import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  RESPONSIVE_MODES,
  RESPONSIVE_BREAKPOINTS,
  POINTER_TYPES,
  HOVER_TYPES,
  classifyLayout,
  classifyEnvironment,
  initResponsiveState,
  destroyResponsiveState,
  getResponsiveState,
  subscribeToResponsiveState,
  configureResponsiveSidebar,
  syncSidebarLayoutState,
  initResponsiveSidebarState,
  destroyResponsiveSidebarState,
  resetSidebarStateForTesting,
  normalizeMediaKey,
  extractHubMediaKeys,
  isImageInHubKeys,
  deduplicateBodyMedia
} from '../responsive/index.js';

import {
  setActivePage,
  resetNavigationForTesting,
  collapseSidebarAfterSelection
} from '../navigation/index.js';

import { isRichTextNote } from '../note-types/text-note.js';

const sharedMockElements = new Map();

// Initialize default mock DOM before importing app.js so top-level getEl() captures mock DOM nodes
setupMockDOM();

const {
  notes,
  installPhoneCardSwipeGestures,
  installPhonePullToRefresh,
  installResponsiveSidebarSwipe,
  initResponsiveGestures,
  destroyResponsiveGestures,
  initResponsiveCardLifecycle,
  destroyResponsiveCardLifecycle,
  createNoteCardElement,
  getVisualNoteType,
  getNoteTypeIndicators,
  renderNoteTypeIndicatorsElement,
  buildSpineCardActions,
  buildCompactPhoneCardActions,
  buildNoteCardActionPanel,
  renderGrid,
  renderNotes,
  toggleNoteCardPin,
  toggleNoteCardFavorite,
  openNoteCardTheme,
  toggleNoteCardActionMenu,
  toggleNoteCardArchive,
  deleteNoteCard
} = await import('../app.js');
const { initSync } = await import('../sync.js');

/**
 * Creates a mock window environment with listener tracking for runtime responsive testing.
 */
function createMockEnvironment({
  width = 1200,
  height = 800,
  pointer = 'fine',
  hover = 'hover',
  maxTouchPoints = 0,
  msMaxTouchPoints = 0,
  ontouchstart = undefined,
  orientation = 'landscape',
  displayMode = 'browser',
  reducedMotion = false
} = {}) {
  const windowListeners = new Map();
  const mqlListeners = new Map();

  const config = {
    width,
    height,
    pointer,
    hover,
    maxTouchPoints,
    msMaxTouchPoints,
    orientation,
    displayMode,
    reducedMotion
  };

  const getMatchesMap = () => ({
    '(pointer: coarse)': config.pointer === 'coarse',
    '(pointer: fine)': config.pointer === 'fine',
    '(pointer: none)': config.pointer === 'none',
    '(hover: hover)': config.hover === 'hover',
    '(hover: none)': config.hover === 'none',
    '(orientation: portrait)': config.orientation === 'portrait',
    '(orientation: landscape)': config.orientation === 'landscape',
    '(display-mode: standalone)': config.displayMode === 'standalone',
    '(prefers-reduced-motion: reduce)': config.reducedMotion === true
  });

  const win = {
    get innerWidth() { return config.width; },
    get innerHeight() { return config.height; },
    navigator: {
      get maxTouchPoints() { return config.maxTouchPoints; },
      get msMaxTouchPoints() { return config.msMaxTouchPoints; },
      get standalone() { return config.displayMode === 'standalone'; }
    },
    screen: {
      get orientation() { return { type: `${config.orientation}-primary` }; }
    },
    addEventListener: (evt, fn) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, new Set());
      windowListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      if (windowListeners.has(evt)) windowListeners.get(evt).delete(fn);
    },
    matchMedia: (query) => ({
      get matches() { return Boolean(getMatchesMap()[query]); },
      media: query,
      addEventListener: (evt, fn) => {
        if (!mqlListeners.has(query)) mqlListeners.set(query, new Set());
        mqlListeners.get(query).add(fn);
      },
      removeEventListener: (evt, fn) => {
        if (mqlListeners.has(query)) mqlListeners.get(query).delete(fn);
      }
    }),
    _dispatchWindowEvent: (evt) => {
      const set = windowListeners.get(evt);
      if (set) set.forEach(fn => fn({ type: evt }));
    },
    _dispatchMediaQueryChange: (query) => {
      const set = mqlListeners.get(query);
      if (set) set.forEach(fn => fn({ matches: Boolean(getMatchesMap()[query]), media: query }));
    },
    _getWindowListenerCount: () => {
      let count = 0;
      windowListeners.forEach(set => { count += set.size; });
      return count;
    },
    _getMqlListenerCount: () => {
      let count = 0;
      mqlListeners.forEach(set => { count += set.size; });
      return count;
    },
    _updateConfig: (patch) => {
      Object.assign(config, patch);
    }
  };

  if (ontouchstart !== undefined) {
    win.ontouchstart = ontouchstart;
  }

  return { win, config };
}

/**
 * Cleanup function to destroy responsive state, gesture listeners, and delete globals after each test.
 */
function cleanupGlobals() {
  destroyResponsiveGestures();
  destroyResponsiveSidebarState();
  destroyResponsiveState();
  delete global.document;
  delete global.window;
  delete global.localStorage;
  resetNavigationForTesting();
  resetSidebarStateForTesting();
  initSync({
    getCurrentUser: () => null,
    getNotes: () => [],
    getCustomFolders: () => []
  });
}

/**
 * Helper to build mock DOM for navigation and state characterization tests.
 */
function setupMockDOM(winObj) {
  if (typeof global.NodeFilter === 'undefined') {
    global.NodeFilter = {
      SHOW_ALL: -1,
      SHOW_ELEMENT: 1,
      SHOW_ATTRIBUTE: 2,
      SHOW_TEXT: 4,
      SHOW_CDATA_SECTION: 8,
      SHOW_ENTITY_REFERENCE: 16,
      SHOW_ENTITY: 32,
      SHOW_PROCESSING_INSTRUCTION: 64,
      SHOW_COMMENT: 128,
      SHOW_DOCUMENT: 256,
      SHOW_DOCUMENT_TYPE: 512,
      SHOW_DOCUMENT_FRAGMENT: 1024,
      SHOW_NOTATION: 2048,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3
    };
  }

  const elements = sharedMockElements;

  const createElement = (id, tag = 'div', className = '') => {
    if (id && elements.has(id)) {
      const existing = elements.get(id);
      existing.children.length = 0;
      existing.innerHTML = '';
      return existing;
    }

    const listeners = new Map();
    const attributes = new Map();
    const style = {
      setProperty: (k, v) => { style[k] = String(v); },
      removeProperty: (k) => { delete style[k]; },
      getPropertyValue: (k) => style[k] || ''
    };
    const classListSet = new Set(className.split(' ').filter(Boolean));
    const children = [];

    let _innerHTML = '';
    const element = {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      style,
      get innerHTML() {
        if (element.content && element.content.children && element.content.children.length > 0) {
          return element.content.innerHTML;
        }
        const serializeNode = (n) => {
          if (!n) return '';
          if (n.nodeType === 3) return n.textContent || '';
          const tag = (n.tagName || 'DIV').toLowerCase();
          const attrs = [];
          if (n.attributes) {
            Array.from(n.attributes).forEach(a => {
              attrs.push(`${a.name}="${a.value}"`);
            });
          }
          const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
          if (tag === 'img' || tag === 'input' || tag === 'embed' || tag === 'link' || tag === 'meta' || tag === 'base') {
            return `<${tag}${attrStr}>`;
          }
          const childHtml = (n.children || []).map(serializeNode).join('');
          const textHtml = childHtml || (n.textContent ? n.textContent : '');
          return `<${tag}${attrStr}>${textHtml}</${tag}>`;
        };
        if (children.length > 0) {
          return children.map(serializeNode).join('');
        }
        return _innerHTML;
      },
      set innerHTML(val) {
        _innerHTML = String(val || '');
        children.length = 0;
        if (element.content) {
          element.content.innerHTML = val;
          return;
        }
        if (!_innerHTML || typeof _innerHTML !== 'string') return;

        if (!/<[a-z][a-z0-9-]*\b/i.test(_innerHTML)) {
          children.push({ nodeType: 3, textContent: _innerHTML, parentElement: element, parentNode: element });
          return;
        }

        const elemReg = /<([a-z0-9-]+)([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)?/gi;
        let match;
        while ((match = elemReg.exec(_innerHTML)) !== null) {
          const tag = match[1].toLowerCase();
          const attrStr = match[2] || '';
          const inner = match[3] || '';

          const childEl = createElement('', tag);
          const attrReg = /([a-z0-9:-]+)(?:=["']([^"']*)["'])?/gi;
          let attrMatch;
          while ((attrMatch = attrReg.exec(attrStr)) !== null) {
            const attrName = attrMatch[1].toLowerCase();
            if (attrName === 'class' || attrName === 'id' || attrName === 'style') continue;
            const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
            childEl.setAttribute(attrName, attrVal);
            if (attrName === 'type') childEl.type = attrVal;
            if (attrName === 'disabled') childEl.disabled = true;
          }
          const srcMatch = attrStr.match(/src=["']([^"']+)["']/i);
          if (srcMatch) childEl.setAttribute('src', srcMatch[1]);
          const classMatch = attrStr.match(/class=["']([^"']+)["']/i);
          if (classMatch) childEl.setAttribute('class', classMatch[1]);
          const idMatch = attrStr.match(/id=["']([^"']+)["']/i);
          if (idMatch) childEl.setAttribute('id', idMatch[1]);
          const dataAttMatch = attrStr.match(/data-attachment-id=["']([^"']+)["']/i);
          if (dataAttMatch) childEl.setAttribute('data-attachment-id', dataAttMatch[1]);

          if (inner) {
            childEl.innerHTML = inner;
            (childEl.children || []).forEach(c => {
              c.parentElement = childEl;
              c.parentNode = childEl;
            });
          }
          children.push(childEl);
          childEl.parentElement = element;
          childEl.parentNode = element;
        }
      },
      children,
      appendChild: (child) => {
        if (child && typeof child === 'object') {
          if (child.nodeType === 11 || (child.children && child.children.length > 0 && !child.tagName)) {
            child.children.forEach(c => {
              children.push(c);
              c.parentElement = element;
              c.parentNode = element;
            });
            child.children.length = 0;
          } else {
            children.push(child);
            child.parentElement = element;
            child.parentNode = element;
          }
        }
        return child;
      },
      replaceChild: (newChild, oldChild) => {
        const idx = children.indexOf(oldChild);
        if (idx !== -1) {
          children[idx] = newChild;
          if (newChild && typeof newChild === 'object') {
            newChild.parentElement = element;
            newChild.parentNode = element;
          }
        }
        return oldChild;
      },
      removeChild: (child) => {
        _innerHTML = '';
        const idx = children.indexOf(child);
        if (idx !== -1) {
          children.splice(idx, 1);
        }
        return child;
      },
      remove: () => {
        const parent = element.parentElement || element.parentNode;
        if (parent && typeof parent.removeChild === 'function') {
          parent.removeChild(element);
        }
      },
      classList: {
        add: (...cls) => cls.forEach(c => classListSet.add(c)),
        remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
        contains: (c) => classListSet.has(c),
        toggle: (c, force) => {
          if (force === true) classListSet.add(c);
          else if (force === false) classListSet.delete(c);
          else if (classListSet.has(c)) classListSet.delete(c);
          else classListSet.add(c);
        }
      },
      get attributes() {
        return Array.from(attributes.entries()).map(([name, value]) => ({ name, value }));
      },
      hasAttribute: (k) => attributes.has(String(k).toLowerCase()),
      setAttribute: (k, v) => {
        const key = String(k).toLowerCase();
        attributes.set(key, String(v));
        if (key === 'src') element.src = String(v);
        if (key === 'id') element.id = String(v);
      },
      getAttribute: (k) => attributes.get(String(k).toLowerCase()) ?? element.dataset[k] ?? null,
      removeAttribute: (k) => attributes.delete(String(k).toLowerCase()),
      get textContent() {
        if (children.length === 0) return _innerHTML.replace(/<[^>]+>/g, '').trim();
        return children.map(c => typeof c.textContent === 'string' ? c.textContent : (c.textVal || '')).join('');
      },
      set textContent(val) {
        _innerHTML = String(val || '');
        children.length = 0;
      },
      querySelector: (sel) => {
        if (sel === '.empty-text') {
          let textEl = children.find(c => c.classList && c.classList.contains('empty-text'));
          if (!textEl) {
            textEl = createElement('empty-text', 'span', 'empty-text');
            children.push(textEl);
          }
          return textEl;
        }
        const findChild = (el) => {
          if (!el || !el.children) return null;
          for (const c of el.children) {
            if (sel.startsWith('.') && c.classList && c.classList.contains(sel.substring(1))) return c;
            if (sel.startsWith('#') && c.id === sel.substring(1)) return c;
            if (sel.toUpperCase() === c.tagName) return c;
            const res = findChild(c);
            if (res) return res;
          }
          return null;
        };
        const found = findChild(element);
        if (found) return found;
        return createElement('mock-' + sel.replace(/[^a-zA-Z0-9]/g, '-'), 'div');
      },
      querySelectorAll: (sel) => {
        const matches = [];
        const selectors = sel.split(',').map(s => s.trim().toLowerCase());
        const search = (el) => {
          if (!el || !el.children) return;
          for (const c of el.children) {
            if (!c) continue;
            const matchesSel = selectors.some(s => {
              if (s === '*') return true;
              if (s === 'img' && c.tagName === 'IMG') return true;
              if (s === 'script' && c.tagName === 'SCRIPT') return true;
              if (s === 'iframe' && c.tagName === 'IFRAME') return true;
              if (s === 'style' && c.tagName === 'STYLE') return true;
              if (s.startsWith('.') && c.classList && c.classList.contains(s.substring(1))) return true;
              if (s.startsWith('#') && c.id === s.substring(1)) return true;
              if (s.startsWith('[') && s.endsWith(']') && c.getAttribute && Boolean(c.getAttribute(s.slice(1, -1).split('=')[0]))) return true;
              return s.toUpperCase() === c.tagName;
            });
            if (matchesSel) matches.push(c);
            search(c);
          }
        };
        search(element);
        return matches;
      },
      closest: (sel) => {
        if (sel.includes('note-card') && classListSet.has('note-card')) return element;
        if (sel.includes('note-media-hub') && classListSet.has('note-media-hub')) return element;
        return null;
      },
      addEventListener: (evt, fn) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (listeners.has(evt)) {
          const list = listeners.get(evt).filter(f => f !== fn);
          listeners.set(evt, list);
        }
      },
      dispatchEvent: (evt) => {
        const list = listeners.get(evt.type || evt) || [];
        if (evt && typeof evt === 'object') {
          if (!evt.target) evt.target = element;
          if (!evt.currentTarget) evt.currentTarget = element;
        }
        list.forEach(fn => fn(evt));
      },
      click: () => {
        const list = listeners.get('click') || [];
        list.forEach(fn => fn({
          type: 'click',
          target: element,
          currentTarget: element,
          preventDefault: () => {},
          stopPropagation: () => {}
        }));
      },
      focus: () => {
        if (global.document) global.document.activeElement = element;
      }
    };
    Object.defineProperty(element, 'className', {
      get: () => Array.from(classListSet).join(' '),
      set: (value) => {
        classListSet.clear();
        String(value || '').split(/\s+/).filter(Boolean).forEach(name => classListSet.add(name));
      }
    });

    if (tag.toLowerCase() === 'template') {
      const frag = createElement('template-content-' + Math.random().toString(36).substring(2, 7), '');
      frag.tagName = undefined;
      frag.nodeType = 11;
      element.content = frag;
    }

    if (tag.toLowerCase() === 'input' || tag.toLowerCase() === 'textarea') {
      element.value = '';
    }

    if (id) elements.set(id, element);
    return element;
  };

  // Pre-instantiate production UI elements
  const pinnedSection = createElement('pinned-section', 'div', 'pinned-section');
  const pinnedGrid = createElement('pinned-grid', 'div', 'pinned-grid');
  const othersSection = createElement('others-section', 'div', 'others-section');
  const othersGrid = createElement('others-grid', 'div', 'others-grid');
  const othersSectionTitle = createElement('others-section-title', 'div', 'others-section-title');
  const emptyState = createElement('empty-state', 'div', 'empty-state');
  const emptyText = createElement('empty-text', 'span', 'empty-text');
  emptyState.appendChild(emptyText);

  const notesFeed = createElement('notes-feed', 'div', 'notes-feed');
  const feedFilterRow = createElement('feed-filter-row', 'div', 'feed-filter-row');
  const creatorWrapper = createElement('creator-wrapper', 'div', 'creator-wrapper');
  const searchPage = createElement('search-page', 'div', 'search-page');
  const settingsPage = createElement('settings-page', 'div', 'settings-page');
  const productivityPage = createElement('productivity-page', 'div', 'productivity-page');
  const dedicatedSearchInput = createElement('dedicated-search-input', 'input', 'search-input');
  const menuBtn = createElement('menu-btn', 'button', 'menu-btn');
  const appSidebar = createElement('app-sidebar', 'aside', 'app-sidebar');

  const docListeners = new Map();

  global.document = {
    readyState: 'loading',
    body: createElement('body', 'body', 'sidebar-pinned'),
    createElement: (tag, className = '') => createElement('el-' + Math.random().toString(36).substring(2, 7), tag, className),
    createElementNS: (ns, tag) => createElement('svg-' + Math.random().toString(36).substring(2, 7), tag),
    createTreeWalker: (root, whatToShow, filter) => {
      const nodes = [];
      const collectNodes = (node) => {
        if (!node) return;
        nodes.push(node);
        if (node.children) {
          node.children.forEach(collectNodes);
        }
      };
      collectNodes(root);
      let idx = 0;
      const walker = {
        currentNode: null,
        nextNode: () => {
          if (idx < nodes.length) {
            walker.currentNode = nodes[idx++];
            return walker.currentNode;
          }
          walker.currentNode = null;
          return null;
        }
      };
      return walker;
    },
    getElementById: (id) => {
      if (elements.has(id)) return elements.get(id);
      const el = createElement(id, 'div');
      return el;
    },
    querySelector: (sel) => {
      if (sel === '#pinned-grid' || sel === '.pinned-grid') return pinnedGrid;
      if (sel === '#pinned-section' || sel === '.pinned-section') return pinnedSection;
      if (sel === '#others-grid' || sel === '.others-grid') return othersGrid;
      if (sel === '#others-section' || sel === '.others-section') return othersSection;
      if (sel === '#others-section-title' || sel === '.others-section-title') return othersSectionTitle;
      if (sel === '#empty-state' || sel === '.empty-state') return emptyState;
      if (sel === '.menu-btn') return menuBtn;
      if (sel === '.app-sidebar') return appSidebar;
      if (sel === '.mobile-bottom-dock') return elements.get('mobile-bottom-dock') || createElement('mobile-bottom-dock', 'div', 'mobile-bottom-dock');
      if (sel === '#mobile-pull-indicator') return elements.get('mobile-pull-indicator') || createElement('mobile-pull-indicator', 'div');
      if (sel === '#settings-page') return settingsPage;
      if (sel === '#productivity-page') return productivityPage;
      if (sel === '#search-page') return searchPage;
      if (sel === '#notes-feed') return notesFeed;
      if (sel === '.creator-wrapper') return creatorWrapper;
      if (sel === '.feed-filter-row') return feedFilterRow;
      if (sel === '#dedicated-search-input') return dedicatedSearchInput;
      if (sel.startsWith('.note-card')) {
        return Array.from(elements.values()).find(e => e.classList.contains('note-card')) || null;
      }
      return createElement('mock-' + sel.replace(/[^a-zA-Z0-9]/g, '-'), 'div');
    },
    querySelectorAll: (sel) => {
      if (sel === '.sidebar-item') {
        return Array.from(elements.values()).filter(e => e.classList.contains('sidebar-item'));
      }
      if (sel === '.mobile-bottom-dock .mobile-dock-item[data-target-page]' || sel === '.mobile-bottom-dock .mobile-dock-item') {
        return Array.from(elements.values()).filter(e => e.classList.contains('mobile-dock-item'));
      }
      if (sel === '.tablet-dock-item[data-tablet-page]') {
        return Array.from(elements.values()).filter(e => e.classList.contains('tablet-dock-item'));
      }
      if (sel === '.note-card-menu.open') {
        return Array.from(elements.values()).filter(e => e.classList.contains('note-card-menu') && e.classList.contains('open'));
      }
      if (sel === '.note-card.menu-open') {
        return Array.from(elements.values()).filter(e => e.classList.contains('note-card') && e.classList.contains('menu-open'));
      }
      return [];
    },
    addEventListener: (evt, fn) => {
      if (!docListeners.has(evt)) docListeners.set(evt, new Set());
      docListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      if (docListeners.has(evt)) docListeners.get(evt).delete(fn);
    },
    dispatchEvent: (evt) => {
      const set = docListeners.get(evt.type || evt);
      if (set) set.forEach(fn => fn(evt));
    },
    _getDocListenerCount: (evt) => {
      if (evt) return docListeners.get(evt)?.size || 0;
      let total = 0;
      docListeners.forEach(s => { total += s.size; });
      return total;
    },
    _createElement: createElement,
    _elements: elements
  };

  const storageMap = new Map();
  global.localStorage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    _storageMap: storageMap
  };

  global.window = winObj || {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };

  createElement('app-sidebar', 'aside', 'app-sidebar');
  createElement('mobile-bottom-dock', 'nav', 'mobile-bottom-dock');
  createElement('settings-page', 'section', 'settings-page');
  createElement('productivity-page', 'section', 'productivity-page');
  createElement('search-page', 'section', 'search-page');
  createElement('notes-feed', 'section', 'notes-feed');

  const sidebarNotes = createElement('sidebar-all-notes', 'div', 'sidebar-item active');
  sidebarNotes.setAttribute('aria-current', 'page');
  sidebarNotes.dataset.page = 'notes';

  const sidebarSearch = createElement('sidebar-search', 'div', 'sidebar-item');
  sidebarSearch.dataset.page = 'search';

  const mobileNotes = createElement('mobile-notes', 'button', 'mobile-dock-item active');
  mobileNotes.setAttribute('data-target-page', 'notes');
  mobileNotes.setAttribute('aria-current', 'page');

  const mobileSearch = createElement('mobile-search', 'button', 'mobile-dock-item');
  mobileSearch.setAttribute('data-target-page', 'search');

  const tabletNotes = createElement('tablet-notes', 'button', 'tablet-dock-item active');
  tabletNotes.dataset.tabletPage = 'notes';
  tabletNotes.setAttribute('aria-current', 'page');

  const tabletSearch = createElement('tablet-search', 'button', 'tablet-dock-item');
  tabletSearch.dataset.tabletPage = 'search';

  return {
    elements,
    sidebarNotes,
    sidebarSearch,
    mobileNotes,
    mobileSearch,
    tabletNotes,
    tabletSearch,
    searchPage,
    notesFeed
  };
}

// ============================================================================
// CANONICAL RESPONSIVE CONTRACT TEST SUITE
// ============================================================================

test('1. Width boundary immediately below phone/tablet transition (699px portrait -> phone)', () => {
  const { win } = createMockEnvironment({ width: 699, height: 900, orientation: 'portrait' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
});

test('2. Exact phone/tablet boundary (700px portrait -> tablet-portrait)', () => {
  const { win } = createMockEnvironment({ width: 700, height: 1000, orientation: 'portrait' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
});

test('3. Tablet portrait (768x1024 portrait -> tablet-portrait)', () => {
  const { win } = createMockEnvironment({ width: 768, height: 1024, orientation: 'portrait' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
});

test('4. Large tablet portrait (1024x1366 portrait -> tablet-portrait)', () => {
  const { win } = createMockEnvironment({ width: 1024, height: 1366, orientation: 'portrait' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
});

test('5. Tablet landscape (1180x820 landscape -> tablet-landscape)', () => {
  const { win } = createMockEnvironment({ width: 1180, height: 820, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
});

test('6. Width immediately above tablet landscape range (1181px landscape -> desktop)', () => {
  const { win } = createMockEnvironment({ width: 1181, height: 820, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.DESKTOP);
});

test('7. Desktop layout (1440x900 -> desktop)', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.DESKTOP);
});

test('8. Phone landscape (640x360 landscape -> phone)', () => {
  const { win } = createMockEnvironment({ width: 640, height: 360, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
});

test('9. Coarse-pointer desktop/touch laptop (1440x900, coarse pointer -> desktop layout, coarse pointer)', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900, pointer: 'coarse', maxTouchPoints: 10, hover: 'hover' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.DESKTOP);
  assert.equal(result.pointer, POINTER_TYPES.COARSE);
  assert.equal(result.hasTouch, true);
});

test('10. Fine-pointer narrow desktop window (600px, fine pointer -> phone layout, fine pointer)', () => {
  const { win } = createMockEnvironment({ width: 600, height: 800, pointer: 'fine', maxTouchPoints: 0, hover: 'hover' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(result.pointer, POINTER_TYPES.FINE);
  assert.equal(result.hasTouch, false);
});

test('11. Orientation change classification (800px width: portrait -> tablet-portrait, landscape -> tablet-landscape)', () => {
  const { win: portraitEnv } = createMockEnvironment({ width: 800, height: 1000, orientation: 'portrait' });
  const { win: landscapeEnv } = createMockEnvironment({ width: 800, height: 600, orientation: 'landscape' });

  assert.equal(classifyEnvironment(portraitEnv).layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
  assert.equal(classifyEnvironment(landscapeEnv).layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
});

test('11b. Viewport orientation preference over screen.orientation (800x1000 portrait with screen.orientation landscape)', () => {
  const { win: env } = createMockEnvironment({ width: 800, height: 1000, orientation: 'portrait' });
  env.screen = { orientation: { type: 'landscape-primary' } };

  const result = classifyEnvironment(env);
  assert.equal(result.orientation, 'portrait');
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
});

test('11c. Viewport orientation preference inverse mismatch (1000x800 landscape with screen.orientation portrait)', () => {
  const { win: env } = createMockEnvironment({ width: 1000, height: 800, orientation: 'landscape' });
  env.screen = { orientation: { type: 'portrait-primary' } };

  const result = classifyEnvironment(env);
  assert.equal(result.orientation, 'landscape');
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
});

test('11d. Viewport dimensions orientation fallback when matchMedia is absent', () => {
  const env = {
    innerWidth: 800,
    innerHeight: 1000,
    screen: { orientation: { type: 'landscape-primary' } }
  };

  const result = classifyEnvironment(env);
  assert.equal(result.orientation, 'portrait');
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
});

test('12. Repeated classification calls return consistent outputs (idempotency)', () => {
  const { win: env } = createMockEnvironment({ width: 800, height: 1080, orientation: 'portrait' });
  const first = classifyEnvironment(env);
  const second = classifyEnvironment(env);
  const third = classifyEnvironment(env);

  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test('13. Invalid or missing environment values fall back safely to desktop fine-pointer', () => {
  assert.equal(classifyLayout(null), RESPONSIVE_MODES.DESKTOP);
  assert.equal(classifyLayout({ width: 0, height: 0 }), RESPONSIVE_MODES.DESKTOP);
  assert.equal(classifyLayout({ width: NaN }), RESPONSIVE_MODES.DESKTOP);

  const envMissingMatchMedia = { innerWidth: 1200, innerHeight: 800 };
  const res = classifyEnvironment(envMissingMatchMedia);
  assert.equal(res.layoutMode, RESPONSIVE_MODES.DESKTOP);
  assert.equal(res.pointer, POINTER_TYPES.FINE);
});

test('14. Touch capability detection across maxTouchPoints, msMaxTouchPoints, and ontouchstart', () => {
  const { win: envMaxTouch } = createMockEnvironment({ maxTouchPoints: 5 });
  assert.equal(classifyEnvironment(envMaxTouch).hasTouch, true);

  const { win: envMsMaxTouch } = createMockEnvironment({ msMaxTouchPoints: 2 });
  assert.equal(classifyEnvironment(envMsMaxTouch).hasTouch, true);

  const { win: envOntouchstart } = createMockEnvironment({ ontouchstart: null });
  assert.equal(classifyEnvironment(envOntouchstart).hasTouch, true);

  const { win: envNoTouch } = createMockEnvironment({ maxTouchPoints: 0, msMaxTouchPoints: 0 });
  assert.equal(classifyEnvironment(envNoTouch).hasTouch, false);
});

test('15. Standalone PWA capability separated from layout', () => {
  const { win: desktopPwa } = createMockEnvironment({ width: 1440, height: 900, displayMode: 'standalone' });
  const { win: phoneBrowser } = createMockEnvironment({ width: 390, height: 844, displayMode: 'browser' });

  const resDesktop = classifyEnvironment(desktopPwa);
  const resPhone = classifyEnvironment(phoneBrowser);

  assert.equal(resDesktop.layoutMode, RESPONSIVE_MODES.DESKTOP);
  assert.equal(resDesktop.isStandalone, true);

  assert.equal(resPhone.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(resPhone.isStandalone, false);
});

test('16. Reduced-motion capability separated from layout', () => {
  const { win: reducedMotionTablet } = createMockEnvironment({ width: 768, height: 1024, orientation: 'portrait', reducedMotion: true });
  const res = classifyEnvironment(reducedMotionTablet);

  assert.equal(res.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
  assert.equal(res.prefersReducedMotion, true);
});

// ============================================================================
// PHASE 2 RUNTIME RESPONSIVE STATE TESTS
// ============================================================================

test('Phase 2 - 1. Initial state and body attributes synchronization', () => {
  const { win } = createMockEnvironment({
    width: 390,
    height: 844,
    orientation: 'portrait',
    pointer: 'coarse',
    hover: 'none',
    maxTouchPoints: 5,
    displayMode: 'standalone',
    reducedMotion: true
  });
  setupMockDOM(win);

  try {
    destroyResponsiveState();
    const state = initResponsiveState();

    assert.equal(state.layoutMode, RESPONSIVE_MODES.PHONE);
    assert.equal(state.orientation, 'portrait');
    assert.equal(state.pointer, POINTER_TYPES.COARSE);
    assert.equal(state.hover, HOVER_TYPES.NONE);
    assert.equal(state.hasTouch, true);
    assert.equal(state.isStandalone, true);
    assert.equal(state.prefersReducedMotion, true);

    // Verify DOM synchronization
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.PHONE);
    assert.equal(global.document.body.dataset.orientation, 'portrait');
    assert.equal(global.document.body.dataset.pointer, POINTER_TYPES.COARSE);
    assert.equal(global.document.body.dataset.hover, HOVER_TYPES.NONE);
    assert.equal(global.document.body.classList.contains('touch-capable'), true);
    assert.equal(global.document.body.classList.contains('pwa-standalone'), true);
    assert.equal(global.document.body.classList.contains('prefers-reduced-motion'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 2. Phone, Tablet, and Desktop transitions', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let lastNotifiedState = null;
    subscribeToResponsiveState(s => { lastNotifiedState = s; });

    // Transition to tablet portrait
    config.width = 768;
    config.height = 1024;
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.TABLET_PORTRAIT);
    assert.equal(lastNotifiedState.layoutMode, RESPONSIVE_MODES.TABLET_PORTRAIT);

    // Transition to tablet landscape
    config.width = 1180;
    config.height = 820;
    config.orientation = 'landscape';
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.TABLET_LANDSCAPE);
    assert.equal(lastNotifiedState.layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);

    // Transition to desktop
    config.width = 1440;
    config.height = 900;
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.DESKTOP);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.DESKTOP);
    assert.equal(lastNotifiedState.layoutMode, RESPONSIVE_MODES.DESKTOP);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 3. Orientation transition', () => {
  const { win, config } = createMockEnvironment({ width: 800, height: 1000, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let notifications = 0;
    subscribeToResponsiveState(() => { notifications++; });

    assert.equal(getResponsiveState().orientation, 'portrait');
    assert.equal(global.document.body.dataset.orientation, 'portrait');

    // Trigger orientation change to landscape
    config.width = 1000;
    config.height = 800;
    config.orientation = 'landscape';
    win._dispatchWindowEvent('orientationchange');

    assert.equal(getResponsiveState().orientation, 'landscape');
    assert.equal(global.document.body.dataset.orientation, 'landscape');
    assert.equal(notifications, 1);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 4. Capability-only transition', () => {
  const { win, config } = createMockEnvironment({ width: 1440, height: 900, reducedMotion: false });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let lastState = null;
    subscribeToResponsiveState(s => { lastState = s; });

    assert.equal(global.document.body.classList.contains('prefers-reduced-motion'), false);

    // Toggle reduced motion capability via media query event
    config.reducedMotion = true;
    win._dispatchMediaQueryChange('(prefers-reduced-motion: reduce)');

    assert.equal(lastState.prefersReducedMotion, true);
    assert.equal(global.document.body.classList.contains('prefers-reduced-motion'), true);
    assert.equal(lastState.layoutMode, RESPONSIVE_MODES.DESKTOP); // Layout unchanged
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 5. No notification for unchanged state', () => {
  const { win } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let callCount = 0;
    subscribeToResponsiveState(() => { callCount++; });

    // Dispatch resize without changing dimensions or capabilities
    win._dispatchWindowEvent('resize');
    win._dispatchWindowEvent('orientationchange');

    assert.equal(callCount, 0, 'Subscribers must not be notified when state has not changed');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 6. Multiple subscribers receive immutable snapshots', () => {
  const { win, config } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    initResponsiveState();

    let sub1Snapshot = null;
    let sub2Snapshot = null;

    subscribeToResponsiveState(s => { sub1Snapshot = s; });
    subscribeToResponsiveState(s => { sub2Snapshot = s; });

    config.width = 500;
    config.height = 800;
    win._dispatchWindowEvent('resize');

    assert.equal(sub1Snapshot.layoutMode, RESPONSIVE_MODES.PHONE);
    assert.equal(sub2Snapshot.layoutMode, RESPONSIVE_MODES.PHONE);
    assert.equal(Object.isFrozen(sub1Snapshot), true, 'Snapshot must be frozen/immutable');
    assert.equal(Object.isFrozen(sub2Snapshot), true, 'Snapshot must be frozen/immutable');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 7. Unsubscribe behavior', () => {
  const { win, config } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    initResponsiveState();

    let callCount = 0;
    const unsubscribe = subscribeToResponsiveState(() => { callCount++; });

    config.width = 500;
    win._dispatchWindowEvent('resize');
    assert.equal(callCount, 1);

    unsubscribe();

    config.width = 1440;
    win._dispatchWindowEvent('resize');
    assert.equal(callCount, 1, 'Unsubscribed callback must not be called again');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 8. Initialization idempotency', () => {
  const { win } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    const initialWinListenerCount = win._getWindowListenerCount();
    const initialMqlListenerCount = win._getMqlListenerCount();

    const state1 = initResponsiveState();
    const countAfterFirstInitWindow = win._getWindowListenerCount();
    const countAfterFirstInitMql = win._getMqlListenerCount();

    assert.ok(countAfterFirstInitWindow > initialWinListenerCount, 'Listeners should be attached on first init');

    const state2 = initResponsiveState();
    const countAfterSecondInitWindow = win._getWindowListenerCount();
    const countAfterSecondInitMql = win._getMqlListenerCount();

    assert.equal(countAfterSecondInitWindow, countAfterFirstInitWindow, 'Listener count must not increase on duplicate init');
    assert.equal(countAfterSecondInitMql, countAfterFirstInitMql, 'MQL listener count must not increase on duplicate init');
    assert.strictEqual(state1, state2, 'Repeated init should return the same immutable state snapshot');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 9. Full listener cleanup on destroyResponsiveState', () => {
  const { win } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    assert.ok(win._getWindowListenerCount() > 0, 'Window listeners should be active after init');
    assert.ok(win._getMqlListenerCount() > 0, 'MQL listeners should be active after init');

    destroyResponsiveState();

    assert.equal(win._getWindowListenerCount(), 0, 'All window listeners must be removed on destroy');
    assert.equal(win._getMqlListenerCount(), 0, 'All MQL listeners must be removed on destroy');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 10. Destroy then reinitialize', () => {
  const { win, config } = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.DESKTOP);

    destroyResponsiveState();

    config.width = 400;
    config.height = 800;

    const newState = initResponsiveState();
    assert.equal(newState.layoutMode, RESPONSIVE_MODES.PHONE);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.PHONE);
    assert.ok(win._getWindowListenerCount() > 0, 'Listeners should be re-attached after reinitialization');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 2 - 11. Missing DOM or window safety', () => {
  delete global.window;
  delete global.document;

  try {
    const state = initResponsiveState();
    assert.equal(state.layoutMode, RESPONSIVE_MODES.DESKTOP);
    assert.equal(state.pointer, POINTER_TYPES.FINE);

    let notified = false;
    subscribeToResponsiveState(() => { notified = true; });

    assert.equal(notified, false);
    destroyResponsiveState();
  } finally {
    cleanupGlobals();
  }
});

// ============================================================================
// PRODUCTION DOM & NAVIGATION SURFACE CHARACTERIZATION TESTS
// ============================================================================

test('Production DOM inventory: Creation controls exist for Phone, Tablet, and Desktop in index.html', () => {
  const indexPath = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  // Phone creation controls
  assert.match(html, /id="mobile-dock-add-btn"/, 'Phone mobile dock add button should exist in index.html');
  assert.match(html, /id="mobile-bottom-sheet"/, 'Mobile quick-create bottom sheet should exist in index.html');
  assert.match(html, /data-create-type="text"/, 'Text creation option should exist in bottom sheet');
  assert.match(html, /data-create-type="checklist"/, 'Checklist creation option should exist in bottom sheet');
  assert.match(html, /data-create-type="voice"/, 'Voice creation option should exist in bottom sheet');
  assert.match(html, /data-create-type="photo"/, 'Photo creation option should exist in bottom sheet');
  assert.match(html, /data-create-type="bookmark"/, 'Link creation option should exist in bottom sheet');

  // Tablet creation controls
  assert.match(html, /class="tablet-dock-create"/, 'Tablet dock create button should exist in index.html');
  assert.match(html, /data-tablet-action="create"/, 'Tablet action create attribute should exist in index.html');

  // Desktop creation controls
  assert.match(html, /id="sidebar-new-note"/, 'Desktop sidebar new note button should exist in index.html');
});

test('Production DOM inventory: Navigation surfaces exist in index.html', () => {
  const indexPath = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /class="app-sidebar"/, 'Sidebar surface should exist in index.html');
  assert.match(html, /class="mobile-bottom-dock"/, 'Mobile bottom dock surface should exist in index.html');
  assert.match(html, /class="tablet-dock"/, 'Tablet dock surface should exist in index.html');
});

test('Navigation helper synchronization: setActivePage updates mobile, tablet, and sidebar states and is reversible', () => {
  const {
    sidebarNotes,
    sidebarSearch,
    mobileNotes,
    mobileSearch,
    tabletNotes,
    tabletSearch,
    searchPage,
    notesFeed
  } = setupMockDOM();

  try {
    resetNavigationForTesting();

    // 1. Transition from 'notes' to 'search'
    const pageAfterFirstTransition = setActivePage('search');
    assert.equal(pageAfterFirstTransition, 'search');

    // Assert Sidebar production-observable effects
    assert.equal(sidebarSearch.classList.contains('active'), true, 'Search sidebar item should have active class');
    assert.equal(sidebarSearch.getAttribute('aria-current'), 'page', 'Search sidebar item should have aria-current="page"');
    assert.equal(sidebarNotes.classList.contains('active'), false, 'Notes sidebar item should not be active');

    // Assert Mobile Dock production-observable effects
    assert.equal(mobileSearch.classList.contains('active'), true, 'Mobile Search dock item should have active class');
    assert.equal(mobileNotes.classList.contains('active'), false, 'Mobile Notes dock item should no longer be active');

    // Assert Tablet Dock production-observable effects
    assert.equal(tabletSearch.classList.contains('active'), true, 'Tablet Search dock item should have active class');
    assert.equal(tabletNotes.classList.contains('active'), false, 'Tablet Notes dock item should no longer be active');

    // Assert Page Containers production-observable effects
    assert.equal(searchPage.style.display, 'flex', 'Search page should be visible (display: flex)');
    assert.equal(notesFeed.style.display, 'none', 'Notes feed should be hidden (display: none)');

    // 2. Reversible transition back from 'search' to 'notes'
    const pageAfterSecondTransition = setActivePage('notes');
    assert.equal(pageAfterSecondTransition, 'notes');

    // Assert Sidebar reversible state
    assert.equal(sidebarNotes.classList.contains('active'), true, 'Notes sidebar item should be active again');
    assert.equal(sidebarNotes.getAttribute('aria-current'), 'page', 'Notes sidebar item should have aria-current="page"');
    assert.equal(sidebarSearch.classList.contains('active'), false, 'Search sidebar item should no longer be active');

    // Assert Mobile Dock reversible state
    assert.equal(mobileNotes.classList.contains('active'), true, 'Mobile Notes dock item should be active again');
    assert.equal(mobileSearch.classList.contains('active'), false, 'Mobile Search dock item should no longer be active');

    // Assert Tablet Dock reversible state
    assert.equal(tabletNotes.classList.contains('active'), true, 'Tablet Notes dock item should be active again');
    assert.equal(tabletSearch.classList.contains('active'), false, 'Tablet Search dock item should no longer be active');

    // Assert Page Containers reversible state
    assert.equal(notesFeed.style.display, '', 'Notes feed should be visible again');
    assert.equal(searchPage.style.display, 'none', 'Search page should be hidden');
  } finally {
    cleanupGlobals();
  }
});

test('Sidebar collapse helper removes sidebar-pinned when window.innerWidth < 1024', () => {
  setupMockDOM();
  try {
    global.window.innerWidth = 800;
    global.document.body.classList.add('sidebar-pinned');

    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');

    collapseSidebarAfterSelection();

    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

// ============================================================================
// PHASE 3A STABILIZATION: COMPACT PHONE LANDSCAPE BOUNDARY & RUNTIME TESTS
// ============================================================================

test('Compact landscape boundary classification: 844x390 -> phone', () => {
  const { win } = createMockEnvironment({ width: 844, height: 390, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(result.orientation, 'landscape');
});

test('Compact landscape boundary classification: 932x430 -> phone', () => {
  const { win } = createMockEnvironment({ width: 932, height: 430, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(result.orientation, 'landscape');
});

test('Compact landscape boundary classification: 933x430 -> tablet-landscape', () => {
  const { win } = createMockEnvironment({ width: 933, height: 430, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
  assert.equal(result.orientation, 'landscape');
});

test('Compact landscape boundary classification: 844x501 -> tablet-landscape', () => {
  const { win } = createMockEnvironment({ width: 844, height: 501, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
  assert.equal(result.orientation, 'landscape');
});

test('Compact landscape boundary classification: 932x500 exact boundary -> phone', () => {
  const { win } = createMockEnvironment({ width: 932, height: 500, orientation: 'landscape' });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(result.orientation, 'landscape');
});

test('Compact landscape retains pointer and capability independence', () => {
  const { win } = createMockEnvironment({
    width: 844,
    height: 390,
    orientation: 'landscape',
    pointer: 'coarse',
    maxTouchPoints: 5,
    reducedMotion: true
  });
  const result = classifyEnvironment(win);
  assert.equal(result.layoutMode, RESPONSIVE_MODES.PHONE);
  assert.equal(result.pointer, POINTER_TYPES.COARSE);
  assert.equal(result.hasTouch, true);
  assert.equal(result.prefersReducedMotion, true);
});

test('Transitions into and out of compact landscape update body.dataset.layout and notify subscribers once', () => {
  const { win, config } = createMockEnvironment({ width: 1180, height: 820, orientation: 'landscape' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let notifications = [];
    subscribeToResponsiveState(s => { notifications.push(s); });

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.TABLET_LANDSCAPE);

    // 1. Transition into compact phone landscape (844x390)
    config.width = 844;
    config.height = 390;
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.PHONE);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.PHONE);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].layoutMode, RESPONSIVE_MODES.PHONE);

    // 2. Transition back out to non-compact tablet landscape (1180x820)
    config.width = 1180;
    config.height = 820;
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
    assert.equal(global.document.body.dataset.layout, RESPONSIVE_MODES.TABLET_LANDSCAPE);
    assert.equal(notifications.length, 2);
    assert.equal(notifications[1].layoutMode, RESPONSIVE_MODES.TABLET_LANDSCAPE);
  } finally {
    cleanupGlobals();
  }
});

// ============================================================================
// PHASE 4A LIFECYCLE-GATED RESPONSIVE TOUCH GESTURE TESTS
// ============================================================================

test('Phase 4A - 1. Phone touch installs card swipe, pull-to-refresh, and sidebar swipe with exact counts', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 3, 'Phone touch installs exactly 3 touchstart listeners');
    assert.equal(global.document._getDocListenerCount('touchmove'), 2, 'Phone touch installs exactly 2 touchmove listeners');
    assert.equal(global.document._getDocListenerCount('touchend'), 3, 'Phone touch installs exactly 3 touchend listeners');
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1, 'Phone touch installs exactly 1 touchcancel listener');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 2. Phone without touch installs no gesture listeners', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 0 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 3. Tablet portrait touch installs only sidebar swipe with exact counts', () => {
  const { win } = createMockEnvironment({ width: 768, height: 1024, orientation: 'portrait', maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 1, 'Sidebar touchstart installed');
    assert.equal(global.document._getDocListenerCount('touchmove'), 0, 'Card swipe/pull refresh touchmove not installed');
    assert.equal(global.document._getDocListenerCount('touchend'), 1, 'Sidebar touchend installed');
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0, 'Card swipe touchcancel not installed');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 4. Tablet landscape touch installs no gesture listeners', () => {
  const { win } = createMockEnvironment({ width: 1180, height: 820, orientation: 'landscape', maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 5. Touch desktop installs no gesture listeners', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900, maxTouchPoints: 5, pointer: 'coarse' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 6. Phone-to-desktop transition removes all gesture listeners', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 3);
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);

    // Resize to desktop
    config.width = 1440;
    config.height = 900;
    win._dispatchWindowEvent('resize');

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 7. Desktop-to-phone transition installs exact listeners once', () => {
  const { win, config } = createMockEnvironment({ width: 1440, height: 900, maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);

    // Transition to phone touch
    config.width = 390;
    config.height = 844;
    win._dispatchWindowEvent('resize');

    assert.equal(global.document._getDocListenerCount('touchstart'), 3);
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);

    // Subsequent resize within phone range
    config.width = 400;
    win._dispatchWindowEvent('resize');

    assert.equal(global.document._getDocListenerCount('touchstart'), 3, 'Listener count must not increase on unchanged eligibility');
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 8. Repeated unchanged state does not duplicate gesture listeners', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 3);
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);

    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 3, 'Repeated initialization must be idempotent');
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4A - 9. Cleanup resets active swipe card state and transient styles via production handler without pin/trash side effects', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  const { elements } = setupMockDOM(win);

  const testNote = { id: 'test-card-9', title: 'Card 9', pinned: false, updatedAt: 1000 };
  notes.push(testNote);

  try {
    initResponsiveState();
    initResponsiveGestures();

    // 1. Create real mock .note-card[data-id]
    const cardElement = global.document._createElement('card-9', 'div', 'note-card');
    cardElement.setAttribute('data-id', 'test-card-9');
    elements.set('card-9', cardElement);

    // 2. Dispatch production touchstart to set activeSwipeCard
    global.document.dispatchEvent({
      type: 'touchstart',
      touches: [{ clientX: 100, clientY: 100 }],
      target: cardElement
    });

    // 3. Dispatch horizontal touchmove far enough (> 60px) to set transform & swiping-pin
    global.document.dispatchEvent({
      type: 'touchmove',
      touches: [{ clientX: 175, clientY: 100 }],
      target: cardElement
    });

    // 4. Assert transform and class are present before cleanup
    assert.equal(cardElement.style.transform, 'translateX(75px)');
    assert.equal(cardElement.classList.contains('swiping-pin'), true);

    // 5. Call destroyResponsiveGestures()
    destroyResponsiveGestures();

    // 6. Assert cleanup state
    assert.equal(cardElement.style.transform, '');
    assert.equal(cardElement.classList.contains('swiping-pin'), false);
    assert.equal(cardElement.classList.contains('swiping-delete'), false);
    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);
    assert.equal(testNote.pinned, false, 'Note pinned state must not change during gesture cleanup');
    assert.equal(testNote.updatedAt, 1000, 'Note updatedAt must not change during gesture cleanup');
  } finally {
    const idx = notes.findIndex(n => n.id === 'test-card-9');
    if (idx !== -1) notes.splice(idx, 1);
    cleanupGlobals();
  }
});

test('Phase 4A - 10. Complete production touch sequence toggles note pin state and stray touchend does not re-toggle', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  const { elements } = setupMockDOM(win);

  const testNote = { id: 'test-note-10', title: 'Swipe Pin Note', pinned: false, updatedAt: 1000 };
  notes.push(testNote);

  try {
    initResponsiveState();
    initResponsiveGestures();

    // 1. Create real mock .note-card[data-id]
    const cardElement = global.document._createElement('card-10', 'div', 'note-card');
    cardElement.setAttribute('data-id', 'test-note-10');
    elements.set('card-10', cardElement);

    // 2. Dispatch touchstart
    global.document.dispatchEvent({
      type: 'touchstart',
      touches: [{ clientX: 100, clientY: 100 }],
      target: cardElement
    });

    // 3. Dispatch touchmove beyond 80px pin threshold
    global.document.dispatchEvent({
      type: 'touchmove',
      touches: [{ clientX: 200, clientY: 100 }],
      target: cardElement
    });

    // 4. Dispatch touchend
    global.document.dispatchEvent({
      type: 'touchend',
      changedTouches: [{ clientX: 200, clientY: 100 }],
      target: cardElement
    });

    // 5. Assert production results
    assert.equal(testNote.pinned, true, 'Note pinned state toggled from false to true');
    assert.ok(testNote.updatedAt > 1000, 'Note updatedAt was updated');
    assert.equal(cardElement.style.transform, '');
    assert.equal(cardElement.classList.contains('swiping-pin'), false);

    // 5b. Assert real render path completed: matching note card was appended to pinnedGrid
    const pinnedGrid = global.document.querySelector('#pinned-grid');
    assert.ok(pinnedGrid, 'pinned-grid element must exist');
    assert.ok(
      pinnedGrid.children.some(child => child.getAttribute && child.getAttribute('data-id') === 'test-note-10'),
      'Render path must append updated card with data-id="test-note-10" to pinnedGrid'
    );

    // 6. Dispatch another touchend without a new touchstart and prove note does not toggle again
    global.document.dispatchEvent({
      type: 'touchend',
      changedTouches: [{ clientX: 200, clientY: 100 }],
      target: cardElement
    });

    assert.equal(testNote.pinned, true, 'Stray touchend must not re-toggle note pinned state');
  } finally {
    const idx = notes.findIndex(n => n.id === 'test-note-10');
    if (idx !== -1) notes.splice(idx, 1);
    cleanupGlobals();
  }
});

test('Phase 4A - 11. Destroy/reset removes all gesture and responsive subscriptions', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 3);
    assert.equal(global.document._getDocListenerCount('touchmove'), 2);
    assert.equal(global.document._getDocListenerCount('touchend'), 3);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 1);

    destroyResponsiveGestures();

    assert.equal(global.document._getDocListenerCount('touchstart'), 0);
    assert.equal(global.document._getDocListenerCount('touchmove'), 0);
    assert.equal(global.document._getDocListenerCount('touchend'), 0);
    assert.equal(global.document._getDocListenerCount('touchcancel'), 0);

    // Change viewport state after destroy to ensure subscription is removed
    config.width = 1440;
    config.height = 900;
    win._dispatchWindowEvent('resize');

    assert.equal(global.document._getDocListenerCount('touchstart'), 0, 'No listeners re-installed after destroy');
  } finally {
    cleanupGlobals();
  }
});

/* ==========================================================================
   Phase 4B — Centralized Responsive Sidebar Interaction State Tests
   ========================================================================== */

test('Phase 4B - 1. Phone initialization removes pinned state', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(win);

  try {
    global.document.body.classList.add('sidebar-pinned');
    initResponsiveState();
    initResponsiveSidebarState();

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 2. Tablet portrait behaves as drawer (unpinned layout)', () => {
  const { win } = createMockEnvironment({ width: 768, height: 1024 });
  setupMockDOM(win);

  try {
    global.document.body.classList.add('sidebar-pinned');
    initResponsiveState();
    initResponsiveSidebarState();

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 3. Tablet landscape removes drawer and retains rail semantics', () => {
  const { win } = createMockEnvironment({ width: 1180, height: 820 });
  setupMockDOM(win);

  try {
    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');
    global.document.body.classList.add('sidebar-pinned');

    initResponsiveState();
    initResponsiveSidebarState();

    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 4. Desktop removes drawer and preserves pinned state', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);

  try {
    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');
    global.document.body.classList.add('sidebar-pinned');

    initResponsiveState();
    initResponsiveSidebarState();

    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 5. Phone menu toggles drawer only', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    const sidebar = global.document.querySelector('.app-sidebar');

    menuBtn.click();

    assert.equal(sidebar.classList.contains('sidebar-open'), true);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 6. Desktop menu toggles pinned only', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    const sidebar = global.document.querySelector('.app-sidebar');

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), true);

    menuBtn.click();

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
    assert.equal(sidebar.classList.contains('sidebar-open'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 7. Tablet-landscape menu does not toggle desktop pin state', () => {
  const { win } = createMockEnvironment({ width: 1180, height: 820 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    const sidebar = global.document.querySelector('.app-sidebar');

    menuBtn.click();

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
    assert.equal(sidebar.classList.contains('sidebar-open'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 8. Navigation selection closes drawer in both drawer modes', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');

    // Phone drawer mode
    sidebar.classList.add('sidebar-open');
    collapseSidebarAfterSelection();
    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);

    // Tablet portrait drawer mode
    config.width = 768;
    config.height = 1024;
    win._dispatchWindowEvent('resize');

    sidebar.classList.add('sidebar-open');
    collapseSidebarAfterSelection();
    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 9. Compact landscape phone uses drawer behavior', () => {
  const { win } = createMockEnvironment({ width: 844, height: 390, orientation: 'landscape' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    const sidebar = global.document.querySelector('.app-sidebar');

    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);

    menuBtn.click();

    assert.equal(sidebar.classList.contains('sidebar-open'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 10. Resize/rotation clears stale classes', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');

    // Rotate to tablet landscape
    config.width = 1180;
    config.height = 820;
    config.orientation = 'landscape';
    win._dispatchWindowEvent('resize');
    win._dispatchMediaQueryChange('(orientation: landscape)');

    assert.equal(getResponsiveState().layoutMode, 'tablet-landscape', 'State must be updated to tablet-landscape');
    assert.equal(sidebar.classList.contains('sidebar-open'), false);
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), false);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 11. Repeated initialization adds no duplicate listeners/subscriptions', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    const sidebar = global.document.querySelector('.app-sidebar');

    menuBtn.click();

    // Toggled once from false -> true (if duplicate listener existed it would toggle back to false)
    assert.equal(sidebar.classList.contains('sidebar-open'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B - 12. Destroy prevents later responsive changes from mutating sidebar state', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();
    destroyResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');

    // Resize to desktop
    config.width = 1440;
    config.height = 900;
    win._dispatchWindowEvent('resize');

    // Since destroyed, responsive subscription does not clear sidebar-open
    assert.equal(sidebar.classList.contains('sidebar-open'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 1. Menu click calls injected real callback once', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let callCount = 0;
    initResponsiveSidebarState({
      closeAllNoteCardMenus: () => { callCount++; }
    });

    const menuBtn = global.document.querySelector('.menu-btn');
    menuBtn.click();

    assert.equal(callCount, 1);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 2. Repeated initialization does not duplicate callback invocation', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let callCount = 0;
    const cb = () => { callCount++; };
    initResponsiveSidebarState({ closeAllNoteCardMenus: cb });
    initResponsiveSidebarState({ closeAllNoteCardMenus: cb });

    const menuBtn = global.document.querySelector('.menu-btn');
    menuBtn.click();

    assert.equal(callCount, 1);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 3. Missing callback does not throw', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    assert.doesNotThrow(() => {
      menuBtn.click();
    });
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 4. Capability-only change while a phone drawer is open keeps it open', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    const menuBtn = global.document.querySelector('.menu-btn');

    // Open phone drawer
    menuBtn.click();
    assert.equal(sidebar.classList.contains('sidebar-open'), true);

    // Trigger capability-only update (e.g. prefersReducedMotion change without layout change)
    config.prefersReducedMotion = true;
    win._dispatchMediaQueryChange('(prefers-reduced-motion: reduce)');

    assert.equal(getResponsiveState().layoutMode, 'phone');
    assert.equal(sidebar.classList.contains('sidebar-open'), true, 'Phone drawer must remain open on capability-only update');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 5. Capability-only change while a tablet-portrait drawer is open keeps it open', () => {
  const { win, config } = createMockEnvironment({ width: 768, height: 1024, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    const menuBtn = global.document.querySelector('.menu-btn');

    // Open tablet-portrait drawer
    menuBtn.click();
    assert.equal(sidebar.classList.contains('sidebar-open'), true);

    // Capability-only change within tablet-portrait
    config.prefersReducedMotion = true;
    win._dispatchMediaQueryChange('(prefers-reduced-motion: reduce)');

    assert.equal(getResponsiveState().layoutMode, 'tablet-portrait');
    assert.equal(sidebar.classList.contains('sidebar-open'), true, 'Tablet portrait drawer must remain open on capability-only update');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 6. Phone-to-tablet-landscape transition closes the drawer', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    const menuBtn = global.document.querySelector('.menu-btn');

    // Open phone drawer
    menuBtn.click();
    assert.equal(sidebar.classList.contains('sidebar-open'), true);

    // Resize/rotate to tablet landscape
    config.width = 1180;
    config.height = 820;
    config.orientation = 'landscape';
    win._dispatchWindowEvent('resize');
    win._dispatchMediaQueryChange('(orientation: landscape)');

    assert.equal(getResponsiveState().layoutMode, 'tablet-landscape');
    assert.equal(sidebar.classList.contains('sidebar-open'), false, 'Drawer must close on transition to tablet-landscape');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 7. Drawer-to-desktop transition closes the drawer', () => {
  const { win, config } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    const menuBtn = global.document.querySelector('.menu-btn');

    // Open phone drawer
    menuBtn.click();
    assert.equal(sidebar.classList.contains('sidebar-open'), true);

    // Resize to desktop
    config.width = 1440;
    config.height = 900;
    config.orientation = 'landscape';
    win._dispatchWindowEvent('resize');

    assert.equal(getResponsiveState().layoutMode, 'desktop');
    assert.equal(sidebar.classList.contains('sidebar-open'), false, 'Drawer must close on transition to desktop');
    assert.equal(global.document.body.classList.contains('sidebar-pinned'), true);
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 8. Destroy/reset clears callback and previous-layout state', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    let callCount = 0;
    initResponsiveSidebarState({ closeAllNoteCardMenus: () => { callCount++; } });

    destroyResponsiveSidebarState();

    const menuBtn = global.document.querySelector('.menu-btn');
    menuBtn.click();

    assert.equal(callCount, 0, 'Callback must not fire after destroy');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 4B Stab - 9. Reinitialization performs a clean initial synchronization', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, orientation: 'portrait' });
  setupMockDOM(win);

  try {
    initResponsiveState();
    initResponsiveSidebarState();

    const sidebar = global.document.querySelector('.app-sidebar');
    sidebar.classList.add('sidebar-open');

    destroyResponsiveSidebarState();

    // Reinitialize - should perform initial sync and clear stale sidebar-open class
    initResponsiveSidebarState();
    assert.equal(sidebar.classList.contains('sidebar-open'), false, 'Reinitialization must perform initial sync and clear stale drawer');
  } finally {
    cleanupGlobals();
  }
});

// ============================================================================
// PHASE 6A SECURITY, RICH-TEXT & MEDIA INTEGRATION TESTS (22 TESTS)
// ============================================================================

// 1. Plain-text integrity: A plain note containing <b>literal</b> displays literal tag text
test('Phase 6A Security 1 - Plain note containing <b>literal</b> displays literal tag text', () => {
  setupMockDOM();
  const note = {
    id: 'sec-plain-1',
    title: 'Plain Tag',
    text: '<b>literal</b>',
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody, 'Preview body MUST exist for plain text note');

  const bElement = findMockDescendant(previewBody, el => el.tagName === 'B');
  assert.equal(bElement, null, 'Plain note MUST NOT render HTML <b> element');

  cleanupGlobals();
});

// 2. Plain-text integrity: A plain note containing <button>Example</button> does not create a BUTTON element
test('Phase 6A Security 2 - Plain note containing <button>Example</button> does not create a BUTTON element', () => {
  setupMockDOM();
  const note = {
    id: 'sec-plain-2',
    title: 'Plain Button Tag',
    text: '<button>Example</button>',
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const btnElement = findMockDescendant(previewBody, el => el.tagName === 'BUTTON' && el.textContent?.includes('Example'));
  assert.equal(btnElement, null, 'Plain note MUST NOT construct BUTTON element from tag text');

  cleanupGlobals();
});

// 3. Plain-text integrity: A plain note containing <img src=x onerror="..."> does not create an IMG element
test('Phase 6A Security 3 - Plain note containing <img src=x onerror="..."> does not create an IMG element', () => {
  setupMockDOM();
  const note = {
    id: 'sec-plain-3',
    title: 'Plain Img Tag',
    text: '<img src=x onerror="alert(1)">',
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const imgElement = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.equal(imgElement, null, 'Plain note MUST NOT construct IMG element from tag text');

  cleanupGlobals();
});

// 4. Plain-text integrity: Plain-text HTML-like content remains unchanged in stored note data
test('Phase 6A Security 4 - Plain-text HTML-like content remains unchanged in stored note data', () => {
  setupMockDOM();
  const note = {
    id: 'sec-plain-4',
    title: 'Stored Plain Note',
    text: '<code><script>alert("test")</script></code>',
    type: 'text'
  };

  const snapshotBefore = JSON.stringify(note);
  createNoteCardElement(note);
  const snapshotAfter = JSON.stringify(note);

  assert.equal(snapshotBefore, snapshotAfter, 'Rendering note MUST NOT mutate stored plain note text');
  assert.equal(note.text, '<code><script>alert("test")</script></code>');

  cleanupGlobals();
});

// 5. Explicit rich-text behavior: isRichText: true preserves allowed formatting (paragraphs, strong, em, safe links)
test('Phase 6A Security 5 - isRichText: true preserves allowed formatting (p, strong, em, safe a)', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-5',
    title: 'Rich Formatting',
    text: '<p>Paragraph <strong>strong</strong> <em>em</em> <a href="https://example.com">link</a></p>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const pEl = findMockDescendant(previewBody, el => el.tagName === 'P');
  assert.ok(pEl, 'Rich text MUST preserve <p> element');

  cleanupGlobals();
});

// 6. Explicit rich-text behavior: Script, style, iframe, object, embed, link, meta, base, and form elements are removed
test('Phase 6A Security 6 - Script, style, iframe, object, embed, link, meta, base, form elements are removed', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-6',
    title: 'Unsafe Elements',
    text: '<script>alert(1)</script><style>body{}</style><iframe src="evil.html"></iframe><object data="a"></object><embed src="a"><link rel="stylesheet"><meta charset="utf-8"><base href="a"><form action="a"></form><p>Safe content</p>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM'].forEach(tag => {
    const el = findMockDescendant(previewBody, e => e.tagName === tag);
    assert.equal(el, null, `<${tag.toLowerCase()}> tags MUST be sanitized from rich text`);
  });

  cleanupGlobals();
});

// 7. Explicit rich-text behavior: Attributes such as onerror, onclick, onload, onfocus, and other on* attributes are removed
test('Phase 6A Security 7 - Inline on* event handler attributes are removed', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-7',
    title: 'Event Attributes',
    text: '<img src="https://example.com/photo.jpg" onerror="alert(1)" onclick="alert(2)" onload="alert(3)" onfocus="alert(4)">',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.ok(imgEl, 'Image element MUST remain');
  assert.equal(imgEl.getAttribute('onerror'), null, 'onerror attribute MUST be removed');
  assert.equal(imgEl.getAttribute('onclick'), null, 'onclick attribute MUST be removed');
  assert.equal(imgEl.getAttribute('onload'), null, 'onload attribute MUST be removed');
  assert.equal(imgEl.getAttribute('onfocus'), null, 'onfocus attribute MUST be removed');

  cleanupGlobals();
});

// 8. Explicit rich-text behavior: javascript: and vbscript: URLs are removed regardless of casing or surrounding whitespace
test('Phase 6A Security 8 - javascript: and vbscript: URLs are removed', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-8',
    title: 'Unsafe Protocols',
    text: '<a href=" JAVASCRIPT:alert(1) ">Link 1</a><a href="vbscript:msgbox(1)">Link 2</a>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const aElements = previewBody.querySelectorAll ? previewBody.querySelectorAll('a') : [];
  aElements.forEach(a => {
    const href = a.getAttribute('href');
    assert.equal(href, null, 'javascript: and vbscript: href attributes MUST be removed');
  });

  cleanupGlobals();
});

// 9. Explicit rich-text behavior: Unsafe data URLs are removed
test('Phase 6A Security 9 - Unsafe data URLs are removed', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-9',
    title: 'Unsafe Data URL',
    text: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Unsafe Data Link</a>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const aEl = findMockDescendant(previewBody, el => el.tagName === 'A');
  if (aEl) {
    assert.equal(aEl.getAttribute('href'), null, 'Unsafe data:text/html URL MUST be removed');
  }

  cleanupGlobals();
});

// 10. Explicit rich-text behavior: Required safe Paperuss image data URLs remain supported
test('Phase 6A Security 10 - Safe Paperuss image data URLs remain supported', () => {
  setupMockDOM();
  const safeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const note = {
    id: 'sec-rich-10',
    title: 'Safe Data URL',
    text: `<img src="${safeDataUrl}">`,
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.ok(imgEl, 'Safe image data URL MUST preserve IMG element');
  assert.equal(imgEl.getAttribute('src'), safeDataUrl, 'Safe image data URL MUST be preserved in src attribute');

  cleanupGlobals();
});

// 11. Explicit rich-text behavior: contenteditable is removed
test('Phase 6A Security 11 - contenteditable attribute is removed from preview elements', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-11',
    title: 'Contenteditable Test',
    text: '<div contenteditable="true"><span contenteditable="events">Text</span></div>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const editableEl = findMockDescendant(previewBody, el => el.hasAttribute && el.hasAttribute('contenteditable'));
  assert.equal(editableEl, null, 'contenteditable attributes MUST be removed from preview elements');

  cleanupGlobals();
});

// 12. Explicit rich-text behavior: Preview checkbox inputs remain disabled
test('Phase 6A Security 12 - Preview checkbox inputs remain disabled', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-12',
    title: 'Checkbox Test',
    text: '<p><input type="checkbox"> Task item</p>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const checkboxEl = findMockDescendant(previewBody, el => el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'checkbox');
  assert.ok(checkboxEl, 'Checkbox input MUST exist');
  assert.ok(checkboxEl.getAttribute('disabled'), 'Checkbox input MUST have disabled attribute set');

  cleanupGlobals();
});

// 13. Explicit rich-text behavior: Unsafe SVG/MathML payloads cannot preserve executable attributes or URLs
test('Phase 6A Security 13 - Unsafe SVG/MathML payloads are sanitized', () => {
  setupMockDOM();
  const note = {
    id: 'sec-rich-13',
    title: 'SVG Payload Test',
    text: '<svg onload="alert(1)"><use xlink:href="javascript:alert(2)"></use><foreignObject><script>alert(3)</script></foreignObject></svg>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const svgEl = findMockDescendant(previewBody, el => el.tagName === 'SVG');
  if (svgEl) {
    assert.equal(svgEl.getAttribute('onload'), null, 'SVG onload attribute MUST be removed');
  }

  const scriptEl = findMockDescendant(previewBody, el => el.tagName === 'SCRIPT');
  assert.equal(scriptEl, null, 'Script inside SVG foreignObject MUST be removed');

  cleanupGlobals();
});

// 14. Media integration: An explicit rich-text body image matching the media hub is suppressed
test('Phase 6A Media 14 - Explicit rich-text body image matching media hub is suppressed', () => {
  setupMockDOM();
  const note = {
    id: 'sec-media-14',
    title: 'Media Hub Matching',
    text: '<p>Text before</p><img src="https://example.com/matched.jpg"><p>Text after</p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/matched.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.equal(imgEl, null, 'Duplicated body image matching media hub MUST be suppressed');

  cleanupGlobals();
});

// 15. Media integration: Surrounding rich-text content remains visible
test('Phase 6A Media 15 - Surrounding rich-text content remains visible', () => {
  setupMockDOM();
  const note = {
    id: 'sec-media-15',
    title: 'Surrounding Content',
    text: '<p>Surrounding text before</p><img src="https://example.com/matched.jpg"><p>Surrounding text after</p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/matched.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const textContent = previewBody.innerHTML || previewBody.textContent || '';
  assert.ok(textContent.includes('Surrounding text before'), 'Text before suppressed image MUST remain visible');
  assert.ok(textContent.includes('Surrounding text after'), 'Text after suppressed image MUST remain visible');

  cleanupGlobals();
});

// 16. Media integration: A distinct rich-text body image remains visible
test('Phase 6A Media 16 - A distinct rich-text body image remains visible', () => {
  setupMockDOM();
  const note = {
    id: 'sec-media-16',
    title: 'Distinct Image',
    text: '<p>Body text</p><img src="https://example.com/body-unique.jpg">',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/hub-hero.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.ok(imgEl, 'Distinct non-matching body image MUST remain visible');

  cleanupGlobals();
});

// 17. Media integration: A duplicate-only rich-text body removes the empty preview wrapper
test('Phase 6A Media 17 - A duplicate-only rich-text body removes empty preview wrapper', () => {
  setupMockDOM();
  const note = {
    id: 'sec-media-17',
    title: 'Duplicate Only',
    text: '<p><img src="https://example.com/only-dup.jpg"></p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/only-dup.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.equal(previewBody, null, 'Empty preview body wrapper MUST be removed when body contained only duplicated image');

  cleanupGlobals();
});

// 18. Media integration: Deduplication and sanitization do not mutate the note or attachment objects
test('Phase 6A Media 18 - Deduplication and sanitization do not mutate note or attachment objects', () => {
  setupMockDOM();
  const note = {
    id: 'sec-media-18',
    title: 'Immutability Check',
    text: '<p>Before</p><img src="https://example.com/shared.jpg"><p>After</p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/shared.jpg',
    fileAttachments: [
      { id: 'att-immut', type: 'image', url: 'https://example.com/shared.jpg' }
    ]
  };

  const noteCopy = JSON.parse(JSON.stringify(note));
  createNoteCardElement(note);

  assert.deepEqual(note, noteCopy, 'Note object and attachments MUST NOT be mutated during card rendering');

  cleanupGlobals();
});

// 19. Legacy handling: Evidence-backed legacy rich-text records use safe rich-text path
test('Phase 6A Legacy 19 - Evidence-backed legacy rich-text records use safe rich-text path', () => {
  setupMockDOM();
  const legacyNote = {
    id: 'sec-leg-19',
    title: 'Legacy Glass Note',
    text: '<p>Glass Editor Content</p>',
    editorMode: 'glass',
    type: 'text'
  };

  const card = createNoteCardElement(legacyNote);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const pEl = findMockDescendant(previewBody, el => el.tagName === 'P');
  assert.ok(pEl, 'Legacy note with editorMode: glass MUST enter safe rich-text rendering path');

  cleanupGlobals();
});

// 20. Legacy handling: An unmarked plain-text record with HTML-looking text never enters the legacy-rich-text path
test('Phase 6A Legacy 20 - Unmarked plain-text record with HTML-looking text renders literally as plain text', () => {
  setupMockDOM();
  const plainNote = {
    id: 'sec-leg-20',
    title: 'Unmarked HTML Text Note',
    text: '<div>Plain text tag</div>',
    type: 'text'
  };

  const card = createNoteCardElement(plainNote);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody, 'Preview body MUST exist');

  const textDiv = findMockDescendant(previewBody, el => el.classList?.contains('note-text'));
  assert.ok(textDiv, 'Plain text note container MUST exist');
  assert.ok(textDiv.innerHTML?.includes('Plain text tag') || textDiv.textContent?.includes('Plain text tag'), 'Plain text note content MUST be rendered');

  let childDiv = null;
  if (textDiv.children) {
    for (const child of textDiv.children) {
      const found = findMockDescendant(child, el => el.tagName === 'DIV');
      if (found) { childDiv = found; break; }
    }
  }
  assert.equal(childDiv, null, 'Plain-text note MUST NOT parse HTML tag text into an inner DIV element');

  cleanupGlobals();
});

// 21. Legacy handling: Tests identify the real legacy marker being exercised (editorMode: glass / isRichText: true)
test('Phase 6A Legacy 21 - Explicit property markers (isRichText / editorMode: glass) are validated by classifier helper', () => {
  assert.strictEqual(isRichTextNote({ isRichText: true }), true, 'isRichText: true is recognized');
  assert.strictEqual(isRichTextNote({ editorMode: 'glass' }), true, 'editorMode: glass is recognized');
  assert.strictEqual(isRichTextNote({ isRichText: 'true' }), false, 'String rich-text flags are not inferred');
  assert.strictEqual(isRichTextNote({ isRichText: 1 }), false, 'Numeric rich-text flags are not inferred');
  assert.strictEqual(isRichTextNote({ editorMode: 'rich' }), false, 'Undocumented editor modes are not inferred');
  assert.strictEqual(isRichTextNote({ editorMode: 'rich-text' }), false, 'Undocumented editor modes are not inferred');
  assert.strictEqual(isRichTextNote({ text: '<p>HTML</p>' }), false, 'Plain text with HTML tags without property marker returns false');
});

test('Phase 6A Security - data media URLs are allowed only on matching media source attributes', () => {
  setupMockDOM();
  const pngData = 'data:image/png;base64,iVBORw0KGgo=';
  const audioData = 'data:audio/mpeg;base64,SUQz';
  const note = {
    id: 'sec-data-context',
    title: 'Contextual data URLs',
    text: [
      `<img src="${pngData}">`,
      `<a href="${pngData}">Image link</a>`,
      `<audio src="${audioData}"></audio>`,
      `<a href="${audioData}">Audio link</a>`
    ].join(''),
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  const audioEl = findMockDescendant(previewBody, el => el.tagName === 'AUDIO');
  const anchors = [];
  const collectAnchors = (el) => {
    if (!el) return;
    if (el.tagName === 'A') anchors.push(el);
    (el.children || []).forEach(collectAnchors);
  };
  collectAnchors(previewBody);

  assert.equal(imgEl?.getAttribute('src'), pngData);
  assert.equal(audioEl?.getAttribute('src'), audioData);
  anchors.forEach(anchor => assert.equal(anchor.getAttribute('href'), null));
  cleanupGlobals();
});

test('Phase 6A Security - SVG data URLs are rejected from rich-text media and links', () => {
  setupMockDOM();
  const svgData = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const note = {
    id: 'sec-svg-data',
    title: 'SVG data URL',
    text: `<img src="${svgData}"><a href="${svgData}">SVG link</a>`,
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  const imgEl = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  const anchorEl = findMockDescendant(previewBody, el => el.tagName === 'A');

  assert.equal(imgEl?.getAttribute('src'), null);
  assert.equal(anchorEl?.getAttribute('href'), null);
  cleanupGlobals();
});

// 22. Legacy handling: Do not use a synthetic "any HTML means legacy" assumption
test('Phase 6A Legacy 22 - Synthetic "any HTML means legacy" assumption is rejected', () => {
  const plainHtmlNote = { id: 'leg-22', title: 'Test', text: '<section>Sample</section>', type: 'text' };
  assert.strictEqual(isRichTextNote(plainHtmlNote), false, 'Arbitrary HTML tags DO NOT trigger rich-text classification');
});

// Phone Grid Safety Test

function findMockDescendant(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const match = findMockDescendant(child, predicate);
    if (match) return match;
  }
  return null;
}

function persistedStorageContainsNote(noteId) {
  return Array.from(global.localStorage?._storageMap?.values?.() || []).some((value) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.some(note => note?.id === noteId);
    } catch {
      return false;
    }
  });
}

function configureCardActionPersistence() {
  initSync({
    getCurrentUser: () => null,
    getNotes: () => notes,
    getCustomFolders: () => []
  });
}

test('Phase 5A - desktop and mobile pin controls share the production pin action', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  const note = { id: 'phase5a-pin', title: 'Shared pin', text: '', type: 'text', pinned: false, updatedAt: 1000 };
  notes.push(note);

  try {
    configureCardActionPersistence();
    const spine = buildSpineCardActions(note);
    const mockCard = global.document.createElement('div', 'note-card');
    const { cardMenu } = buildCompactPhoneCardActions(note, mockCard);

    const desktopPin = findMockDescendant(spine, el => el.title === 'Pin');
    const mobilePin = findMockDescendant(cardMenu, el => el.getAttribute?.('aria-label') === 'Pin note');
    assert.ok(desktopPin, 'Desktop spine pin control must exist');
    assert.ok(mobilePin, 'Mobile/card-menu pin control must exist');

    let desktopStopped = 0;
    desktopPin.dispatchEvent({ type: 'click', stopPropagation: () => { desktopStopped++; }, target: desktopPin });
    assert.equal(note.pinned, true);
    assert.equal(note.updatedAt, 1000, 'Pin preserves its existing timestamp behavior');
    assert.equal(desktopStopped, 1);
    assert.equal(persistedStorageContainsNote(note.id), true, 'Pin action persists the real notes collection');

    let mobileStopped = 0;
    mobilePin.dispatchEvent({ type: 'click', stopPropagation: () => { mobileStopped++; }, target: mobilePin });
    assert.equal(note.pinned, false, 'Mobile control invokes the same reversible pin mutation');
    assert.equal(mobileStopped, 1);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5A - desktop favorite control synchronizes favorite and starred reversibly', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  const note = { id: 'phase5a-favorite', title: 'Shared favorite', text: '', type: 'text', favorite: false, starred: false, updatedAt: 1000 };
  notes.push(note);

  try {
    configureCardActionPersistence();
    const card = createNoteCardElement(note);
    const favoriteButton = findMockDescendant(card, el => el.getAttribute?.('aria-label') === 'Add to Favorites');
    assert.ok(favoriteButton);

    favoriteButton.dispatchEvent({ type: 'click', stopPropagation: () => {}, target: favoriteButton });
    assert.equal(note.favorite, true);
    assert.equal(note.starred, true);
    assert.ok(note.updatedAt > 1000);
    const firstUpdatedAt = note.updatedAt;
    assert.equal(persistedStorageContainsNote(note.id), true);

    toggleNoteCardFavorite(note, { stopPropagation() {} });
    assert.equal(note.favorite, false);
    assert.equal(note.starred, false);
    assert.ok(note.updatedAt >= firstUpdatedAt);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5A - desktop and mobile theme controls invoke the shared theme action', () => {
  const { win } = createMockEnvironment({ width: 768, height: 1024 });
  setupMockDOM(win);
  const note = { id: 'phase5a-theme', title: 'Shared theme', text: '', type: 'text', updatedAt: 1000 };
  notes.push(note);

  try {
    const spine = buildSpineCardActions(note);
    const mockCard = global.document.createElement('div', 'note-card');
    const { cardMenu } = buildCompactPhoneCardActions(note, mockCard);

    const desktopTheme = findMockDescendant(spine, el => el.title === 'Change Theme');
    const mobileTheme = findMockDescendant(cardMenu, el => el.getAttribute?.('aria-label') === 'Change note theme');
    const themePicker = global.document.getElementById('theme-picker-v2');
    assert.ok(desktopTheme);
    assert.ok(mobileTheme);

    desktopTheme.dispatchEvent({ type: 'click', stopPropagation: () => {}, target: desktopTheme });
    assert.equal(themePicker.classList.contains('visible'), true);
    themePicker.classList.remove('visible');

    mobileTheme.dispatchEvent({ type: 'click', stopPropagation: () => {}, target: mobileTheme });
    assert.equal(themePicker.classList.contains('visible'), true);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5A - both More controls share menu behavior without opening the editor', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  const note = { id: 'phase5a-menu', title: 'Shared menu', text: '', type: 'text', updatedAt: 1000 };

  try {
    const card = createNoteCardElement(note);
    const desktopMore = findMockDescendant(card, el => el.title === 'More Actions');
    const menu = findMockDescendant(card, el => el !== card && el.classList?.contains('note-card-menu'));
    assert.ok(desktopMore);
    assert.ok(menu);

    let stopped = 0;
    desktopMore.dispatchEvent({ type: 'click', stopPropagation: () => { stopped++; }, target: desktopMore });
    assert.equal(menu.classList.contains('open'), true);
    assert.equal(stopped, 1, 'Shared action stops propagation before the card editor click path');
  } finally {
    cleanupGlobals();
  }
});

test('Phase 5A - shared card actions reject invalid input without mutating notes', () => {
  const beforeIds = notes.map(note => note.id);
  let stops = 0;
  const event = { stopPropagation: () => { stops++; } };

  assert.equal(toggleNoteCardPin(null, event), false);
  assert.equal(toggleNoteCardFavorite(undefined, event), false);
  assert.equal(openNoteCardTheme('invalid', event), false);
  assert.equal(toggleNoteCardActionMenu(null, null, event), false);
  assert.deepEqual(notes.map(note => note.id), beforeIds);
  assert.equal(stops, 4, 'Invalid actions still prevent accidental parent-card activation');
});

// ============================================================================
// PHASE 5B SHARED NOTE-CARD STATE ACTION TESTS
// ============================================================================

test('Phase 5B - card archive control uses the shared reversible archive action', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  const note = {
    id: 'phase5b-archive',
    title: 'Shared archive',
    text: '',
    type: 'text',
    pinned: true,
    archived: false,
    deleted: false,
    updatedAt: 1000
  };
  notes.push(note);

  try {
    configureCardActionPersistence();
    const card = createNoteCardElement(note);
    const archiveButton = findMockDescendant(
      card,
      el => el.getAttribute?.('aria-label') === 'Archive note'
    );
    assert.ok(archiveButton, 'Card archive control must exist');

    let stopped = 0;
    archiveButton.dispatchEvent({
      type: 'click',
      stopPropagation: () => { stopped++; },
      target: archiveButton
    });
    assert.equal(note.archived, true);
    assert.equal(note.deleted, false);
    assert.equal(note.pinned, false);
    assert.ok(note.updatedAt > 1000);
    assert.equal(stopped, 1);
    assert.equal(persistedStorageContainsNote(note.id), true);

    toggleNoteCardArchive(note, { stopPropagation() {} });
    assert.equal(note.archived, false, 'Shared action restores an archived note');
    assert.equal(note.deleted, false);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5B - card trash control and shared restore action preserve note lifecycle state', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);
  const note = {
    id: 'phase5b-trash',
    title: 'Shared trash',
    text: '',
    type: 'text',
    pinned: true,
    archived: true,
    deleted: false,
    updatedAt: 1000
  };
  notes.push(note);

  try {
    configureCardActionPersistence();
    const card = createNoteCardElement(note);
    const trashButton = findMockDescendant(
      card,
      el => el.getAttribute?.('aria-label') === 'Move note to delete page'
    );
    assert.ok(trashButton, 'Card trash control must exist');

    let stopped = 0;
    trashButton.dispatchEvent({
      type: 'click',
      stopPropagation: () => { stopped++; },
      target: trashButton
    });
    assert.equal(note.deleted, true);
    assert.equal(note.archived, false);
    assert.equal(note.pinned, false);
    assert.ok(note.deletedAt);
    assert.equal(stopped, 1);
    assert.equal(persistedStorageContainsNote(note.id), true);

    toggleNoteCardArchive(note, { stopPropagation() {} });
    assert.equal(note.deleted, false, 'Archive action restores a note when invoked from Trash');
    assert.equal(note.archived, false);
    assert.equal(note.deletedAt, null);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5B - swipe-compatible pin options preserve control semantics and add swipe feedback state', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);
  const note = {
    id: 'phase5b-swipe-pin',
    title: 'Swipe pin',
    text: '',
    type: 'text',
    pinned: false,
    updatedAt: 1000
  };
  notes.push(note);

  try {
    configureCardActionPersistence();
    assert.equal(
      toggleNoteCardPin(note, null, { updateTimestamp: true, showFeedback: true }),
      true
    );
    assert.equal(note.pinned, true);
    assert.ok(note.updatedAt > 1000, 'Swipe pin path retains its timestamp update');
    assert.equal(persistedStorageContainsNote(note.id), true);
  } finally {
    const index = notes.findIndex(item => item.id === note.id);
    if (index !== -1) notes.splice(index, 1);
    cleanupGlobals();
  }
});

test('Phase 5B - new shared lifecycle actions reject invalid input safely', () => {
  const beforeIds = notes.map(note => note.id);
  let stops = 0;
  const event = { stopPropagation: () => { stops++; } };

  assert.equal(toggleNoteCardArchive(null, event), false);
  assert.equal(deleteNoteCard(undefined, event), false);
  assert.deepEqual(notes.map(note => note.id), beforeIds);
assert.equal(stops, 2);
});

// ============================================================================
// PHASE 6A RESPONSIVE NOTE CARDS & DENSITY TESTS
// ============================================================================

test('Phase 6A - one incompatible saved note cannot prevent the remaining grid from rendering', () => {
  setupMockDOM();
  const grid = document.createElement('div');
  const savedConsoleError = console.error;
  console.error = () => {};

  try {
    renderGrid(grid, [
      { id: 'legacy-bad-title', title: { legacy: true }, text: 'Still saved locally', type: 'text' },
      { id: 'healthy-note', title: 'Healthy note', text: 'Visible content', type: 'text' }
    ]);

    assert.equal(grid.children.length, 2, 'Both the fallback card and healthy card must remain visible');
    assert.ok(grid.children[0].classList.contains('note-card-fallback'), 'Incompatible note must receive a safe fallback card');
    assert.equal(grid.children[0].getAttribute('data-id'), 'legacy-bad-title');
    assert.equal(grid.children[1].getAttribute('data-id'), 'healthy-note');
  } finally {
    console.error = savedConsoleError;
    cleanupGlobals();
  }
});

test('Phase 6A - desktop and tablet cards do not contain phone menu toggle node', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  initResponsiveState();

  const note = { id: 'p6a-no-toggle', title: 'Desktop Card', text: 'Text content', type: 'text' };
  const card = createNoteCardElement(note);

  const toggle = findMockDescendant(card, el => el.classList?.contains('note-card-menu-toggle'));
  assert.equal(toggle, null, 'Desktop card must NOT create note-card-menu-toggle node');
  const spine = findMockDescendant(card, el => el.classList?.contains('note-card-spine'));
  assert.ok(spine, 'Desktop card must create spine');

  cleanupGlobals();
});

test('Phase 6A - production layout transition replaces cards in production grid on desktop-to-phone mode change', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-1', title: 'Production Note 1', text: 'Body content', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  assert.ok(othersGrid, '#others-grid must exist in mock DOM');
  assert.ok(othersGrid.children.length > 0, 'Initial render must populate #others-grid');

  const oldCardNode = othersGrid.children[0];
  assert.equal(oldCardNode.getAttribute('data-layout-mode'), 'desktop');
  assert.ok(findMockDescendant(oldCardNode, el => el.classList?.contains('note-card-spine')));
  assert.equal(findMockDescendant(oldCardNode, el => el.classList?.contains('note-card-menu-toggle')), null);

  // Trigger real desktop-to-phone transition
  win._updateConfig({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  win._dispatchWindowEvent('resize');

  const newCardNode = othersGrid.children[0];
  assert.notEqual(newCardNode, oldCardNode, 'Production transition MUST replace card node in production grid');
  assert.equal(newCardNode.getAttribute('data-layout-mode'), 'phone');
  assert.equal(findMockDescendant(newCardNode, el => el.classList?.contains('note-card-spine')), null, 'Phone card must have no spine');
  assert.ok(findMockDescendant(newCardNode, el => el.classList?.contains('note-card-menu-toggle')), 'Phone card must have compact toggle');

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - production layout transition from phone to tablet portrait rerenders grid with spine and no phone toggle', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-2', title: 'Production Note 2', text: 'Tablet transition test', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  const phoneCardNode = othersGrid.children[0];
  assert.equal(phoneCardNode.getAttribute('data-layout-mode'), 'phone');
  assert.ok(findMockDescendant(phoneCardNode, el => el.classList?.contains('note-card-menu-toggle')));

  // Trigger real phone-to-tablet-portrait transition
  win._updateConfig({ width: 800, height: 1024, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  win._dispatchWindowEvent('resize');

  const tabletCardNode = othersGrid.children[0];
  assert.notEqual(tabletCardNode, phoneCardNode, 'Phone-to-tablet transition MUST replace card node in production grid');
  assert.equal(tabletCardNode.getAttribute('data-layout-mode'), 'tablet-portrait');
  assert.ok(findMockDescendant(tabletCardNode, el => el.classList?.contains('note-card-spine')), 'Tablet portrait must render spine');
  assert.equal(findMockDescendant(tabletCardNode, el => el.classList?.contains('note-card-menu-toggle')), null, 'Tablet portrait must NOT render phone toggle');

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - production layout transition from tablet portrait to tablet landscape updates layout mode cleanly', () => {
  const { win } = createMockEnvironment({ width: 800, height: 1024, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-3', title: 'Tablet Portrait to Landscape', text: 'Text', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  assert.ok(othersGrid);

  // Switch to tablet landscape
  win._updateConfig({ width: 1180, height: 820, pointer: 'coarse', maxTouchPoints: 5, orientation: 'landscape' });
  win._dispatchWindowEvent('resize');

  const cardNode = othersGrid.children[0];
  assert.equal(cardNode.getAttribute('data-layout-mode'), 'tablet-landscape');
  assert.ok(findMockDescendant(cardNode, el => el.classList?.contains('note-card-spine')));
  assert.equal(findMockDescendant(cardNode, el => el.classList?.contains('note-card-menu-toggle')), null);

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - capability-only state changes do not rerender cards or replace grid elements', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900, pointer: 'fine', hover: 'hover' });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-cap', title: 'Capability Test', text: 'Text', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  const cardBefore = othersGrid.children[0];

  // Change pointer & hover capability without changing width/layoutMode
  win._updateConfig({ pointer: 'coarse', hover: 'none', reducedMotion: true, displayMode: 'standalone' });
  win._dispatchWindowEvent('resize');

  const cardAfter = othersGrid.children[0];
  assert.equal(cardAfter, cardBefore, 'Capability-only changes MUST NOT replace production card node');

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - repeated initResponsiveCardLifecycle calls do not add duplicate subscriptions', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-dup', title: 'Idempotency Note', text: 'Text', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();
  initResponsiveCardLifecycle();
  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  const cardBefore = othersGrid.children[0];

  // Trigger one transition
  win._updateConfig({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  win._dispatchWindowEvent('resize');

  const cardAfter = othersGrid.children[0];
  assert.notEqual(cardAfter, cardBefore);

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - destroyResponsiveCardLifecycle prevents subsequent responsive state changes from rerendering cards', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-destroy', title: 'Teardown Note', text: 'Text', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();
  const othersGrid = sharedMockElements.get('others-grid');
  const cardBeforeDestroy = othersGrid.children[0];

  destroyResponsiveCardLifecycle();

  // Resize after teardown
  win._updateConfig({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  win._dispatchWindowEvent('resize');

  const cardAfterDestroy = othersGrid.children[0];
  assert.equal(cardAfterDestroy, cardBeforeDestroy, 'Teardown MUST prevent card rerendering on responsive state change');

  cleanupGlobals();
});

test('Phase 6A - destroy followed by initialization restores one clean subscription', () => {
  const { win } = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(win);
  initResponsiveState();
  destroyResponsiveCardLifecycle();

  notes.length = 0;
  notes.push({ id: 'prod-note-reinit', title: 'Reinit Note', text: 'Text', type: 'text' });
  renderNotes();

  initResponsiveCardLifecycle();
  destroyResponsiveCardLifecycle();
  initResponsiveCardLifecycle();

  const othersGrid = sharedMockElements.get('others-grid');
  const cardOld = othersGrid.children[0];

  win._updateConfig({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5, orientation: 'portrait' });
  win._dispatchWindowEvent('resize');

  const cardNew = othersGrid.children[0];
  assert.notEqual(cardNew, cardOld, 'Reinitialization after destroy MUST work cleanly');

  destroyResponsiveCardLifecycle();
  cleanupGlobals();
});

test('Phase 6A - genuine media deduplication integration: rich-text note body image matching hub is suppressed while surrounding text remains', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-1',
    title: 'Rich Text Dedup',
    text: '<p>Meaningful text before</p><img src="https://example.com/shared-photo.jpg"><p>Meaningful text after</p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/shared-photo.jpg',
    fileAttachments: [
      { id: 'att-shared', type: 'image', url: 'https://example.com/shared-photo.jpg' }
    ]
  };

  const snapshotBefore = JSON.stringify(note);
  const card = createNoteCardElement(note);
  const snapshotAfter = JSON.stringify(note);

  assert.equal(snapshotBefore, snapshotAfter, 'Deduplication MUST NOT mutate stored note object');

  const hub = findMockDescendant(card, el => el.classList?.contains('note-media-hub'));
  assert.ok(hub, 'Media hub MUST render photo slide from fileAttachments');

  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody, 'Preview body MUST exist for note containing surrounding text');

  const bodyImgs = previewBody.children?.filter(c => c.tagName === 'IMG') || [];
  assert.equal(bodyImgs.length, 0, 'Preview body MUST contain no matching <img> element');

  const textContent = previewBody.innerHTML || '';
  assert.ok(textContent.includes('Meaningful text before'), 'Meaningful text before image MUST remain visible');
  assert.ok(textContent.includes('Meaningful text after'), 'Meaningful text after image MUST remain visible');

  cleanupGlobals();
});

test('Phase 6A - media deduplication: body containing only duplicated image removes empty preview body wrapper', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-2',
    title: 'Only Image Note',
    text: '<p><img src="https://example.com/hero-only.jpg"></p>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/hero-only.jpg',
    fileAttachments: [
      { id: 'att-hero-only', type: 'image', url: 'https://example.com/hero-only.jpg' }
    ]
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.equal(previewBody, null, 'Empty preview body wrapper MUST be removed when body contained only duplicated image');

  cleanupGlobals();
});

test('Phase 6A - media deduplication: non-matching body image remains visible', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-3',
    title: 'Two Different Images',
    text: '<p>Body text</p><img src="https://example.com/unique-body.jpg">',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/hub-photo.jpg',
    fileAttachments: [
      { id: 'att-hub', type: 'image', url: 'https://example.com/hub-photo.jpg' }
    ]
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const previewImg = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.ok(previewImg, 'Different body image MUST remain visible in preview body');

  cleanupGlobals();
});

test('Phase 6A - media deduplication: URLs sharing only filename are not deduplicated', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-4',
    title: 'Filename Collision Note',
    text: '<p>Text</p><img src="https://cdn.b.com/other/photo.jpg">',
    isRichText: true,
    type: 'text',
    image: 'https://cdn.a.com/photo.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const previewImg = findMockDescendant(previewBody, el => el.tagName === 'IMG');
  assert.ok(previewImg, 'Images with different URLs sharing only filename MUST NOT be deduplicated');

  cleanupGlobals();
});

test('Phase 6A - media deduplication: attachment ID matching deduplicates correctly', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-5',
    title: 'Attachment ID Matching',
    text: '<p>Text</p><img data-attachment-id="att-99" src="https://example.com/local-copy.jpg">',
    isRichText: true,
    type: 'text',
    fileAttachments: [
      { id: 'att-99', type: 'image', url: 'https://example.com/server-copy.jpg' }
    ]
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  if (previewBody) {
    const previewImgs = previewBody.children?.filter(c => c.tagName === 'IMG') || [];
    assert.equal(previewImgs.length, 0, 'Image matching attachment ID att-99 MUST be deduplicated');
  }

  cleanupGlobals();
});

test('Phase 6A - media deduplication: legacy rich-text image markup uses same production path', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-6',
    title: 'Legacy Rich Text',
    text: '<div class="rich-text"><img src="https://example.com/legacy.jpg"><p>Legacy text</p></div>',
    isRichText: true,
    type: 'text',
    image: 'https://example.com/legacy.jpg'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);
  const textContent = previewBody.innerHTML || '';
  assert.ok(textContent.includes('Legacy text'), 'Legacy text MUST be preserved');

  cleanupGlobals();
});

test('Phase 6A - media deduplication: unsafe rich-text elements remain sanitized', () => {
  setupMockDOM();
  const note = {
    id: 'p6a-gen-7',
    title: 'Unsafe Rich Text',
    text: '<script>alert("xss")</script><iframe src="evil.html"></iframe><p>Safe content</p>',
    isRichText: true,
    type: 'text'
  };

  const card = createNoteCardElement(note);
  const previewBody = findMockDescendant(card, el => el.classList?.contains('note-card-preview-body'));
  assert.ok(previewBody);

  const scriptEl = findMockDescendant(previewBody, el => el.tagName === 'SCRIPT');
  const iframeEl = findMockDescendant(previewBody, el => el.tagName === 'IFRAME');
  assert.equal(scriptEl, null, '<script> tags MUST be sanitized');
  assert.equal(iframeEl, null, '<iframe> tags MUST be sanitized');

  cleanupGlobals();
});

test('Phase 6B - phone More control exposes menu semantics and Escape restores focus', () => {
  const { win } = createMockEnvironment({ width: 390, height: 844, maxTouchPoints: 5 });
  setupMockDOM(win);
  initResponsiveState();
  const note = { id: 'phase6b-phone-menu', title: 'Accessible menu', text: 'Body', type: 'text' };
  const card = createNoteCardElement(note);
  const toggle = findMockDescendant(card, el => el.classList?.contains('note-card-menu-toggle'));
  const menu = findMockDescendant(card, el => el.classList?.contains('note-card-menu'));
  const panel = findMockDescendant(card, el => el.classList?.contains('note-card-menu-panel'));

  assert.ok(toggle);
  assert.ok(menu);
  assert.ok(panel);
  assert.equal(toggle.getAttribute('aria-haspopup'), 'menu');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), panel.getAttribute('id'));
  assert.equal(panel.getAttribute('role'), 'menu');
  assert.ok((panel.children || []).every(action => action.getAttribute?.('role') === 'menuitem'));

  toggle.click();
  assert.equal(menu.classList.contains('open'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  menu.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(menu.classList.contains('open'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(global.document.activeElement, toggle);
  cleanupGlobals();
});

test('Phase 6B - tablet and desktop spine More controls own the shared action panel', () => {
  const { win } = createMockEnvironment({ width: 834, height: 1194, maxTouchPoints: 5 });
  setupMockDOM(win);
  initResponsiveState();
  const note = { id: 'phase6b-spine-menu', title: 'Spine menu', text: 'Body', type: 'text' };
  const card = createNoteCardElement(note);
  const spineToggle = findMockDescendant(card, el => el.classList?.contains('note-card-menu-toggle-desktop'));
  const phoneToggle = findMockDescendant(card, el => el.classList?.contains('note-card-menu-toggle'));
  const panel = findMockDescendant(card, el => el.classList?.contains('note-card-menu-panel'));

  assert.ok(spineToggle);
  assert.equal(phoneToggle, null);
  assert.equal(spineToggle.getAttribute('aria-haspopup'), 'menu');
  assert.equal(spineToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(spineToggle.getAttribute('aria-controls'), panel.getAttribute('id'));

  spineToggle.click();
  assert.equal(spineToggle.getAttribute('aria-expanded'), 'true');
  spineToggle.click();
  assert.equal(spineToggle.getAttribute('aria-expanded'), 'false');
  cleanupGlobals();
});

test('Phase 6A - phone grid safety verified across representative device viewports', () => {
  const phoneSizes = [
    { name: 'iPhone SE / Small Phone', width: 320, height: 568 },
    { name: 'Android Standard', width: 360, height: 800 },
    { name: 'iPhone 12/13/14', width: 390, height: 844 },
    { name: 'iPhone Pro Max / Pixel XL', width: 430, height: 932 },
    { name: 'Compact Phone Landscape', width: 667, height: 375 }
  ];

  const cssPath = path.join(process.cwd(), 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  phoneSizes.forEach(size => {
    const { win } = createMockEnvironment({ width: size.width, height: size.height, maxTouchPoints: 5 });
    setupMockDOM(win);
    const state = classifyEnvironment(win);

    assert.equal(state.layoutMode, 'phone', `${size.name} (${size.width}x${size.height}) MUST classify as phone layout mode`);
    cleanupGlobals();
  });

  assert.ok(cssContent.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'), 'CSS enforces 2-column grid in phone grid mode');
  assert.ok(cssContent.includes('body[data-layout="phone"] .notes-grid:not(.list-view)'), 'CSS respects .list-view override');
  assert.ok(cssContent.includes('min-width: 0 !important;'), 'CSS enforces min-width: 0 on phone cards to prevent grid track expansion');
  assert.ok(cssContent.includes('box-sizing: border-box !important;'), 'CSS enforces border-box sizing');
  assert.ok(cssContent.includes('overflow-wrap: break-word !important;'), 'CSS enforces word wrap on note preview elements to prevent horizontal overflow');
});

test('Phase 6B - card density, spine geometry, and type indicators', () => {
  const cssPath = path.join(process.cwd(), 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');

  assert.ok(cssContent.includes('body[data-layout="desktop"] .notes-grid:not(.list-view) .note-card {\n  height: 288px !important;'), 'Desktop card height target 288px');
  assert.ok(cssContent.includes('body[data-layout="desktop"] .notes-grid:not(.list-view) {\n  gap: 14px !important;'), 'Desktop gap 14px');
  assert.ok(cssContent.includes('body[data-layout="tablet-portrait"] .notes-grid:not(.list-view) .note-card,\nbody[data-layout="tablet-landscape"] .notes-grid:not(.list-view) .note-card {\n  height: 272px !important;'), 'Tablet card height target 272px');
  assert.ok(cssContent.includes('body[data-layout="tablet-portrait"] .notes-grid:not(.list-view),\nbody[data-layout="tablet-landscape"] .notes-grid:not(.list-view) {\n  gap: 12px !important;'), 'Tablet gap 12px');
  assert.ok(cssContent.includes('width: 42px;'), 'Spine width 42px');
  assert.ok(cssContent.includes('width: 32px;\n    height: 32px;'), 'Spine button 32px');

  // Desktop & Tablet cards render spine, phone card does not
  const desktopEnv = createMockEnvironment({ width: 1440, height: 900 });
  setupMockDOM(desktopEnv.win);
  initResponsiveState();
  const desktopCard = createNoteCardElement({ id: 'card-desktop', title: 'Desktop', text: 'Body', type: 'text' });
  assert.ok(findMockDescendant(desktopCard, el => el.classList?.contains('note-card-spine')), 'Desktop card must render spine');
  cleanupGlobals();

  const tabletEnv = createMockEnvironment({ width: 768, height: 1024, orientation: 'portrait' });
  setupMockDOM(tabletEnv.win);
  initResponsiveState();
  const tabletCard = createNoteCardElement({ id: 'card-tablet', title: 'Tablet', text: 'Body', type: 'text' });
  assert.ok(findMockDescendant(tabletCard, el => el.classList?.contains('note-card-spine')), 'Tablet card must render spine');
  cleanupGlobals();

  const phoneEnv = createMockEnvironment({ width: 390, height: 844 });
  setupMockDOM(phoneEnv.win);
  initResponsiveState();
  const phoneCard = createNoteCardElement({ id: 'card-phone', title: 'Phone', text: 'Body', type: 'text' });
  assert.equal(findMockDescendant(phoneCard, el => el.classList?.contains('note-card-spine')), null, 'Phone card must NOT render spine');
  cleanupGlobals();

  // Top-bar type text badge is absent
  const topbarEnv = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(topbarEnv.win);
  initResponsiveState();
  const cardWithTopbar = createNoteCardElement({ id: 'topbar-card', title: 'Topbar Test', text: 'Body', type: 'text' });
  assert.equal(findMockDescendant(cardWithTopbar, el => el.classList?.contains('topbar-type-badge')), null, 'Topbar text type badge must be absent');
  assert.ok(findMockDescendant(cardWithTopbar, el => el.classList?.contains('topbar-folder-badge')), 'Topbar folder badge must be present');
  cleanupGlobals();

  // Helper & footer indicator rendering
  assert.deepEqual(getNoteTypeIndicators({ type: 'text', title: 'Plain', text: 'Hello' }), ['text']);

  const noteMulti2 = { id: 'note-2', title: 'Multi 2', text: 'Recipe & voice', type: 'recipe', audio: 'mic.mp3' };
  const indicatorsMulti2 = getNoteTypeIndicators(noteMulti2);
  assert.ok(indicatorsMulti2.includes('voice'));
  assert.ok(indicatorsMulti2.includes('recipe'));
  assert.equal(indicatorsMulti2.length, 2);

  const noteMulti4 = { id: 'note-3', title: 'Multi 4', text: 'Checklist task - [ ] todo', type: 'checklist', audio: 'mic.mp3', image: 'photo.jpg', files: [{ id: 1 }] };
  const indicatorsMulti4 = getNoteTypeIndicators(noteMulti4);
  assert.equal(indicatorsMulti4.length, 4);

  const cardEnv = createMockEnvironment({ width: 1200, height: 800 });
  setupMockDOM(cardEnv.win);
  initResponsiveState();
  const multi4Card = createNoteCardElement(noteMulti4);
  const footerIndicators = findMockDescendant(multi4Card, el => el.classList?.contains('note-footer-type-indicators'));
  assert.ok(footerIndicators, 'Footer indicators container must exist');
  const indicatorIcons = (footerIndicators.children || []).filter(child => child.classList?.contains('note-type-indicator-icon'));
  const indicatorMore = (footerIndicators.children || []).find(child => child.classList?.contains('note-type-indicator-more'));
  assert.equal(indicatorIcons.length, 2, 'Footer shows at most 2 icons');
  assert.ok(indicatorMore, 'Footer shows +N badge for remaining types');
  assert.equal(indicatorMore.textContent, '+2');
  cleanupGlobals();

  // getVisualNoteType classification remains unchanged
  assert.equal(getVisualNoteType({ type: 'recipe', recipeData: {} }), 'recipe');
  assert.equal(getVisualNoteType({ audio: 'record.mp3' }), 'voice');
  assert.equal(getVisualNoteType({ image: 'img.png' }), 'visual');
  assert.equal(getVisualNoteType({ type: 'checklist' }), 'checklist');
  assert.equal(getVisualNoteType({ linkPreview: {} }), 'link');
  assert.equal(getVisualNoteType({ files: [{ name: 'doc.pdf' }] }), 'file');
  assert.equal(getVisualNoteType({ text: 'Plain text note' }), 'text');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VALID_PAGES,
  DEFAULT_PAGE,
  isValidPageId,
  normalizePageId
} from '../navigation/navigation-config.js';

import {
  getActivePage,
  setActivePageState,
  subscribeToPageChanges,
  resetPageStateForTesting,
  currentPage
} from '../navigation/navigation-state.js';

import {
  showPageContainer,
  setActiveSidebarPage,
  updateMobileDockState
} from '../navigation/navigation-renderer.js';

import {
  setActivePage,
  registerPageLifecycle,
  onPageChange,
  configureNavigation,
  initNavigation,
  resetNavigationForTesting,
  hasRequiredNavigationDOM
} from '../navigation/index.js';

import { currentPage as appCurrentPage } from '../app.js';

function setupMockDOM() {
  const elements = new Map();

  const createElement = (id, tag = 'div', className = '') => {
    const listeners = new Map();
    const attributes = new Map();
    const style = {};
    const classListSet = new Set(className.split(' ').filter(Boolean));

    const element = {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      style,
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
      setAttribute: (k, v) => attributes.set(k, String(v)),
      getAttribute: (k) => attributes.get(k) || element.dataset[k] || null,
      removeAttribute: (k) => attributes.delete(k),
      addEventListener: (evt, fn) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      dispatchEvent: (evt) => {
        const list = listeners.get(evt.type || evt) || [];
        list.forEach(fn => fn(evt));
      },
      click: () => {
        const list = listeners.get('click') || [];
        list.forEach(fn => fn({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} }));
      },
      _listenerCounts: () => {
        let count = 0;
        listeners.forEach(arr => { count += arr.length; });
        return count;
      }
    };
    elements.set(id, element);
    return element;
  };

  const docListeners = new Map();

  global.document = {
    body: createElement('body', 'body'),
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel === '.app-sidebar') return elements.get('app-sidebar') || null;
      if (sel === '.mobile-bottom-dock') return elements.get('mobile-bottom-dock') || null;
      if (sel === '#settings-page') return elements.get('settings-page') || null;
      if (sel === '#productivity-page') return elements.get('productivity-page') || null;
      if (sel === '#search-page') return elements.get('search-page') || null;
      if (sel === '#notes-feed') return elements.get('notes-feed') || null;
      if (sel === '.creator-wrapper') return elements.get('creator-wrapper') || null;
      if (sel === '.feed-filter-row') return elements.get('feed-filter-row') || null;
      return null;
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
      return [];
    },
    addEventListener: (evt, fn) => {
      if (!docListeners.has(evt)) docListeners.set(evt, []);
      docListeners.get(evt).push(fn);
    },
    dispatchEvent: (evt) => {
      const list = docListeners.get(evt.type || evt) || [];
      list.forEach(fn => fn(evt));
    }
  };

  global.window = {
    innerWidth: 1024,
    addEventListener: () => {},
    dispatchEvent: () => {}
  };

  // Build standard navigation DOM elements
  const sidebar = createElement('app-sidebar', 'aside', 'app-sidebar');
  const mobileDock = createElement('mobile-bottom-dock', 'nav', 'mobile-bottom-dock');

  const settingsPage = createElement('settings-page', 'section', 'settings-page');
  const productivityPage = createElement('productivity-page', 'section', 'productivity-page');
  const searchPage = createElement('search-page', 'section', 'search-page');
  const notesFeed = createElement('notes-feed', 'section', 'notes-feed');

  const sidebarNotes = createElement('sidebar-all-notes', 'div', 'sidebar-item');
  const sidebarFavorites = createElement('sidebar-favorites', 'div', 'sidebar-item');
  const sidebarSearch = createElement('sidebar-search', 'div', 'sidebar-item');
  const sidebarProductivity = createElement('sidebar-productivity', 'div', 'sidebar-item');
  const sidebarArchive = createElement('sidebar-archive', 'div', 'sidebar-item');
  const sidebarDeleted = createElement('sidebar-deleted', 'div', 'sidebar-item');
  const sidebarSettings = createElement('sidebar-settings', 'div', 'sidebar-item');

  const mobileNotes = createElement('mobile-notes', 'button', 'mobile-dock-item');
  mobileNotes.dataset.targetPage = 'notes';
  mobileNotes.setAttribute('data-target-page', 'notes');

  const mobileSettings = createElement('mobile-dock-settings-btn', 'button', 'mobile-dock-item');

  const tabletNotes = createElement('tablet-notes', 'button', 'tablet-dock-item');
  tabletNotes.dataset.tabletPage = 'notes';

  return { elements, sidebar, mobileDock, settingsPage, productivityPage, searchPage, notesFeed };
}

function cleanupMockDOM() {
  delete global.document;
  delete global.window;
}

test('navigation-config exports valid pages and fallback', () => {
  assert.ok(Array.isArray(VALID_PAGES));
  assert.strictEqual(DEFAULT_PAGE, 'notes');
  assert.strictEqual(isValidPageId('notes'), true);
  assert.strictEqual(isValidPageId('settings'), true);
  assert.strictEqual(isValidPageId('invalid_page'), false);
  assert.strictEqual(normalizePageId('search'), 'search');
  assert.strictEqual(normalizePageId('unknown'), 'notes');
});

test('navigation-state tracks active page and notifies subscribers', () => {
  resetPageStateForTesting();
  assert.strictEqual(getActivePage(), 'notes');

  let notifiedPage = null;
  const unsubscribe = subscribeToPageChanges((newPage) => {
    notifiedPage = newPage;
  });

  setActivePageState('settings');
  assert.strictEqual(getActivePage(), 'settings');
  assert.strictEqual(notifiedPage, 'settings');

  unsubscribe();
  setActivePageState('search');
  assert.strictEqual(getActivePage(), 'search');
  assert.strictEqual(notifiedPage, 'settings');
});

test('A. Renderer visibility correctly toggles page containers', () => {
  const { settingsPage, productivityPage, searchPage, notesFeed } = setupMockDOM();

  showPageContainer('settings');
  assert.strictEqual(settingsPage.style.display, 'flex');
  assert.strictEqual(productivityPage.style.display, 'none');
  assert.strictEqual(searchPage.style.display, 'none');
  assert.strictEqual(notesFeed.style.display, 'none');

  showPageContainer('productivity');
  assert.strictEqual(settingsPage.style.display, 'none');
  assert.strictEqual(productivityPage.style.display, 'flex');
  assert.strictEqual(searchPage.style.display, 'none');
  assert.strictEqual(notesFeed.style.display, 'none');

  showPageContainer('notes');
  assert.strictEqual(settingsPage.style.display, 'none');
  assert.strictEqual(productivityPage.style.display, 'none');
  assert.strictEqual(searchPage.style.display, 'none');
  assert.strictEqual(notesFeed.style.display, '');

  cleanupMockDOM();
});

test('B. Active navigation states update sidebar, tablet dock, and mobile dock', () => {
  const { elements } = setupMockDOM();
  const sidebarNotes = elements.get('sidebar-all-notes');
  const sidebarSettings = elements.get('sidebar-settings');
  const mobileNotes = elements.get('mobile-notes');

  setActiveSidebarPage('settings');
  assert.strictEqual(sidebarSettings.classList.contains('active'), true);
  assert.strictEqual(sidebarSettings.getAttribute('aria-current'), 'page');
  assert.strictEqual(sidebarNotes.classList.contains('active'), false);

  updateMobileDockState('notes');
  assert.strictEqual(mobileNotes.classList.contains('active'), true);
  assert.strictEqual(mobileNotes.getAttribute('aria-current'), 'page');

  cleanupMockDOM();
});

test('C. Initialization idempotency prevents duplicate listener registrations', () => {
  const { elements } = setupMockDOM();
  resetNavigationForTesting();

  const sidebarNotes = elements.get('sidebar-all-notes');
  assert.strictEqual(initNavigation(), true);
  const firstCount = sidebarNotes._listenerCounts();

  assert.strictEqual(initNavigation(), true);
  const secondCount = sidebarNotes._listenerCounts();

  assert.strictEqual(firstCount, secondCount);
  cleanupMockDOM();
});

test('D. Early initialization before DOM returns false without marking initialized', () => {
  cleanupMockDOM();
  resetNavigationForTesting();

  assert.strictEqual(hasRequiredNavigationDOM(), false);
  assert.strictEqual(initNavigation(), false);

  // Setup DOM and retry
  setupMockDOM();
  assert.strictEqual(hasRequiredNavigationDOM(), true);
  assert.strictEqual(initNavigation(), true);

  cleanupMockDOM();
});

test('E. Same-page navigation skips lifecycle hooks unless forced', () => {
  setupMockDOM();
  resetNavigationForTesting();

  let enterCount = 0;
  registerPageLifecycle('search', {
    onEnter: () => { enterCount++; }
  });

  setActivePage('search');
  assert.strictEqual(enterCount, 1);

  // Same page navigation without force
  setActivePage('search');
  assert.strictEqual(enterCount, 1);

  // Forced same page navigation
  setActivePage('search', { force: true });
  assert.strictEqual(enterCount, 2);

  cleanupMockDOM();
});

test('F & G. Lifecycle callbacks and duplicate listener regression check', () => {
  const { elements } = setupMockDOM();
  resetNavigationForTesting();
  initNavigation();

  let transitionCount = 0;
  registerPageLifecycle('settings', {
    onEnter: () => { transitionCount++; }
  });

  const sidebarSettings = elements.get('sidebar-settings');
  sidebarSettings.click();

  assert.strictEqual(getActivePage(), 'settings');
  assert.strictEqual(transitionCount, 1);

  cleanupMockDOM();
});

test('Mobile dock click causes exactly one transition and fires injected haptic callback once', () => {
  const { elements } = setupMockDOM();
  resetNavigationForTesting();

  const hapticCalls = [];
  configureNavigation({
    triggerHaptic: (type) => { hapticCalls.push(type); }
  });

  let transitionCount = 0;
  registerPageLifecycle('settings', {
    onEnter: () => { transitionCount++; }
  });

  initNavigation();

  const mobileSettings = elements.get('mobile-dock-settings-btn');
  mobileSettings.click();

  assert.strictEqual(getActivePage(), 'settings');
  assert.strictEqual(transitionCount, 1);
  assert.deepStrictEqual(hapticCalls, ['tap']);

  cleanupMockDOM();
});

test('H. currentPage imported from app.js is a string and updates after navigation', () => {
  resetNavigationForTesting();
  assert.strictEqual(typeof appCurrentPage, 'string');
  assert.strictEqual(appCurrentPage, 'notes');
  setActivePage('search');
  assert.strictEqual(currentPage, 'search');
  assert.strictEqual(appCurrentPage, 'search');
});

test('I. Invalid page IDs fall back to Notes without hiding every container', () => {
  const { notesFeed } = setupMockDOM();
  resetNavigationForTesting();

  setActivePage('invalid_page');
  assert.strictEqual(getActivePage(), 'notes');
  assert.strictEqual(notesFeed.style.display, '');

  cleanupMockDOM();
});

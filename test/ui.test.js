import test from 'node:test';
import assert from 'node:assert/strict';

import {
  showToast,
  getOrCreateToastContainer,
  configureToastProvider,
  normalizeToastPosition,
  lockBodyScroll,
  unlockBodyScroll,
  getActiveScrollLockCount,
  resetScrollLockForTesting,
  saveFocusedElement,
  restoreFocusedElement,
  setupOverlayOutsideClick,
  setupOverlayEscapeKey,
  showDialog,
  hideDialog,
  resetDialogStateForTesting
} from '../ui/index.js';

import { showToast as appShowToast } from '../app.js';

function setupMockDOM() {
  const elements = new Map();

  const createElement = (id, tag = 'div', className = '') => {
    const listeners = new Map();
    const attributes = new Map();
    const style = {};
    const classListSet = new Set(className.split(' ').filter(Boolean));
    const children = [];
    let _id = id || '';

    const element = {
      tagName: tag.toUpperCase(),
      dataset: {},
      style,
      parentNode: null,
      children,
      classList: {
        add: (...cls) => cls.forEach(c => classListSet.add(c)),
        remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
        contains: (c) => classListSet.has(c),
        toggle: (c, force) => {
          if (force === true) classListSet.add(c);
          else if (force === false) classListSet.delete(c);
          else if (classListSet.has(c)) classListSet.delete(c);
          else classListSet.add(c);
        },
        forEach: (fn) => Array.from(classListSet).forEach(fn)
      },
      setAttribute: (k, v) => {
        attributes.set(k, String(v));
        if (k === 'id') {
          element.id = String(v);
        } else if (k === 'class') {
          element.className = String(v);
        }
      },
      getAttribute: (k) => attributes.get(k) || element.dataset[k] || null,
      removeAttribute: (k) => {
        attributes.delete(k);
        if (k === 'class') classListSet.clear();
      },
      addEventListener: (evt, fn) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        const list = listeners.get(evt);
        if (list) {
          const idx = list.indexOf(fn);
          if (idx !== -1) list.splice(idx, 1);
        }
      },
      dispatchEvent: (evt) => {
        const list = listeners.get(evt.type || evt) || [];
        list.forEach(fn => fn(evt));
      },
      appendChild: (child) => {
        child.parentNode = element;
        children.push(child);
        return child;
      },
      remove: () => {
        if (element.parentNode && element.parentNode.children) {
          const idx = element.parentNode.children.indexOf(element);
          if (idx !== -1) element.parentNode.children.splice(idx, 1);
        }
        element.parentNode = null;
      },
      querySelector: (sel) => {
        const isClass = sel.startsWith('.');
        const isId = sel.startsWith('#');
        const target = sel.slice(1);

        const search = (node) => {
          for (const child of node.children) {
            if (isId && child.id === target) return child;
            if (isClass && child.classList.contains(target)) return child;
            const found = search(child);
            if (found) return found;
          }
          return null;
        };

        return search(element);
      },
      querySelectorAll: (sel) => {
        const isClass = sel.startsWith('.');
        const target = sel.slice(1);
        const results = [];
        const search = (node) => {
          for (const child of node.children) {
            if (isClass && child.classList.contains(target)) {
              results.push(child);
            }
            search(child);
          }
        };
        search(element);
        return results;
      },
      click: () => {
        const list = listeners.get('click') || [];
        list.forEach(fn => fn({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} }));
      },
      focus: () => {
        if (typeof document !== 'undefined') {
          document.activeElement = element;
        }
      },
      _listenerCounts: () => {
        let count = 0;
        listeners.forEach(arr => { count += arr.length; });
        return count;
      }
    };

    Object.defineProperty(element, 'id', {
      get: () => _id,
      set: (val) => {
        _id = String(val);
        if (_id) elements.set(_id, element);
      },
      configurable: true,
      enumerable: true
    });

    Object.defineProperty(element, 'className', {
      get: () => Array.from(classListSet).join(' '),
      set: (val) => {
        classListSet.clear();
        String(val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c));
      },
      configurable: true,
      enumerable: true
    });

    if (_id) {
      elements.set(_id, element);
    }

    return element;
  };

  const docListeners = new Map();

  global.document = {
    body: createElement('body', 'body'),
    activeElement: null,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => createElement('', tag),
    createElementNS: (ns, tag) => createElement('', tag),
    querySelector: (sel) => {
      if (sel === '#toast-container' || sel === '.toast-container') return elements.get('toast-container') || null;
      return null;
    },
    addEventListener: (evt, fn) => {
      if (!docListeners.has(evt)) docListeners.set(evt, []);
      docListeners.get(evt).push(fn);
    },
    removeEventListener: (evt, fn) => {
      const list = docListeners.get(evt);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
    },
    dispatchEvent: (evt) => {
      const list = docListeners.get(evt.type || evt) || [];
      list.forEach(fn => fn(evt));
    },
    _docListenerCount: (evt) => {
      return (docListeners.get(evt) || []).length;
    }
  };

  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  // Default provider configuration
  configureToastProvider({
    getSettings: () => ({ notificationsEnabled: true, toastPosition: 'top-right' })
  });

  return { elements, createElement };
}

function cleanupMockDOM() {
  resetScrollLockForTesting();
  resetDialogStateForTesting();
  delete global.document;
  delete global.window;
}

test('1. Basic Toast creates DOM, renders title and text with safe textContent', () => {
  setupMockDOM();
  configureToastProvider({
    getSettings: () => ({ notificationsEnabled: true, toastPosition: 'bottom-right' })
  });

  const toast = showToast({ title: 'Safety Test', text: '<script>alert(1)</script>' });
  assert.ok(toast);

  const titleEl = toast.querySelector('.toast-title');
  const textEl = toast.querySelector('.toast-text');

  assert.strictEqual(titleEl.textContent, 'Safety Test');
  assert.strictEqual(textEl.textContent, '<script>alert(1)</script>');

  cleanupMockDOM();
});

test('2. Toast close button uses UTF-8 glyph and hides/removes toast DOM', (t, done) => {
  setupMockDOM();

  const toast = showToast({ title: 'Close Test', text: 'Dismiss me', duration: 0 });
  const closeBtn = toast.querySelector('.toast-close');
  assert.ok(closeBtn);
  assert.strictEqual(closeBtn.textContent, '✕');

  closeBtn.click();
  assert.strictEqual(toast.classList.contains('hide'), true);

  setTimeout(() => {
    assert.strictEqual(toast.parentNode, null);
    cleanupMockDOM();
    done();
  }, 400);
});

test('3. Invalid toast positions fall back to top-right', () => {
  setupMockDOM();
  assert.strictEqual(normalizeToastPosition('invalid-pos'), 'top-right');
  assert.strictEqual(normalizeToastPosition('bottom-left'), 'bottom-left');

  const liveSettings = { notificationsEnabled: true, toastPosition: 'invalid-pos' };
  configureToastProvider({
    getSettings: () => liveSettings
  });

  const toast = showToast({ title: 'Pos Test', text: 'Positioning' });
  assert.ok(toast);
  const container = getOrCreateToastContainer(liveSettings);
  assert.strictEqual(container.classList.contains('pos-top-right'), true);

  cleanupMockDOM();
});

test('4. Dynamic toast provider settings changes are reflected immediately', () => {
  setupMockDOM();
  const settingsState = { notificationsEnabled: true, toastPosition: 'top-left' };
  configureToastProvider({
    getSettings: () => settingsState
  });

  let toast = showToast({ title: 'First', text: 'First' });
  assert.ok(toast);

  // Disable notifications dynamically
  settingsState.notificationsEnabled = false;
  toast = showToast({ title: 'Second', text: 'Second' });
  assert.strictEqual(toast, null);

  cleanupMockDOM();
});

test('5. Toast action button callback fires exactly once on click', () => {
  setupMockDOM();

  let actionFired = 0;
  const toast = showToast({
    title: 'Action Test',
    text: 'Click action',
    action: {
      text: 'Undo',
      callback: () => { actionFired++; }
    }
  });

  const actionBtn = toast.querySelector('.toast-action-btn');
  assert.ok(actionBtn);

  actionBtn.click();
  assert.strictEqual(actionFired, 1);

  cleanupMockDOM();
});

test('6. Compatibility: appShowToast re-exports showToast from app.js', () => {
  setupMockDOM();

  const toast = appShowToast({ title: 'Re-export Test', text: 'Working' });
  assert.ok(toast);
  assert.strictEqual(toast.querySelector('.toast-title').textContent, 'Re-export Test');

  cleanupMockDOM();
});

test('7. Two open dialogs maintain reference-counted body scroll lock until both close', () => {
  const { createElement } = setupMockDOM();

  const dialog1 = createElement('d1');
  const dialog2 = createElement('d2');

  showDialog(dialog1, { lockScroll: true });
  assert.strictEqual(getActiveScrollLockCount(), 1);
  assert.strictEqual(document.body.classList.contains('scroll-locked'), true);

  showDialog(dialog2, { lockScroll: true });
  assert.strictEqual(getActiveScrollLockCount(), 2);
  assert.strictEqual(document.body.classList.contains('scroll-locked'), true);

  // Close dialog 1; dialog 2 remains open and body remains locked
  hideDialog(dialog1, { lockScroll: true });
  assert.strictEqual(getActiveScrollLockCount(), 1);
  assert.strictEqual(document.body.classList.contains('scroll-locked'), true);

  // Close dialog 2; body unlocks
  hideDialog(dialog2, { lockScroll: true });
  assert.strictEqual(getActiveScrollLockCount(), 0);
  assert.strictEqual(document.body.classList.contains('scroll-locked'), false);

  cleanupMockDOM();
});

test('8. Per-dialog focus restoration, listener idempotency, and Escape / outside-click configuration', () => {
  const { createElement } = setupMockDOM();

  const btnOutside = createElement('btn-outside');
  btnOutside.focus();
  assert.strictEqual(document.activeElement, btnOutside);

  const dialog1 = createElement('d1');
  showDialog(dialog1, { dismissOnEscape: true, dismissOnOutsideClick: true });

  // Re-opening same dialog repeatedly does not duplicate listeners
  const initialListenerCount = document._docListenerCount('keydown');
  showDialog(dialog1, { dismissOnEscape: true, dismissOnOutsideClick: true });
  assert.strictEqual(document._docListenerCount('keydown'), initialListenerCount);

  // Opening dialog2 on top
  const dialog2 = createElement('d2');
  showDialog(dialog2, { dismissOnEscape: true });

  // Pressing Escape closes top dialog (dialog2) first
  document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
  assert.strictEqual(dialog2.classList.contains('visible'), false);
  assert.strictEqual(dialog1.classList.contains('visible'), true);

  // Pressing Escape again closes dialog1 and restores focus to btnOutside
  document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
  assert.strictEqual(dialog1.classList.contains('visible'), false);
  assert.strictEqual(document.activeElement, btnOutside);

  cleanupMockDOM();
});

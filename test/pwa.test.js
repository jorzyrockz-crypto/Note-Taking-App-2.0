import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_VERSION as PWA_VERSION,
  DEFAULT_CHANGELOG as PWA_CHANGELOG,
  getDeferredPrompt,
  clearDeferredPrompt,
  promptInstall,
  initPwaInstall,
  resetInstallStateForTesting,
  registerPaperussServiceWorker,
  handleServiceWorkerUpdate,
  activateWaitingWorker,
  resetServiceWorkerStateForTesting,
  initVersionAndChangelog,
  resetVersionStateForTesting,
  initializePwa,
  resetPwaInitializationForTesting
} from '../pwa/index.js';

import { CURRENT_VERSION as APP_VERSION, DEFAULT_CHANGELOG as APP_CHANGELOG } from '../app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function setupMockDOM() {
  const elements = new Map();

  const createElement = (id, tag = 'div', className = '') => {
    const listeners = new Map();
    const attributes = new Map();
    const style = { display: 'none' };
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
        forEach: (fn) => Array.from(classListSet).forEach(fn)
      },
      setAttribute: (k, v) => {
        attributes.set(k, String(v));
        if (k === 'id') element.id = String(v);
        if (k === 'class') element.className = String(v);
      },
      getAttribute: (k) => attributes.get(k) || null,
      removeAttribute: (k) => attributes.delete(k),
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
        if (sel === ':scope > li') return children.filter(c => c.tagName === 'LI');
        return [];
      },
      click: () => {
        const list = listeners.get('click') || [];
        list.forEach(fn => fn({ type: 'click', preventDefault: () => {} }));
      },
      _listenerCount: (evt) => (listeners.get(evt) || []).length
    };

    Object.defineProperty(element, 'id', {
      get: () => _id,
      set: (val) => {
        _id = String(val);
        if (_id) elements.set(_id, element);
      },
      configurable: true
    });

    Object.defineProperty(element, 'className', {
      get: () => Array.from(classListSet).join(' '),
      set: (val) => {
        classListSet.clear();
        String(val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c));
      },
      configurable: true
    });

    if (_id) elements.set(_id, element);
    return element;
  };

  const docListeners = new Map();
  const winListeners = new Map();

  // Create required DOM elements
  const installRow = createElement('settings-install-row');
  const installBtn = createElement('settings-install-btn', 'button');
  installRow.appendChild(installBtn);

  const versionLabel = createElement('version-label', 'span', 'version-label');
  const changelogList = createElement('changelog-list', 'ul', 'changelog-list');
  const appUpdateBtn = createElement('app-update-btn', 'button');

  const body = createElement('body', 'body');
  body.appendChild(installRow);
  body.appendChild(versionLabel);
  body.appendChild(changelogList);
  body.appendChild(appUpdateBtn);

  global.document = {
    body,
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel === '.version-label') return versionLabel;
      if (sel === '.changelog-list') return changelogList;
      if (sel === '#app-update-btn') return appUpdateBtn;
      if (sel === '#settings-install-row') return installRow;
      if (sel === '#settings-install-btn') return installBtn;
      return null;
    },
    createElement: (tag) => createElement('', tag),
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
      (docListeners.get(evt.type || evt) || []).forEach(fn => fn(evt));
    }
  };

  let reloadCount = 0;
  global.window = {
    addEventListener: (evt, fn) => {
      if (!winListeners.has(evt)) winListeners.set(evt, []);
      winListeners.get(evt).push(fn);
    },
    removeEventListener: (evt, fn) => {
      const list = winListeners.get(evt);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
    },
    dispatchEvent: (evt) => {
      (winListeners.get(evt.type || evt) || []).forEach(fn => fn(evt));
    },
    location: {
      reload: () => { reloadCount++; }
    },
    _getReloadCount: () => reloadCount,
    _winListenerCount: (evt) => (winListeners.get(evt) || []).length
  };

  const mockSession = new Map();
  global.sessionStorage = {
    getItem: (k) => mockSession.get(k) || null,
    setItem: (k, v) => mockSession.set(k, String(v)),
    removeItem: (k) => mockSession.delete(k)
  };

  let registerCallCount = 0;
  const swListeners = new Map();
  const mockNavigator = {
    serviceWorker: {
      controller: null,
      register: async (url) => {
        registerCallCount++;
        const regListeners = new Map();
        return {
          scope: 'http://localhost/',
          waiting: null,
          installing: null,
          addEventListener: (evt, fn) => {
            if (!regListeners.has(evt)) regListeners.set(evt, []);
            regListeners.get(evt).push(fn);
          },
          _dispatchRegEvent: (evt) => {
            (regListeners.get(evt.type || evt) || []).forEach(fn => fn(evt));
          }
        };
      },
      addEventListener: (evt, fn) => {
        if (!swListeners.has(evt)) swListeners.set(evt, []);
        swListeners.get(evt).push(fn);
      },
      _dispatchSW: (evt) => {
        (swListeners.get(evt.type || evt) || []).forEach(fn => fn(evt));
      },
      _swListenerCount: (evt) => (swListeners.get(evt) || []).length
    }
  };

  Object.defineProperty(global, 'navigator', {
    value: mockNavigator,
    configurable: true,
    writable: true
  });

  return {
    elements,
    createElement,
    getRegisterCallCount: () => registerCallCount
  };
}

function cleanupMockDOM() {
  resetInstallStateForTesting();
  resetServiceWorkerStateForTesting();
  resetVersionStateForTesting();
  resetPwaInitializationForTesting();

  delete global.document;
  delete global.window;
  delete global.sessionStorage;
  delete global.navigator;
}

test('1. Install Prompt capture prevents default, stores event, reveals controls, and is idempotent', () => {
  setupMockDOM();
  initPwaInstall();

  let defaultPrevented = false;
  const mockPromptEvent = {
    type: 'beforeinstallprompt',
    preventDefault: () => { defaultPrevented = true; }
  };

  global.window.dispatchEvent(mockPromptEvent);

  assert.strictEqual(defaultPrevented, true);
  assert.strictEqual(getDeferredPrompt(), mockPromptEvent);

  const installRow = global.document.getElementById('settings-install-row');
  assert.strictEqual(installRow.style.display, 'flex');

  // Repeated initialization does not duplicate listeners
  const initialCount = global.window._winListenerCount('beforeinstallprompt');
  initPwaInstall();
  assert.strictEqual(global.window._winListenerCount('beforeinstallprompt'), initialCount);

  cleanupMockDOM();
});

test('2. Install Action invokes prompt(), handles accepted outcome, and clears deferred prompt', async () => {
  setupMockDOM();
  initPwaInstall();

  let promptCalled = 0;
  const mockPromptEvent = {
    type: 'beforeinstallprompt',
    preventDefault: () => {},
    prompt: () => { promptCalled++; },
    userChoice: Promise.resolve({ outcome: 'accepted' })
  };

  global.window.dispatchEvent(mockPromptEvent);
  assert.strictEqual(getDeferredPrompt(), mockPromptEvent);

  const accepted = await promptInstall();
  assert.strictEqual(promptCalled, 1);
  assert.strictEqual(accepted, true);
  assert.strictEqual(getDeferredPrompt(), null);

  cleanupMockDOM();
});

test('3. appinstalled event clears deferred state, hides controls, and triggers success toast', () => {
  setupMockDOM();
  let toastTriggered = null;

  initPwaInstall({
    showToast: (opts) => { toastTriggered = opts; }
  });

  const mockPromptEvent = {
    type: 'beforeinstallprompt',
    preventDefault: () => {}
  };
  global.window.dispatchEvent(mockPromptEvent);
  assert.ok(getDeferredPrompt());

  global.window.dispatchEvent({ type: 'appinstalled' });

  assert.strictEqual(getDeferredPrompt(), null);
  const installRow = global.document.getElementById('settings-install-row');
  assert.strictEqual(installRow.style.display, 'none');
  assert.ok(toastTriggered);
  assert.strictEqual(toastTriggered.title, 'App Installed');

  cleanupMockDOM();
});

test('4. Service Worker registration uses expected URL and scope, handling errors gracefully', async () => {
  setupMockDOM();

  const reg = await registerPaperussServiceWorker({ swUrl: './sw.js' });
  assert.ok(reg);
  assert.strictEqual(reg.scope, 'http://localhost/');

  // Unsupported browser fallback
  resetServiceWorkerStateForTesting();
  Object.defineProperty(global, 'navigator', {
    value: {},
    configurable: true,
    writable: true
  });
  const fallbackReg = await registerPaperussServiceWorker();
  assert.strictEqual(fallbackReg, null);

  cleanupMockDOM();
});

test('5. First installation guard through registerPaperussServiceWorker does not notify when controller is null', async () => {
  const dom = setupMockDOM();
  let toastTriggered = null;

  global.navigator.serviceWorker.controller = null; // First installation

  const reg = await registerPaperussServiceWorker({
    swUrl: './sw.js',
    showToast: (opts) => { toastTriggered = opts; }
  });

  const stateListeners = new Map();
  const mockInstallingWorker = {
    state: 'installing',
    addEventListener: (evt, fn) => {
      if (!stateListeners.has(evt)) stateListeners.set(evt, []);
      stateListeners.get(evt).push(fn);
    }
  };

  reg.installing = mockInstallingWorker;
  reg._dispatchRegEvent({ type: 'updatefound' });

  mockInstallingWorker.state = 'installed';
  (stateListeners.get('statechange') || []).forEach(fn => fn());

  assert.strictEqual(toastTriggered, null, 'No update toast on first installation');
  assert.strictEqual(global.window.__swUpdateWaiting, undefined, 'No __swUpdateWaiting flag set on first installation');

  cleanupMockDOM();
});

test('6. Update detection through registerPaperussServiceWorker notifies user when active controller exists', async () => {
  const dom = setupMockDOM();
  let toastTriggered = null;

  global.navigator.serviceWorker.controller = { state: 'activated' }; // Active controller present

  const reg = await registerPaperussServiceWorker({
    swUrl: './sw.js',
    showToast: (opts) => { toastTriggered = opts; }
  });

  const stateListeners = new Map();
  const mockInstallingWorker = {
    state: 'installing',
    addEventListener: (evt, fn) => {
      if (!stateListeners.has(evt)) stateListeners.set(evt, []);
      stateListeners.get(evt).push(fn);
    }
  };

  reg.installing = mockInstallingWorker;
  reg._dispatchRegEvent({ type: 'updatefound' });

  mockInstallingWorker.state = 'installed';
  (stateListeners.get('statechange') || []).forEach(fn => fn());

  assert.ok(toastTriggered, 'Update toast triggered when active controller exists');
  assert.strictEqual(toastTriggered.title, 'Update Available');
  assert.strictEqual(toastTriggered.duration, 0);

  cleanupMockDOM();
});

test('7. Update activation sends SKIP_WAITING and controllerchange reloads page at most once', async () => {
  setupMockDOM();

  let messageSent = null;
  const mockWaitingWorker = {
    postMessage: (msg) => { messageSent = msg; }
  };

  activateWaitingWorker(mockWaitingWorker);
  assert.deepStrictEqual(messageSent, { type: 'SKIP_WAITING' });

  await registerPaperussServiceWorker();

  // Dispatch controllerchange multiple times
  global.navigator.serviceWorker._dispatchSW({ type: 'controllerchange' });
  global.navigator.serviceWorker._dispatchSW({ type: 'controllerchange' });

  assert.strictEqual(global.window._getReloadCount(), 1);

  cleanupMockDOM();
});

test('8. Repeated initializePwa calls are idempotent across all sub-module listeners and actions', async () => {
  const dom = setupMockDOM();
  let versionSubCount = 0;
  const mockSubscribe = (cb) => { versionSubCount++; };

  const p1 = initializePwa({ showToast: () => {}, subscribeToVersionUpdates: mockSubscribe });
  const p2 = initializePwa({ showToast: () => {}, subscribeToVersionUpdates: mockSubscribe });

  assert.strictEqual(p1, p2, 'initializePwa returns the exact same promise instance');
  await p1;

  assert.strictEqual(dom.getRegisterCallCount(), 1, 'navigator.serviceWorker.register called once');
  assert.strictEqual(global.window._winListenerCount('beforeinstallprompt'), 1, 'beforeinstallprompt listener registered once');
  assert.strictEqual(global.window._winListenerCount('appinstalled'), 1, 'appinstalled listener registered once');
  assert.strictEqual(global.navigator.serviceWorker._swListenerCount('controllerchange'), 1, 'controllerchange listener registered once');
  assert.strictEqual(versionSubCount, 1, 'subscribeToVersionUpdates called once');

  const appUpdateBtn = global.document.getElementById('app-update-btn');
  assert.strictEqual(appUpdateBtn._listenerCount('click'), 1, 'app-update-btn click listener registered once');

  cleanupMockDOM();
});

test('9. Version synchronization: CURRENT_VERSION matches across pwa/version.js, firebase.js, and index.html', () => {
  const firebaseContent = fs.readFileSync(path.join(rootDir, 'firebase.js'), 'utf-8');
  const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

  // Verify version string in firebase.js
  const firebaseVersionMatch = firebaseContent.match(/version:\s*['"]([^'"]+)['"]/);
  assert.ok(firebaseVersionMatch, 'version field found in firebase.js');
  const firebaseVersion = firebaseVersionMatch[1];

  // Verify version string in index.html
  const indexHtmlVersionMatch = indexHtmlContent.match(/<span class="version-label">Version\s+([^<]+)<\/span>/);
  assert.ok(indexHtmlVersionMatch, 'version label found in index.html');
  const indexHtmlVersion = indexHtmlVersionMatch[1];

  assert.strictEqual(
    PWA_VERSION,
    firebaseVersion,
    `pwa/version.js (${PWA_VERSION}) must match firebase.js (${firebaseVersion})`
  );

  assert.strictEqual(
    PWA_VERSION,
    indexHtmlVersion,
    `pwa/version.js (${PWA_VERSION}) must match index.html (${indexHtmlVersion})`
  );
});

test('10. Compatibility re-exports: CURRENT_VERSION and DEFAULT_CHANGELOG re-exported from app.js', () => {
  assert.strictEqual(APP_VERSION, PWA_VERSION);
  assert.strictEqual(APP_CHANGELOG, PWA_CHANGELOG);
  assert.ok(Array.isArray(APP_CHANGELOG));
});

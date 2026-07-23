import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initSettings,
  resetInitStateForTesting,
  renderSettingsPage,
  saveSettingsFromForm,
  renderSettingsBgPicker,
  updateSettingsLivePreview,
  renderSettingsCustomThemesList,
  createCustomEmojiTheme,
  deleteCustomEmojiTheme,
  autoIdentifyEmojiColor
} from '../settings.js';

import { updateSettingsState } from '../settings/settings-store.js';
import { appSettings, saveSettingsAndSync } from '../app.js';

// Setup minimal DOM mock environment with event listener tracking and canvas support
function createMockDomEnvironment() {
  const elements = new Map();
  let createdCanvas = null;

  const mockDocument = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const mockCtx = {
          font: '',
          textAlign: '',
          textBaseline: '',
          fillText: () => {},
          getImageData: () => {
            // Deterministic 32x32 blue pixel array (r:0, g:100, b:250, a:255)
            const data = new Uint8ClampedArray(32 * 32 * 4);
            for (let i = 0; i < data.length; i += 4) {
              data[i] = 0;       // Red
              data[i + 1] = 100; // Green
              data[i + 2] = 250; // Blue
              data[i + 3] = 255; // Alpha (opaque saturated color)
            }
            return { data };
          }
        };
        createdCanvas = {
          width: 0,
          height: 0,
          getContext: () => mockCtx
        };
        return createdCanvas;
      }

      return {
        tagName: tag,
        style: { setProperty: () => {}, removeProperty: () => {} },
        classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
        setAttribute: () => {},
        removeAttribute: () => {}
      };
    },
    getElementById: (id) => {
      if (!elements.has(id)) {
        const listeners = new Map();
        const element = {
          id,
          style: { setProperty: () => {}, removeProperty: () => {} },
          value: '',
          checked: false,
          disabled: false,
          dataset: {},
          classList: {
            contains: () => false,
            add: () => {},
            remove: () => {},
            toggle: () => {}
          },
          setAttribute: () => {},
          removeAttribute: () => {},
          addEventListener: (event, handler) => {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(handler);
          },
          querySelectorAll: () => [],
          querySelector: () => null,
          appendChild: () => {},
          closest: () => null,
          click: function() {
            const handlers = listeners.get('click') || [];
            handlers.forEach(fn => fn({ target: element, stopPropagation: () => {} }));
          }
        };
        elements.set(id, { element, listeners });
      }
      return elements.get(id).element;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    body: {
      classList: {
        contains: () => false,
        add: () => {},
        remove: () => {},
        toggle: () => {}
      },
      style: {
        setProperty: () => {},
        removeProperty: () => {}
      }
    }
  };

  const store = new Map();
  const mockLocalStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };

  return { mockDocument, mockLocalStorage, elements, getCanvas: () => createdCanvas };
}

test('compatibility facade exports all required API functions', () => {
  assert.equal(typeof initSettings, 'function');
  assert.equal(typeof renderSettingsPage, 'function');
  assert.equal(typeof saveSettingsFromForm, 'function');
  assert.equal(typeof renderSettingsBgPicker, 'function');
  assert.equal(typeof updateSettingsLivePreview, 'function');
  assert.equal(typeof renderSettingsCustomThemesList, 'function');
  assert.equal(typeof createCustomEmojiTheme, 'function');
  assert.equal(typeof deleteCustomEmojiTheme, 'function');
  assert.equal(typeof autoIdentifyEmojiColor, 'function');
});

test('Idempotency test: repeated initSettings calls do not duplicate listener registrations', () => {
  resetInitStateForTesting();
  const env = createMockDomEnvironment();
  globalThis.document = env.mockDocument;
  globalThis.localStorage = env.mockLocalStorage;

  // Touch settings-page DOM to ensure element is present
  const pageEl = env.mockDocument.getElementById('settings-page');
  const backBtn = env.mockDocument.getElementById('settings-back-btn');

  // First initialization
  const firstResult = initSettings();
  assert.equal(firstResult, true);
  const initialClickListenersCount = env.elements.get('settings-back-btn').listeners.get('click')?.length || 0;
  assert.ok(initialClickListenersCount > 0, 'Click listeners should be bound on backBtn');

  // Second initialization call
  const secondResult = initSettings();
  assert.equal(secondResult, true);
  const secondClickListenersCount = env.elements.get('settings-back-btn').listeners.get('click')?.length || 0;

  // Assert listener count did not increase
  assert.equal(secondClickListenersCount, initialClickListenersCount, 'Listener count must not duplicate on repeated init');
});

test('Early initialization test: retries initSettings after DOM becomes available', () => {
  resetInitStateForTesting();
  const env = createMockDomEnvironment();

  // Create a document mock where settings-page is absent initially
  const customDoc = {
    ...env.mockDocument,
    getElementById: (id) => {
      if (id === 'settings-page') return null;
      return env.mockDocument.getElementById(id);
    }
  };
  globalThis.document = customDoc;
  globalThis.localStorage = env.mockLocalStorage;

  // First call when DOM is absent
  const firstAttempt = initSettings();
  assert.equal(firstAttempt, false, 'initSettings should return false when DOM is absent');

  // Now make DOM available
  globalThis.document = env.mockDocument;
  const retryAttempt = initSettings();
  assert.equal(retryAttempt, true, 'initSettings should return true on retry once DOM is present');
});

test('Render-without-save test: renderSettingsPage reads state without invoking persistence', () => {
  resetInitStateForTesting();
  const env = createMockDomEnvironment();
  globalThis.document = env.mockDocument;
  globalThis.localStorage = env.mockLocalStorage;

  // Ensure DOM exists
  env.mockDocument.getElementById('settings-page');

  // Spy on saveSettingsAndSync
  let syncInvokedCount = 0;
  const originalSave = appSettings._testSpySave;
  appSettings._testSpySave = () => { syncInvokedCount++; };

  renderSettingsPage();

  assert.equal(syncInvokedCount, 0, 'renderSettingsPage must not invoke save/persistence');
});

test('Partial-update test: updating one setting preserves unrelated nested and top-level settings', () => {
  // Set initial complex state
  appSettings.uiColorTheme = 'lavender';
  appSettings.notificationsEnabled = true;
  appSettings.reminderTimes = {
    morning: '08:00',
    afternoon: '13:00',
    evening: '18:00'
  };

  // Perform partial update
  updateSettingsState({ linkPreviewsEnabled: false }, { save: false, applyUi: false });

  // Assert unrelated fields remain untouched
  assert.equal(appSettings.uiColorTheme, 'lavender');
  assert.equal(appSettings.notificationsEnabled, true);
  assert.deepEqual(appSettings.reminderTimes, {
    morning: '08:00',
    afternoon: '13:00',
    evening: '18:00'
  });
  assert.equal(appSettings.linkPreviewsEnabled, false);
});

test('Wallpaper-removal test: clicking remove clears wallpaper state, updates controls, and invokes persistence', () => {
  resetInitStateForTesting();
  const env = createMockDomEnvironment();
  globalThis.document = env.mockDocument;
  globalThis.localStorage = env.mockLocalStorage;

  // Initialize DOM and active custom wallpaper state
  initSettings();
  appSettings.appBgType = 'custom-image';
  appSettings.appBgImage = { src: 'data:image/png;base64,testdata', overlay: 20, fit: 'cover' };

  const removeBtn = env.mockDocument.getElementById('settings-app-bg-remove');

  // Trigger removal click handler
  removeBtn.click();

  // Assert wallpaper state reset
  assert.equal(appSettings.appBgImage, null, 'appBgImage should be set to null');
  assert.equal(appSettings.appBgType, 'preset', 'appBgType should revert to preset');
  assert.equal(removeBtn.disabled, true, 'Remove button should be disabled when custom image is removed');
});

test('Emoji extraction test: autoIdentifyEmojiColor extracts deterministic HSL values from canvas data', () => {
  const env = createMockDomEnvironment();
  globalThis.document = env.mockDocument;

  // Blue pixel mock data yields hue ~216°
  const result = autoIdentifyEmojiColor('🌊');

  assert.equal(typeof result.hue, 'number');
  assert.equal(result.hue, 216, 'Deterministic pixel data should yield 216° hue');
  assert.equal(result.lightBg, 'hsl(216, 35%, 90%)');
  assert.equal(result.darkBg, 'hsl(216, 20%, 25%)');
});

test('Emoji extraction fallback test: handles canvas exception safely', () => {
  const env = createMockDomEnvironment();
  // Provide document where canvas getContext throws an exception
  globalThis.document = {
    ...env.mockDocument,
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => { throw new Error('Canvas Context Unsupported'); }
        };
      }
      return env.mockDocument.createElement(tag);
    }
  };

  const result = autoIdentifyEmojiColor('❓');
  assert.equal(typeof result.hue, 'number');
  assert.ok(result.lightBg.startsWith('hsl('));
  assert.ok(result.darkBg.startsWith('hsl('));
});

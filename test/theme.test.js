import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THEME_ID,
  SUPPORTED_THEME_IDS,
  THEME_CONFIGS,
  LEGACY_PRESET_MAP,
  isValidThemeId,
  getThemeConfig
} from '../theme/theme-config.js';

import {
  normalizeThemeId,
  migrateLegacyThemeSettings,
  hasActiveCustomWallpaper
} from '../theme/theme-state.js';

import {
  applyUiColorThemeClass,
  applyAppBgColor
} from '../theme/theme-renderer.js';

import { applyNoteAppearance } from '../theme.js';

// Setup minimal DOM mock environment for testing DOM manipulations
function createMockDom() {
  const classList = new Set();
  const styleProps = new Map();
  const elementsById = new Map();

  const tintOverlay = {
    style: {
      display: 'none'
    }
  };
  elementsById.set('workspace-tint-overlay', tintOverlay);

  const mockBody = {
    classList: {
      add: (cls) => classList.add(cls),
      remove: (...classes) => classes.forEach(cls => classList.delete(cls)),
      contains: (cls) => classList.has(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classList.has(cls)) classList.delete(cls); else classList.add(cls);
        } else if (force) {
          classList.add(cls);
        } else {
          classList.delete(cls);
        }
      }
    },
    style: {
      setProperty: (prop, val) => styleProps.set(prop, val),
      removeProperty: (prop) => styleProps.delete(prop),
      getPropertyValue: (prop) => styleProps.get(prop) || ''
    }
  };

  const mockDocument = {
    body: mockBody,
    getElementById: (id) => elementsById.get(id) || null
  };

  return { mockDocument, mockBody, tintOverlay, classList, styleProps };
}

test('theme-config exports supported themes and default theme is slate', () => {
  assert.equal(DEFAULT_THEME_ID, 'slate');
  assert.ok(SUPPORTED_THEME_IDS.includes('slate'));
  assert.ok(SUPPORTED_THEME_IDS.includes('lavender'));
  assert.ok(SUPPORTED_THEME_IDS.includes('sky'));
  assert.ok(SUPPORTED_THEME_IDS.includes('paper'));
  assert.ok(SUPPORTED_THEME_IDS.includes('auto'));
});

test('isValidThemeId validates supported and rejects invalid theme IDs', () => {
  assert.equal(isValidThemeId('slate'), true);
  assert.equal(isValidThemeId('mint'), true);
  assert.equal(isValidThemeId('non-existent-theme'), false);
  assert.equal(isValidThemeId(null), false);
  assert.equal(isValidThemeId(undefined), false);
});

test('getThemeConfig returns configuration or falls back to default slate', () => {
  const mintConfig = getThemeConfig('mint');
  assert.equal(mintConfig.id, 'mint');
  assert.ok(mintConfig.lightBg.includes('gradient'));
  assert.ok(mintConfig.darkBg.includes('gradient'));

  const invalidConfig = getThemeConfig('invalid-theme');
  assert.equal(invalidConfig.id, 'slate');
});

test('normalizeThemeId safely falls back to slate for invalid or missing values', () => {
  assert.equal(normalizeThemeId('lavender'), 'lavender');
  assert.equal(normalizeThemeId('unknown'), 'slate');
  assert.equal(normalizeThemeId(''), 'slate');
  assert.equal(normalizeThemeId(null), 'slate');
});

test('migrateLegacyThemeSettings converts legacy appBgColor presets to uiColorTheme', () => {
  const legacy1 = { appBgColor: 'coolgray' };
  migrateLegacyThemeSettings(legacy1);
  assert.equal(legacy1.uiColorTheme, 'slate');

  const legacy2 = { appBgColor: 'lilac' };
  migrateLegacyThemeSettings(legacy2);
  assert.equal(legacy2.uiColorTheme, 'lavender');

  const legacy3 = { appBgColor: 'sage' };
  migrateLegacyThemeSettings(legacy3);
  assert.equal(legacy3.uiColorTheme, 'mint');

  const existingValid = { uiColorTheme: 'peach', appBgColor: 'coolgray' };
  migrateLegacyThemeSettings(existingValid);
  assert.equal(existingValid.uiColorTheme, 'peach');
});

test('hasActiveCustomWallpaper detects active custom background image', () => {
  assert.equal(hasActiveCustomWallpaper(null), false);
  assert.equal(hasActiveCustomWallpaper({ appBgType: 'preset' }), false);
  assert.equal(hasActiveCustomWallpaper({ appBgType: 'custom-image', appBgImage: { src: 'data:image/png;base64,123' } }), true);
});

test('applyUiColorThemeClass applies supported UI themes and removes stale classes', () => {
  const { mockDocument, classList } = createMockDom();
  globalThis.document = mockDocument;

  applyUiColorThemeClass('lavender');
  assert.ok(classList.has('ui-theme-lavender'));
  assert.equal(classList.has('ui-theme-slate'), false);

  applyUiColorThemeClass('mint');
  assert.ok(classList.has('ui-theme-mint'));
  assert.equal(classList.has('ui-theme-lavender'), false);

  // Fallback test
  applyUiColorThemeClass('invalid-theme');
  assert.ok(classList.has('ui-theme-slate'));
  assert.equal(classList.has('ui-theme-mint'), false);
});

test('applyAppBgColor sets theme-derived background in light and dark mode', () => {
  const { mockDocument, mockBody, styleProps, tintOverlay } = createMockDom();
  globalThis.document = mockDocument;

  // Light mode test
  applyAppBgColor({ uiColorTheme: 'sky' });
  assert.equal(tintOverlay.style.display, 'none');
  const lightBg = styleProps.get('--bg-app');
  assert.ok(lightBg.includes('180deg'));

  // Dark mode test
  mockBody.classList.add('dark-theme');
  applyAppBgColor({ uiColorTheme: 'sky' });
  const darkBg = styleProps.get('--bg-app');
  assert.ok(darkBg.includes('180deg'));
  assert.notEqual(lightBg, darkBg);
});

test('applyAppBgColor handles custom wallpaper, tint overlay, opacity, and wallpaper removal', () => {
  const { mockDocument, styleProps, tintOverlay } = createMockDom();
  globalThis.document = mockDocument;

  const customSettings = {
    uiColorTheme: 'mint',
    appBgType: 'custom-image',
    appBgImage: {
      src: 'https://example.com/wallpaper.jpg',
      fit: 'cover',
      position: 'top center',
      overlay: 25
    }
  };

  // Apply custom wallpaper
  applyAppBgColor(customSettings);
  assert.equal(tintOverlay.style.display, 'block');
  assert.ok(styleProps.get('--bg-app').includes('https://example.com/wallpaper.jpg'));
  assert.equal(styleProps.get('--bg-app-size'), 'cover');
  assert.equal(styleProps.get('--bg-app-position'), 'top center');

  // Switching accent theme while wallpaper is active keeps wallpaper active
  customSettings.uiColorTheme = 'blush';
  applyAppBgColor(customSettings);
  assert.equal(tintOverlay.style.display, 'block');
  assert.ok(styleProps.get('--bg-app').includes('https://example.com/wallpaper.jpg'));

  // Removing wallpaper returns to theme background
  customSettings.appBgType = 'preset';
  customSettings.appBgImage = null;
  applyAppBgColor(customSettings);
  assert.equal(tintOverlay.style.display, 'none');
  assert.equal(styleProps.has('--bg-app-size'), false);
  assert.equal(styleProps.has('--bg-app-position'), false);
  assert.ok(styleProps.get('--bg-app').includes('linear-gradient'));
});

test('applyAppBgColor called without arguments falls back to appSettings', () => {
  const { mockDocument, styleProps } = createMockDom();
  globalThis.document = mockDocument;

  // Should execute safely without throwing or losing default theme background
  assert.doesNotThrow(() => {
    applyAppBgColor();
  });
  assert.ok(styleProps.get('--bg-app').includes('linear-gradient'));
});

test('applyNoteAppearance applies dark-mode optimized colors for solid themes', () => {
  const { mockDocument, mockBody } = createMockDom();
  globalThis.document = mockDocument;

  const mockElement = {
    setAttribute: (k, v) => mockElement[k] = v,
    removeAttribute: (k) => delete mockElement[k],
    style: {
      setProperty: (k, v) => mockElement[k] = v,
      removeProperty: (k) => delete mockElement[k]
    }
  };

  // Light mode solid theme
  applyNoteAppearance(mockElement, { color: 'default', theme: 'sage-green' });
  assert.equal(mockElement['--note-frame'], '#D0E8D3');

  // Dark mode solid theme
  mockBody.classList.add('dark-theme');
  applyNoteAppearance(mockElement, { color: 'default', theme: 'sage-green' });
  assert.equal(mockElement['--note-frame'], '#1c2e22');
});

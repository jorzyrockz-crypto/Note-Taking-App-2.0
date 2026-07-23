/**
 * Theme state normalization and migration module.
 * Handles normalization, validation, and migration of legacy settings.
 */

import {
  DEFAULT_THEME_ID,
  SUPPORTED_THEME_IDS,
  LEGACY_PRESET_MAP,
  isValidThemeId
} from './theme-config.js';

/**
 * Normalizes a theme ID to a valid supported theme ID.
 * Returns DEFAULT_THEME_ID if invalid or falsy.
 */
export function normalizeThemeId(themeId) {
  if (isValidThemeId(themeId)) {
    return themeId;
  }
  return DEFAULT_THEME_ID;
}

/**
 * Migrates legacy settings to ensure uiColorTheme is properly populated
 * while preserving appBgType, appBgImage, and appBgColor.
 */
export function migrateLegacyThemeSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { uiColorTheme: DEFAULT_THEME_ID };
  }

  // If uiColorTheme is missing or invalid, attempt migration from legacy appBgColor
  if (!isValidThemeId(settings.uiColorTheme)) {
    const legacyBg = settings.appBgColor;
    if (legacyBg && LEGACY_PRESET_MAP[legacyBg]) {
      settings.uiColorTheme = LEGACY_PRESET_MAP[legacyBg];
    } else {
      settings.uiColorTheme = DEFAULT_THEME_ID;
    }
  }

  return settings;
}

/**
 * Returns true if a valid custom wallpaper image is configured and active.
 */
export function hasActiveCustomWallpaper(settings) {
  return Boolean(
    settings &&
    settings.appBgType === 'custom-image' &&
    settings.appBgImage &&
    settings.appBgImage.src
  );
}

let settingsProvider = null;

export function setSettingsProvider(providerFn) {
  if (typeof providerFn === 'function') {
    settingsProvider = providerFn;
  }
}

export function getActiveSettings(explicitSettings) {
  if (explicitSettings && typeof explicitSettings === 'object' && Object.keys(explicitSettings).length > 0) {
    return explicitSettings;
  }
  if (settingsProvider) {
    const provided = settingsProvider();
    if (provided && typeof provided === 'object') {
      return provided;
    }
  }
  return explicitSettings || {};
}

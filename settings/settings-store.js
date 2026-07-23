/**
 * Settings Store Module
 * Coordinates settings mutation, persistence, and synchronization.
 * Operates on existing appSettings reference without creating duplicate state.
 */

import {
  appSettings,
  saveSettingsAndSync,
  applyWorkspacePreferences,
  applyCardLayoutStyle,
  showToast
} from '../app.js';

import {
  applyUiColorThemeClass,
  applyAppBgColor
} from '../theme/theme-renderer.js';

/**
 * Update appSettings with partial state changes and optionally commit/sync.
 * @param {Object} partialSettings
 * @param {Object} options
 * @param {boolean} [options.save=true] - Whether to call saveSettingsAndSync
 * @param {boolean} [options.applyUi=true] - Whether to apply UI appearance changes immediately
 */
export function updateSettingsState(partialSettings, options = { save: true, applyUi: true }) {
  if (!partialSettings || typeof partialSettings !== 'object') return;

  Object.assign(appSettings, partialSettings);

  if (options.applyUi !== false) {
    if (partialSettings.cardLayoutStyle !== undefined) {
      applyCardLayoutStyle(appSettings.cardLayoutStyle);
    }
    if (partialSettings.tabletFirstEnabled !== undefined || partialSettings.workspaceDensity !== undefined) {
      applyWorkspacePreferences();
    }
    if (partialSettings.uiColorTheme !== undefined) {
      if (typeof applyUiColorThemeClass === 'function') {
        applyUiColorThemeClass(appSettings.uiColorTheme);
      }
      if (typeof applyAppBgColor === 'function') {
        applyAppBgColor();
      }
    }
  }

  if (options.save !== false) {
    saveSettingsAndSync();
  }
}

/**
 * Get current appSettings state object.
 */
export function getAppSettings() {
  return appSettings;
}

export {
  saveSettingsAndSync,
  applyWorkspacePreferences,
  applyCardLayoutStyle,
  showToast
};

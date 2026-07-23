/**
 * Theme renderer module.
 * Applies UI theme body classes, theme canvas backgrounds, and custom wallpaper settings.
 */

import { clamp, numericSetting, escapeCssUrl } from '../utils.js';
import { SUPPORTED_THEME_IDS, getThemeConfig } from './theme-config.js';
import { normalizeThemeId, hasActiveCustomWallpaper, getActiveSettings } from './theme-state.js';

const ALL_PRESET_CLASSES = ['base', 'sky', 'lilac', 'sage', 'peach', 'offwhite', 'white', 'coolgray', 'paper', 'custom'];

/**
 * Applies the active UI theme class to document.body (e.g. `ui-theme-slate`).
 * Removes stale theme classes and handles fallbacks safely.
 */
export function applyUiColorThemeClass(themeId) {
  if (typeof document === 'undefined' || !document.body) return;

  const normalizedTheme = normalizeThemeId(themeId);

  // Remove stale theme classes
  SUPPORTED_THEME_IDS.forEach(id => {
    document.body.classList.remove(`ui-theme-${id}`);
  });

  document.body.classList.add(`ui-theme-${normalizedTheme}`);
}

/**
 * Applies the theme-derived background or custom wallpaper to document.body.
 * Toggles wallpaper tint overlay (#workspace-tint-overlay).
 */
export function applyAppBgColor(settings) {
  if (typeof document === 'undefined' || !document.body) return;

  const activeSettings = getActiveSettings(settings);
  const isDark = document.body.classList.contains('dark-theme');
  const hasCustomImage = hasActiveCustomWallpaper(activeSettings);
  const themeId = normalizeThemeId(activeSettings.uiColorTheme);
  const config = getThemeConfig(themeId);

  const tintOverlay = document.getElementById('workspace-tint-overlay');
  if (tintOverlay) {
    tintOverlay.style.display = hasCustomImage ? 'block' : 'none';
  }

  // Toggle active preset classes on the body for styling isolation
  const bgPreset = hasCustomImage ? 'custom' : config.bgPreset;
  ALL_PRESET_CLASSES.forEach(preset => {
    document.body.classList.toggle(`bg-preset-${preset}`, bgPreset === preset);
  });

  if (hasCustomImage) {
    const overlayOpacity = clamp(numericSetting(activeSettings.appBgImage?.overlay, isDark ? 38 : 18), 0, 70) / 100;
    const overlayColor = isDark ? `rgba(15, 23, 42, ${overlayOpacity})` : `rgba(255, 255, 255, ${overlayOpacity})`;
    const imageUrl = escapeCssUrl(activeSettings.appBgImage?.src || '');

    document.body.style.setProperty('--bg-app', `linear-gradient(${overlayColor}, ${overlayColor}), url("${imageUrl}")`, 'important');
    document.body.style.setProperty('--bg-app-size', activeSettings.appBgImage?.fit === 'tile' ? 'auto' : (activeSettings.appBgImage?.fit || 'cover'));
    document.body.style.setProperty('--bg-app-position', activeSettings.appBgImage?.position || 'center center');
    document.body.style.setProperty('--bg-app-repeat', activeSettings.appBgImage?.fit === 'tile' ? 'repeat' : 'no-repeat');
    return;
  }

  // Remove custom wallpaper inline CSS properties
  document.body.style.removeProperty('--bg-app-size');
  document.body.style.removeProperty('--bg-app-position');
  document.body.style.removeProperty('--bg-app-repeat');

  const bgValue = isDark ? config.darkBg : config.lightBg;
  document.body.style.setProperty('--bg-app', bgValue, 'important');
}

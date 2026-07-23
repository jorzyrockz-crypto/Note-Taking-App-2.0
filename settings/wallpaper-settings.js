/**
 * Wallpaper Settings Module
 * Handles background image uploads, removal, opacity overlay slider,
 * background fit selections, and rendering background picker controls.
 */

import { SettingsDOM } from './settings-dom.js';
import { saveSettingsAndSync, showToast } from './settings-store.js';
import {
  appSettings,
  processUploadedBackgroundImage
} from '../app.js';

import {
  applyAppBgColor,
  applyUiColorThemeClass
} from '../theme/theme-renderer.js';

export function bindWallpaperEvents() {
  const dom = SettingsDOM;

  dom.appBgUpload?.addEventListener('change', handleAppBackgroundUpload);

  dom.appBgRemove?.addEventListener('click', () => {
    appSettings.appBgType = 'preset';
    appSettings.appBgImage = null;
    applyAppBgColor();
    renderSettingsBgPicker();
    saveSettingsAndSync();
  });

  dom.appBgOverlay?.addEventListener('input', () => {
    if (appSettings.appBgImage) {
      appSettings.appBgImage.overlay = Number(dom.appBgOverlay.value);
      if (dom.appBgOverlayVal) dom.appBgOverlayVal.textContent = `${dom.appBgOverlay.value}%`;
      applyAppBgColor();
      saveSettingsAndSync();
    }
  });

  dom.appBgFit?.addEventListener('change', () => {
    if (appSettings.appBgImage) {
      appSettings.appBgImage.fit = dom.appBgFit.value;
      applyAppBgColor();
      saveSettingsAndSync();
    }
  });
}

export async function handleAppBackgroundUpload() {
  const dom = SettingsDOM;
  const [file] = Array.from(dom.appBgUpload?.files || []);
  if (!file) return;

  try {
    const processed = await processUploadedBackgroundImage(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.82
    });
    appSettings.appBgType = 'custom-image';
    appSettings.autoExtractedTheme = processed.extractedTheme || 'sky';
    appSettings.appBgImage = {
      ...processed,
      fit: 'cover',
      position: 'center center',
      overlay: Number(dom.appBgOverlay?.value || 18)
    };
    applyAppBgColor();
    if (appSettings.uiColorTheme === 'auto' && typeof applyUiColorThemeClass === 'function') {
      applyUiColorThemeClass('auto');
    }
    renderSettingsBgPicker();
    saveSettingsAndSync();
    showToast({ title: 'Background uploaded', text: 'Your custom app background is active.' });
  } catch (error) {
    console.warn('Unable to set app background:', error);
    showToast({ title: 'Upload failed', text: error.message || 'Choose another image and try again.' });
  } finally {
    if (dom.appBgUpload) dom.appBgUpload.value = '';
  }
}

export function renderSettingsBgPicker() {
  const dom = SettingsDOM;
  const customBg = appSettings.appBgImage?.src ? appSettings.appBgImage : null;
  if (dom.appBgRemove) dom.appBgRemove.disabled = !customBg;
  if (dom.appBgOverlay) dom.appBgOverlay.value = customBg?.overlay ?? 18;
  if (dom.appBgOverlayVal) dom.appBgOverlayVal.textContent = `${customBg?.overlay ?? 18}%`;

  if (dom.appBgFit) {
    dom.appBgFit.value = customBg?.fit || 'cover';
    dom.appBgFit.disabled = !customBg;
  }
}

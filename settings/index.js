/**
 * Settings Feature Coordinator Index
 * Central entrance point for settings initialization, rendering, and API compatibility.
 */

import { SettingsDOM } from './settings-dom.js';
import { saveSettingsAndSync, showToast } from './settings-store.js';
import { bindAppearanceEvents, populateAppearanceForm, updateSettingsLivePreview, renderSettingsCustomThemesList, createCustomEmojiTheme, deleteCustomEmojiTheme, autoIdentifyEmojiColor } from './appearance-settings.js';
import { bindWallpaperEvents, renderSettingsBgPicker } from './wallpaper-settings.js';
import { bindNotificationEvents, populateNotificationForm } from './notification-settings.js';
import { populateEditorForm } from './editor-settings.js';
import { bindAccountEvents } from './account-settings.js';

import {
  appSettings,
  setActivePage,
  setExperimentalSkyTheme,
  setPremiumSkyTheme,
  applyCardLayoutStyle,
  applyWorkspacePreferences,
  applyThemeSchedule,
  syncEmojiThemePresentation
} from '../app.js';

import {
  applyUiColorThemeClass,
  applyAppBgColor
} from '../theme/theme-renderer.js';

import { globalEmojiThemeControls } from '../theme.js';

let isInitialized = false;

export function resetInitStateForTesting() {
  isInitialized = false;
}

export function initSettings() {
  if (isInitialized) {
    // Idempotent: avoid duplicate listener bindings if initSettings is called multiple times
    return true;
  }

  const dom = SettingsDOM;
  if (!dom.page) {
    // Required settings DOM is not present yet; do not set initialized flag so retries succeed
    return false;
  }

  // Bind Section Handlers
  bindAppearanceEvents();
  bindWallpaperEvents();
  bindNotificationEvents();
  bindAccountEvents();

  // Navigation Back/Save
  dom.backBtn?.addEventListener('click', () => {
    saveSettingsFromForm();
    setActivePage('notes');
  });
  dom.saveBtn?.addEventListener('click', () => {
    saveSettingsFromForm();
    setActivePage('notes');
  });

  // Tab Navigation
  initSettingsTabs();

  isInitialized = true;
  return true;
}

function initSettingsTabs() {
  const tabItems = document.querySelectorAll('.settings-tab-item');
  const panels = document.querySelectorAll('.settings-tab-panel');

  const savedTab = (typeof localStorage !== 'undefined' && localStorage?.getItem)
    ? localStorage.getItem('paperuss_settings_tab') || 'general'
    : 'general';
  activateTab(savedTab);

  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      activateTab(tab);
      if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
        localStorage.setItem('paperuss_settings_tab', tab);
      }
    });
  });

  function activateTab(tabId) {
    tabItems.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `settings-panel-${tabId}`));
  }
}

export function renderSettingsPage() {
  const dom = SettingsDOM;
  if (!dom.page) return;

  // Hide other pages, show settings page
  const creatorWrapper = document.querySelector('.creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');
  const productivityPage = document.getElementById('productivity-page');
  const searchPage = document.getElementById('search-page');

  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (productivityPage) productivityPage.style.display = 'none';
  if (searchPage) searchPage.style.display = 'none';
  dom.page.style.display = 'flex';

  // Populate form fields from state without triggering saves
  populateEditorForm();
  populateAppearanceForm();
  populateNotificationForm();
  renderSettingsBgPicker();
}

export function saveSettingsFromForm() {
  const dom = SettingsDOM;
  if (!dom.linkPreviews) return;

  Object.assign(appSettings, {
    linkPreviewsEnabled: dom.linkPreviews.checked,
    checkedItemsToBottom: dom.checkedBottom ? dom.checkedBottom.checked : false,
    newChecklistItemsToBottom: dom.newBottom ? dom.newBottom.checked : false,
    advancedEditorEnabled: false,
    modernGlassEditorEnabled: true,
    cardLayoutStyle: dom.cardStyleSelect ? dom.cardStyleSelect.value : 'default',
    workspaceDensity: 'auto',
    tabletFirstEnabled: dom.tabletFirst ? dom.tabletFirst.checked : false,
    reminderTimes: {
      morning: dom.reminderMorning ? dom.reminderMorning.value : '08:00',
      afternoon: dom.reminderAfternoon ? dom.reminderAfternoon.value : '13:00',
      evening: dom.reminderEvening ? dom.reminderEvening.value : '18:00'
    },
    uiColorTheme: dom.uiColorThemeSelect ? dom.uiColorThemeSelect.value : 'slate',
    themeScheduleEnabled: dom.themeSchedule ? dom.themeSchedule.checked : false,
    themeLightFrom: dom.themeLightFrom ? dom.themeLightFrom.value : '07:00',
    themeDarkFrom: dom.themeDarkFrom ? dom.themeDarkFrom.value : '19:00',
    notificationsEnabled: dom.notifEnabled ? dom.notifEnabled.checked : true,
    notificationsReminders: dom.notifReminders ? dom.notifReminders.checked : true,
    notificationsDnd: dom.notifDnd ? dom.notifDnd.checked : false,
    notificationsQuietHours: dom.notifQuietHours ? dom.notifQuietHours.checked : false,
    quietHoursFrom: dom.quietFrom ? dom.quietFrom.value : '22:00',
    quietHoursTo: dom.quietTo ? dom.quietTo.value : '07:00',
    notificationsSound: dom.notifSound ? dom.notifSound.checked : true,
    notificationsVibrate: dom.notifVibrate ? dom.notifVibrate.checked : true
  });

  if (dom.experimentalSkyTheme) {
    const enabled = dom.experimentalSkyTheme.checked;
    setExperimentalSkyTheme(enabled);
    localStorage.setItem('paperuss_experimental_sky', enabled ? 'true' : 'false');
  }

  if (dom.premiumSkyTheme) {
    const enabled = dom.premiumSkyTheme.checked;
    setPremiumSkyTheme(enabled);
    localStorage.setItem('paperuss_theme_premium_ambient', enabled ? 'true' : 'false');
  }

  if (dom.emojiOpacity && dom.emojiSize && dom.emojiSpacing) {
    globalEmojiThemeControls.opacity = Number(dom.emojiOpacity.value);
    globalEmojiThemeControls.size = Number(dom.emojiSize.value);
    globalEmojiThemeControls.spacing = Number(dom.emojiSpacing.value);
  }

  saveSettingsAndSync();

  applyCardLayoutStyle(appSettings.cardLayoutStyle);
  applyWorkspacePreferences();

  if (typeof applyUiColorThemeClass === 'function') {
    applyUiColorThemeClass(appSettings.uiColorTheme || 'slate');
  }
  if (typeof applyAppBgColor === 'function') {
    applyAppBgColor();
  }
  if (typeof applyThemeSchedule === 'function') {
    applyThemeSchedule();
  }

  syncEmojiThemePresentation();
  showToast({ title: 'Settings Saved', text: 'Your preferences have been updated successfully.' });
}

export {
  renderSettingsBgPicker,
  updateSettingsLivePreview,
  renderSettingsCustomThemesList,
  createCustomEmojiTheme,
  deleteCustomEmojiTheme,
  autoIdentifyEmojiColor
};

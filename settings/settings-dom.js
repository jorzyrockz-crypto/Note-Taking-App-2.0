/**
 * Settings DOM Elements Module
 * Centralizes DOM element lookups for settings controls.
 * Avoids repeated document.getElementById calls while ensuring elements
 * are looked up on demand (never pre-cached before DOM exists).
 */

export function getSettingsEl(id) {
  return document.getElementById(id);
}

export const SettingsDOM = {
  // Page & Actions
  get page() { return getSettingsEl('settings-page'); },
  get backBtn() { return getSettingsEl('settings-back-btn'); },
  get saveBtn() { return getSettingsEl('settings-save'); },
  get resetDataBtn() { return getSettingsEl('settings-reset-data'); },

  // Editor Preferences
  get linkPreviews() { return getSettingsEl('settings-link-previews'); },
  get checkedBottom() { return getSettingsEl('settings-checked-bottom'); },
  get newBottom() { return getSettingsEl('settings-new-bottom'); },
  get advancedEditor() { return getSettingsEl('settings-advanced-editor'); },
  get modernGlassEditor() { return getSettingsEl('settings-modern-glass-editor'); },
  get cardStyleSelect() { return getSettingsEl('settings-card-style'); },
  get cardStyleSeg() { return getSettingsEl('settings-card-style-seg'); },

  // Workspace & Themes
  get tabletFirst() { return getSettingsEl('settings-tablet-first'); },
  get experimentalSkyTheme() { return getSettingsEl('settings-experimental-sky-theme'); },
  get premiumSkyTheme() { return getSettingsEl('settings-premium-floating-theme'); },
  get uiColorThemeSelect() { return getSettingsEl('settings-ui-color-theme'); },
  get accentSwatchesRow() { return getSettingsEl('settings-accent-swatches'); },

  // Sliders & Preview
  get emojiOpacity() { return getSettingsEl('settings-emoji-opacity'); },
  get emojiSize() { return getSettingsEl('settings-emoji-size'); },
  get emojiSpacing() { return getSettingsEl('settings-emoji-spacing'); },
  get previewCard() { return getSettingsEl('settings-preview-card'); },
  get opacityValLabel() { return getSettingsEl('settings-opacity-val'); },
  get sizeValLabel() { return getSettingsEl('settings-size-val'); },
  get spacingValLabel() { return getSettingsEl('settings-spacing-val'); },

  // Custom Theme Creation
  get customThemeTitle() { return getSettingsEl('settings-custom-theme-title'); },
  get customThemeEmojis() { return getSettingsEl('settings-custom-theme-emojis'); },
  get customThemeCreateBtn() { return getSettingsEl('settings-custom-theme-create'); },
  get customThemesList() { return getSettingsEl('settings-custom-themes-list'); },

  // Wallpaper / App Background
  get appBgUpload() { return getSettingsEl('settings-app-bg-upload'); },
  get appBgRemove() { return getSettingsEl('settings-app-bg-remove'); },
  get appBgOverlay() { return getSettingsEl('settings-app-bg-overlay'); },
  get appBgOverlayVal() { return getSettingsEl('settings-app-bg-overlay-val'); },
  get appBgFit() { return getSettingsEl('settings-app-bg-fit'); },

  // Theme Scheduling
  get themeSchedule() { return getSettingsEl('settings-theme-schedule'); },
  get themeLightFrom() { return getSettingsEl('settings-theme-light-from'); },
  get themeDarkFrom() { return getSettingsEl('settings-theme-dark-from'); },
  get themeScheduleHours() { return getSettingsEl('settings-theme-schedule-hours'); },

  // Reminders
  get reminderMorning() { return getSettingsEl('settings-reminder-morning'); },
  get reminderAfternoon() { return getSettingsEl('settings-reminder-afternoon'); },
  get reminderEvening() { return getSettingsEl('settings-reminder-evening'); },

  // Notifications
  get notifEnabled() { return getSettingsEl('settings-notif-enabled'); },
  get notifReminders() { return getSettingsEl('settings-notif-reminders'); },
  get notifDnd() { return getSettingsEl('settings-notif-dnd'); },
  get notifQuietHours() { return getSettingsEl('settings-notif-quiet-hours'); },
  get quietHoursRange() { return getSettingsEl('settings-quiet-hours-range'); },
  get quietFrom() { return getSettingsEl('settings-quiet-from'); },
  get quietTo() { return getSettingsEl('settings-quiet-to'); },
  get notifSound() { return getSettingsEl('settings-notif-sound'); },
  get notifVibrate() { return getSettingsEl('settings-notif-vibrate'); },
  get notifPositionGrid() { return getSettingsEl('settings-notif-position-grid'); }
};

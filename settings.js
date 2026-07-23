/**
 * Settings Module Compatibility Facade
 * Re-exports the settings public API from the modular ./settings/ package.
 * Preserves 100% backward compatibility for dynamic imports from app.js.
 */

export {
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
} from './settings/index.js';

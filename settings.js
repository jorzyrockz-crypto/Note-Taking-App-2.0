import {
  notes,
  appSettings,
  STORAGE_KEYS,
  saveEmojiThemeControls,
  updateSliderTrackFill,
  applyCardLayoutStyle,
  syncEmojiThemePresentation,
  renderNotes,
  showToast,
  buildColorPickers,
  setActivePage,
  clearAllCacheAndData,
  saveToLocalStorage,
  saveSettingsAndSync,
  applyAppBgColor,
  saveCustomThemesAndSync,
  processUploadedBackgroundImage,
  experimentalSkyTheme,
  setExperimentalSkyTheme,
  premiumSkyTheme,
  setPremiumSkyTheme,
  applyUiColorThemeClass
} from './app.js';

import {
  customThemes,
  THEME_PRESETS,
  DEFAULT_THEME_PRESETS,
  globalEmojiThemeControls,
  getEmojiThemeControls,
  buildEmojiThemePattern
} from './theme.js';

let settingsPage;
let settingsExperimentalSkyTheme;
let settingsPremiumSkyTheme;
let settingsBackBtn;
let settingsSave;
let settingsResetData;
let settingsLinkPreviews;
let settingsCheckedBottom;
let settingsNewBottom;
let settingsAdvancedEditor;
let settingsModernGlassEditor;
let settingsCardStyle;
let settingsEmojiOpacity;
let settingsEmojiSize;
let settingsEmojiSpacing;
let settingsPreviewCard;
let settingsCustomThemeTitle;
let settingsCustomThemeEmojis;
let settingsCustomThemeCreate;
let settingsCustomThemesList;
let settingsReminderMorning;
let settingsReminderAfternoon;
let settingsReminderEvening;
let settingsUiColorTheme;
let settingsAppBgUpload;
let settingsAppBgRemove;
let settingsAppBgOverlay;
let settingsAppBgOverlayVal;
let settingsAppBgFit;

export function initSettings() {
  settingsPage = document.getElementById('settings-page');
  settingsBackBtn = document.getElementById('settings-back-btn');
  settingsSave = document.getElementById('settings-save');
  settingsResetData = document.getElementById('settings-reset-data');

  settingsLinkPreviews = document.getElementById('settings-link-previews');
  settingsCheckedBottom = document.getElementById('settings-checked-bottom');
  settingsNewBottom = document.getElementById('settings-new-bottom');
  settingsAdvancedEditor = document.getElementById('settings-advanced-editor');
  settingsModernGlassEditor = document.getElementById('settings-modern-glass-editor');
  settingsCardStyle = document.getElementById('settings-card-style');
  settingsExperimentalSkyTheme = document.getElementById('settings-experimental-sky-theme');
  settingsPremiumSkyTheme = document.getElementById('settings-premium-floating-theme');

  settingsEmojiOpacity = document.getElementById('settings-emoji-opacity');
  settingsEmojiSize = document.getElementById('settings-emoji-size');
  settingsEmojiSpacing = document.getElementById('settings-emoji-spacing');
  settingsPreviewCard = document.getElementById('settings-preview-card');

  settingsCustomThemeTitle = document.getElementById('settings-custom-theme-title');
  settingsCustomThemeEmojis = document.getElementById('settings-custom-theme-emojis');
  settingsCustomThemeCreate = document.getElementById('settings-custom-theme-create');
  settingsCustomThemesList = document.getElementById('settings-custom-themes-list');

  settingsReminderMorning = document.getElementById('settings-reminder-morning');
  settingsReminderAfternoon = document.getElementById('settings-reminder-afternoon');
  settingsReminderEvening = document.getElementById('settings-reminder-evening');
  settingsUiColorTheme = document.getElementById('settings-ui-color-theme');
  settingsAppBgUpload = document.getElementById('settings-app-bg-upload');
  settingsAppBgRemove = document.getElementById('settings-app-bg-remove');
  settingsAppBgOverlay = document.getElementById('settings-app-bg-overlay');
  settingsAppBgOverlayVal = document.getElementById('settings-app-bg-overlay-val');
  settingsAppBgFit = document.getElementById('settings-app-bg-fit');

  // Bind Event Handlers
  settingsBackBtn?.addEventListener('click', () => {
    saveSettingsFromForm();
    setActivePage('notes');
  });
  settingsSave?.addEventListener('click', () => {
    saveSettingsFromForm();
    setActivePage('notes');
  });
  settingsResetData?.addEventListener('click', clearAllCacheAndData);

  // Sliders preview
  [settingsEmojiOpacity, settingsEmojiSize, settingsEmojiSpacing].forEach(input => {
    input?.addEventListener('input', updateSettingsLivePreview);
  });

  // Card style live preview
  settingsCardStyle?.addEventListener('change', () => {
    applyCardLayoutStyle(settingsCardStyle.value);
  });

  settingsExperimentalSkyTheme?.addEventListener('change', () => {
    const enabled = settingsExperimentalSkyTheme.checked;
    setExperimentalSkyTheme(enabled);
    localStorage.setItem('paperuss_experimental_sky', enabled ? 'true' : 'false');
  });

  settingsPremiumSkyTheme?.addEventListener('change', () => {
    const enabled = settingsPremiumSkyTheme.checked;
    setPremiumSkyTheme(enabled);
    localStorage.setItem('paperuss_theme_premium_ambient', enabled ? 'true' : 'false');
  });

  settingsAppBgUpload?.addEventListener('change', handleAppBackgroundUpload);
  settingsAppBgRemove?.addEventListener('click', () => {
    appSettings.appBgType = 'preset';
    appSettings.appBgImage = null;
    applyAppBgColor();
    renderSettingsBgPicker();
    saveSettingsAndSync();
  });
  settingsAppBgOverlay?.addEventListener('input', () => {
    if (appSettings.appBgImage) {
      appSettings.appBgImage.overlay = Number(settingsAppBgOverlay.value);
      if (settingsAppBgOverlayVal) settingsAppBgOverlayVal.textContent = `${settingsAppBgOverlay.value}%`;
      applyAppBgColor();
      saveSettingsAndSync();
    }
  });

  settingsAppBgFit?.addEventListener('change', () => {
    if (appSettings.appBgImage) {
      appSettings.appBgImage.fit = settingsAppBgFit.value;
      applyAppBgColor();
      saveSettingsAndSync();
    }
  });

  // Custom theme create
  settingsCustomThemeCreate?.addEventListener('click', createCustomEmojiTheme);
  settingsCustomThemeCreate?.removeAttribute('disabled');
  settingsCustomThemeEmojis?.addEventListener('input', () => {
    const val = settingsCustomThemeEmojis.value;
    const emojis = Array.from(val);
    if (emojis.length > 3) {
      settingsCustomThemeEmojis.value = emojis.slice(0, 3).join('');
    }
  });
}


async function handleAppBackgroundUpload() {
  const [file] = Array.from(settingsAppBgUpload?.files || []);
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
      overlay: Number(settingsAppBgOverlay?.value || 18)
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
    if (settingsAppBgUpload) settingsAppBgUpload.value = '';
  }
}

export function renderSettingsPage() {
  if (!settingsPage) return;

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
  settingsPage.style.display = 'flex';

  // Populate form
  if (settingsLinkPreviews) settingsLinkPreviews.checked = appSettings.linkPreviewsEnabled;
  if (settingsCheckedBottom) settingsCheckedBottom.checked = appSettings.checkedItemsToBottom;
  if (settingsNewBottom) settingsNewBottom.checked = appSettings.newChecklistItemsToBottom;
  if (settingsAdvancedEditor) settingsAdvancedEditor.checked = appSettings.advancedEditorEnabled;
  if (settingsModernGlassEditor) settingsModernGlassEditor.checked = appSettings.modernGlassEditorEnabled || false;
  if (settingsCardStyle) settingsCardStyle.value = appSettings.cardLayoutStyle;
  if (settingsExperimentalSkyTheme) settingsExperimentalSkyTheme.checked = experimentalSkyTheme;
  if (settingsPremiumSkyTheme) settingsPremiumSkyTheme.checked = premiumSkyTheme;
  if (settingsUiColorTheme) settingsUiColorTheme.value = appSettings.uiColorTheme || 'auto';

  // Sliders
  const controls = getEmojiThemeControls();
  if (settingsEmojiOpacity) {
    settingsEmojiOpacity.value = controls.opacity;
    updateSliderTrackFill(settingsEmojiOpacity);
  }
  if (settingsEmojiSize) {
    settingsEmojiSize.value = controls.size;
    updateSliderTrackFill(settingsEmojiSize);
  }
  if (settingsEmojiSpacing) {
    settingsEmojiSpacing.value = controls.spacing;
    updateSliderTrackFill(settingsEmojiSpacing);
  }

  // Reminders
  if (settingsReminderMorning) settingsReminderMorning.value = appSettings.reminderTimes?.morning || '08:00';
  if (settingsReminderAfternoon) settingsReminderAfternoon.value = appSettings.reminderTimes?.afternoon || '13:00';
  if (settingsReminderEvening) settingsReminderEvening.value = appSettings.reminderTimes?.evening || '18:00';

  updateSettingsLivePreview();
  renderSettingsCustomThemesList();
  renderSettingsBgPicker();
}

export function updateSettingsLivePreview() {
  if (!settingsPreviewCard) return;
  const opacityVal = Number(settingsEmojiOpacity.value);
  const sizeVal = Number(settingsEmojiSize.value);
  const spacingVal = Number(settingsEmojiSpacing.value);

  const opacityLabel = document.getElementById('settings-opacity-val');
  const sizeLabel = document.getElementById('settings-size-val');
  const spacingLabel = document.getElementById('settings-spacing-val');

  if (opacityLabel) opacityLabel.textContent = `${opacityVal}%`;
  if (sizeLabel) sizeLabel.textContent = `${sizeVal}px`;
  if (spacingLabel) spacingLabel.textContent = `${spacingVal}px`;

  if (settingsEmojiOpacity) updateSliderTrackFill(settingsEmojiOpacity);
  if (settingsEmojiSize) updateSliderTrackFill(settingsEmojiSize);
  if (settingsEmojiSpacing) updateSliderTrackFill(settingsEmojiSpacing);

  // Draw preview using a dummy preset (spring)
  const tempControls = { opacity: opacityVal, size: sizeVal, spacing: spacingVal };
  const pattern = buildEmojiThemePattern('spring', tempControls);
  settingsPreviewCard.style.setProperty('--theme-pattern', pattern);
  settingsPreviewCard.style.setProperty('--note-theme-pattern-size', `${spacingVal}px ${spacingVal}px`);
  
  // Style standard preview
  settingsPreviewCard.style.setProperty('--note-frame', 'var(--theme-spring-bg)');
  settingsPreviewCard.style.backgroundColor = 'var(--theme-spring-bg)';
  settingsPreviewCard.setAttribute('data-theme', 'spring');
}

export function renderSettingsCustomThemesList() {
  if (!settingsCustomThemesList) return;
  settingsCustomThemesList.innerHTML = '';

  if (customThemes.length === 0) {
    settingsCustomThemesList.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); text-align:center; padding:12px;">No custom themes created yet</div>';
    return;
  }

  customThemes.forEach(theme => {
    const row = document.createElement('div');
    row.className = 'theme-picker-v2-card';
    row.style.position = 'relative';
    row.style.cursor = 'default';
    
    // Auto color badge
    const badgeColor = document.body.classList.contains('dark-theme') ? theme.customBg.dark : theme.customBg.light;
    const pattern = buildEmojiThemePattern(theme.id);

    row.innerHTML = `
      <div class="theme-picker-v2-card-preview" style="background-color: ${badgeColor}; background-image: ${pattern}; background-size: 80px 80px; flex-grow: 1;">
        <div class="theme-picker-v2-card-preview-inner" style="background: rgba(255, 255, 255, 0.95); font-size: 20px;">${theme.emoji}</div>
      </div>
      <div class="theme-picker-v2-card-meta">
        <strong>${theme.title}</strong>
        <span>${theme.emojis.join(' ')}</span>
      </div>
      <button class="icon-btn danger-btn delete-theme-btn" data-id="${theme.id}" title="Delete Theme" style="position: absolute; top: 6px; right: 6px; width: 30px; height: 30px; border-radius: 50%; background: var(--bg-app); border: 1px solid var(--border-light); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.15); padding: 0;">
        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    `;

    row.querySelector('.delete-theme-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomEmojiTheme(theme.id);
    });

    settingsCustomThemesList.appendChild(row);
  });
}

export function createCustomEmojiTheme() {
  const title = settingsCustomThemeTitle.value.trim();
  const emojisStr = settingsCustomThemeEmojis.value.trim();

  if (!title || !emojisStr) {
    showToast({ title: 'Invalid Theme', text: 'Please fill out both the title and emojis fields.' });
    return;
  }

  // Parse emojis into array
  const emojis = Array.from(emojisStr);
  const primaryEmoji = emojis[0];

  // Auto identify background color using canvas
  const detectedBg = autoIdentifyEmojiColor(primaryEmoji);

  const newTheme = {
    id: 'user_' + Date.now(),
    emoji: primaryEmoji,
    title: title,
    emojis: emojis,
    customBg: {
      light: detectedBg.lightBg,
      dark: detectedBg.darkBg
    }
  };

  customThemes.push(newTheme);
  saveCustomThemesAndSync();

  // Merge into preset list
  THEME_PRESETS.splice(0, THEME_PRESETS.length, ...DEFAULT_THEME_PRESETS, ...customThemes);

  // Clear inputs
  settingsCustomThemeTitle.value = '';
  settingsCustomThemeEmojis.value = '';

  showToast({ title: 'Theme Created', text: `Theme "${title}" is now available in the picker!` });

  renderSettingsCustomThemesList();
  
  // Rebuild note theme pickers in app
  buildColorPickers();
}

export function deleteCustomEmojiTheme(themeId) {
  if (!confirm('Are you sure you want to delete this custom theme? Any notes using it will revert to default.')) return;

  // Clean custom themes list in place
  customThemes.splice(0, customThemes.length, ...customThemes.filter(t => t.id !== themeId));
  saveCustomThemesAndSync();

  // Update notes that used this theme
  notes.forEach(note => {
    if (note.theme === themeId) {
      note.theme = null;
    }
  });
  saveToLocalStorage();
  saveEmojiThemeControls(); // trigger save action if needed

  // Re-merge presets in place
  THEME_PRESETS.splice(0, THEME_PRESETS.length, ...DEFAULT_THEME_PRESETS, ...customThemes);

  showToast({ title: 'Theme Deleted', text: 'Custom note theme removed.' });

  renderSettingsCustomThemesList();
  buildColorPickers();
  renderNotes();
}

export function autoIdentifyEmojiColor(emojiString) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // Draw emoji
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiString, 16, 16);
    
    const imgData = ctx.getImageData(0, 0, 32, 32).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    
    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i+1];
      const b = imgData[i+2];
      const a = imgData[i+3];
      
      if (a > 30) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        if (diff > 15) { // saturated color
          rSum += r;
          gSum += g;
          bSum += b;
          count++;
        }
      }
    }
    
    let rgb = { r: 120, g: 120, b: 120 };
    if (count > 0) {
      rgb.r = Math.round(rSum / count);
      rgb.g = Math.round(gSum / count);
      rgb.b = Math.round(bSum / count);
    } else {
      let fallbackR = 0, fallbackG = 0, fallbackB = 0, fallbackCount = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        const a = imgData[i+3];
        if (a > 30) {
          fallbackR += r;
          fallbackG += g;
          fallbackB += b;
          fallbackCount++;
        }
      }
      if (fallbackCount > 0) {
        rgb.r = Math.round(fallbackR / fallbackCount);
        rgb.g = Math.round(fallbackG / fallbackCount);
        rgb.b = Math.round(fallbackB / fallbackCount);
      }
    }
    
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    
    h = Math.round(h * 360);
    
    // Light pastel
    const lightBg = `hsl(${h}, 35%, 90%)`;
    // Dark desaturated pastel
    const darkBg = `hsl(${h}, 20%, 25%)`;
    
    return {
      hue: h,
      lightBg,
      darkBg
    };
  } catch (error) {
    console.warn('Canvas color extraction failed:', error);
    const randHue = Math.floor(Math.random() * 360);
    return {
      hue: randHue,
      lightBg: `hsl(${randHue}, 35%, 90%)`,
      darkBg: `hsl(${randHue}, 20%, 25%)`
    };
  }
}

export function saveSettingsFromForm() {
  if (!settingsLinkPreviews) return;

  Object.assign(appSettings, {
    linkPreviewsEnabled: settingsLinkPreviews.checked,
    checkedItemsToBottom: settingsCheckedBottom.checked,
    newChecklistItemsToBottom: settingsNewBottom.checked,
    advancedEditorEnabled: false,
    modernGlassEditorEnabled: true,
    cardLayoutStyle: settingsCardStyle.value,
    reminderTimes: {
      morning: settingsReminderMorning.value,
      afternoon: settingsReminderAfternoon.value,
      evening: settingsReminderEvening.value
    },
    uiColorTheme: settingsUiColorTheme ? settingsUiColorTheme.value : 'auto'
  });

  if (settingsExperimentalSkyTheme) {
    const enabled = settingsExperimentalSkyTheme.checked;
    setExperimentalSkyTheme(enabled);
    localStorage.setItem('paperuss_experimental_sky', enabled ? 'true' : 'false');
  }

  if (settingsPremiumSkyTheme) {
    const enabled = settingsPremiumSkyTheme.checked;
    setPremiumSkyTheme(enabled);
    localStorage.setItem('paperuss_theme_premium_ambient', enabled ? 'true' : 'false');
  }

  // Save slider positions as global settings
  globalEmojiThemeControls.opacity = Number(settingsEmojiOpacity.value);
  globalEmojiThemeControls.size = Number(settingsEmojiSize.value);
  globalEmojiThemeControls.spacing = Number(settingsEmojiSpacing.value);

  // Commit and sync settings
  saveSettingsAndSync();

  // Apply layout style
  applyCardLayoutStyle(appSettings.cardLayoutStyle);

  // Apply UI Accent color theme
  if (typeof applyUiColorThemeClass === 'function') {
    applyUiColorThemeClass(appSettings.uiColorTheme || 'auto');
  }

  // Sync presentation and notes grid
  syncEmojiThemePresentation();

  showToast({ title: 'Settings Saved', text: 'Your preferences have been updated successfully.' });
}

export function renderSettingsBgPicker() {
  const container = document.getElementById('settings-bg-picker-grid');
  if (!container) return;
  container.innerHTML = '';

  const activeBg = appSettings.appBgType === 'custom-image' ? 'custom' : (appSettings.appBgColor || 'base');
  const customBg = appSettings.appBgImage?.src ? appSettings.appBgImage : null;
  if (settingsAppBgRemove) settingsAppBgRemove.disabled = !customBg;
  if (settingsAppBgOverlay) settingsAppBgOverlay.value = customBg?.overlay ?? 18;
  if (settingsAppBgOverlayVal) settingsAppBgOverlayVal.textContent = `${customBg?.overlay ?? 18}%`;
  
  if (settingsAppBgFit) {
    settingsAppBgFit.value = customBg?.fit || 'cover';
    settingsAppBgFit.disabled = !customBg;
  }

  const options = [
    { id: 'base', title: 'Default (Sky Match)', subtitle: 'Matches navigation bar', previewBg: 'linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 100%)', previewBgDark: 'linear-gradient(180deg, #131e35 0%, #0d1424 100%)' },
    { id: 'sky', title: 'Sky Blue', subtitle: 'Premium soft gradient', previewBg: 'linear-gradient(180deg, #e0f2fe 0%, #fafafd 100%)', previewBgDark: 'linear-gradient(180deg, #0f1a38 0%, #080d1c 100%)' },
    { id: 'lilac', title: 'Lilac Lavender', subtitle: 'Relaxing light purple', previewBg: 'linear-gradient(180deg, #f3e8ff 0%, #faf9fc 100%)', previewBgDark: 'linear-gradient(180deg, #19122a 0%, #0d0916 100%)' },
    { id: 'sage', title: 'Sage Mint', subtitle: 'Resting organic green', previewBg: 'linear-gradient(180deg, #dcfce7 0%, #f9fbf9 100%)', previewBgDark: 'linear-gradient(180deg, #0e2219 0%, #08120d 100%)' },
    { id: 'peach', title: 'Peach Glow', subtitle: 'Warm cozy workspace', previewBg: 'linear-gradient(180deg, #ffedd5 0%, #fdfbf8 100%)', previewBgDark: 'linear-gradient(180deg, #28170a 0%, #170d05 100%)' },
    { id: 'offwhite', title: 'Soft Off-White', subtitle: 'Clean paper-like warmth', previewBg: 'linear-gradient(180deg, #fdfcf8 0%, #faf9f6 100%)', previewBgDark: '#171511' },
    { id: 'white', title: 'Pure White', subtitle: 'Bright minimal canvas', previewBg: '#ffffff', previewBgDark: '#111827' },
    { id: 'coolgray', title: 'Cool Gray', subtitle: 'Clean neutral grey canvas', previewBg: '#EEEEEE', previewBgDark: '#1F2937' },
    { id: 'paper', title: 'Notebook Paper', subtitle: 'Warm oat tone for Notebook card style', previewBg: 'linear-gradient(180deg, #efede3 0%, #f6f4ec 100%)', previewBgDark: 'linear-gradient(180deg, #1d1a14 0%, #15130f 100%)' }
  ];

  const isDark = document.body.classList.contains('dark-theme');

  if (customBg) {
    options.unshift({
      id: 'custom',
      title: 'Custom Image',
      subtitle: customBg.name || 'Uploaded background',
      previewBg: `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url('${customBg.src}')`,
      previewBgDark: `linear-gradient(rgba(15,23,42,0.35), rgba(15,23,42,0.35)), url('${customBg.src}')`,
      isCustom: true
    });
  }

  options.forEach(opt => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `theme-picker-v2-card ${activeBg === opt.id ? 'selected' : ''}`;
    
    const bgPreview = isDark ? opt.previewBgDark : opt.previewBg;
    
    card.innerHTML = `
      <span class="theme-picker-v2-card-preview" style="background: ${bgPreview} !important; border: 1px solid var(--border-light) !important;">
        <span class="theme-picker-v2-card-preview-inner" style="font-size: 14px; font-weight: 600;">Aa</span>
      </span>
      <span class="theme-picker-v2-card-meta">
        <strong>${opt.title}</strong>
        <span>${opt.subtitle}</span>
      </span>
    `;

    card.addEventListener('click', () => {
      if (opt.isCustom) {
        appSettings.appBgType = 'custom-image';
      } else {
        appSettings.appBgType = 'preset';
        appSettings.appBgColor = opt.id;
      }
      applyAppBgColor();
      if (appSettings.uiColorTheme === 'auto' && typeof applyUiColorThemeClass === 'function') {
        applyUiColorThemeClass('auto');
      }
      renderSettingsBgPicker();
      saveSettingsAndSync();
    });

    container.appendChild(card);
  });
}

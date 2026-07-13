import {
  notes,
  appSettings,
  customThemes,
  THEME_PRESETS,
  DEFAULT_THEME_PRESETS,
  STORAGE_KEYS,
  globalEmojiThemeControls,
  getEmojiThemeControls,
  saveEmojiThemeControls,
  updateSliderTrackFill,
  buildEmojiThemePattern,
  applyCardLayoutStyle,
  syncEmojiThemePresentation,
  renderNotes,
  showToast,
  buildColorPickers,
  setActivePage,
  clearAllCacheAndData,
  saveToLocalStorage,
  saveSettingsAndSync,
  saveCustomThemesAndSync,
  experimentalSkyTheme,
  setExperimentalSkyTheme
} from './app.js';

let settingsPage;
let settingsExperimentalSkyTheme;
let settingsBackBtn;
let settingsSave;
let settingsResetData;
let settingsLinkPreviews;
let settingsCheckedBottom;
let settingsNewBottom;
let settingsAdvancedEditor;
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

export function initSettings() {
  settingsPage = document.getElementById('settings-page');
  settingsBackBtn = document.getElementById('settings-back-btn');
  settingsSave = document.getElementById('settings-save');
  settingsResetData = document.getElementById('settings-reset-data');

  settingsLinkPreviews = document.getElementById('settings-link-previews');
  settingsCheckedBottom = document.getElementById('settings-checked-bottom');
  settingsNewBottom = document.getElementById('settings-new-bottom');
  settingsAdvancedEditor = document.getElementById('settings-advanced-editor');
  settingsCardStyle = document.getElementById('settings-card-style');
  settingsExperimentalSkyTheme = document.getElementById('settings-experimental-sky-theme');

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

export function renderSettingsPage() {
  if (!settingsPage) return;

  const creatorWrapper = document.querySelector('.creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');
  const productivityPage = document.getElementById('productivity-page');

  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (productivityPage) productivityPage.style.display = 'none';
  settingsPage.style.display = 'flex';

  // Populate form
  if (settingsLinkPreviews) settingsLinkPreviews.checked = appSettings.linkPreviewsEnabled;
  if (settingsCheckedBottom) settingsCheckedBottom.checked = appSettings.checkedItemsToBottom;
  if (settingsNewBottom) settingsNewBottom.checked = appSettings.newChecklistItemsToBottom;
  if (settingsAdvancedEditor) settingsAdvancedEditor.checked = appSettings.advancedEditorEnabled;
  if (settingsCardStyle) settingsCardStyle.value = appSettings.cardLayoutStyle;
  if (settingsExperimentalSkyTheme) settingsExperimentalSkyTheme.checked = experimentalSkyTheme;

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
    advancedEditorEnabled: settingsAdvancedEditor ? settingsAdvancedEditor.checked : true,
    cardLayoutStyle: settingsCardStyle.value,
    reminderTimes: {
      morning: settingsReminderMorning.value,
      afternoon: settingsReminderAfternoon.value,
      evening: settingsReminderEvening.value
    }
  });

  if (settingsExperimentalSkyTheme) {
    const enabled = settingsExperimentalSkyTheme.checked;
    setExperimentalSkyTheme(enabled);
    localStorage.setItem('paperuss_experimental_sky', enabled ? 'true' : 'false');
  }

  // Save slider positions as global settings
  globalEmojiThemeControls.opacity = Number(settingsEmojiOpacity.value);
  globalEmojiThemeControls.size = Number(settingsEmojiSize.value);
  globalEmojiThemeControls.spacing = Number(settingsEmojiSpacing.value);

  // Commit and sync settings
  saveSettingsAndSync();

  // Apply layout style
  applyCardLayoutStyle(appSettings.cardLayoutStyle);

  // Sync presentation and notes grid
  syncEmojiThemePresentation();

  showToast({ title: 'Settings Saved', text: 'Your preferences have been updated successfully.' });
}

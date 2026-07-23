/**
 * Appearance Settings Module
 * Handles UI color themes, swatches, layout options, ambient sky themes,
 * theme scheduling, emoji pattern controls, and custom emoji theme creation/deletion.
 */

import { SettingsDOM } from './settings-dom.js';
import { updateSettingsState, saveSettingsAndSync, showToast } from './settings-store.js';
import {
  appSettings,
  notes,
  setExperimentalSkyTheme,
  setPremiumSkyTheme,
  experimentalSkyTheme,
  premiumSkyTheme,
  applyThemeSchedule,
  setTheme,
  saveEmojiThemeControls,
  updateSliderTrackFill,
  applyCardLayoutStyle,
  syncEmojiThemePresentation,
  buildColorPickers,
  renderNotes,
  saveToLocalStorage,
  saveCustomThemesAndSync
} from '../app.js';

import {
  applyUiColorThemeClass,
  applyAppBgColor
} from '../theme/theme-renderer.js';

import {
  customThemes,
  THEME_PRESETS,
  DEFAULT_THEME_PRESETS,
  globalEmojiThemeControls,
  getEmojiThemeControls,
  buildEmojiThemePattern
} from '../theme.js';

export function bindAppearanceEvents() {
  const dom = SettingsDOM;

  // Segmented control (Card Layout)
  dom.cardStyleSeg?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    dom.cardStyleSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (dom.cardStyleSelect) dom.cardStyleSelect.value = btn.dataset.value;
    applyCardLayoutStyle(btn.dataset.value);
  });

  // Card style select change (hidden fallback)
  dom.cardStyleSelect?.addEventListener('change', () => {
    applyCardLayoutStyle(dom.cardStyleSelect.value);
  });

  // Tablet-first experience
  dom.tabletFirst?.addEventListener('change', () => {
    const enabled = dom.tabletFirst.checked;
    updateSettingsState({ tabletFirstEnabled: enabled });
    showToast({
      title: enabled ? 'Tablet experience enabled' : 'Tablet experience disabled',
      text: enabled
        ? 'The tablet dock and touch-first navigation are now active on supported screen sizes.'
        : 'Paperuss has returned to its standard adaptive navigation.'
    });
  });

  // Accent Swatch Buttons
  dom.accentSwatchesRow?.addEventListener('click', (e) => {
    const btn = e.target.closest('.accent-swatch-btn');
    if (!btn) return;
    dom.accentSwatchesRow.querySelectorAll('.accent-swatch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.value;
    if (dom.uiColorThemeSelect) dom.uiColorThemeSelect.value = val;
    if (typeof applyUiColorThemeClass === 'function') applyUiColorThemeClass(val);
    appSettings.uiColorTheme = val;
    if (typeof applyAppBgColor === 'function') applyAppBgColor();
    saveSettingsAndSync();
  });

  // Experimental & Premium Sky Themes
  dom.experimentalSkyTheme?.addEventListener('change', () => {
    const enabled = dom.experimentalSkyTheme.checked;
    setExperimentalSkyTheme(enabled);
    localStorage.setItem('paperuss_experimental_sky', enabled ? 'true' : 'false');
  });

  dom.premiumSkyTheme?.addEventListener('change', () => {
    const enabled = dom.premiumSkyTheme.checked;
    setPremiumSkyTheme(enabled);
    localStorage.setItem('paperuss_theme_premium_ambient', enabled ? 'true' : 'false');
  });

  // Theme Scheduling
  dom.themeSchedule?.addEventListener('change', () => {
    const enabled = dom.themeSchedule.checked;
    if (dom.themeScheduleHours) {
      dom.themeScheduleHours.style.display = enabled ? 'block' : 'none';
    }
    appSettings.themeScheduleEnabled = enabled;
    saveSettingsAndSync();
    if (enabled && typeof applyThemeSchedule === 'function') {
      applyThemeSchedule();
    } else if (!enabled) {
      const manualTheme = localStorage.getItem('paperuss_manual_theme') || 'light';
      if (typeof setTheme === 'function') {
        setTheme(manualTheme);
      }
    }
  });

  [dom.themeLightFrom, dom.themeDarkFrom].forEach(input => {
    input?.addEventListener('change', () => {
      appSettings.themeLightFrom = dom.themeLightFrom ? dom.themeLightFrom.value : '07:00';
      appSettings.themeDarkFrom = dom.themeDarkFrom ? dom.themeDarkFrom.value : '19:00';
      saveSettingsAndSync();
      if (typeof applyThemeSchedule === 'function') {
        applyThemeSchedule();
      }
    });
  });

  // Emoji Sliders live preview
  [dom.emojiOpacity, dom.emojiSize, dom.emojiSpacing].forEach(input => {
    input?.addEventListener('input', updateSettingsLivePreview);
  });

  // Custom theme create
  dom.customThemeCreateBtn?.addEventListener('click', createCustomEmojiTheme);
  dom.customThemeCreateBtn?.removeAttribute('disabled');
  dom.customThemeEmojis?.addEventListener('input', () => {
    const val = dom.customThemeEmojis.value;
    const emojis = Array.from(val);
    if (emojis.length > 3) {
      dom.customThemeEmojis.value = emojis.slice(0, 3).join('');
    }
  });
}

export function populateAppearanceForm() {
  const dom = SettingsDOM;

  const cardStyle = appSettings.cardLayoutStyle || 'default';
  if (dom.cardStyleSelect) dom.cardStyleSelect.value = cardStyle;
  document.querySelectorAll('#settings-card-style-seg .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === cardStyle);
  });

  if (dom.tabletFirst) dom.tabletFirst.checked = appSettings.tabletFirstEnabled === true;
  if (dom.experimentalSkyTheme) dom.experimentalSkyTheme.checked = experimentalSkyTheme;
  if (dom.premiumSkyTheme) dom.premiumSkyTheme.checked = premiumSkyTheme;

  // Theme Scheduling
  if (dom.themeSchedule) {
    dom.themeSchedule.checked = !!appSettings.themeScheduleEnabled;
    if (dom.themeScheduleHours) {
      dom.themeScheduleHours.style.display = appSettings.themeScheduleEnabled ? 'block' : 'none';
    }
  }
  if (dom.themeLightFrom) {
    dom.themeLightFrom.value = appSettings.themeLightFrom || '07:00';
  }
  if (dom.themeDarkFrom) {
    dom.themeDarkFrom.value = appSettings.themeDarkFrom || '19:00';
  }

  // Accent swatches
  const accentVal = appSettings.uiColorTheme || 'slate';
  if (dom.uiColorThemeSelect) dom.uiColorThemeSelect.value = accentVal;
  document.querySelectorAll('#settings-accent-swatches .accent-swatch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === accentVal);
  });

  // Sliders
  const controls = getEmojiThemeControls();
  if (dom.emojiOpacity) {
    dom.emojiOpacity.value = controls.opacity;
    updateSliderTrackFill(dom.emojiOpacity);
  }
  if (dom.emojiSize) {
    dom.emojiSize.value = controls.size;
    updateSliderTrackFill(dom.emojiSize);
  }
  if (dom.emojiSpacing) {
    dom.emojiSpacing.value = controls.spacing;
    updateSliderTrackFill(dom.emojiSpacing);
  }

  updateSettingsLivePreview();
  renderSettingsCustomThemesList();
}

export function updateSettingsLivePreview() {
  const dom = SettingsDOM;
  if (!dom.previewCard) return;
  const opacityVal = Number(dom.emojiOpacity?.value || 30);
  const sizeVal = Number(dom.emojiSize?.value || 32);
  const spacingVal = Number(dom.emojiSpacing?.value || 60);

  if (dom.opacityValLabel) dom.opacityValLabel.textContent = `${opacityVal}%`;
  if (dom.sizeValLabel) dom.sizeValLabel.textContent = `${sizeVal}px`;
  if (dom.spacingValLabel) dom.spacingValLabel.textContent = `${spacingVal}px`;

  if (dom.emojiOpacity) updateSliderTrackFill(dom.emojiOpacity);
  if (dom.emojiSize) updateSliderTrackFill(dom.emojiSize);
  if (dom.emojiSpacing) updateSliderTrackFill(dom.emojiSpacing);

  const tempControls = { opacity: opacityVal, size: sizeVal, spacing: spacingVal };
  const pattern = buildEmojiThemePattern('spring', tempControls);
  dom.previewCard.style.setProperty('--theme-pattern', pattern);
  dom.previewCard.style.setProperty('--note-theme-pattern-size', `${spacingVal}px ${spacingVal}px`);
  dom.previewCard.style.setProperty('--note-frame', 'var(--theme-spring-bg)');
  dom.previewCard.style.backgroundColor = 'var(--theme-spring-bg)';
  dom.previewCard.setAttribute('data-theme', 'spring');
}

export function renderSettingsCustomThemesList() {
  const dom = SettingsDOM;
  if (!dom.customThemesList) return;
  dom.customThemesList.innerHTML = '';

  if (customThemes.length === 0) {
    dom.customThemesList.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); text-align:center; padding:12px;">No custom themes created yet</div>';
    return;
  }

  customThemes.forEach(theme => {
    const row = document.createElement('div');
    row.className = 'theme-picker-v2-card';
    row.style.position = 'relative';
    row.style.cursor = 'default';

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

    dom.customThemesList.appendChild(row);
  });
}

export function createCustomEmojiTheme() {
  const dom = SettingsDOM;
  const title = dom.customThemeTitle?.value.trim();
  const emojisStr = dom.customThemeEmojis?.value.trim();

  if (!title || !emojisStr) {
    showToast({ title: 'Invalid Theme', text: 'Please fill out both the title and emojis fields.' });
    return;
  }

  const emojis = Array.from(emojisStr);
  const primaryEmoji = emojis[0];
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
  THEME_PRESETS.splice(0, THEME_PRESETS.length, ...DEFAULT_THEME_PRESETS, ...customThemes);

  if (dom.customThemeTitle) dom.customThemeTitle.value = '';
  if (dom.customThemeEmojis) dom.customThemeEmojis.value = '';

  showToast({ title: 'Theme Created', text: `Theme "${title}" is now available in the picker!` });
  renderSettingsCustomThemesList();
  buildColorPickers();
}

export function deleteCustomEmojiTheme(themeId) {
  if (!confirm('Are you sure you want to delete this custom theme? Any notes using it will revert to default.')) return;

  customThemes.splice(0, customThemes.length, ...customThemes.filter(t => t.id !== themeId));
  saveCustomThemesAndSync();

  notes.forEach(note => {
    if (note.theme === themeId) {
      note.theme = null;
    }
  });
  saveToLocalStorage();
  saveEmojiThemeControls();

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
        if (diff > 15) {
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
    return {
      hue: h,
      lightBg: `hsl(${h}, 35%, 90%)`,
      darkBg: `hsl(${h}, 20%, 25%)`
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

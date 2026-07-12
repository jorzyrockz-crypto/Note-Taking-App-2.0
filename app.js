import {
  applyChecklistInlineReminder,
  checklistToPlain,
  extractChecklistInlineReminder,
  getNoteType,
  isChecklistFormat,
  normalizeNoteType,
  plainToChecklist,
  stripChecklistInlineReminder,
  renderNoteContent,
  renderTextWithLinks,
  syncNoteTypeEditor
} from './note-types/index.js';

import {
  isRealFirebase,
  registerUser,
  loginUser,
  logoutUser,
  onAuthChange,
  saveNoteToCloud,
  deleteNoteFromCloud,
  fetchNotesFromCloud,
  getFirebaseConfig,
  saveFirebaseConfig,
  updateUserProfilePic
} from './firebase.js';

// ==========================================================================
// 1. Initial State & Data Definition (Upgraded)
// ==========================================================================

const COLOR_PRESETS = [
  'default', 'red', 'orange', 'yellow', 
  'green', 'teal', 'blue', 'darkblue', 
  'purple', 'pink', 'brown', 'grey'
];

const DEFAULT_FOLDERS = [
  { name: 'Inbox', icon: 'inbox', accent: '#4f86ff', soft: 'rgba(79, 134, 255, 0.16)' },
  { name: 'Product Updates', icon: 'sparkles', accent: '#f97316', soft: 'rgba(249, 115, 22, 0.16)' },
  { name: 'Inspiration Wall', icon: 'bookmark', accent: '#0ea5e9', soft: 'rgba(14, 165, 233, 0.16)' },
  { name: 'Voice Memos', icon: 'mic', accent: '#ec4899', soft: 'rgba(236, 72, 153, 0.16)' },
  { name: 'Kitchen Board', icon: 'chef-hat', accent: '#22c55e', soft: 'rgba(34, 197, 94, 0.16)' },
  { name: 'Action Lists', icon: 'check-square', accent: '#8b5cf6', soft: 'rgba(139, 92, 246, 0.16)' },
  { name: 'Moodboard', icon: 'image', accent: '#14b8a6', soft: 'rgba(20, 184, 166, 0.16)' },
  { name: 'Welcome', icon: 'star', accent: '#f59e0b', soft: 'rgba(245, 158, 11, 0.18)' }
];

const FOLDER_ICON_FALLBACKS = [
  { accent: '#4f46e5', soft: 'rgba(79, 70, 229, 0.16)' },
  { accent: '#0f766e', soft: 'rgba(15, 118, 110, 0.16)' },
  { accent: '#be185d', soft: 'rgba(190, 24, 93, 0.16)' },
  { accent: '#b45309', soft: 'rgba(180, 83, 9, 0.16)' },
  { accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' },
  { accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.16)' }
];

let sidebarSettings;
export let appSettings = {
  linkPreviewsEnabled: true,
  checkedItemsToBottom: true,
  newChecklistItemsToBottom: true,
  advancedEditorEnabled: true,
  cardLayoutStyle: 'default',
  reminderTimes: {
    morning: '08:00',
    afternoon: '13:00',
    evening: '18:00'
  }
};
export let customThemes = [];

// Settings DOM Elements
let settingsBtn, settingsModal, settingsClose, settingsCancel, settingsSave, settingsResetData;
let settingsLinkPreviews, settingsCheckedBottom, settingsNewBottom, settingsCardStyle;
let settingsEmojiOpacity, settingsEmojiSize, settingsEmojiSpacing, settingsPreviewCard;
let settingsCustomThemeTitle, settingsCustomThemeEmojis, settingsCustomThemeCreate, settingsCustomThemesList;
let settingsReminderMorning, settingsReminderAfternoon, settingsReminderEvening;

export let notes = [];
export let customFolders = [];
export let currentEditingNoteId = null;
let creatorColor = 'default';
let creatorTheme = null; // Pattern theme preset
let creatorCustomTheme = null;
let activeThemePickerContext = null;
let creatorReminder = null; // Target ISO datetime string
let creatorAudio = null;
let creatorAudioDuration = null;
let creatorPinned = false;
let creatorFavorite = false;
let creatorArchived = false;
let creatorImage = null; // Stores Base64 drawing/image upload
let creatorFiles = [];
let creatorFolder = '';
let creatorFolders = [];
let creatorAutoFolder = '';
let creatorIntentType = null;
let creatorLinkPreviewUrl = null;
let creatorLinkPreviewTimer = null;
let creatorLinkPreviewAbort = null;
let selectedTagFilter = null; // Sidebar selected filter tag
let selectedFolderFilter = null;
let selectedTypeFilter = 'all';
export let currentPage = 'notes';
export let currentUser = null;
let selectedProductivityTaskFilter = 'all';
export let selectedProductivityDayView = 'agenda';
export let calendarCursorDate = new Date();
export let selectedCalendarDate = getLocalDateKey(new Date());
let hasShownStorageWarning = false;
export const CUSTOM_THEME_ID = 'custom';
const ENABLE_CUSTOM_THEME_UPLOAD = false;
export const DEFAULT_EMOJI_THEME_CONTROLS = Object.freeze({
  opacity: 8,
  size: 14,
  spacing: 96
});
const emojiPatternCache = new Map();
export let globalEmojiThemeControls = { ...DEFAULT_EMOJI_THEME_CONTROLS };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numericSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function rgbaFromRgb(r, g, b, alpha) {
  return `rgba(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)}, ${alpha})`;
}

function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const normalized = clamp(channel, 0, 255) / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * rs) + (0.7152 * gs) + (0.0722 * bs);
}

function escapeCssUrl(url = '') {
  return url.replace(/["\\\n\r]/g, match => `\\${match}`);
}

function escapeSvgText(text = '') {
  return `${text}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getEmojiThemeControls() {
  return {
    opacity: clamp(numericSetting(globalEmojiThemeControls.opacity, DEFAULT_EMOJI_THEME_CONTROLS.opacity), 0, 28),
    size: clamp(numericSetting(globalEmojiThemeControls.size, DEFAULT_EMOJI_THEME_CONTROLS.size), 10, 34),
    spacing: clamp(numericSetting(globalEmojiThemeControls.spacing, DEFAULT_EMOJI_THEME_CONTROLS.spacing), 64, 160)
  };
}

function clearCustomThemeStyles(element) {
  if (!element) return;
  element.style.removeProperty('--custom-theme-image');
  element.style.removeProperty('--note-theme-accent');
  element.style.removeProperty('--note-theme-soft');
  element.style.removeProperty('--note-theme-text');
  element.style.removeProperty('--note-theme-muted-text');
  element.style.removeProperty('--note-theme-surface');
  element.style.removeProperty('--note-theme-header-scrim');
}

function applyNoteAppearance(element, noteLike = {}) {
  if (!element) return;

  const color = noteLike.color || 'default';
  const theme = color !== 'default' ? null : (noteLike.theme || null);
  const customTheme = theme === 'custom' ? noteLike.customTheme : null;

  element.setAttribute('data-color', color);
  if (theme) {
    element.setAttribute('data-theme', theme);
  } else {
    element.removeAttribute('data-theme');
  }

  if (theme && theme !== CUSTOM_THEME_ID) {
    applyGeneratedEmojiThemeStyles(element, theme);
    clearCustomThemeStyles(element);
    const preset = getThemePreset(theme);
    if (preset && preset.customBg) {
      const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('dark-theme');
      const bgVal = isDark && preset.customBg.dark ? preset.customBg.dark : (preset.customBg.light || preset.customBg);
      element.style.setProperty('--note-color', bgVal);
      element.style.setProperty('--bg-current-creator', bgVal);
      element.style.backgroundColor = bgVal;
    } else {
      element.style.removeProperty('--note-color');
      element.style.removeProperty('--bg-current-creator');
      element.style.backgroundColor = '';
    }
  } else if (customTheme?.image) {
    clearGeneratedEmojiThemeStyles(element);
    element.style.setProperty('--custom-theme-image', `url("${escapeCssUrl(customTheme.image)}")`);
    element.style.setProperty('--note-theme-accent', customTheme.accent || '#64748b');
    element.style.setProperty('--note-theme-soft', customTheme.soft || 'rgba(100, 116, 139, 0.18)');
    element.style.setProperty('--note-theme-text', customTheme.textColor || '#0f172a');
    element.style.setProperty('--note-theme-muted-text', customTheme.mutedText || 'rgba(15, 23, 42, 0.62)');
    element.style.setProperty('--note-theme-surface', customTheme.surface || 'rgba(255, 255, 255, 0.88)');
    element.style.setProperty('--note-theme-header-scrim', customTheme.headerScrim || 'rgba(255, 255, 255, 0.18)');
  } else {
    clearGeneratedEmojiThemeStyles(element);
    clearCustomThemeStyles(element);
    element.style.removeProperty('--bg-current-creator');
    element.style.backgroundColor = '';
  }
}

function normalizeNoteAppearance(noteLike = {}) {
  const color = noteLike.color || 'default';
  if (color !== 'default') {
    return {
      ...noteLike,
      color,
      theme: null,
      customTheme: null
    };
  }

  const theme = noteLike.theme || null;
  return {
    ...noteLike,
    color,
    theme,
    customTheme: theme === CUSTOM_THEME_ID ? (noteLike.customTheme || null) : null
  };
}

function applyAppearanceSelection(noteLike = {}, type, value) {
  if (type === 'color') {
    noteLike.color = value;
    noteLike.theme = null;
    noteLike.customTheme = null;
  } else if (type === 'theme') {
    noteLike.color = 'default';
    noteLike.theme = value === 'none' ? null : value;
    noteLike.customTheme = null;
  } else if (type === 'custom-theme') {
    noteLike.color = 'default';
    noteLike.theme = CUSTOM_THEME_ID;
    noteLike.customTheme = value;
  }

  return Object.assign(noteLike, normalizeNoteAppearance(noteLike));
}

function getThemeSelectionFromContext() {
  if (!activeThemePickerContext) return null;
  if (activeThemePickerContext.type === 'creator') {
    return creatorTheme || null;
  }
  if (activeThemePickerContext.note) {
    return activeThemePickerContext.note.theme || null;
  }
  return null;
}

function loadEmojiThemeControls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.emojiThemeControls);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    globalEmojiThemeControls = {
      opacity: clamp(numericSetting(parsed.opacity, DEFAULT_EMOJI_THEME_CONTROLS.opacity), 0, 28),
      size: clamp(numericSetting(parsed.size, DEFAULT_EMOJI_THEME_CONTROLS.size), 10, 34),
      spacing: clamp(numericSetting(parsed.spacing, DEFAULT_EMOJI_THEME_CONTROLS.spacing), 64, 160)
    };
  } catch (error) {
    globalEmojiThemeControls = { ...DEFAULT_EMOJI_THEME_CONTROLS };
  }
}

function saveEmojiThemeControls() {
  try {
    localStorage.setItem(STORAGE_KEYS.emojiThemeControls, JSON.stringify(getEmojiThemeControls()));
  } catch (error) {
    console.warn('Unable to save emoji theme controls:', error);
  }
}

function syncThemePickerControlValues() {
  if (!themePickerV2Controls) return;
  const controls = getEmojiThemeControls();
  themePickerV2Controls.querySelectorAll('[data-control-key]').forEach(input => {
    const key = input.getAttribute('data-control-key');
    if (!(key in controls)) return;
    input.value = controls[key];
    updateSliderTrackFill(input);
  });
  themePickerV2Controls.querySelectorAll('[data-control-value]').forEach(output => {
    const key = output.getAttribute('data-control-value');
    if (key === 'opacity') output.textContent = `${controls.opacity}%`;
    if (key === 'size') output.textContent = `${controls.size}px`;
    if (key === 'spacing') output.textContent = `${controls.spacing}px`;
  });
}

function applyThemePreviewCardStyles(card, themeId) {
  if (!card || !themeId) return;
  const preview = card.querySelector('.theme-picker-v2-card-preview');
  if (!preview) return;
  preview.style.backgroundImage = buildEmojiThemePattern(themeId);
  preview.style.backgroundSize = `${getEmojiThemeControls().spacing}px ${getEmojiThemeControls().spacing}px`;
}

function syncEmojiThemePresentation() {
  document.querySelectorAll('.theme-picker-v2-card[data-theme]').forEach(card => {
    applyThemePreviewCardStyles(card, card.getAttribute('data-theme'));
  });
  document.querySelectorAll('.note-card[data-id]').forEach(card => {
    const note = notes.find(entry => entry.id === card.getAttribute('data-id'));
    if (note) applyNoteAppearance(card, note);
  });
  applyCreatorAppearance();
  if (currentEditingNoteId) {
    const note = notes.find(entry => entry.id === currentEditingNoteId);
    if (note) applyNoteAppearance(editModalCard, note);
  }
  syncThemePickerControlValues();
}

function renderThemePickerV2Controls() {
  if (!themePickerV2Controls) return;
  const controls = getEmojiThemeControls();
  themePickerV2Controls.innerHTML = `
    <div class="theme-picker-v2-controls-copy">
      <div class="theme-picker-v2-controls-title">Global Emoji Controls</div>
      <p>These settings affect the emoji pattern only. Theme background colors stay unchanged.</p>
    </div>
    <label class="theme-picker-v2-control">
      <span class="theme-picker-v2-control-top">
        <strong>Emoji opacity</strong>
        <span data-control-value="opacity">${controls.opacity}%</span>
      </span>
      <input type="range" min="0" max="28" step="1" value="${controls.opacity}" data-control-key="opacity">
    </label>
    <label class="theme-picker-v2-control">
      <span class="theme-picker-v2-control-top">
        <strong>Emoji resizer</strong>
        <span data-control-value="size">${controls.size}px</span>
      </span>
      <input type="range" min="10" max="34" step="1" value="${controls.size}" data-control-key="size">
    </label>
    <label class="theme-picker-v2-control">
      <span class="theme-picker-v2-control-top">
        <strong>Emoji placement</strong>
        <span data-control-value="spacing">${controls.spacing}px</span>
      </span>
      <input type="range" min="64" max="160" step="4" value="${controls.spacing}" data-control-key="spacing">
    </label>
  `;
  themePickerV2Controls.querySelectorAll('[data-control-key]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-control-key');
      globalEmojiThemeControls = {
        ...getEmojiThemeControls(),
        [key]: Number(input.value)
      };
      syncEmojiThemePresentation();
      saveEmojiThemeControls();
    });
  });
}

function closeThemePickerV2() {
  activeThemePickerContext = null;
  themePickerV2?.classList.remove('visible');
}

function applyThemeSelectionFromPicker(themeId) {
  if (!activeThemePickerContext) return;

  if (activeThemePickerContext.type === 'creator') {
    const normalized = applyAppearanceSelection({
      color: 'default',
      theme: creatorTheme,
      customTheme: null
    }, 'theme', themeId);
    creatorColor = normalized.color;
    creatorTheme = normalized.theme;
    creatorCustomTheme = null;
    applyCreatorAppearance();
  } else if (activeThemePickerContext.type === 'modal' && activeThemePickerContext.note) {
    applyAppearanceSelection(activeThemePickerContext.note, 'theme', themeId);
    applyNoteAppearance(editModalCard, activeThemePickerContext.note);
    saveToLocalStorage();
    renderNotes();
  } else if (activeThemePickerContext.type === 'note' && activeThemePickerContext.note) {
    applyAppearanceSelection(activeThemePickerContext.note, 'theme', themeId);
    saveToLocalStorage();
    renderNotes();
  }

  closeThemePickerV2();
}

function renderThemePickerV2() {
  if (!themePickerV2Grid) return;
  themePickerV2Grid.innerHTML = '';
  const activeTheme = getThemeSelectionFromContext();

  const noThemeCard = document.createElement('button');
  noThemeCard.type = 'button';
  noThemeCard.className = `theme-picker-v2-card theme-picker-v2-card-none ${!activeTheme ? 'selected' : ''}`;
  noThemeCard.innerHTML = `
    <span class="theme-picker-v2-card-preview">
      <span class="theme-picker-v2-card-preview-inner">Aa</span>
    </span>
    <span class="theme-picker-v2-card-meta">
      <strong>No theme</strong>
      <span>Plain note surface</span>
    </span>
  `;
  noThemeCard.addEventListener('click', () => applyThemeSelectionFromPicker('none'));
  themePickerV2Grid.appendChild(noThemeCard);

  THEME_PRESETS.forEach(theme => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `theme-picker-v2-card ${activeTheme === theme.id ? 'selected' : ''}`;
    option.setAttribute('data-theme', theme.id);
    option.innerHTML = `
      <span class="theme-picker-v2-card-preview">
        <span class="theme-picker-v2-card-preview-inner">${theme.emoji}</span>
      </span>
      <span class="theme-picker-v2-card-meta">
        <strong>${theme.title}</strong>
        <span>Emoji theme</span>
      </span>
    `;
    applyThemePreviewCardStyles(option, theme.id);
    option.addEventListener('click', () => applyThemeSelectionFromPicker(theme.id));
    themePickerV2Grid.appendChild(option);
  });
  renderThemePickerV2Controls();
  syncThemePickerControlValues();
}

function openThemePickerV2(context) {
  closeAllNoteCardMenus();
  activeThemePickerContext = context;
  renderThemePickerV2();
  themePickerV2?.classList.add('visible');
}

function applyCreatorAppearance() {
  applyNoteAppearance(noteCreator, {
    color: creatorColor,
    theme: creatorTheme,
    customTheme: creatorCustomTheme
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

const DB_NAME = 'AtlasNestFileDB';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;

function openFileDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function storeFileInDB(id, fileBlob) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(fileBlob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getFileFromDB(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFileFromDB(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAttachmentSrc(file) {
  if (file.storedInDB || file.dataUrl === 'db') {
    try {
      const blob = await getFileFromDB(file.id);
      if (blob) {
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error('Failed to read file from IndexedDB:', e);
    }
    return '';
  }
  return file.dataUrl;
}

function buildCustomThemeFromImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('Canvas is unavailable for theme extraction.'));
        return;
      }

      const sampleSize = 24;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      context.drawImage(img, 0, 0, sampleSize, sampleSize);

      const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
      let totalWeight = 0;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] / 255;
        if (alpha < 0.2) continue;

        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const brightness = (r + g + b) / 765;
        const weight = alpha * (0.45 + (saturation * 0.9) + ((1 - Math.abs(brightness - 0.58)) * 0.35));

        totalWeight += weight;
        totalR += r * weight;
        totalG += g * weight;
        totalB += b * weight;
      }

      const baseR = totalWeight ? totalR / totalWeight : 100;
      const baseG = totalWeight ? totalG / totalWeight : 116;
      const baseB = totalWeight ? totalB / totalWeight : 139;

      const baseLuminance = getRelativeLuminance(baseR, baseG, baseB);
      const accentBoost = baseLuminance < 0.32 ? 46 : baseLuminance < 0.52 ? 28 : 18;
      const accentR = clamp((baseR * 0.88) + accentBoost, 0, 255);
      const accentG = clamp((baseG * 0.88) + accentBoost, 0, 255);
      const accentB = clamp((baseB * 0.88) + accentBoost, 0, 255);
      const luminance = getRelativeLuminance(baseR, baseG, baseB);
      const darkImage = luminance < 0.42;
      const textColor = darkImage ? '#f8fafc' : '#0f172a';
      const mutedText = darkImage ? 'rgba(248, 250, 252, 0.82)' : 'rgba(15, 23, 42, 0.68)';
      const surface = darkImage ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.9)';
      const headerScrim = darkImage ? 'rgba(15, 23, 42, 0.56)' : 'rgba(255, 255, 255, 0.26)';

      resolve({
        image: dataUrl,
        accent: rgbToHex(accentR, accentG, accentB),
        soft: rgbaFromRgb(accentR, accentG, accentB, darkImage ? 0.28 : 0.22),
        textColor,
        mutedText,
        surface,
        headerScrim
      });
    };
    img.onerror = () => reject(new Error('Unable to load the selected image.'));
    img.src = dataUrl;
  });
}

async function createCustomThemeFromFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return buildCustomThemeFromImage(dataUrl);
}

export const STORAGE_KEYS = {
  settings: 'keep_settings',
  customThemes: 'keep_custom_themes',
  notes: 'keep_notes',
  folders: 'keep_folders',
  theme: 'keep_theme',
  emojiThemeControls: 'keep_emoji_theme_controls',
  view: 'keep_view',
  starterSeeded: 'keep_starter_seeded_v3'
};

const STARTER_NOTES = [
  {
    id: 'starter-welcome',
    title: '🚀 Welcome to AtlasNest',
    text: '# Welcome to AtlasNest 🚀\n\nAtlasNest is a visual bookmarking and note-taking studio designed for links, voice notes, drawing, and checklists.\n\n**Best of all, you don\'t even need to sign in to start!**\n• Your notes are saved locally to your device\'s browser database.\n• You can sync them to the cloud at any time by signing in.\n• Open the user profile dropdown (top right) to upload a custom profile picture.\n\nExplore the other cards to learn about AtlasNest\'s features!',
    color: 'default',
    theme: 'plants',
    pinned: true,
    archived: false,
    image: null,
    updatedAt: Date.now() - 10000
  },
  {
    id: 'starter-pwa',
    title: '📲 Install App & Go Offline (PWA)',
    text: '# Go Offline with PWA 📲\n\nAtlasNest is a Progressive Web App (PWA). You can install it on your home screen or desktop:\n\n1. Click the **Install App** button inside your **Settings** panel (or look for the install icon in your browser address bar).\n2. Once installed, AtlasNest launches in standalone mode.\n3. Enjoy full **offline support**! All notes, drawings, and files will load instantly even without an internet connection.',
    color: 'default',
    theme: 'winter',
    pinned: true,
    archived: false,
    image: null,
    updatedAt: Date.now() - 20000
  },
  {
    id: 'starter-indexeddb',
    title: '🎥 Attach Large Files & Videos',
    text: '# Upload Videos & Large Files 🎥\n\nNeed to attach media? You can upload videos, audio files, and documents directly from your device storage:\n\n• Select files up to **100MB** using the attachment menu.\n• Large files are stored in **IndexedDB** on your phone\'s storage.\n• They bypass the strict LocalStorage size limit, keeping your app fast and lightweight.\n• Tap on any video or audio attachment inside a note to play it instantly.',
    color: 'default',
    theme: 'school',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 30000
  },
  {
    id: 'starter-voice-sketch',
    title: '🎙️ Voice Memos & Sketching',
    text: '# Voice Notes & Canvas Sketches 🎙️🎨\n\nAtlasNest features built-in tools for audio recording and drawing:\n\n• **Voice Notes**: Click the microphone icon to record audio on-the-fly. Listen back right inside the note.\n• **Canvas Sketches**: Tap the paint icon to launch the touch-friendly whiteboard. Draw diagrams, ideas, or write handwritten notes, then save them directly to your card.',
    color: 'default',
    theme: 'celebration',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 40000
  },
  {
    id: 'starter-links-recipes',
    title: '🍽️ Rich Link Previews & Recipes',
    text: '# Web Previews & Recipe Imports 🔗\n\nAtlasNest automatically parses links to create rich previews:\n\n• Paste any URL (like https://github.com) into a note, and AtlasNest will generate a premium preview card.\n• **Recipe Builder**: Paste a cooking recipe link (like a WordPress Recipe Maker print page). AtlasNest will parse it and build a structured recipe card with checkable ingredients and directions.',
    color: 'default',
    theme: 'food',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 50000
  }
];

// ==========================================================================
// 2. DOM Elements & References
// ==========================================================================

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const viewToggle = document.getElementById('view-toggle');
const themeBtn = document.getElementById('theme-btn');

const noteCreator = document.getElementById('note-creator');
const creatorCollapsed = document.getElementById('creator-collapsed');
const creatorExpanded = document.getElementById('creator-expanded');
const creatorTitle = document.getElementById('creator-title');
const creatorText = document.getElementById('creator-text');
const creatorAdvancedHeader = document.getElementById('creator-advanced-header');
const creatorBackBtn = document.getElementById('creator-back-btn');
const creatorBreadcrumb = document.getElementById('creator-breadcrumb');
const creatorAutosaveStatus = document.getElementById('creator-autosave-status');
const creatorShareBtn = document.getElementById('creator-share-btn');
const creatorMoreBtn = document.getElementById('creator-more-btn');
const creatorMetadata = document.getElementById('creator-metadata');
const creatorFloatingToolbar = document.getElementById('creator-floating-toolbar');
const creatorMorePopover = document.getElementById('creator-more-popover');
const creatorSave = document.getElementById('creator-save');
const creatorClose = document.getElementById('creator-close');
const creatorPin = document.getElementById('creator-pin');
const creatorColorPicker = document.getElementById('creator-color-picker');
const creatorImageBanner = document.getElementById('creator-image-banner');
const creatorImgPreview = document.getElementById('creator-img-preview');
const creatorRemoveImg = document.getElementById('creator-remove-img');
const creatorImageBtn = document.getElementById('creator-image-btn');
const creatorImageInput = document.getElementById('creator-image-input');
const creatorCameraInput = document.getElementById('creator-camera-input');
const creatorFileBtn = document.getElementById('creator-file-btn');
const creatorFileInput = document.getElementById('creator-file-input');
const creatorListBtn = document.getElementById('creator-list-btn');
const creatorListToggleBtn = document.getElementById('creator-list-toggle');
const creatorLinkParserBtn = document.getElementById('creator-link-parser-btn');
const creatorDrawBtn = document.getElementById('creator-palette-draw');
const creatorDrawToggleBtn = document.getElementById('creator-draw-toggle');

const pinnedSection = document.getElementById('pinned-section');
const pinnedGrid = document.getElementById('pinned-grid');
const othersSection = document.getElementById('others-section');
const othersGrid = document.getElementById('others-grid');
const othersSectionTitle = document.getElementById('others-section-title');
const emptyState = document.getElementById('empty-state');
const sidebarTagsList = document.getElementById('sidebar-tags-list');
const sidebarAllNotes = document.getElementById('sidebar-all-notes');
const creatorWrapper = document.querySelector('.creator-wrapper');
const notesFeed = document.querySelector('.notes-feed');
let sidebarFoldersList = null;
let sidebarProductivity = null;
let sidebarArchive = null;
let sidebarDeleted = null;
let creatorFolderInput = null;
let creatorFolderField = null;
let creatorFolderTrigger = null;
let creatorFolderOptions = null;
let creatorFolderCustomInput = null;
let folderSuggestions = null;
let feedFilterRow = null;
let menuPanel = null;
let folderDrawer = null;
let folderDrawerList = null;
let productivityPage = null;

const editModal = document.getElementById('edit-modal');
const editModalCard = document.getElementById('edit-modal-card');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const modalPin = document.getElementById('modal-pin');
const modalDelete = document.getElementById('modal-delete');
const modalClose = document.getElementById('modal-close');
const modalColorPicker = document.getElementById('modal-color-picker');
const themePickerV2 = document.getElementById('theme-picker-v2');
const themePickerV2Grid = document.getElementById('theme-picker-v2-grid');
const themePickerV2Controls = document.getElementById('theme-picker-v2-controls');
const themePickerV2Close = document.getElementById('theme-picker-v2-close');
const modalImageBanner = document.getElementById('modal-image-banner');
const modalImgPreview = document.getElementById('modal-img-preview');
const modalRemoveImg = document.getElementById('modal-remove-img');
const modalImageBtn = document.getElementById('modal-image-btn');
const modalImageInput = document.getElementById('modal-image-input');
const modalCameraInput = document.getElementById('modal-camera-input');
const modalFileBtn = document.getElementById('modal-file-btn');
const modalFileInput = document.getElementById('modal-file-input');
const modalShareBtn = document.getElementById('modal-share-btn');
const modalListBtn = document.getElementById('modal-list-btn');
const modalDrawBtn = document.getElementById('modal-draw-btn');
const modalTagsContainer = document.getElementById('modal-popover-tags-container');
let modalFolderInput = null;
let modalFolderField = null;
let modalFolderTrigger = null;
let modalFolderOptions = null;
let modalFolderCustomInput = null;

// Canvas Sketch Overlay elements
const sketchModal = document.getElementById('sketch-modal');
const sketchCanvas = document.getElementById('sketch-canvas');
const sketchClear = document.getElementById('sketch-clear');
const sketchClose = document.getElementById('sketch-close');
const sketchSave = document.getElementById('sketch-save');
const sketchEraser = document.getElementById('sketch-eraser');
const sketchBrushSize = document.getElementById('sketch-brush-size');
const sketchColors = document.getElementById('sketch-colors');

// Drawing context variables
let canvasCtx = null;
let isDrawing = false;
let lastDrawX = 0;
let lastDrawY = 0;
let brushColor = '#202124';
let brushSize = 6;
let isEraserActive = false;
let activeSketchTarget = null; // 'creator' or 'modal'

function enhanceShell() {
  const allNotesLabel = sidebarAllNotes?.querySelector('.sidebar-label');
  if (allNotesLabel) allNotesLabel.textContent = 'All Notes';
  if (sidebarAllNotes) {
    sidebarAllNotes.setAttribute('title', 'All Notes');
    sidebarAllNotes.setAttribute('aria-label', 'All Notes');
  }

  const creatorRecipeBtn = document.getElementById('creator-recipe-btn');
  if (creatorRecipeBtn) {
    creatorRecipeBtn.setAttribute('aria-label', 'Import recipe');
    creatorRecipeBtn.setAttribute('title', 'Import Recipe');
  }

  const recipeModalHeader = document.querySelector('.recipe-modal-header h3');
  if (recipeModalHeader) recipeModalHeader.textContent = 'Recipe Builder';
  const recipeModalDesc = document.querySelector('.recipe-modal-desc');
  if (recipeModalDesc) {
    recipeModalDesc.textContent = 'Paste a recipe URL to import structured cooking data, review the parsed result, then save it to Kitchen Board.';
  }
  const recipeModalBody = document.querySelector('#recipe-modal .recipe-modal-body');
  if (recipeModalBody) {
    recipeModalBody.innerHTML = `
      <div class="input-group">
        <label for="recipe-url-input" class="recipe-field-label">Recipe URL</label>
        <input type="text" id="recipe-url-input" class="recipe-field-input" placeholder="https://example.com/recipe/lemon-pasta">
      </div>

      <div class="recipe-import-status" id="recipe-import-status" aria-live="polite"></div>
      <div class="recipe-import-error" id="recipe-import-error" role="alert" style="display: none;"></div>

      <div class="recipe-builder-form" id="recipe-builder-form" style="display: none;">
        <div class="input-group">
          <label for="recipe-title-input" class="recipe-field-label">Recipe Title</label>
          <input type="text" id="recipe-title-input" class="recipe-field-input" placeholder="Creamy Garlic Tuscan Salmon">
        </div>

        <div class="input-group">
          <label for="recipe-description-input" class="recipe-field-label">Description</label>
          <textarea id="recipe-description-input" class="recipe-field-input textarea-field" rows="2" placeholder="Short recipe summary"></textarea>
        </div>

        <div class="recipe-inline-grid">
          <div class="input-group">
            <label for="recipe-image-url-input" class="recipe-field-label">Image URL</label>
            <input type="text" id="recipe-image-url-input" class="recipe-field-input" placeholder="https://images.example.com/dish.jpg">
          </div>
          <div class="input-group">
            <label for="recipe-servings-input" class="recipe-field-label">Servings</label>
            <input type="number" id="recipe-servings-input" class="recipe-field-input" min="1" step="1" placeholder="4">
          </div>
        </div>

        <div class="recipe-inline-grid recipe-inline-grid--times">
          <div class="input-group">
            <label for="recipe-prep-time-input" class="recipe-field-label">Prep Minutes</label>
            <input type="number" id="recipe-prep-time-input" class="recipe-field-input" min="0" step="1" placeholder="15">
          </div>
          <div class="input-group">
            <label for="recipe-cook-time-input" class="recipe-field-label">Cook Minutes</label>
            <input type="number" id="recipe-cook-time-input" class="recipe-field-input" min="0" step="1" placeholder="30">
          </div>
        </div>

        <div class="form-divider"><span>INGREDIENTS</span></div>
        <div class="input-group">
          <label for="recipe-ingredients-input" class="recipe-field-label">Ingredients (one per line)</label>
          <textarea id="recipe-ingredients-input" class="recipe-field-input textarea-field recipe-list-textarea" rows="7" placeholder="2 salmon fillets&#10;1 tbsp olive oil&#10;1 cup spinach"></textarea>
        </div>

        <div class="form-divider"><span>INSTRUCTIONS</span></div>
        <div class="input-group">
          <label for="recipe-instructions-input" class="recipe-field-label">Instructions (one step per line)</label>
          <textarea id="recipe-instructions-input" class="recipe-field-input textarea-field recipe-list-textarea" rows="8" placeholder="Season the salmon.&#10;Sear each side for 4 minutes.&#10;Finish the sauce and serve."></textarea>
        </div>
      </div>
    `;
  }
  const recipeModalFooter = document.querySelector('#recipe-modal .recipe-modal-footer');
  if (recipeModalFooter) {
    recipeModalFooter.innerHTML = `
      <button class="text-btn" id="recipe-modal-cancel">Cancel</button>
      <button class="text-btn" id="recipe-modal-retry" style="display: none;">Retry</button>
      <button class="text-btn" id="recipe-modal-import">Import Recipe</button>
      <button class="text-btn save-btn" id="recipe-modal-save" style="display: none;">Save to Cookbook</button>
    `;
  }

  const logoContainer = document.querySelector('.logo-container');
  if (logoContainer && !logoContainer.querySelector('.brand-lockup')) {
    const titleText = logoContainer.querySelector('.logo-title');
    const lockup = document.createElement('div');
    lockup.className = 'brand-lockup';
    if (titleText) {
      titleText.replaceWith(lockup);
      const brand = document.createElement('span');
      brand.className = 'logo-title';
      brand.textContent = 'AtlasNest';
      lockup.appendChild(brand);
    }
  }

  const sidebar = document.querySelector('.app-sidebar');
  if (sidebar && !document.getElementById('sidebar-productivity')) {
    const productivityItem = document.createElement('div');
    productivityItem.className = 'sidebar-item';
    productivityItem.id = 'sidebar-productivity';
    productivityItem.setAttribute('title', 'Productivity');
    productivityItem.setAttribute('aria-label', 'Productivity');
    productivityItem.innerHTML = `
      <svg class="sidebar-icon" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm3 0v2h10v-2H7Zm0 5v7h3v-7H7Zm5 0v2h5v-2h-5Zm0 4v3h5v-3h-5Z"/></svg>
      <span class="sidebar-label">Productivity</span>
    `;
    sidebar.insertBefore(productivityItem, sidebar.querySelector('.sidebar-divider') || null);
  }
  sidebarProductivity = document.getElementById('sidebar-productivity');

  if (sidebar && !document.getElementById('sidebar-archive')) {
    const archiveItem = document.createElement('div');
    archiveItem.className = 'sidebar-item';
    archiveItem.id = 'sidebar-archive';
    archiveItem.setAttribute('title', 'Archive');
    archiveItem.setAttribute('aria-label', 'Archive');
    archiveItem.innerHTML = `
      <svg class="sidebar-icon" viewBox="0 0 24 24"><path d="M20.54 5.23 19.15 3.55A2 2 0 0 0 17.61 3H6.39a2 2 0 0 0-1.54.55L3.46 5.23A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.46-1.27ZM6.24 5h11.52l.81 1H5.43l.81-1ZM12 17l-4-4h2.5v-3h3v3H16l-4 4Z"/></svg>
      <span class="sidebar-label">Archive</span>
    `;
    sidebar.insertBefore(archiveItem, sidebar.querySelector('.sidebar-divider') || null);
  }
  sidebarArchive = document.getElementById('sidebar-archive');

  if (sidebar && !document.getElementById('sidebar-deleted')) {
    const deletedItem = document.createElement('div');
    deletedItem.className = 'sidebar-item';
    deletedItem.id = 'sidebar-deleted';
    deletedItem.setAttribute('title', 'Trash');
    deletedItem.setAttribute('aria-label', 'Trash');
    deletedItem.innerHTML = `
      <svg class="sidebar-icon" viewBox="0 0 24 24"><path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Zm3-4h6l1 2h4v2H4V5h4l1-2Z"/></svg>
      <span class="sidebar-label">Trash</span>
    `;
    sidebar.insertBefore(deletedItem, sidebar.querySelector('.sidebar-divider') || null);
  }
  sidebarDeleted = document.getElementById('sidebar-deleted');
  if (sidebar && !document.getElementById('sidebar-settings')) {
    const settingsItem = document.createElement('div');
    settingsItem.className = 'sidebar-item';
    settingsItem.id = 'sidebar-settings';
    settingsItem.setAttribute('title', 'Settings');
    settingsItem.setAttribute('aria-label', 'Settings');
    settingsItem.innerHTML = `
      <svg class="sidebar-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
      <span class="sidebar-label">Settings</span>
    `;
    sidebar.appendChild(settingsItem);
  }
  sidebarSettings = document.getElementById('sidebar-settings');

  if (sidebar && !document.getElementById('sidebar-folders-list')) {
    const divider = document.createElement('div');
    divider.className = 'sidebar-divider';
    const title = document.createElement('div');
    title.className = 'sidebar-section-title sidebar-label';
    title.textContent = 'GROUPS';
    sidebarFoldersList = document.createElement('div');
    sidebarFoldersList.className = 'sidebar-tags-container';
    sidebarFoldersList.id = 'sidebar-folders-list';
    sidebar.insertBefore(sidebarFoldersList, sidebarTagsList);
    sidebar.insertBefore(title, sidebarFoldersList);
    sidebar.insertBefore(divider, title);
  } else {
    sidebarFoldersList = document.getElementById('sidebar-folders-list');
  }

  const chipsContainer = document.getElementById('creator-chips-container');
  if (chipsContainer && !document.getElementById('creator-folder')) {
    const metaRow = document.createElement('div');
    metaRow.className = 'creator-meta-row';
    metaRow.innerHTML = `
      <div class="creator-folder-field">
        <div class="creator-folder-label">Categories</div>
        <button type="button" class="creator-folder-trigger" id="creator-folder-trigger" aria-expanded="false"></button>
        <div class="creator-folder-options" id="creator-folder-options"></div>
        <label class="creator-folder-custom">
          <span class="creator-folder-custom-icon">${getFolderIconSvg('folder')}</span>
          <input type="text" id="creator-folder-custom" placeholder="Add category" autocomplete="off">
        </label>
        <input type="hidden" id="creator-folder">
      </div>
    `;
    chipsContainer.insertAdjacentElement('afterend', metaRow);
  }

  creatorFolderField = document.querySelector('.creator-folder-field');
  creatorFolderInput = document.getElementById('creator-folder');
  creatorFolderTrigger = document.getElementById('creator-folder-trigger');
  creatorFolderOptions = document.getElementById('creator-folder-options');
  creatorFolderCustomInput = document.getElementById('creator-folder-custom');
  folderSuggestions = document.getElementById('folder-suggestions');

  if (creatorWrapper && !document.getElementById('feed-filter-row')) {
    feedFilterRow = document.createElement('div');
    feedFilterRow.className = 'feed-filter-row';
    feedFilterRow.id = 'feed-filter-row';
    feedFilterRow.innerHTML = `
      <button class="filter-pill active" data-type-filter="all">All</button>
      <button class="filter-pill" data-type-filter="text">Text</button>
      <button class="filter-pill" data-type-filter="checklist">Checklist</button>
      <button class="filter-pill" data-type-filter="voice">Voice</button>
      <button class="filter-pill" data-type-filter="bookmark">Bookmark</button>
      <button class="filter-pill" data-type-filter="recipe">Recipe</button>
      <button class="filter-pill" data-type-filter="image">Visual</button>
    `;
    creatorWrapper.insertAdjacentElement('afterend', feedFilterRow);
  } else {
    feedFilterRow = document.getElementById('feed-filter-row');
  }

  menuPanel = document.getElementById('menu-panel');

  if (!document.getElementById('folder-drawer')) {
    folderDrawer = document.createElement('div');
    folderDrawer.className = 'folder-drawer';
    folderDrawer.id = 'folder-drawer';
    folderDrawer.innerHTML = `
      <div class="folder-drawer-backdrop"></div>
      <div class="folder-drawer-panel">
        <div class="folder-drawer-header">
          <div>
            <div class="folder-drawer-title">Folder View</div>
            <div class="folder-drawer-subtitle">Browse notes by group</div>
          </div>
          <button class="icon-btn folder-drawer-close" id="folder-drawer-close" aria-label="Close folder view">✕</button>
        </div>
        <div class="folder-drawer-list" id="folder-drawer-list"></div>
      </div>
    `;
    document.body.appendChild(folderDrawer);
  } else {
    folderDrawer = document.getElementById('folder-drawer');
  }

  folderDrawerList = document.getElementById('folder-drawer-list');
}


function clearSidebarActiveStates() {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
}

function setActiveSidebarPage(page) {
  clearSidebarActiveStates();
    if (page === 'settings') {
      sidebarSettings?.classList.add('active');
      return;
    }
  if (page === 'productivity') {
    sidebarProductivity?.classList.add('active');
  } else if (page === 'archive') {
    sidebarArchive?.classList.add('active');
  } else if (page === 'deleted') {
    sidebarDeleted?.classList.add('active');
  } else {
    sidebarAllNotes?.classList.add('active');
  }
}

function setActivePage(page) {
  currentPage = page;
    if (page === 'settings') {
      selectedTagFilter = null;
      selectedFolderFilter = null;
      setActiveSidebarPage('settings');
      collapseSidebarAfterSelection();
      renderAppView();
      return;
    }
  if (page === 'productivity') {
    selectedTagFilter = null;
    selectedFolderFilter = null;
    setActiveSidebarPage('productivity');
  } else if (page === 'archive' || page === 'deleted') {
    selectedTagFilter = null;
    selectedFolderFilter = null;
    setActiveSidebarPage(page);
  } else {
    setActiveSidebarPage('notes');
  }
  collapseSidebarAfterSelection();
  renderAppView();
}

function collapseSidebarAfterSelection() {
  const sidebar = document.querySelector('.app-sidebar');
  if (sidebar?.classList.contains('sidebar-open')) {
    sidebar.classList.remove('sidebar-open');
  }
  if (window.innerWidth < 1024) {
    document.body.classList.remove('sidebar-pinned');
  }
}

function ensureCalendarSelection() {
  if (!selectedCalendarDate) {
    selectedCalendarDate = getLocalDateKey(new Date());
  }
  if (!(calendarCursorDate instanceof Date) || Number.isNaN(calendarCursorDate.getTime())) {
    const fallbackDate = new Date(`${selectedCalendarDate}T00:00:00`);
    calendarCursorDate = Number.isNaN(fallbackDate.getTime())
      ? new Date()
      : new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
  }
  const selectedDate = new Date(`${selectedCalendarDate}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) {
    selectedCalendarDate = getLocalDateKey(new Date());
    calendarCursorDate = new Date();
    return;
  }
}

function getActiveChecklistRowIndex(editorEl) {
  const activeRow = editorEl?.querySelector('.checklist-editor-row.is-active');
  if (!activeRow) return -1;
  return Number(activeRow.dataset.index ?? -1);
}

function applyInlineReminderToChecklistText(rawText, rowIndex, reminderValue) {
  const lines = `${rawText || ''}`.split('\n');
  if (rowIndex < 0 || rowIndex >= lines.length) return rawText;
  const line = lines[rowIndex];
  if (!line.startsWith('- [ ] ') && !line.startsWith('- [x] ')) return rawText;
  const prefix = line.startsWith('- [x] ') ? '- [x] ' : '- [ ] ';
  const lineContent = line.substring(6);
  lines[rowIndex] = prefix + applyChecklistInlineReminder(lineContent, reminderValue);
  return lines.join('\n');
}

function renderAppView() {
  if (currentPage === 'productivity') {
    renderProductivityPage();
  } else if (currentPage === 'settings') {
    renderSettingsPage();
  } else {
    renderNotesPage();
  }
}

function isDeletedNote(note) {
  return note?.deleted === true;
}

function isArchivedNote(note) {
  return note?.archived === true && !isDeletedNote(note);
}

function isActiveNote(note) {
  return !isArchivedNote(note) && !isDeletedNote(note);
}

function getPageNotes(page) {
  if (page === 'archive') {
    return notes.filter(note => isArchivedNote(note));
  }
  if (page === 'deleted') {
    return notes.filter(note => isDeletedNote(note));
  }
  return notes.filter(note => isActiveNote(note));
}

function archiveNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note || isDeletedNote(note)) return;
  note.archived = true;
  note.archivedAt = Date.now();
  note.deleted = false;
  note.deletedAt = null;
  note.updatedAt = Date.now();
  saveToLocalStorage();
  closeAllNoteCardMenus();
  renderNotes();
}

function restoreArchivedNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.archived = false;
  note.archivedAt = null;
  note.deleted = false;
  note.deletedAt = null;
  note.updatedAt = Date.now();
  saveToLocalStorage();
  closeAllNoteCardMenus();
  renderNotes();
}

function trashNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.deleted = true;
  note.deletedAt = Date.now();
  note.archived = false;
  note.archivedAt = null;
  note.updatedAt = Date.now();
  saveToLocalStorage();
  closeAllNoteCardMenus();
  renderNotes();
}

function restoreDeletedNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.deleted = false;
  note.deletedAt = null;
  note.archived = false;
  note.archivedAt = null;
  note.updatedAt = Date.now();
  saveToLocalStorage();
  closeAllNoteCardMenus();
  renderNotes();
}

function deleteNotePermanently(id) {
  const note = notes.find(n => n.id === id);
  if (note && note.files) {
    normalizeNoteFiles(note.files).forEach(file => {
      if (file.storedInDB || file.dataUrl === 'db') {
        deleteFileFromDB(file.id).catch(err => {
          console.warn('Failed to delete file from DB:', err);
        });
      }
    });
  }

  notes = notes.filter(n => n.id !== id);
  if (currentUser) {
    deleteNoteFromCloud(currentUser.uid, id).catch(err => {
      console.warn('Failed to delete note from cloud:', err);
    });
  }
  saveToLocalStorage();
  closeAllNoteCardMenus();
  renderNotes();
}

// ==========================================================================
// 3. Core Initialization & Event Listeners
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  enhanceShell();
  initTheme();
  loadEmojiThemeControls();
  initViewLayout();
  initData();
  setupEventHandlers();
  buildColorPickers();
  initCanvasDrawEngine();
  renderAppView();
  handleSharedLaunchData();
  initAuth();

  registerServiceWorker();
  
  // Start background checks for note reminders
  setInterval(checkReminders, 10000);
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      console.log('Service Worker registered successfully:', reg.scope);
    })
    .catch(err => {
      console.error('Service Worker registration failed:', err);
    });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installRow = document.getElementById('settings-install-row');
  if (installRow) {
    installRow.style.display = 'flex';
  }
  
  // Install button click handler
  const installBtn = document.getElementById('settings-install-btn');
  if (installBtn && !installBtn.dataset.bound) {
    installBtn.addEventListener('click', () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          }
          deferredPrompt = null;
          if (installRow) installRow.style.display = 'none';
        });
      }
    });
    installBtn.dataset.bound = 'true';
  }

  showInstallNotification();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const installRow = document.getElementById('settings-install-row');
  if (installRow) {
    installRow.style.display = 'none';
  }
  showToast({ title: 'App Installed', text: 'AtlasNest has been installed successfully!' });
});

function showInstallNotification() {
  if (sessionStorage.getItem('install-prompted')) return;
  sessionStorage.setItem('install-prompted', 'true');

  showToast({
    title: 'Install App',
    text: 'Install AtlasNest on your device for offline support and standalone launch.',
    action: {
      text: 'Install',
      callback: () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            const installRow = document.getElementById('settings-install-row');
            if (installRow) installRow.style.display = 'none';
          });
        }
      }
    }
  });
}

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${normalizedTheme}`);

  const isDark = normalizedTheme === 'dark';
  if (isDark) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }

  if (themeBtn) {
    themeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 0 1 11.21 3c0-.34.02-.68.06-1.01A1 1 0 0 0 9.8.93a10 10 0 1 0 13.27 13.27 1 1 0 0 0-.06-1.41c-.33.04-.67.06-1.01.06z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-16h1v3h-1V2zm0 17h1v3h-1v-3zM2 11h3v1H2v-1zm17 0h3v1h-3v-1zM4.93 4.22l.71-.71 2.12 2.12-.71.71-2.12-2.12zm11.31 11.31l.71-.71 2.12 2.12-.71.71-2.12-2.12zM4.93 19.07l2.12-2.12.71.71-2.12 2.12-.71-.71zm11.31-11.31l2.12-2.12.71.71-2.12 2.12-.71-.71z"/></svg>';
  }

  localStorage.setItem(STORAGE_KEYS.theme, normalizedTheme);
}

function initViewLayout() {
  const viewMode = localStorage.getItem(STORAGE_KEYS.view) || 'grid';
  if (viewMode === 'list') {
    pinnedGrid.classList.add('list-view');
    othersGrid.classList.add('list-view');
    document.getElementById('grid-icon').style.display = 'block';
    document.getElementById('list-icon').style.display = 'none';
  } else {
    pinnedGrid.classList.remove('list-view');
    othersGrid.classList.remove('list-view');
    document.getElementById('grid-icon').style.display = 'none';
    document.getElementById('list-icon').style.display = 'block';
  }
}

function initData() {
  const localData = localStorage.getItem(STORAGE_KEYS.notes);
  const localFolders = localStorage.getItem(STORAGE_KEYS.folders);
  let loadedNotes = [];
  let loadedFolders = [];
  
  if (localData) {
    try {
      loadedNotes = JSON.parse(localData);
      if (!Array.isArray(loadedNotes)) {
        loadedNotes = [];
      } else {
        loadedNotes = loadedNotes.map(normalizeNoteType);
      }
    } catch (e) {
      loadedNotes = [];
    }
  }

  if (localFolders) {
    try {
      loadedFolders = JSON.parse(localFolders);
      if (!Array.isArray(loadedFolders)) {
        loadedFolders = [];
      }
    } catch (e) {
      loadedFolders = [];
    }
  }
  
  // Seed starter notes only once so user deletions stay deleted after reload.
  const hasSeededStarterNotes = localStorage.getItem(STORAGE_KEYS.starterSeeded) === 'true';
  if (!hasSeededStarterNotes && loadedNotes.length === 0) {
    loadedNotes = STARTER_NOTES.map(starterNote => normalizeNoteType({ ...starterNote }));
    localStorage.setItem(STORAGE_KEYS.starterSeeded, 'true');
  }

  loadedNotes = loadedNotes.map((note, index) => ({
    ...note,
    folder: note.folder || inferDefaultFolder(note, index),
    archived: note.archived === true,
    archivedAt: typeof note.archivedAt === 'number' ? note.archivedAt : null,
    deleted: note.deleted === true,
    deletedAt: typeof note.deletedAt === 'number' ? note.deletedAt : null
  })).map((note, index) => {
    setNoteFolders(note, getNoteFolders(note, inferDefaultFolder(note, index)));
    return normalizeNoteAppearance(note);
  });

  loadedNotes.forEach((note, index) => {
    setNoteFolders(note, getNoteFolders(note, inferDefaultFolder(note, index)));
  });
  
  // Sort notes by updatedAt descending to keep new notes at the top
  loadedNotes.sort((a, b) => b.updatedAt - a.updatedAt);
  
  notes = loadedNotes;
  customFolders = sanitizeFolderList(loadedFolders);
  notes.forEach(registerNoteFolders);
  saveToLocalStorage();
}

function setupEventHandlers() {
  settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', () => setActivePage('settings'));
  sidebarSettings?.addEventListener('click', () => setActivePage('settings'));
  // Toggle sidebar drawer on mobile / pin layout on desktop
  const menuBtn = document.querySelector('.menu-btn');
  const sidebar = document.querySelector('.app-sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 900) {
        sidebar.classList.toggle('sidebar-open');
        document.body.classList.remove('sidebar-pinned');
      } else {
        document.body.classList.toggle('sidebar-pinned');
      }
      closeAllNoteCardMenus();
    });
  }

  document.getElementById('folder-drawer-close')?.addEventListener('click', closeFolderDrawer);
  folderDrawer?.querySelector('.folder-drawer-backdrop')?.addEventListener('click', closeFolderDrawer);

  // Close sidebar drawer on mobile when clicking outside
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('sidebar-open')) {
      if (!sidebar.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('sidebar-open');
      }
    }
    if (!e.target.closest('.note-card')) {
      collapseExpandedTouchCards();
    }
    if (!e.target.closest('.note-card-menu')) {
      closeAllNoteCardMenus();
    }
  });

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isDark = document.body.classList.contains('dark-theme');
    setTheme(isDark ? 'light' : 'dark');
  });

  // View toggle (Grid / List)
  viewToggle.addEventListener('click', toggleViewLayout);

  // Search filter
  searchInput.addEventListener('input', () => {
    searchClear.style.display = searchInput.value.trim() !== '' ? 'block' : 'none';
    renderAppView();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    renderAppView();
    searchInput.focus();
  });

  // Sidebar navigation resets hashtag filter
  sidebarAllNotes.addEventListener('click', () => {
    selectedTagFilter = null;
    selectedFolderFilter = null;
    setActivePage('notes');
  });

  sidebarProductivity?.addEventListener('click', () => {
    ensureCalendarSelection();
    setActivePage('productivity');
  });

  sidebarArchive?.addEventListener('click', () => {
    setActivePage('archive');
  });

  sidebarDeleted?.addEventListener('click', () => {
    setActivePage('deleted');
  });

  if (creatorFolderTrigger && !creatorFolderTrigger.dataset.bound) {
    creatorFolderTrigger.addEventListener('click', () => {
      if (isInlineCreatorFolderPicker()) return;
      const willOpen = !creatorFolderField?.classList.contains('is-open');
      creatorFolderField?.classList.toggle('is-open', willOpen);
      creatorFolderTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    creatorFolderTrigger.dataset.bound = 'true';
  }
  if (creatorFolderCustomInput && !creatorFolderCustomInput.dataset.bound) {
    creatorFolderCustomInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const customFolder = creatorFolderCustomInput.value.trim();
      if (!customFolder) return;
      setCreatorFolderValue([...getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || '')), customFolder]);
      closeCreatorFolderPicker();
    });
    creatorFolderCustomInput.addEventListener('blur', () => {
      const customFolder = creatorFolderCustomInput.value.trim();
      if (!customFolder) return;
      setCreatorFolderValue([...getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || '')), customFolder]);
    });
    creatorFolderCustomInput.dataset.bound = 'true';
  }

  if (feedFilterRow) {
    feedFilterRow.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedTypeFilter = btn.getAttribute('data-type-filter') || 'all';
        feedFilterRow.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        renderAppView();
      });
    });
  }


  // Note Creator Focus / Expand
  creatorCollapsed.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
  });

  // Collapse checklist shortcut in creator
  creatorListToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
    creatorText.value = '- [ ] ';
    syncCreatorInputs();
    autoGrowTextarea.call(creatorText);
  });

  // Collapse sketch shortcut in creator
  creatorDrawToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
    openDrawingWorkspace('creator');
  });
  
  // Auto-grow textareas
  creatorText.addEventListener('input', () => {
    autoGrowTextarea.call(creatorText);
    if (creatorText.value.startsWith('- [ ] ') || creatorText.value.startsWith('- [x] ')) {
      syncCreatorInputs();
    }
    syncCreatorFolderInput();
    scheduleCreatorLinkPreview();
    triggerAutosave();
    updateEditorMirror(creatorText, document.getElementById('creator-text-mirror'));
  });
  creatorTitle.addEventListener('input', () => {
    syncCreatorFolderInput();
    scheduleCreatorLinkPreview();
    triggerAutosave();
  });
  creatorText.addEventListener('paste', () => {
    expandCreator();
    setTimeout(() => scheduleCreatorLinkPreview(80), 0);
  });
  creatorTitle.addEventListener('paste', () => {
    expandCreator();
    setTimeout(() => scheduleCreatorLinkPreview(80), 0);
  });
  creatorText.addEventListener('keydown', handleRichListEditing);
  modalText.addEventListener('input', function() {
    autoGrowTextarea.call(modalText);
    updateEditorMirror(modalText, document.getElementById('modal-text-mirror'));
  });
  modalText.addEventListener('keydown', handleRichListEditing);

  // Creator pin state
  creatorPin.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorPinned = !creatorPinned;
    creatorPin.classList.toggle('pinned', creatorPinned);
  });

  // Creator palette toggle
  const paletteTrigger = document.querySelector('.creator-palette-trigger');
  paletteTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    openThemePickerV2({ type: 'creator' });
  });

  // Creator reminder trigger
  const creatorReminderBtn = document.getElementById('creator-reminder-btn');
  const creatorReminderPicker = document.getElementById('creator-reminder-picker');
  creatorReminderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-picker-bubble, .reminder-picker-bubble').forEach(p => {
      if (p !== creatorReminderPicker) p.classList.remove('visible');
    });

    const creatorChecklistEditor = document.getElementById('creator-checklist-editor');
    const activeChecklistIndex = creatorChecklistEditor?.style.display !== 'none'
      ? getActiveChecklistRowIndex(creatorChecklistEditor)
      : -1;
    const activeChecklistLine = activeChecklistIndex >= 0
      ? (creatorText.value.split('\n')[activeChecklistIndex] || '')
      : '';
    const activeChecklistReminder = activeChecklistIndex >= 0
      ? extractChecklistInlineReminder(activeChecklistLine.substring(6))
      : '';

    buildReminderPicker(creatorReminderPicker, activeChecklistReminder || creatorReminder, (dateTime) => {
      if (activeChecklistIndex >= 0) {
        creatorText.value = applyInlineReminderToChecklistText(creatorText.value, activeChecklistIndex, dateTime);
        syncCreatorInputs();
      } else {
        creatorReminder = dateTime;
        renderCreatorReminderChip();
      }
      creatorReminderPicker.classList.remove('visible');
    }, () => {
      if (activeChecklistIndex >= 0) {
        creatorText.value = applyInlineReminderToChecklistText(creatorText.value, activeChecklistIndex, '');
        syncCreatorInputs();
      } else {
        creatorReminder = null;
        renderCreatorReminderChip();
      }
      creatorReminderPicker.classList.remove('visible');
    });
    creatorReminderPicker.classList.toggle('visible');
  });

  // Creator checklists convert trigger
  creatorListBtn.addEventListener('click', () => {
    const isList = isChecklistFormat(creatorText.value);
    if (isList) {
      creatorText.value = checklistToPlain(creatorText.value);
    } else {
      creatorText.value = plainToChecklist(creatorText.value);
    }
    syncCreatorInputs();
    autoGrowTextarea.call(creatorText);
  });

  // Creator Drawing Canvas trigger
  creatorDrawBtn.addEventListener('click', () => {
    openDrawingWorkspace('creator');
  });

  // Creator image source picker
  creatorImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageSourcePicker('creator', creatorImageBtn);
  });
  creatorLinkParserBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    parseCreatorLinkManually();
  });
  creatorImageInput.addEventListener('change', (e) => {
    handleSelectedImageFile('creator', e.target.files[0]);
    e.target.value = '';
  });
  creatorImgPreview?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (creatorImage) openImageViewer(creatorImage, creatorTitle.value.trim() || 'Draft image');
  });
  creatorCameraInput?.addEventListener('change', (e) => {
    handleSelectedImageFile('creator', e.target.files[0]);
    e.target.value = '';
  });
  creatorFileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorFileInput?.click();
  });
  creatorFileInput?.addEventListener('change', async (e) => {
    await handleSelectedFiles('creator', e.target.files);
    e.target.value = '';
  });

  // Remove Creator image banner
  creatorRemoveImg.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorImage = null;
    creatorImageBanner.style.display = 'none';
    creatorImgPreview.src = '';
    creatorImageInput.value = ''; // reset file input
    if (creatorCameraInput) creatorCameraInput.value = '';
    syncCreatorFolderInput();
  });

  // Close / Save Note Creator
  creatorSave.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNote();
    collapseCreator();
  });

  creatorClose.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNote();
    collapseCreator();
  });

  // Click outside Note Creator auto-saves
  document.addEventListener('click', (e) => {
    if (creatorExpanded.style.display !== 'none' && !noteCreator.contains(e.target)) {
      if (!e.target.closest('#theme-picker-v2') && !e.target.closest('.color-picker-bubble') && !e.target.closest('.reminder-trigger-wrapper') && !e.target.closest('.edit-modal-overlay')) {
        saveCreatorNote();
        collapseCreator();
      }
    }
    
    // Close color pickers
    if (!e.target.closest('.color-palette-trigger-wrapper')) {
      document.querySelectorAll('.color-picker-bubble').forEach(el => el.classList.remove('visible'));
    }

    // Close reminder pickers
    if (!e.target.closest('.reminder-trigger-wrapper')) {
      document.querySelectorAll('.reminder-picker-bubble').forEach(el => el.classList.remove('visible'));
    }

    if (!e.target.closest('.modal-folder-field')) {
      closeModalFolderPicker();
    }
    if (!e.target.closest('.creator-folder-field')) {
      closeCreatorFolderPicker();
    }

  });

  // Edit Modal Event Handlers
  modalClose.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });

  // Modal Pin toggle
  modalPin.addEventListener('click', () => {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.pinned = !note.pinned;
      modalPin.classList.toggle('pinned', note.pinned);
      saveToLocalStorage();
      renderNotes();
    }
  });

  // Modal Delete note
  modalDelete.addEventListener('click', () => {
    if (currentEditingNoteId) {
      const note = notes.find(n => n.id === currentEditingNoteId);
      if (note?.deleted) {
        deleteNotePermanently(currentEditingNoteId);
      } else {
        trashNote(currentEditingNoteId);
      }
      closeEditModal();
    }
  });

  // Modal Color picker toggle
  document.getElementById('modal-palette-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      openThemePickerV2({ type: 'modal', note });
    }
  });

  themePickerV2Close?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeThemePickerV2();
  });
  themePickerV2?.addEventListener('click', (e) => {
    if (e.target === themePickerV2) {
      closeThemePickerV2();
    }
  });

  // Modal Checklist convert trigger
  modalListBtn.addEventListener('click', () => {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;

    const isList = isChecklistFormat(note.text);
    if (isList) {
      note.text = checklistToPlain(note.text);
      modalText.value = note.text;
    } else {
      note.text = plainToChecklist(note.text);
      modalText.value = note.text;
    }
    note.type = note.recipeData ? 'recipe' : getNoteType(note.text);
    saveToLocalStorage();
    renderNotes();
    syncModalInputs(note);
    autoGrowTextarea.call(modalText);
  });

  // Modal drawing canvas trigger
  modalDrawBtn.addEventListener('click', () => {
    openDrawingWorkspace('modal');
  });

  // Creator voice note trigger
  const creatorVoiceBtn = document.getElementById('creator-voice-btn');
  creatorVoiceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVoiceRecording('creator');
  });

  // Modal voice note trigger
  const modalVoiceBtn = document.getElementById('modal-voice-btn');
  modalVoiceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVoiceRecording('modal');
  });

  // Recipe Importer trigger actions
  const creatorRecipeBtn = document.getElementById('creator-recipe-btn');
  creatorRecipeBtn?.addEventListener('click', () => openRecipeModal());

  // Modal image source picker
  modalImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageSourcePicker('modal', modalImageBtn);
  });
  modalImageInput.addEventListener('change', (e) => {
    handleSelectedImageFile('modal', e.target.files[0]);
    e.target.value = '';
  });
  modalCameraInput?.addEventListener('change', (e) => {
    handleSelectedImageFile('modal', e.target.files[0]);
    e.target.value = '';
  });
  modalFileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    modalFileInput?.click();
  });
  modalFileInput?.addEventListener('change', async (e) => {
    await handleSelectedFiles('modal', e.target.files);
    e.target.value = '';
  });
  modalShareBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) openShareSheet(note);
  });

  // Remove Modal image banner
  modalRemoveImg.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.image = null;
      modalImageBanner.style.display = 'none';
      modalImgPreview.src = '';
      modalImageInput.value = '';
      if (modalCameraInput) modalCameraInput.value = '';
      saveToLocalStorage();
      renderNotes();
    }
  });
  document.addEventListener('click', closeImageSourcePicker);
  initAdvancedEditorHandlers();
  initModalAdvancedEditorHandlers();
}

// ==========================================================================
// 4. Color Palette Builders
// ==========================================================================

export const DEFAULT_THEME_PRESETS = [
  { id: 'plants', emoji: '🌿', title: 'Plants', emojis: ['🌿', '🍃', '🪴'] },
  { id: 'animals', emoji: '🦊', title: 'Animals', emojis: ['🦊', '🐾', '🦉'] },
  { id: 'spring', emoji: '🌸', title: 'Spring', emojis: ['🌸', '🦋', '🌼'] },
  { id: 'summer', emoji: '☀️', title: 'Summer', emojis: ['☀️', '🌴', '🍹'] },
  { id: 'autumn', emoji: '🍂', title: 'Autumn', emojis: ['🍂', '🍁', '☕'] },
  { id: 'winter', emoji: '❄️', title: 'Winter', emojis: ['❄️', '☃️', '🧤'] },
  { id: 'school', emoji: '🎓', title: 'School', emojis: ['🎓', '📚', '✏️'] },
  { id: 'office', emoji: '💼', title: 'Office', emojis: ['💼', '📎', '🗂️'] },
  { id: 'food', emoji: '🍜', title: 'Food', emojis: ['🍜', '🍽️', '🥢'] },
  { id: 'holiday', emoji: '🏖️', title: 'Holiday', emojis: ['🏖️', '✈️', '🧳'] },
  { id: 'celebration', emoji: '🎉', title: 'Celebration', emojis: ['🎉', '🎊', '✨'] }
];
export let THEME_PRESETS = [...DEFAULT_THEME_PRESETS];

function getThemePreset(themeId) {
  return THEME_PRESETS.find(theme => theme.id === themeId) || null;
}

export function buildEmojiThemePattern(themeId, controls = getEmojiThemeControls()) {
  const preset = getThemePreset(themeId);
  if (!preset) return 'none';

  const safeControls = {
    opacity: clamp(numericSetting(controls.opacity, DEFAULT_EMOJI_THEME_CONTROLS.opacity), 0, 28),
    size: clamp(numericSetting(controls.size, DEFAULT_EMOJI_THEME_CONTROLS.size), 10, 34),
    spacing: clamp(numericSetting(controls.spacing, DEFAULT_EMOJI_THEME_CONTROLS.spacing), 64, 160)
  };
  const cacheKey = `${themeId}:${safeControls.opacity}:${safeControls.size}:${safeControls.spacing}`;
  if (emojiPatternCache.has(cacheKey)) {
    return emojiPatternCache.get(cacheKey);
  }

  const tile = safeControls.spacing;
  const baseSize = safeControls.size;
  const alpha = clamp(safeControls.opacity / 100, 0, 0.28).toFixed(3);
  const emojis = preset.emojis?.length ? preset.emojis : [preset.emoji];
  const placements = [
    { x: 0.14, y: 0.24, scale: 1.32, rotate: -16, emoji: emojis[0] || preset.emoji },
    { x: 0.74, y: 0.19, scale: 0.72, rotate: 14, emoji: emojis[1] || emojis[0] || preset.emoji },
    { x: 0.48, y: 0.58, scale: 1.04, rotate: -7, emoji: emojis[2] || emojis[0] || preset.emoji },
    { x: 0.2, y: 0.84, scale: 0.58, rotate: 20, emoji: emojis[1] || emojis[0] || preset.emoji },
    { x: 0.84, y: 0.78, scale: 0.9, rotate: -22, emoji: emojis[2] || emojis[0] || preset.emoji }
  ];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">
      ${placements.map(entry => {
        const fontSize = (baseSize * entry.scale).toFixed(2);
        const x = (tile * entry.x).toFixed(2);
        const y = (tile * entry.y).toFixed(2);
        return `<text x="${x}" y="${y}" font-size="${fontSize}" opacity="${alpha}" transform="rotate(${entry.rotate} ${x} ${y})">${escapeSvgText(entry.emoji)}</text>`;
      }).join('')}
    </svg>
  `.trim();
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  emojiPatternCache.set(cacheKey, url);
  return url;
}

function applyGeneratedEmojiThemeStyles(element, themeId) {
  if (!element || !themeId || themeId === CUSTOM_THEME_ID) return;
  const controls = getEmojiThemeControls();
  element.style.setProperty('--theme-pattern', buildEmojiThemePattern(themeId, controls));
  element.style.setProperty('--note-theme-pattern-size', `${controls.spacing}px ${controls.spacing}px`);
}

function clearGeneratedEmojiThemeStyles(element) {
  if (!element) return;
  element.style.removeProperty('--theme-pattern');
  element.style.removeProperty('--note-theme-pattern-size');
  element.style.removeProperty('--note-color');
}

function buildColorPickers() {
  applyCreatorAppearance();
  buildColorGrid(creatorColorPicker, creatorColor, creatorTheme, creatorCustomTheme, async (type, value) => {
    const normalized = applyAppearanceSelection({
      color: creatorColor,
      theme: creatorTheme,
      customTheme: creatorCustomTheme
    }, type, value);
    creatorColor = normalized.color;
    creatorTheme = normalized.theme;
    creatorCustomTheme = normalized.customTheme;
    applyCreatorAppearance();
    creatorColorPicker.classList.remove('visible');
  });
}

function buildColorGrid(container, activeColor, activeTheme, activeCustomTheme, onSelect) {
  container.innerHTML = '';

  const clearSelection = () => {
    container.querySelectorAll('.color-option, .picker-clear-button, .custom-theme-preview').forEach(el => el.classList.remove('selected'));
  };

  const header = document.createElement('div');
  header.className = 'picker-header';

  const title = document.createElement('span');
  title.className = 'picker-section-title';
  title.textContent = 'Note Themes';
  header.appendChild(title);

  const clearThemeButton = document.createElement('button');
  clearThemeButton.type = 'button';
  clearThemeButton.className = 'picker-clear-button';
  clearThemeButton.textContent = 'No theme';
  clearThemeButton.title = 'Remove the current theme';
  if (!activeTheme) clearThemeButton.classList.add('selected');
  clearThemeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelection();
    clearThemeButton.classList.add('selected');
    onSelect('theme', 'none');
  });
  header.appendChild(clearThemeButton);

  const uploadThemeButton = document.createElement('button');
  uploadThemeButton.type = 'button';
  uploadThemeButton.className = 'picker-clear-button picker-upload-button';
  uploadThemeButton.textContent = activeTheme === CUSTOM_THEME_ID ? 'Replace image' : 'Upload image';
  uploadThemeButton.title = 'Upload a custom note background';
  if (ENABLE_CUSTOM_THEME_UPLOAD) {
    header.appendChild(uploadThemeButton);
  }
  container.appendChild(header);

  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/*';
  uploadInput.style.display = 'none';
  uploadInput.addEventListener('change', async () => {
    const [file] = Array.from(uploadInput.files || []);
    if (!file) return;
    try {
      uploadThemeButton.disabled = true;
      uploadThemeButton.textContent = 'Analyzing...';
      const customTheme = await createCustomThemeFromFile(file);
      clearSelection();
      onSelect('custom-theme', customTheme);
    } catch (error) {
      console.warn('Unable to create custom theme:', error);
      showToast({
        title: 'Theme upload failed',
        text: 'The background could not be processed. Try another image.'
      });
    } finally {
      uploadThemeButton.disabled = false;
      uploadThemeButton.textContent = activeTheme === CUSTOM_THEME_ID ? 'Replace image' : 'Upload image';
      uploadInput.value = '';
    }
  });
  if (ENABLE_CUSTOM_THEME_UPLOAD) {
    uploadThemeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadInput.click();
    });
    container.appendChild(uploadInput);
  }

  const colorRow = document.createElement('div');
  colorRow.className = 'picker-row picker-row-colors';

  COLOR_PRESETS.forEach(color => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'color-option';
    option.setAttribute('data-color', color);
    option.title = color.charAt(0).toUpperCase() + color.slice(1);

    const isSelected = !activeTheme && color === activeColor;
    if (isSelected) option.classList.add('selected');

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelection();
      option.classList.add('selected');
      onSelect('color', color);
    });
    colorRow.appendChild(option);
  });
  container.appendChild(colorRow);

  const themeRow = document.createElement('div');
  themeRow.className = 'picker-row picker-row-themes';

  if (activeTheme === CUSTOM_THEME_ID && activeCustomTheme?.image) {
    const customPreview = document.createElement('button');
    customPreview.type = 'button';
    customPreview.className = 'custom-theme-preview selected';
    customPreview.title = 'Custom uploaded theme';
    customPreview.style.setProperty('--custom-theme-image', `url("${escapeCssUrl(activeCustomTheme.image)}")`);
    customPreview.style.setProperty('--custom-theme-accent', activeCustomTheme.accent || '#64748b');
    customPreview.innerHTML = '<span class="custom-theme-preview-badge">Custom</span>';
    customPreview.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelection();
      customPreview.classList.add('selected');
      onSelect('custom-theme', activeCustomTheme);
    });
    themeRow.appendChild(customPreview);
  }

  THEME_PRESETS.forEach(theme => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'color-option theme-option';
    option.setAttribute('data-theme-option', theme.id);
    option.title = theme.title;
    option.textContent = theme.emoji;

    const isSelected = activeTheme ? theme.id === activeTheme : false;
    if (isSelected) option.classList.add('selected');

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelection();
      option.classList.add('selected');
      onSelect('theme', theme.id);
    });
    themeRow.appendChild(option);
  });

  container.appendChild(themeRow);
}

// ==========================================================================
// 5. Note Creation
// ==========================================================================

let creatorActiveNoteId = null;

function expandCreator() {
  creatorCollapsed.style.display = 'none';
  creatorExpanded.style.display = 'flex';
  
  if (appSettings.advancedEditorEnabled) {
    creatorWrapper.classList.add('advanced-editor-active');
    document.body.classList.add('advanced-editor-open');
    document.body.classList.add('editor-focus-mode');
    creatorAdvancedHeader.style.display = 'flex';
    creatorMetadata.style.display = 'block';
    creatorFloatingToolbar.style.display = 'flex';
    
    const date = new Date();
    creatorMetadata.textContent = date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ' • ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
    creatorTitle.placeholder = 'Untitled Note';
    creatorText.placeholder = 'Start writing...';
    creatorPin.style.display = 'none';
    
    creatorActiveNoteId = 'note-' + Date.now();
    
    const selectedFolders = decodeFolderSelection(creatorFolderInput?.value || '');
    const primaryFolder = selectedFolders[0] || 'Personal';
    creatorBreadcrumb.textContent = `${primaryFolder} / Ideas`;
    
    renderPopoverCategories();
    renderPopoverColors();
    initPopoverReminder();
    
    creatorTitle.focus();
  } else {
    creatorWrapper.classList.remove('advanced-editor-active');
    document.body.classList.remove('advanced-editor-open');
    document.body.classList.remove('editor-focus-mode');
    if (creatorAdvancedHeader) creatorAdvancedHeader.style.display = 'none';
    if (creatorMetadata) creatorMetadata.style.display = 'none';
    if (creatorFloatingToolbar) creatorFloatingToolbar.style.display = 'none';
    
    creatorPin.style.display = 'flex';
    creatorTitle.placeholder = 'Title';
    creatorText.placeholder = 'Take a note...';
    creatorText.focus();
  }
  
  syncCreatorInputs();
  syncCreatorFolderInput(true);
}

function collapseCreator() {
  creatorCollapsed.style.display = 'flex';
  creatorExpanded.style.display = 'none';
  creatorPin.style.display = 'none';
  
  if (appSettings.advancedEditorEnabled) {
    creatorWrapper.classList.remove('advanced-editor-active');
    document.body.classList.remove('advanced-editor-open');
    document.body.classList.remove('editor-focus-mode');
    creatorAdvancedHeader.style.display = 'none';
    creatorMetadata.style.display = 'none';
    creatorFloatingToolbar.style.display = 'none';
    creatorMorePopover.style.display = 'none';
    
    creatorTitle.placeholder = 'Title';
    creatorText.placeholder = 'Take a note...';
    creatorActiveNoteId = null;
  }
  
  creatorTitle.value = '';
  creatorText.value = '';
  creatorText.style.height = 'auto';
  creatorLinkPreviewUrl = null;
  clearTimeout(creatorLinkPreviewTimer);
  creatorLinkPreviewAbort?.abort();
  creatorLinkPreviewAbort = null;
  
  creatorColor = 'default';
  creatorTheme = null;
  creatorCustomTheme = null;
  creatorReminder = null;
  creatorAudio = null;
  creatorFolder = '';
  creatorFolders = [];
  creatorAutoFolder = '';
  creatorIntentType = null;
  creatorAudioDuration = null;
  creatorPinned = false;
  creatorImage = null;
  creatorFiles = [];
  
  applyCreatorAppearance();
  creatorPin.classList.remove('pinned');
  if (creatorFolderInput) creatorFolderInput.value = '';
  if (creatorFolderCustomInput) creatorFolderCustomInput.value = '';
  closeCreatorFolderPicker();
  creatorImageBanner.style.display = 'none';
  creatorImgPreview.src = '';
  creatorImageInput.value = '';
  if (creatorCameraInput) creatorCameraInput.value = '';
  if (creatorFileInput) creatorFileInput.value = '';
  
  renderCreatorReminderChip();
  renderCreatorAudioPreview();
  renderCreatorFileAttachments();
  
  // Rebuild creator picker to clear selection styling
  buildColorGrid(creatorColorPicker, creatorColor, creatorTheme, creatorCustomTheme, (type, value) => {
    const normalized = applyAppearanceSelection({
      color: creatorColor,
      theme: creatorTheme,
      customTheme: creatorCustomTheme
    }, type, value);
    creatorColor = normalized.color;
    creatorTheme = normalized.theme;
    creatorCustomTheme = normalized.customTheme;
    applyCreatorAppearance();
    creatorColorPicker.classList.remove('visible');
  });
  creatorColorPicker.classList.remove('visible');
}

function saveCreatorNoteDraft() {
  if (!appSettings.advancedEditorEnabled || !creatorActiveNoteId) return;

  const title = creatorTitle.value.trim();
  const text = creatorText.value.trim();

  // If empty, and it was previously saved, we should remove it from notes
  if (isNoteEffectivelyEmpty(title, text, creatorImage, creatorAudio, creatorFiles)) {
    const idx = notes.findIndex(n => n.id === creatorActiveNoteId);
    if (idx !== -1) {
      notes.splice(idx, 1);
      saveToLocalStorage();
      renderNotes();
    }
    creatorAutosaveStatus.textContent = '✓ Saved';
    return;
  }

  const selectedFolders = decodeFolderSelection(creatorFolderInput?.value || '');

  // Check if note already exists in the array
  let note = notes.find(n => n.id === creatorActiveNoteId);
  if (!note) {
    // Create new note
    note = normalizeNoteType(setNoteFolders({
      id: creatorActiveNoteId,
      type: creatorIntentType || getNoteType(text),
      title: title,
      text: text,
      color: creatorColor,
      theme: creatorTheme,
      customTheme: creatorTheme === CUSTOM_THEME_ID ? creatorCustomTheme : null,
      reminder: creatorReminder,
      reminderTriggered: false,
      audio: creatorAudio,
      audioDuration: creatorAudioDuration,
      pinned: creatorPinned,
      favorite: creatorFavorite,
      archived: creatorArchived,
      archivedAt: creatorArchived ? Date.now() : null,
      deleted: false,
      deletedAt: null,
      image: creatorImage,
      files: normalizeNoteFiles(creatorFiles),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, selectedFolders));
    
    registerNoteFolders(note);
    notes.unshift(note);
  } else {
    // Update existing note
    note.title = title;
    note.text = text;
    note.type = creatorIntentType || getNoteType(text);
    note.color = creatorColor;
    note.theme = creatorTheme;
    note.customTheme = creatorTheme === CUSTOM_THEME_ID ? creatorCustomTheme : null;
    note.reminder = creatorReminder;
    note.audio = creatorAudio;
    note.audioDuration = creatorAudioDuration;
    note.pinned = creatorPinned;
    note.favorite = creatorFavorite;
    note.archived = creatorArchived;
    note.archivedAt = creatorArchived ? (note.archivedAt || Date.now()) : null;
    note.image = creatorImage;
    note.files = normalizeNoteFiles(creatorFiles);
    note.updatedAt = Date.now();
    setNoteFolders(note, selectedFolders);
    registerNoteFolders(note);
  }

  saveToLocalStorage();
  renderNotes();

  creatorAutosaveStatus.textContent = '✓ Saved';
}

function renderPopoverCategories() {
  const container = document.getElementById('popover-category-container');
  if (!container) return;
  container.innerHTML = '';
  
  const currentFolders = getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || ''));

  getAllFolders().forEach(folder => {
    const isActive = currentFolders.includes(folder);
    const item = document.createElement('label');
    item.className = `popover-category-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <input type="checkbox" ${isActive ? 'checked' : ''}>
      <span>${folder}</span>
    `;
    item.querySelector('input').addEventListener('change', () => {
      toggleCreatorFolder(folder);
      renderPopoverCategories();
      
      // Update breadcrumb category
      const activeFolders = getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || ''));
      const primaryFolder = activeFolders[0] || 'Personal';
      creatorBreadcrumb.textContent = `${primaryFolder} / Ideas`;
      
      saveCreatorNoteDraft();
    });
    container.appendChild(item);
  });
}

function renderPopoverColors() {
  const container = document.getElementById('popover-color-grid');
  if (!container) return;
  
  buildColorGrid(container, creatorColor, creatorTheme, creatorCustomTheme, (type, value) => {
    const normalized = applyAppearanceSelection({
      color: creatorColor,
      theme: creatorTheme,
      customTheme: creatorCustomTheme
    }, type, value);
    
    creatorColor = normalized.color;
    creatorTheme = normalized.theme;
    creatorCustomTheme = normalized.customTheme;
    
    applyCreatorAppearance();
    saveCreatorNoteDraft();
    renderPopoverColors();
  });
}

function initPopoverReminder() {
  const input = document.getElementById('popover-reminder-input');
  if (!input) return;
  
  if (creatorReminder) {
    const date = new Date(creatorReminder);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      input.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } else {
    input.value = '';
  }
}

function renderModalPopoverCategories(note) {
  const container = document.getElementById('modal-popover-category-container');
  if (!container) return;
  container.innerHTML = '';
  
  const currentFolders = getNoteFolders(note);

  getAllFolders().forEach(folder => {
    const isActive = currentFolders.includes(folder);
    const item = document.createElement('label');
    item.className = `popover-category-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <input type="checkbox" ${isActive ? 'checked' : ''}>
      <span>${folder}</span>
    `;
    item.querySelector('input').addEventListener('change', () => {
      let folders = getNoteFolders(note);
      if (folders.includes(folder)) {
        folders = folders.filter(f => f !== folder);
      } else {
        folders.push(folder);
      }
      setNoteFolders(note, folders);
      registerNoteFolders(note);
      
      // Update modal breadcrumbs
      const modalBreadcrumb = document.getElementById('modal-breadcrumb');
      if (modalBreadcrumb) {
        modalBreadcrumb.textContent = `${folders[0] || 'Personal'} / Ideas`;
      }
      
      debouncedSave();
      renderNotes();
      renderModalPopoverCategories(note);
    });
    container.appendChild(item);
  });
}

function renderModalPopoverColors(note) {
  const container = document.getElementById('modal-popover-color-grid');
  if (!container) return;
  
  buildColorGrid(container, note.color, note.theme, note.customTheme, (type, value) => {
    applyAppearanceSelection(note, type, value);
    applyNoteAppearance(editModalCard, note);
    debouncedSave();
    renderNotes();
    renderModalPopoverColors(note);
  });
}

function initModalPopoverReminder(note) {
  const input = document.getElementById('modal-popover-reminder-input');
  if (!input) return;
  
  if (note.reminder) {
    const date = new Date(note.reminder);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      input.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } else {
    input.value = '';
  }
}

function initAdvancedEditorHandlers() {
  // Back button
  creatorBackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNoteDraft();
    collapseCreator();
  });

  // Share button
  creatorShareBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mockNote = {
      id: creatorActiveNoteId || 'note-temp',
      title: creatorTitle.value,
      text: creatorText.value,
      color: creatorColor,
      theme: creatorTheme,
      customTheme: creatorTheme === CUSTOM_THEME_ID ? creatorCustomTheme : null,
      files: creatorFiles,
      image: creatorImage
    };
    openShareSheet(mockNote);
  });

  // More Popover toggle
  creatorMoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const creatorCard = document.getElementById('note-creator');
    const isOpen = creatorCard?.classList.contains('properties-sheet-open');
    if (isOpen) {
      creatorCard?.classList.remove('properties-sheet-open');
      creatorMorePopover.style.display = 'none';
    } else {
      creatorCard?.classList.add('properties-sheet-open');
      creatorMorePopover.style.display = 'flex';
      // Sync initial state of pins/favorites in creator properties panel
      document.getElementById('creator-pin')?.classList.toggle('active', !!creatorPinned);
      document.getElementById('creator-favorite')?.classList.toggle('active', !!creatorFavorite);
      document.getElementById('creator-archive')?.classList.toggle('active', !!creatorArchived);
      
      // Render tags and theme previews
      const themePreset = THEME_PRESETS.find(t => t.id === (creatorTheme || 'none'));
      const themeValEl = document.getElementById('creator-theme-preview-val');
      if (themeValEl) {
        themeValEl.textContent = themePreset ? `${themePreset.title} ${themePreset.emoji}` : 'None';
      }
      
      const reminderVal = creatorReminder ? new Date(creatorReminder).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'None';
      const reminderValEl = document.getElementById('creator-reminder-preview-val');
      if (reminderValEl) {
        reminderValEl.textContent = reminderVal;
      }
      renderCreatorPopoverTags();
    }
  });

  creatorMorePopover?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Category Popover inputs
  const popoverCategoryInput = document.getElementById('popover-category-input');
  const popoverCategoryAddBtn = document.getElementById('popover-category-add-btn');
  popoverCategoryAddBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const customFolder = popoverCategoryInput.value.trim();
    if (!customFolder) return;
    const currentFolders = getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || ''));
    setCreatorFolderValue([...currentFolders, customFolder]);
    popoverCategoryInput.value = '';
    renderPopoverCategories();
    saveCreatorNoteDraft();
  });

  // Category search
  document.getElementById('creator-popover-category-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const container = document.getElementById('popover-category-container');
    container?.querySelectorAll('.popover-category-item').forEach(item => {
      const txt = item.textContent.toLowerCase();
      item.style.display = txt.includes(q) ? 'flex' : 'none';
    });
  });

  // Theme launcher
  document.getElementById('creator-theme-launcher')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openThemePickerV2({ type: 'creator' });
  });

  // Compact reminder card toggle
  document.getElementById('creator-reminder-compact-card')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const container = document.getElementById('creator-reminder-picker-container');
    if (container) {
      container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    }
  });

  // Reminder popover set/clear
  const reminderInput = document.getElementById('popover-reminder-input');
  const reminderSaveBtn = document.getElementById('popover-reminder-save-btn');
  const reminderClearBtn = document.getElementById('popover-reminder-clear-btn');
  
  reminderSaveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!reminderInput.value) return;
    const timeMs = new Date(reminderInput.value).getTime();
    if (Number.isNaN(timeMs)) return;
    creatorReminder = timeMs;
    renderCreatorReminderChip();
    
    const reminderVal = new Date(timeMs).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
    const previewVal = document.getElementById('creator-reminder-preview-val');
    if (previewVal) previewVal.textContent = reminderVal;

    saveCreatorNoteDraft();
    showToast({ title: 'Reminder Set', text: 'Note reminder updated successfully.' });
  });

  reminderClearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorReminder = null;
    reminderInput.value = '';
    renderCreatorReminderChip();
    
    const previewVal = document.getElementById('creator-reminder-preview-val');
    if (previewVal) previewVal.textContent = 'None';

    saveCreatorNoteDraft();
    showToast({ title: 'Reminder Cleared', text: 'Note reminder removed.' });
  });

  // Favorite toggle handler
  document.getElementById('creator-favorite')?.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorFavorite = !creatorFavorite;
    document.getElementById('creator-favorite')?.classList.toggle('active', creatorFavorite);
    saveCreatorNoteDraft();
    showToast({ title: creatorFavorite ? 'Added to Favorites' : 'Removed from Favorites', text: 'Note favorite status updated.' });
  });

  // Pin toggle handler
  document.getElementById('creator-pin')?.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorPinned = !creatorPinned;
    document.getElementById('creator-pin')?.classList.toggle('active', creatorPinned);
    saveCreatorNoteDraft();
    showToast({ title: creatorPinned ? 'Note Pinned' : 'Note Unpinned', text: 'Note pin status updated.' });
  });

  // Archive toggle handler
  document.getElementById('creator-archive')?.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorArchived = !creatorArchived;
    document.getElementById('creator-archive')?.classList.toggle('active', creatorArchived);
    saveCreatorNoteDraft();
    showToast({ title: creatorArchived ? 'Note Archived' : 'Note Restored', text: creatorArchived ? 'Note will be archived on save.' : 'Note will be added to feed.' });
  });

  // Move handler
  document.getElementById('creator-move')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const trigger = document.querySelector('.creator-palette-trigger');
    trigger?.click();
  });

  // Duplicate handler
  document.getElementById('creator-duplicate')?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNoteDraft();
    if (creatorActiveNoteId) {
      duplicateNote(creatorActiveNoteId);
      const creatorCard = document.getElementById('note-creator');
      creatorCard?.classList.remove('properties-sheet-open');
      creatorMorePopover.style.display = 'none';
      collapseCreator();
    } else {
      showToast({ title: 'Cannot Duplicate', text: 'Please write some content first.' });
    }
  });

  // Delete handler
  document.getElementById('creator-delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (creatorActiveNoteId) {
      trashNote(creatorActiveNoteId);
      collapseCreator();
    } else {
      clearCreator();
      collapseCreator();
    }
    showToast({ title: 'Note Deleted', text: 'Draft discarded.' });
  });

  // Formatting toolbar bindings
  document.getElementById('tb-bold')?.addEventListener('click', () => formatSelectedText('**', '**'));
  document.getElementById('tb-italic')?.addEventListener('click', () => formatSelectedText('*', '*'));
  document.getElementById('tb-underline')?.addEventListener('click', () => formatSelectedText('<u>', '</u>'));
  document.getElementById('tb-checklist')?.addEventListener('click', () => {
    const isList = isChecklistFormat(creatorText.value);
    creatorText.value = isList ? checklistToPlain(creatorText.value) : plainToChecklist(creatorText.value);
    syncCreatorInputs();
    triggerAutosave();
  });
  document.getElementById('tb-bullet')?.addEventListener('click', () => {
    const pos = creatorText.selectionStart;
    const text = creatorText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    creatorText.value = text.substring(0, lineStart) + '• ' + text.substring(lineStart);
    creatorText.selectionStart = creatorText.selectionEnd = pos + 2;
    creatorText.focus();
    triggerAutosave();
  });
  document.getElementById('tb-number')?.addEventListener('click', () => {
    const pos = creatorText.selectionStart;
    const text = creatorText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    creatorText.value = text.substring(0, lineStart) + '1. ' + text.substring(lineStart);
    creatorText.selectionStart = creatorText.selectionEnd = pos + 3;
    creatorText.focus();
    triggerAutosave();
  });
  document.getElementById('tb-image')?.addEventListener('click', () => creatorImageInput.click());
  document.getElementById('tb-file')?.addEventListener('click', () => creatorFileInput.click());
  document.getElementById('tb-link')?.addEventListener('click', () => creatorLinkParserBtn.click());
  document.getElementById('tb-emoji')?.addEventListener('click', () => {
    const emoji = prompt("Enter emoji:", "📝");
    if (emoji) formatSelectedText(emoji);
  });
  document.getElementById('tb-code')?.addEventListener('click', () => {
    const start = creatorText.selectionStart;
    const end = creatorText.selectionEnd;
    const isMultiLine = creatorText.value.substring(start, end).includes('\n');
    if (isMultiLine) {
      formatSelectedText('```\n', '\n```');
    } else {
      formatSelectedText('`', '`');
    }
  });
  document.getElementById('tb-quote')?.addEventListener('click', () => {
    const pos = creatorText.selectionStart;
    const text = creatorText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    creatorText.value = text.substring(0, lineStart) + '> ' + text.substring(lineStart);
    creatorText.selectionStart = creatorText.selectionEnd = pos + 2;
    creatorText.focus();
    triggerAutosave();
  });
}

function initModalAdvancedEditorHandlers() {
  const modalBackBtn = document.getElementById('modal-back-btn');
  const modalMoreBtn = document.getElementById('modal-more-btn');
  const modalMorePopover = document.getElementById('modal-more-popover');
  
  modalBackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEditModal();
  });

  modalMoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = editModalCard.classList.contains('properties-sheet-open');
    if (isOpen) {
      editModalCard.classList.remove('properties-sheet-open');
      modalMorePopover.style.display = 'none';
    } else {
      editModalCard.classList.add('properties-sheet-open');
      modalMorePopover.style.display = 'flex';
    }
  });

  modalMorePopover?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Modal Category Popover inputs
  const popoverCategoryInput = document.getElementById('modal-popover-category-input');
  const popoverCategoryAddBtn = document.getElementById('modal-popover-category-add-btn');
  popoverCategoryAddBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const customFolder = popoverCategoryInput.value.trim();
    if (!customFolder) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      let folders = getNoteFolders(note);
      if (!folders.includes(customFolder)) {
        folders.push(customFolder);
      }
      setNoteFolders(note, folders);
      registerNoteFolders(note);
      
      const modalBreadcrumb = document.getElementById('modal-breadcrumb');
      if (modalBreadcrumb) {
        modalBreadcrumb.textContent = `${folders[0] || 'Personal'} / Ideas`;
      }
      
      popoverCategoryInput.value = '';
      renderModalPopoverCategories(note);
      debouncedSave();
      renderNotes();
    }
  });

  // Modal Reminder popover set/clear
  const reminderInput = document.getElementById('modal-popover-reminder-input');
  const reminderSaveBtn = document.getElementById('modal-popover-reminder-save-btn');
  const reminderClearBtn = document.getElementById('modal-popover-reminder-clear-btn');
  
  reminderSaveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!reminderInput.value) return;
    const timeMs = new Date(reminderInput.value).getTime();
    if (Number.isNaN(timeMs)) return;
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.reminder = timeMs;
      note.reminderTriggered = false;
      renderModalReminderChip(note);
      debouncedSave();
      renderNotes();
      showToast({ title: 'Reminder Set', text: 'Note reminder updated successfully.' });
    }
  });

  reminderClearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.reminder = null;
      note.reminderTriggered = false;
      reminderInput.value = '';
      renderModalReminderChip(note);
      debouncedSave();
      renderNotes();
      showToast({ title: 'Reminder Cleared', text: 'Note reminder removed.' });
    }
  });

  // Favorite handler
  document.getElementById('modal-favorite')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.favorite = !note.favorite;
      const favLabel = document.getElementById('modal-favorite-label');
      const favBtn = document.getElementById('modal-favorite');
      if (favLabel) favLabel.textContent = note.favorite ? 'Unfavorite' : 'Favorite';
      favBtn?.classList.toggle('active', note.favorite);
      debouncedSave();
      renderNotes();
      showToast({ title: note.favorite ? 'Added to Favorites' : 'Removed from Favorites', text: 'Note favorite status updated.' });
    }
  });

  // Lock Note handler
  document.getElementById('modal-lock')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.locked = !note.locked;
      const lockLabel = document.getElementById('modal-lock-label');
      const lockBtn = document.getElementById('modal-lock');
      if (lockLabel) lockLabel.textContent = note.locked ? 'Unlock Note' : 'Lock Note';
      lockBtn?.classList.toggle('active', note.locked);
      debouncedSave();
      renderNotes();
      showToast({ title: note.locked ? 'Note Locked' : 'Note Unlocked', text: note.locked ? 'Note locked successfully.' : 'Note unlocked.' });
    }
  });

  // Archive handler
  document.getElementById('modal-archive')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      if (note.archived) {
        unarchiveNote(note.id);
        showToast({ title: 'Note Unarchived', text: 'Note returned to home feed.' });
      } else {
        archiveNote(note.id);
        showToast({ title: 'Note Archived', text: 'Note moved to archive section.' });
      }
      closeEditModal();
    }
  });

  // Move handler
  document.getElementById('modal-move')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const trigger = document.getElementById('modal-folder-trigger');
    if (trigger) trigger.click();
  });

  // Export handler
  document.getElementById('modal-export')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      const markdown = `# ${note.title || 'Untitled Note'}\n\n${note.text || ''}`;
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(note.title || 'untitled').toLowerCase().replace(/\s+/g, '-')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast({ title: 'Note Exported', text: 'Downloaded markdown file successfully.' });
    }
  });

  // Category search
  document.getElementById('modal-popover-category-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const container = document.getElementById('modal-popover-category-container');
    container?.querySelectorAll('.popover-category-item').forEach(item => {
      const txt = item.textContent.toLowerCase();
      item.style.display = txt.includes(q) ? 'flex' : 'none';
    });
  });

  // Theme launcher
  document.getElementById('modal-theme-launcher')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      openThemePickerV2({ type: 'modal', note });
    }
  });

  // Compact reminder card toggle
  document.getElementById('modal-reminder-compact-card')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const container = document.getElementById('modal-reminder-picker-container');
    if (container) {
      container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    }
  });

  // Duplicate Note handler
  document.getElementById('modal-duplicate')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      duplicateNote(note.id);
      closeEditModal();
    }
  });

  // Modal Formatting toolbar bindings
  document.getElementById('modal-tb-bold')?.addEventListener('click', () => formatModalText('**', '**'));
  document.getElementById('modal-tb-italic')?.addEventListener('click', () => formatModalText('*', '*'));
  document.getElementById('modal-tb-underline')?.addEventListener('click', () => formatModalText('<u>', '</u>'));
  document.getElementById('modal-tb-bullet')?.addEventListener('click', () => {
    const pos = modalText.selectionStart;
    const text = modalText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    modalText.value = text.substring(0, lineStart) + '• ' + text.substring(lineStart);
    modalText.selectionStart = modalText.selectionEnd = pos + 2;
    modalText.focus();
    debouncedSave();
  });
  document.getElementById('modal-tb-number')?.addEventListener('click', () => {
    const pos = modalText.selectionStart;
    const text = modalText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    modalText.value = text.substring(0, lineStart) + '1. ' + text.substring(lineStart);
    modalText.selectionStart = modalText.selectionEnd = pos + 3;
    modalText.focus();
    debouncedSave();
  });
  document.getElementById('modal-tb-link')?.addEventListener('click', () => {
    const link = prompt("Enter Link URL:", "https://");
    if (link) formatModalText('[', `](${link})`);
  });
  document.getElementById('modal-tb-emoji')?.addEventListener('click', () => {
    const emoji = prompt("Enter emoji:", "📝");
    if (emoji) formatModalText(emoji);
  });
  document.getElementById('modal-tb-code')?.addEventListener('click', () => {
    const start = modalText.selectionStart;
    const end = modalText.selectionEnd;
    const isMultiLine = modalText.value.substring(start, end).includes('\n');
    if (isMultiLine) {
      formatModalText('```\n', '\n```');
    } else {
      formatModalText('`', '`');
    }
  });
  document.getElementById('modal-tb-quote')?.addEventListener('click', () => {
    const pos = modalText.selectionStart;
    const text = modalText.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    modalText.value = text.substring(0, lineStart) + '> ' + text.substring(lineStart);
    modalText.selectionStart = modalText.selectionEnd = pos + 2;
    modalText.focus();
    debouncedSave();
  });
}

function formatModalText(syntaxStart, syntaxEnd = '') {
  const start = modalText.selectionStart;
  const end = modalText.selectionEnd;
  const val = modalText.value;
  
  const selectedText = val.substring(start, end);
  const replacement = syntaxStart + selectedText + syntaxEnd;
  
  modalText.value = val.substring(0, start) + replacement + val.substring(end);
  modalText.focus();
  
  modalText.selectionStart = start + syntaxStart.length;
  modalText.selectionEnd = start + syntaxStart.length + selectedText.length;
  
  debouncedSave();
  autoGrowTextarea.call(modalText);
  updateEditorMirror(modalText, document.getElementById('modal-text-mirror'));
}

function formatSelectedText(syntaxStart, syntaxEnd = '') {
  const start = creatorText.selectionStart;
  const end = creatorText.selectionEnd;
  const val = creatorText.value;
  
  const selectedText = val.substring(start, end);
  const replacement = syntaxStart + selectedText + syntaxEnd;
  
  creatorText.value = val.substring(0, start) + replacement + val.substring(end);
  creatorText.focus();
  
  creatorText.selectionStart = start + syntaxStart.length;
  creatorText.selectionEnd = start + syntaxStart.length + selectedText.length;
  
  triggerAutosave();
  autoGrowTextarea.call(creatorText);
  updateEditorMirror(creatorText, document.getElementById('creator-text-mirror'));
}

let autosaveDebounceTimer = null;
function triggerAutosave() {
  if (!appSettings.advancedEditorEnabled || !creatorActiveNoteId) return;
  creatorAutosaveStatus.textContent = 'Saving...';
  creatorAutosaveStatus.style.opacity = '1';
  clearTimeout(autosaveDebounceTimer);
  autosaveDebounceTimer = setTimeout(() => {
    saveCreatorNoteDraft();
  }, 1000);
}

function saveCreatorNote() {
  const title = creatorTitle.value.trim();
  const text = creatorText.value.trim();
  
  // Don't save if completely empty (allow save when audio or image exists)
  if (isNoteEffectivelyEmpty(title, text, creatorImage, creatorAudio, creatorFiles)) {
    return;
  }
  
  const selectedFolders = decodeFolderSelection(creatorFolderInput?.value || '');
  const newNote = normalizeNoteAppearance(setNoteFolders({
    id: 'note-' + Date.now(),
    type: creatorIntentType || getNoteType(text),
    title: title,
    text: text,
    color: creatorColor,
    theme: creatorTheme,
    customTheme: creatorTheme === CUSTOM_THEME_ID ? creatorCustomTheme : null,
    reminder: creatorReminder,
    reminderTriggered: false,
    audio: creatorAudio,
    audioDuration: creatorAudioDuration,
    pinned: creatorPinned,
    archived: false,
    archivedAt: null,
    deleted: false,
    deletedAt: null,
    image: creatorImage,
    files: normalizeNoteFiles(creatorFiles),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }, selectedFolders));
  
  registerNoteFolders(newNote);
  notes.unshift(newNote);
  saveToLocalStorage();
  renderNotes();
}

// ==========================================================================
// 6. Dynamic Hashtag Extractor
// ==========================================================================

function inferDefaultFolder(note, index = 0) {
  const kind = getVisualNoteType(note);
  const defaults = {
    voice: 'Voice Memos',
    recipe: 'Kitchen Board',
    bookmark: 'Inspiration Wall',
    checklist: 'Action Lists',
    image: 'Moodboard',
    text: 'Inbox'
  };
  return note.folder || defaults[kind] || (index === 0 ? 'Welcome' : 'Inbox');
}

function sanitizeFolderName(folderName) {
  return (folderName || '').trim();
}

function sanitizeFolderList(folderNames = []) {
  return Array.from(
    new Set(
      folderNames
        .map(sanitizeFolderName)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function sanitizeFolderSelection(folderNames = []) {
  const seen = new Set();
  const folders = [];
  folderNames.map(sanitizeFolderName).filter(Boolean).forEach(folder => {
    if (seen.has(folder)) return;
    seen.add(folder);
    folders.push(folder);
  });
  return folders;
}

function getNoteFolders(note = {}, fallbackFolder = 'Inbox') {
  const folders = Array.isArray(note.folders) ? note.folders : [];
  const normalizedFolders = sanitizeFolderSelection([
    ...folders,
    note.folder
  ]);
  if (normalizedFolders.length > 0) return normalizedFolders;
  const fallback = sanitizeFolderName(fallbackFolder) || 'Inbox';
  return [fallback];
}

function getPrimaryFolder(note = {}, fallbackFolder = 'Inbox') {
  return getNoteFolders(note, fallbackFolder)[0] || 'Inbox';
}

function getFolderSummaryLabel(note = {}, fallbackFolder = 'Inbox') {
  const folders = getNoteFolders(note, fallbackFolder);
  const primaryFolder = folders[0] || 'Inbox';
  return folders.length > 1 ? `${primaryFolder} +${folders.length - 1}` : primaryFolder;
}

function setNoteFolders(note, folderNames = []) {
  if (!note) return note;
  const folders = sanitizeFolderSelection(folderNames);
  const normalizedFolders = folders.length > 0 ? folders : ['Inbox'];
  note.folders = normalizedFolders;
  note.folder = normalizedFolders[0];
  return note;
}

function noteHasFolder(note, folderName) {
  const normalizedFolder = sanitizeFolderName(folderName);
  if (!normalizedFolder) return false;
  return getNoteFolders(note).includes(normalizedFolder);
}

function registerNoteFolders(note) {
  getNoteFolders(note).forEach(registerFolder);
}

function encodeFolderSelection(folderNames = []) {
  return JSON.stringify(getSelectedFolders(folderNames));
}

function decodeFolderSelection(value = '') {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return getSelectedFolders(parsed);
  } catch (error) {
    // Fall through to legacy single-value parsing.
  }
  return getSelectedFolders([value]);
}

function getSelectedFolders(folderNames = []) {
  const folders = sanitizeFolderSelection(folderNames);
  return folders.length > 0 ? folders : ['Inbox'];
}

function registerFolder(folderName) {
  const normalizedFolder = sanitizeFolderName(folderName);
  if (!normalizedFolder || customFolders.includes(normalizedFolder)) return;
  customFolders = sanitizeFolderList([...customFolders, normalizedFolder]);
}

function hashString(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getFolderMeta(folderName) {
  const normalizedFolder = sanitizeFolderName(folderName) || 'Inbox';
  const preset = DEFAULT_FOLDERS.find(folder => folder.name === normalizedFolder);
  if (preset) return preset;

  const fallback = FOLDER_ICON_FALLBACKS[hashString(normalizedFolder) % FOLDER_ICON_FALLBACKS.length];
  return {
    name: normalizedFolder,
    icon: 'folder',
    accent: fallback.accent,
    soft: fallback.soft
  };
}

function getFolderIconSvg(iconName) {
  const icons = {
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 21h13a2 2 0 0 0 2-2V8.5a2 2 0 0 0-.59-1.41l-2.5-2.5A2 2 0 0 0 16 4H8a2 2 0 0 0-1.41.59l-2.5 2.5A2 2 0 0 0 3.5 8.5V19a2 2 0 0 0 2 2Z"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3Z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/><path d="M5 14l.7 1.3L7 16l-1.3.7L5 18l-.7-1.3L3 16l1.3-.7L5 14Z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/></svg>',
    'chef-hat': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12h12"/><path d="M7 12a4 4 0 0 1-.7-7.94A5 5 0 0 1 16.9 5a3.5 3.5 0 0 1 .1 7"/><path d="M8 12v7"/><path d="M16 12v7"/><path d="M8 19h8"/></svg>',
    'check-square': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8.5 12 2.3 2.3 4.7-5.1"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="m20.5 16-4.4-4.4a1 1 0 0 0-1.4 0L7 19.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.47L20.75 9.3l-4.38 4.28 1.03 6.05L12 16.77l-5.4 2.86 1.03-6.05L3.25 9.3l6.05-.83L12 3Z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/></svg>'
  };
  return icons[iconName] || icons.folder;
}

function getVisualNoteType(note) {
  const rawType = note.type || getNoteType(note.text || '');
  if (note.recipeData || rawType === 'recipe') return 'recipe';
  if (note.audio) return 'voice';
  if ((note.title || '').toLowerCase().includes('recipe')) return 'recipe';
  if (note.image) return rawType === 'checklist' ? 'checklist' : 'image';
  if (getFirstUrlInText(note.text || '')) return 'bookmark';
  return rawType;
}

function getAllFolders() {
  return sanitizeFolderList([
    ...DEFAULT_FOLDERS.map(folder => folder.name),
    ...customFolders,
    ...notes.flatMap(note => getNoteFolders(note))
  ]);
}

function renderSidebarFolders() {
  if (!sidebarFoldersList) return;
  sidebarFoldersList.innerHTML = '';
  getAllFolders().forEach(folder => {
    const folderMeta = getFolderMeta(folder);
    const item = document.createElement('div');
    item.className = `sidebar-item ${selectedFolderFilter === folder ? 'active' : ''}`;
    item.setAttribute('title', folder);
    item.setAttribute('aria-label', folder);
    item.innerHTML = `
      <span class="sidebar-icon folder-icon" style="--folder-accent: ${folderMeta.accent}; --folder-soft: ${folderMeta.soft};">${getFolderIconSvg(folderMeta.icon)}</span>
      <span class="sidebar-label">${folder}</span>
    `;
    item.addEventListener('click', () => {
      currentPage = 'notes';
      selectedFolderFilter = folder;
      selectedTagFilter = null;
      clearSidebarActiveStates();
      item.classList.add('active');
      collapseSidebarAfterSelection();
      renderAppView();
    });
    sidebarFoldersList.appendChild(item);
  });
}

function renderFolderDrawer() {
  if (!folderDrawerList) return;
  folderDrawerList.innerHTML = '';

  getAllFolders().forEach(folder => {
    const folderMeta = getFolderMeta(folder);
    const relatedNotes = notes.filter(note => noteHasFolder(note, folder) && isActiveNote(note));
    const item = document.createElement('button');
    item.className = `folder-drawer-item ${selectedFolderFilter === folder ? 'active' : ''}`;
    item.innerHTML = `
      <span class="folder-drawer-item-icon" style="--folder-accent: ${folderMeta.accent}; --folder-soft: ${folderMeta.soft};">${getFolderIconSvg(folderMeta.icon)}</span>
      <span class="folder-drawer-item-content">
        <span class="folder-drawer-item-title">${folder}</span>
        <span class="folder-drawer-item-meta">${relatedNotes.length} note${relatedNotes.length === 1 ? '' : 's'}</span>
      </span>
      <span class="folder-drawer-item-trailing">${relatedNotes.slice(0, 2).map(note => getVisualTypeLabel(getVisualNoteType(note))).join(' · ') || 'Empty'}</span>
    `;
    item.addEventListener('click', () => {
      currentPage = 'notes';
      selectedFolderFilter = folder;
      selectedTagFilter = null;
      clearSidebarActiveStates();
      collapseSidebarAfterSelection();
      renderAppView();
      closeFolderDrawer();
    });
    folderDrawerList.appendChild(item);
  });
}

function openFolderDrawer() {
  renderFolderDrawer();
  folderDrawer?.classList.add('visible');
}

function closeFolderDrawer() {
  folderDrawer?.classList.remove('visible');
}

function renderFolderSuggestions() {
  if (!folderSuggestions) return;
  folderSuggestions.innerHTML = '';
  getAllFolders().forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    folderSuggestions.appendChild(option);
  });
}

function isInlineCreatorFolderPicker() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function closeCreatorFolderPicker() {
  if (isInlineCreatorFolderPicker()) return;
  creatorFolderField?.classList.remove('is-open');
  creatorFolderTrigger?.setAttribute('aria-expanded', 'false');
}

function setCreatorFolderValue(folderNames, options = {}) {
  const normalizedFolders = getSelectedFolders(Array.isArray(folderNames) ? folderNames : [folderNames]);
  if (creatorFolderInput) creatorFolderInput.value = encodeFolderSelection(normalizedFolders);
  creatorFolders = normalizedFolders;
  creatorFolder = normalizedFolders[0] || 'Inbox';
  normalizedFolders.forEach(registerFolder);
  if (options.isAuto) {
    creatorAutoFolder = creatorFolder;
  } else if (creatorFolder !== creatorAutoFolder) {
    creatorAutoFolder = '';
  }
  if (creatorFolderCustomInput && !options.preserveDraft) {
    creatorFolderCustomInput.value = '';
  }
  renderCreatorFolderPicker(normalizedFolders);
}

function toggleCreatorFolder(folder) {
  const normalizedFolder = sanitizeFolderName(folder);
  if (!normalizedFolder) return;
  const currentFolders = getSelectedFolders(creatorFolders.length ? creatorFolders : decodeFolderSelection(creatorFolderInput?.value || ''));
  const isAdding = !currentFolders.includes(normalizedFolder);
  if (isAdding && currentFolders.length === 1 && currentFolders[0] === creatorAutoFolder) {
    setCreatorFolderValue([normalizedFolder], { preserveDraft: true });
    return;
  }
  const nextFolders = currentFolders.includes(normalizedFolder)
    ? currentFolders.filter(entry => entry !== normalizedFolder)
    : [...currentFolders, normalizedFolder];
  setCreatorFolderValue(nextFolders.length ? nextFolders : ['Inbox'], { preserveDraft: true });
}

function renderCreatorFolderPicker(selectedFolders) {
  if (!creatorFolderField || !creatorFolderTrigger || !creatorFolderOptions) return;

  const currentFolders = getSelectedFolders(Array.isArray(selectedFolders) ? selectedFolders : [selectedFolders]);
  const primaryFolder = currentFolders[0] || 'Inbox';
  const primaryMeta = getFolderMeta(primaryFolder);
  const extraCount = Math.max(currentFolders.length - 1, 0);

  creatorFolderTrigger.innerHTML = `
    <span class="creator-folder-pill note-folder-pill" style="--folder-accent: ${primaryMeta.accent}; --folder-soft: ${primaryMeta.soft};">
      <span class="creator-folder-pill-icon">${getFolderIconSvg(primaryMeta.icon)}</span>
      <span class="creator-folder-pill-text">${primaryFolder}</span>
      ${extraCount ? `<span class="folder-pill-count">+${extraCount}</span>` : ''}
    </span>
    <span class="creator-folder-trigger-chevron" aria-hidden="true">&#9662;</span>
  `;
  creatorFolderTrigger.setAttribute('aria-label', `Selected categories: ${currentFolders.join(', ')}`);

  creatorFolderOptions.innerHTML = '';
  getAllFolders().forEach(folder => {
    const optionMeta = getFolderMeta(folder);
    const isActive = currentFolders.includes(folder);
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `creator-folder-option ${isActive ? 'active' : ''}`;
    option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    option.innerHTML = `
      <span class="folder-option-check">${isActive ? '&#10003;' : ''}</span>
      <span class="creator-folder-option-icon" style="--folder-accent: ${optionMeta.accent}; --folder-soft: ${optionMeta.soft};">${getFolderIconSvg(optionMeta.icon)}</span>
      <span class="creator-folder-option-label">${folder}</span>
    `;
    option.addEventListener('click', () => {
      toggleCreatorFolder(folder);
    });
    creatorFolderOptions.appendChild(option);
  });
}

function isInlineModalFolderPicker() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function closeModalFolderPicker() {
  if (isInlineModalFolderPicker()) return;
  modalFolderField?.classList.remove('is-open');
  modalFolderTrigger?.setAttribute('aria-expanded', 'false');
}

function setModalFolderValue(folderNames, options = {}) {
  const normalizedFolders = getSelectedFolders(Array.isArray(folderNames) ? folderNames : [folderNames]);
  if (modalFolderInput) modalFolderInput.value = encodeFolderSelection(normalizedFolders);
  normalizedFolders.forEach(registerFolder);
  if (modalFolderCustomInput && !options.preserveDraft) {
    modalFolderCustomInput.value = '';
  }
  renderModalFolderPicker(normalizedFolders);
}

function toggleModalFolder(folder) {
  const normalizedFolder = sanitizeFolderName(folder);
  if (!normalizedFolder) return;
  const currentFolders = getSelectedFolders(decodeFolderSelection(modalFolderInput?.value || ''));
  const nextFolders = currentFolders.includes(normalizedFolder)
    ? currentFolders.filter(entry => entry !== normalizedFolder)
    : [...currentFolders, normalizedFolder];
  setModalFolderValue(nextFolders.length ? nextFolders : ['Inbox'], { preserveDraft: true });
}

function renderModalFolderPicker(selectedFolders) {
  if (!modalFolderField || !modalFolderTrigger || !modalFolderOptions) return;

  const currentFolders = getSelectedFolders(Array.isArray(selectedFolders) ? selectedFolders : [selectedFolders]);
  const primaryFolder = currentFolders[0] || 'Inbox';
  const primaryMeta = getFolderMeta(primaryFolder);
  const extraCount = Math.max(currentFolders.length - 1, 0);

  modalFolderTrigger.innerHTML = `
    <span class="modal-folder-pill note-folder-pill" style="--folder-accent: ${primaryMeta.accent}; --folder-soft: ${primaryMeta.soft};">
      <span class="modal-folder-pill-icon">${getFolderIconSvg(primaryMeta.icon)}</span>
      <span class="modal-folder-pill-text">${primaryFolder}</span>
      ${extraCount ? `<span class="folder-pill-count">+${extraCount}</span>` : ''}
    </span>
    <span class="modal-folder-trigger-chevron" aria-hidden="true">&#9662;</span>
  `;
  modalFolderTrigger.setAttribute('aria-label', `Selected categories: ${currentFolders.join(', ')}`);

  modalFolderOptions.innerHTML = '';
  getAllFolders().forEach(folder => {
    const optionMeta = getFolderMeta(folder);
    const isActive = currentFolders.includes(folder);
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `modal-folder-option ${isActive ? 'active' : ''}`;
    option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    option.innerHTML = `
      <span class="folder-option-check">${isActive ? '&#10003;' : ''}</span>
      <span class="modal-folder-option-icon" style="--folder-accent: ${optionMeta.accent}; --folder-soft: ${optionMeta.soft};">${getFolderIconSvg(optionMeta.icon)}</span>
      <span class="modal-folder-option-label">${folder}</span>
    `;
    option.addEventListener('click', () => {
      toggleModalFolder(folder);
    });
    modalFolderOptions.appendChild(option);
  });
}

function supportsHoverPreview() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function collapseExpandedTouchCards() {
  document.querySelectorAll('.note-card.touch-expanded').forEach(card => {
    card.classList.remove('touch-expanded');
  });
}

function getSuggestedCreatorFolder() {
  const draftNote = {
    title: creatorTitle?.value.trim() || '',
    text: creatorText?.value.trim() || '',
    type: getNoteType(creatorText?.value.trim() || ''),
    audio: creatorAudio,
    image: creatorImage
  };
  return inferDefaultFolder(draftNote, 1);
}

function syncCreatorFolderInput(force = false) {
  if (!creatorFolderInput) return;

  const currentFolders = decodeFolderSelection(creatorFolderInput.value || '');
  const currentValue = currentFolders.join('|');
  const suggestedFolder = getSuggestedCreatorFolder();
  const shouldAutofill = force || !creatorFolderInput.value || (currentFolders.length === 1 && currentFolders[0] === creatorAutoFolder);

  if (shouldAutofill) {
    setCreatorFolderValue([suggestedFolder], { isAuto: true });
    return;
  }

  setCreatorFolderValue(currentValue ? currentFolders : ['Inbox'], { preserveDraft: true });
}

function closeAllNoteCardMenus() {
  document.querySelectorAll('.note-card-menu.open').forEach(menu => {
    menu.classList.remove('open');
    menu.classList.remove('theme-picker-open');
  });
  document.querySelectorAll('.note-card-menu-panel .color-picker-bubble.visible').forEach(picker => {
    picker.classList.remove('visible');
  });
  document.querySelectorAll('.note-card-menu > .color-picker-bubble.visible').forEach(picker => {
    picker.classList.remove('visible');
  });
}

function scanUniqueTags() {
  const tagsSet = new Set();
  notes.forEach(note => {
    if (!isActiveNote(note)) return;
    const words = `${note.title} ${note.text}`.split(/[\s,]+/);
    words.forEach(word => {
      // Find hashtags like #work or #urgent (strictly letters/numbers)
      if (word.startsWith('#') && word.length > 2) {
        const cleanTag = word.substring(1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanTag) tagsSet.add(cleanTag);
      }
    });
  });
  return Array.from(tagsSet).sort();
}

function renderSidebarTags() {
  if (!sidebarTagsList) return;
  sidebarTagsList.innerHTML = '';
  const tags = scanUniqueTags();
  
  tags.forEach(tag => {
    const item = document.createElement('div');
    item.className = `sidebar-item ${selectedTagFilter === tag ? 'active' : ''}`;
    item.innerHTML = `
      <span class="sidebar-icon sidebar-chip-icon">#</span>
      <span class="sidebar-label">#${tag}</span>
    `;
    item.addEventListener('click', () => {
      currentPage = 'notes';
      selectedTagFilter = tag;
      selectedFolderFilter = null;
      clearSidebarActiveStates();
      item.classList.add('active');
      collapseSidebarAfterSelection();
      renderAppView();
    });
    sidebarTagsList.appendChild(item);
  });
}

// ==========================================================================
// 8. Image Handling & Compression
// ==========================================================================

function closeImageSourcePicker() {
  document.querySelectorAll('.image-source-popover').forEach(popover => popover.remove());
}

function openImageSourcePicker(target, anchor) {
  closeImageSourcePicker();

  const uploadInput = target === 'creator' ? creatorImageInput : modalImageInput;
  const cameraInput = target === 'creator' ? creatorCameraInput : modalCameraInput;
  if (!uploadInput) return;

  const popover = document.createElement('div');
  popover.className = 'image-source-popover';
  popover.innerHTML = `
    <button type="button" data-image-source="upload">
      <span class="image-source-icon" aria-hidden="true">+</span>
      <span>
        <strong>Upload image</strong>
        <small>Choose from files or gallery</small>
      </span>
    </button>
    <button type="button" data-image-source="camera">
      <span class="image-source-icon" aria-hidden="true"></span>
      <span>
        <strong>Use camera</strong>
        <small>Take a new photo</small>
      </span>
    </button>
  `;

  popover.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-image-source]')?.getAttribute('data-image-source');
    if (action === 'upload') {
      closeImageSourcePicker();
      uploadInput.value = '';
      uploadInput.click();
    }
    if (action === 'camera') {
      closeImageSourcePicker();
      if (cameraInput) cameraInput.value = '';
      (cameraInput || uploadInput).click();
    }
  });

  document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(260, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
  const top = Math.max(12, Math.min(window.innerHeight - 146, rect.bottom + 10));
  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function handleSelectedImageFile(target, file) {
  if (!file) return;
  if (!file.type?.startsWith('image/')) {
    showToast({ title: 'Image not added', text: 'The selected camera file is not an image.' });
    return;
  }
  handleImageUpload(file, (base64) => {
    if (target === 'creator') {
      creatorImage = base64;
      creatorImgPreview.src = base64;
      creatorImageBanner.style.display = 'block';
      syncCreatorFolderInput();
      return;
    }

    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.image = base64;
      modalImgPreview.src = base64;
      modalImageBanner.style.display = 'block';
      saveToLocalStorage();
      renderNotes();
    }
  }, () => {
    showToast({ title: 'Image not added', text: 'This camera image format could not be read by the browser.' });
  });
}

function normalizeNoteFiles(files = []) {
  return Array.isArray(files) ? files.filter(file => file && file.dataUrl && file.name) : [];
}

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function getSafeFileName(name = 'attachment') {
  return `${name}`.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'attachment';
}

function escapeHtml(value = '') {
  return `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAttachmentKind(file = {}) {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

function getAttachmentLabel(file = {}) {
  const labels = { image: 'IMG', video: 'VID', audio: 'AUD', file: 'FILE' };
  return labels[getAttachmentKind(file)] || 'FILE';
}

function getMediaKindFromUrl(url = '') {
  const cleanUrl = `${url}`.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(cleanUrl)) return 'video';
  if (/\.(mp3|wav|m4a|aac|flac|oga|opus)$/.test(cleanUrl)) return 'audio';
  return null;
}

async function dataUrlToFile(dataUrl, filename, type = '') {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], getSafeFileName(filename), { type: type || blob.type || 'application/octet-stream' });
}

function getDataUrlExtension(dataUrl = '', fallback = 'bin') {
  const match = dataUrl.match(/^data:([^;,]+)/);
  if (!match) return fallback;
  const mime = match[1].toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('pdf')) return 'pdf';
  return mime.split('/').pop() || fallback;
}

function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = getSafeFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildNoteShareText(note) {
  const parts = [];
  if (note.title) parts.push(cleanTitleTags(note.title));
  if (note.text) parts.push(cleanTextTags(note.text));
  const files = normalizeNoteFiles(note.files);
  if (files.length) parts.push(`Attachments: ${files.map(file => file.name).join(', ')}`);
  if (note.audio) parts.push(`Voice note: ${note.audioDuration || 'recorded clip'}`);
  if (note.videoId) parts.push('Video attached');
  return parts.filter(Boolean).join('\n\n') || 'AtlasNest note';
}

async function shareNote(note) {
  const title = cleanTitleTags(note.title || 'AtlasNest note');
  const text = buildNoteShareText(note);
  if (navigator.share) {
    try {
      const shareFiles = [];
      const attachments = normalizeNoteFiles(note.files);
      for (const file of attachments.slice(0, 6)) {
        try {
          const src = await getAttachmentSrc(file);
          if (src) {
            shareFiles.push(await dataUrlToFile(src, file.name, file.type));
          }
        } catch (error) {
          console.warn('Could not prepare attachment for sharing:', file.name, error);
        }
      }
      if (note.image) {
        shareFiles.unshift(await dataUrlToFile(
          note.image,
          `${getSafeFileName(note.title || 'note-image')}.${getDataUrlExtension(note.image, 'jpg')}`,
          'image/*'
        ));
      }
      if (note.audio) {
        shareFiles.push(await dataUrlToFile(
          note.audio,
          `${getSafeFileName(note.title || 'voice-note')}.${getDataUrlExtension(note.audio, 'webm')}`,
          'audio/webm'
        ));
      }
      if (note.videoId) {
        try {
          const blob = await getVideoBlob(note.videoId);
          if (blob) {
            const ext = blob.type?.split('/')[1] || 'mp4';
            shareFiles.push(new File([blob], `${getSafeFileName(note.title || 'note-video')}.${ext}`, { type: blob.type || 'video/mp4' }));
          }
        } catch (error) {
          console.warn('Could not prepare video for sharing:', error);
        }
      }
      const payload = { title, text };
      if (shareFiles.length && navigator.canShare?.({ files: shareFiles })) {
        payload.files = shareFiles;
      }
      await navigator.share(payload);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      console.warn('Native sharing failed, falling back to text copy:', error);
    }
  }
  await navigator.clipboard?.writeText(text);
  showToast({ title: 'Note copied', text: 'Sharing is not available here, so the note text was copied.' });
  return false;
}

function openImageViewer(src, title = 'Note image') {
  if (!src) return;
  document.querySelector('.image-viewer-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'image-viewer-overlay visible';
  overlay.innerHTML = `
    <div class="image-viewer-card" role="dialog" aria-modal="true" aria-label="Image preview">
      <div class="image-viewer-topbar">
        <strong>${title}</strong>
        <div class="image-viewer-topbar-actions">
          <button type="button" class="image-viewer-download" aria-label="Download image">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span>Download</span>
          </button>
          <button type="button" class="image-viewer-close" aria-label="Close image preview">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <img src="${src}" alt="${title}">
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.image-viewer-close')) overlay.remove();
  });
  overlay.querySelector('.image-viewer-download')?.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadDataUrl(src, `${getSafeFileName(title)}.${getDataUrlExtension(src, 'jpg')}`);
  });
  document.body.appendChild(overlay);
}

const SHARE_SHEET_ICONS = {
  native: '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L7.04 9.81C6.5 9.31 5.79 9 5 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
  image: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
  audio: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>'
};

function openShareSheet(note) {
  document.querySelector('.share-sheet-overlay')?.remove();
  const files = normalizeNoteFiles(note.files);
  const overlay = document.createElement('div');
  overlay.className = 'share-sheet-overlay visible';

  const actions = [
    { key: 'native', label: 'Share', icon: SHARE_SHEET_ICONS.native },
    { key: 'copy', label: 'Copy text', icon: SHARE_SHEET_ICONS.copy }
  ];
  if (note.image) actions.push({ key: 'image', label: 'Save image', icon: SHARE_SHEET_ICONS.image });
  if (note.videoId) actions.push({ key: 'video', label: 'Save video', icon: SHARE_SHEET_ICONS.video });
  if (note.audio) actions.push({ key: 'audio', label: 'Save voice', icon: SHARE_SHEET_ICONS.audio });

  overlay.innerHTML = `
    <div class="share-sheet-card" role="dialog" aria-modal="true" aria-label="Share note">
      <div class="share-sheet-handle"></div>
      <div class="share-sheet-header">
        <div>
          <div class="share-sheet-kicker">Share note</div>
          <h3>${cleanTitleTags(note.title || 'Untitled note')}</h3>
        </div>
        <button type="button" class="icon-btn share-sheet-close" aria-label="Close share sheet">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="share-sheet-actions">
        ${actions.map(action => `
          <button type="button" data-share-action="${action.key}">
            <span class="share-sheet-action-icon">${action.icon}</span>
            <span class="share-sheet-action-label">${action.label}</span>
          </button>
        `).join('')}
      </div>
      ${files.length ? `
        <div class="share-sheet-files-label">Attachments</div>
        <div class="share-sheet-files">
          ${files.map(file => `
            <button type="button" data-share-file="${escapeHtml(file.id)}">
              <span class="share-sheet-file-icon">${SHARE_SHEET_ICONS.file}</span>
              <span class="share-sheet-file-info">
                <span class="share-sheet-file-name">${escapeHtml(file.name)}</span>
                <small>${getAttachmentLabel(file)} · ${formatFileSize(file.size)}</small>
              </span>
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.share-sheet-close')) overlay.remove();
  });
  overlay.querySelector('[data-share-action="native"]')?.addEventListener('click', async () => {
    const didShare = await shareNote(note);
    if (didShare) overlay.remove();
  });
  overlay.querySelector('[data-share-action="copy"]')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(buildNoteShareText(note));
    showToast({ title: 'Copied', text: 'Note text copied to clipboard.' });
    overlay.remove();
  });
  overlay.querySelector('[data-share-action="image"]')?.addEventListener('click', () => {
    downloadDataUrl(note.image, `${getSafeFileName(note.title || 'note-image')}.${getDataUrlExtension(note.image, 'jpg')}`);
    overlay.remove();
  });
  overlay.querySelector('[data-share-action="video"]')?.addEventListener('click', async () => {
    try {
      const blob = await getVideoBlob(note.videoId);
      if (!blob) {
        showToast({ title: 'Video unavailable', text: 'This video could not be found.' });
        return;
      }
      const ext = blob.type?.split('/')[1] || 'mp4';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getSafeFileName(note.title || 'note-video')}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Could not save video:', error);
      showToast({ title: 'Video unavailable', text: 'This video could not be saved.' });
    }
    overlay.remove();
  });
  overlay.querySelector('[data-share-action="audio"]')?.addEventListener('click', () => {
    downloadDataUrl(note.audio, `${getSafeFileName(note.title || 'voice-note')}.${getDataUrlExtension(note.audio, 'webm')}`);
    overlay.remove();
  });
  overlay.querySelectorAll('[data-share-file]').forEach(button => {
    button.addEventListener('click', () => {
      const file = files.find(entry => entry.id === button.dataset.shareFile);
      if (file) downloadDataUrl(file.dataUrl, file.name);
      overlay.remove();
    });
  });
  document.body.appendChild(overlay);
}

async function handleSelectedFiles(target, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const maxBytes = 100 * 1024 * 1024; // 100MB instead of 12MB
  const prepared = [];
  for (const file of files.slice(0, 5)) {
    if (file.size > maxBytes) {
      showToast({ title: 'File skipped', text: `${file.name} is larger than 100 MB.` });
      continue;
    }
    try {
      const fileId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let dataUrl = 'db';
      let storedInDB = false;
      
      if (file.size > 100 * 1024) { // Larger than 100KB
        await storeFileInDB(fileId, file);
        storedInDB = true;
      } else {
        dataUrl = await readFileAsDataUrl(file);
      }

      prepared.push({
        id: fileId,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
        storedInDB,
        addedAt: Date.now()
      });
    } catch (error) {
      console.error('Failed to attach file:', file.name, error);
      showToast({ title: 'File error', text: `Could not attach ${file.name}.` });
    }
  }
  if (!prepared.length) return;
  if (target === 'creator') {
    creatorFiles = [...normalizeNoteFiles(creatorFiles), ...prepared];
    renderCreatorFileAttachments();
    return;
  }
  const note = notes.find(n => n.id === currentEditingNoteId);
  if (note) {
    note.files = [...normalizeNoteFiles(note.files), ...prepared];
    note.updatedAt = Date.now();
    saveToLocalStorage();
    renderModalFileAttachments(note);
    renderNotes();
  }
}

function renderNoteFileAttachments(container, note, options = {}) {
  const files = normalizeNoteFiles(note.files);
  if (!container || !files.length) return;
  const wrap = document.createElement('div');
  wrap.className = `file-attachment-list ${options.compact ? 'compact' : ''}`;
  files.forEach(file => {
    const kind = getAttachmentKind(file);
    const chip = document.createElement('div');
    chip.className = `file-attachment-chip type-${kind}${kind === 'video' || kind === 'audio' ? ' has-media' : ''}`;
    chip.innerHTML = `
      <span class="file-attachment-icon" aria-hidden="true">${getAttachmentLabel(file)}</span>
      <span class="file-attachment-copy">
        <strong>${escapeHtml(file.name)}</strong>
        <small>${formatFileSize(file.size)}</small>
      </span>
      <button type="button" class="media-action-btn" data-file-download="${file.id}">Download</button>
      ${options.editable ? `<button type="button" class="media-action-btn danger" data-file-remove="${file.id}">Remove</button>` : ''}
    `;
    if (kind === 'video') {
      const player = document.createElement('video');
      player.className = 'file-media-preview video-preview';
      getAttachmentSrc(file).then(src => {
        if (src) player.src = src;
      });
      player.controls = true;
      player.preload = 'metadata';
      player.playsInline = true;
      player.addEventListener('click', (e) => e.stopPropagation());
      chip.insertBefore(player, chip.querySelector('[data-file-download]'));
    } else if (kind === 'audio') {
      const player = document.createElement('audio');
      player.className = 'file-media-preview audio-preview';
      getAttachmentSrc(file).then(src => {
        if (src) player.src = src;
      });
      player.controls = true;
      player.preload = 'metadata';
      player.addEventListener('click', (e) => e.stopPropagation());
      chip.insertBefore(player, chip.querySelector('[data-file-download]'));
    }
    chip.querySelector('[data-file-download]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      getAttachmentSrc(file).then(src => {
        if (src) downloadDataUrl(src, file.name);
      });
    });
    chip.querySelector('[data-file-remove]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (note === creatorFileDraft) {
        const fileObj = creatorFiles.find(entry => entry.id === file.id);
        if (fileObj && (fileObj.storedInDB || fileObj.dataUrl === 'db')) {
          deleteFileFromDB(file.id).catch(err => console.warn('IndexedDB delete failed:', err));
        }
        creatorFiles = normalizeNoteFiles(creatorFiles).filter(entry => entry.id !== file.id);
        renderCreatorFileAttachments();
        return;
      }
      const fileObj = note.files.find(entry => entry.id === file.id);
      if (fileObj && (fileObj.storedInDB || fileObj.dataUrl === 'db')) {
        deleteFileFromDB(file.id).catch(err => console.warn('IndexedDB delete failed:', err));
      }
      note.files = normalizeNoteFiles(note.files).filter(entry => entry.id !== file.id);
      note.updatedAt = Date.now();
      saveToLocalStorage();
      renderModalFileAttachments(note);
      renderNotes();
    });
    if (kind === 'image') {
      chip.querySelector('.file-attachment-copy')?.addEventListener('click', (e) => {
        e.stopPropagation();
        getAttachmentSrc(file).then(src => {
          if (src) openImageViewer(src, file.name);
        });
      });
    }
    wrap.appendChild(chip);
  });
  container.appendChild(wrap);
}

const creatorFileDraft = {};

function renderCreatorFileAttachments() {
  const container = document.getElementById('creator-chips-container');
  if (!container) return;
  container.querySelectorAll('.file-attachment-list').forEach(el => el.remove());
  creatorFileDraft.files = creatorFiles;
  renderNoteFileAttachments(container, creatorFileDraft, { editable: true });
}

function renderModalFileAttachments(note) {
  const container = document.getElementById('modal-tags-container');
  if (!container) return;
  container.querySelectorAll('.file-attachment-list').forEach(el => el.remove());
  renderNoteFileAttachments(container, note, { editable: true });
}

function handleImageUpload(file, onCompressComplete, onError = () => {}) {
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = function() {
    try {
      // Compress to prevent LocalStorage overflows.
      const canvas = document.createElement('canvas');
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(objectUrl);
      onCompressComplete(compressedDataUrl);
    } catch (error) {
      console.warn('Image compression failed; falling back to FileReader.', error);
      URL.revokeObjectURL(objectUrl);
      fallbackToFileReader(file, onCompressComplete, onError);
    }
  };

  img.onerror = () => {
    console.warn('Image decode failed for selected file via ObjectURL:', file.name, file.type);
    URL.revokeObjectURL(objectUrl);

    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      fallbackToFileReader(file, onCompressComplete, onError);
      return;
    }
    onError();
  };

  img.src = objectUrl;
}

function fallbackToFileReader(file, onCompressComplete, onError) {
  const reader = new FileReader();
  reader.onload = function(event) {
    onCompressComplete(event.target.result);
  };
  reader.onerror = onError;
  reader.readAsDataURL(file);
}

// ==========================================================================
// 9. Canvas Sketching Workspace (Touch-enabled)
// ==========================================================================

function initCanvasDrawEngine() {
  canvasCtx = sketchCanvas.getContext('2d');
  
  // Mouse Draw Event Listeners
  sketchCanvas.addEventListener('mousedown', startDrawing);
  sketchCanvas.addEventListener('mousemove', draw);
  sketchCanvas.addEventListener('mouseup', stopDrawing);
  sketchCanvas.addEventListener('mouseout', stopDrawing);

  // Touch Draw Event Listeners (Optimized for stylus / physical tablet drag drawing)
  sketchCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault(); // Stop scroll bouncing on tablet
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch);
      isDrawing = true;
      lastDrawX = coords.x;
      lastDrawY = coords.y;
    }
  });

  sketchCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDrawing) {
      e.preventDefault();
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch);
      drawStroke(coords.x, coords.y);
    }
  });

  sketchCanvas.addEventListener('touchend', stopDrawing);
  sketchCanvas.addEventListener('touchcancel', stopDrawing);

  // Brush Color Selections
  document.querySelectorAll('.sketch-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sketch-color').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      isEraserActive = false;
      sketchEraser.classList.remove('active');
      brushColor = btn.getAttribute('data-color');
    });
  });

  // Toggle Eraser tool
  sketchEraser.addEventListener('click', () => {
    isEraserActive = !isEraserActive;
    sketchEraser.classList.toggle('active', isEraserActive);
  });

  // Brush Size
  sketchBrushSize.addEventListener('input', (e) => {
    brushSize = e.target.value;
  });

  // Clear Canvas
  sketchClear.addEventListener('click', () => {
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  });

  // Cancel Drawing
  sketchClose.addEventListener('click', () => {
    sketchModal.classList.remove('visible');
  });

  // Save Canvas Sketch
  sketchSave.addEventListener('click', () => {
    // Compress sketch
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const maxW = 500;
    const scale = Math.min(1, maxW / sketchCanvas.width);
    tempCanvas.width = sketchCanvas.width * scale;
    tempCanvas.height = sketchCanvas.height * scale;
    
    // Draw white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(sketchCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);

    // Save target
    if (activeSketchTarget === 'creator') {
      creatorImage = dataUrl;
      creatorImgPreview.src = dataUrl;
      creatorImageBanner.style.display = 'block';
    } else if (activeSketchTarget === 'modal' && currentEditingNoteId) {
      const note = notes.find(n => n.id === currentEditingNoteId);
      if (note) {
        note.image = dataUrl;
        modalImgPreview.src = dataUrl;
        modalImageBanner.style.display = 'block';
        saveToLocalStorage();
        renderNotes();
      }
    }

    sketchModal.classList.remove('visible');
  });
}

function openDrawingWorkspace(target) {
  activeSketchTarget = target;
  sketchModal.classList.add('visible');
  
  // Set dimensions matching canvas wrapper
  const wrapper = sketchCanvas.parentNode;
  sketchCanvas.width = wrapper.clientWidth;
  sketchCanvas.height = wrapper.clientHeight;
  
  // Fill canvas white
  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
}

function getCanvasCoords(eventOrTouch) {
  const rect = sketchCanvas.getBoundingClientRect();
  return {
    x: eventOrTouch.clientX - rect.left,
    y: eventOrTouch.clientY - rect.top
  };
}

function startDrawing(e) {
  isDrawing = true;
  const coords = getCanvasCoords(e);
  lastDrawX = coords.x;
  lastDrawY = coords.y;
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);
  drawStroke(coords.x, coords.y);
}

function drawStroke(x, y) {
  canvasCtx.beginPath();
  canvasCtx.moveTo(lastDrawX, lastDrawY);
  canvasCtx.lineTo(x, y);
  
  canvasCtx.strokeStyle = isEraserActive ? '#ffffff' : brushColor;
  canvasCtx.lineWidth = brushSize;
  canvasCtx.lineCap = 'round';
  canvasCtx.lineJoin = 'round';
  
  canvasCtx.stroke();
  
  lastDrawX = x;
  lastDrawY = y;
}

function stopDrawing() {
  isDrawing = false;
}

// ==========================================================================
// 10. Rendering Engine (Grids, Checklists & Hashtags)
// ==========================================================================

function renderNotes() {
  renderAppView();
}

function renderNotesPage() {
  const settingsPageEl = document.getElementById('settings-page');
  const prodPageEl = document.getElementById('productivity-page');
  
  if (settingsPageEl) settingsPageEl.style.display = 'none';
  if (prodPageEl) prodPageEl.style.display = 'none';
  
  if (creatorWrapper) {
    creatorWrapper.style.display = (currentPage === 'notes') ? '' : 'none';
  }
  if (feedFilterRow) feedFilterRow.style.display = '';
  if (notesFeed) notesFeed.style.display = '';
  if (currentPage !== 'notes') {
    setActiveSidebarPage(currentPage);
  } else if (!selectedFolderFilter && !selectedTagFilter) {
    setActiveSidebarPage('notes');
  }

  const query = searchInput.value.toLowerCase().trim();
  const pageNotes = getPageNotes(currentPage);
  
  // Apply Search + Tag filters
  const filteredNotes = pageNotes.filter(note => {
    
    if (selectedFolderFilter && !noteHasFolder(note, selectedFolderFilter)) return false;

    // Tag filter matching
    if (selectedTagFilter) {
      const tags = extractHashtags(`${note.title || ''} ${note.text || ''}`);
      if (!tags.includes(selectedTagFilter)) return false;
    }

    if (selectedTypeFilter !== 'all') {
      const noteKind = getVisualNoteType(note);
      if (noteKind !== selectedTypeFilter) return false;
    }
    
    // Search query matching
    if (query === '') return true;
    return (note.title || '').toLowerCase().includes(query) || (note.text || '').toLowerCase().includes(query);
  });

  const pinnedList = filteredNotes.filter(n => n.pinned);
  const othersList = filteredNotes.filter(n => !n.pinned);

  renderGrid(pinnedGrid, pinnedList);
  renderGrid(othersGrid, othersList);

  // Section Headers
  pinnedSection.style.display = pinnedList.length > 0 ? 'flex' : 'none';

  if (othersList.length > 0) {
    othersSection.style.display = 'flex';
    othersSectionTitle.style.display = pinnedList.length > 0 ? 'block' : 'none';
  } else {
    othersSection.style.display = 'none';
  }

  // Handle Empty State
  if (filteredNotes.length === 0) {
    emptyState.style.display = 'flex';
    let emptyCopy = 'Notes you add appear here';
    if (currentPage === 'archive') {
      emptyCopy = 'Archived notes appear here';
    } else if (currentPage === 'deleted') {
      emptyCopy = 'Deleted notes appear here until you restore or remove them forever';
    } else if (selectedTagFilter) {
      emptyCopy = `No notes tagged #${selectedTagFilter}`;
    }
    emptyState.querySelector('.empty-text').textContent =
      query !== '' ? 'No matching notes found' : emptyCopy;
  } else {
    emptyState.style.display = 'none';
  }

  // Sidebar tag listing update
  renderSidebarFolders();
  renderFolderSuggestions();
  renderSidebarTags();
}

function getLocalDateKey(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getReminderNotes(noteList = notes) {
  return (noteList || [])
    .filter(note => isActiveNote(note) && note.reminder && !Number.isNaN(new Date(note.reminder).getTime()))
    .sort((a, b) => new Date(a.reminder).getTime() - new Date(b.reminder).getTime());
}

function getChecklistStats(note) {
  const lines = `${note?.text || ''}`.split('\n');
  const checklistLines = lines.filter(line => line.startsWith('- [ ] ') || line.startsWith('- [x] '));
  const total = checklistLines.length;
  const completed = checklistLines.filter(line => line.startsWith('- [x] ')).length;
  const remaining = Math.max(0, total - completed);
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining, progressPercent };
}

function isTaskNote(note) {
  if (!note || !isActiveNote(note)) return false;
  const noteKind = getVisualNoteType(note);
  if (noteKind === 'checklist') return true;
  const tags = extractHashtags(`${note.title || ''} ${note.text || ''}`);
  return tags.includes('task') || tags.includes('todo');
}

function isTaskCompleted(note) {
  const stats = getChecklistStats(note);
  if (stats.total > 0) return stats.remaining === 0;
  const tags = extractHashtags(`${note.title || ''} ${note.text || ''}`);
  return tags.includes('done');
}

function getTaskNotes(noteList = notes) {
  return (noteList || []).filter(note => isActiveNote(note) && isTaskNote(note));
}

function getProductivityDates(noteList = notes) {
  return (noteList || []).filter(note => isActiveNote(note)).reduce((acc, note) => {
    const reminderKeys = new Set();
    const noteReminderKey = getNoteReminderDateKey(note);
    if (noteReminderKey) reminderKeys.add(noteReminderKey);
    getTaskInlineReminderDateKeys(note).forEach(dateKey => reminderKeys.add(dateKey));

    reminderKeys.forEach(dateKey => {
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(note);
    });
    return acc;
  }, {});
}

function getNoteTypeAccent(kind) {
  const accents = {
    text: '#ec4899',
    checklist: '#22c55e',
    bookmark: '#3b82f6',
    voice: '#d946ef',
    recipe: '#f97316',
    image: '#8b5cf6'
  };
  return accents[kind] || '#94a3b8';
}

function getNoteCreatedDateKey(note) {
  return getLocalDateKey(note?.createdAt || note?.updatedAt || Date.now());
}

function getNoteReminderDateKey(note) {
  return note?.reminder ? getLocalDateKey(note.reminder) : '';
}

function getTaskInlineReminderEntries(note) {
  if (!note || !isTaskNote(note)) return [];
  return `${note.text || ''}`
    .split('\n')
    .map(line => {
      const isChecklistLine = line.startsWith('- [ ] ') || line.startsWith('- [x] ');
      if (!isChecklistLine) return null;
      const rawContent = line.substring(6);
      const reminder = extractChecklistInlineReminder(rawContent);
      if (!reminder) return null;
      const label = cleanTextTags(stripChecklistInlineReminder(rawContent)).trim();
      return {
        reminder,
        dateKey: getLocalDateKey(reminder),
        label: label || cleanTitleTags(note.title || 'Untitled task'),
        completed: line.startsWith('- [x] ')
      };
    })
    .filter(entry => entry && entry.dateKey);
}

function getTaskInlineReminderDateKeys(note) {
  return [...new Set(getTaskInlineReminderEntries(note).map(entry => entry.dateKey))];
}

function getTaskPrimaryReminder(note) {
  if (note?.reminder) return note.reminder;
  const taskEntries = getTaskInlineReminderEntries(note)
    .slice()
    .sort((a, b) => new Date(a.reminder).getTime() - new Date(b.reminder).getTime());
  return taskEntries[0]?.reminder || '';
}

function getDayCollections(dateKey) {
  const relevantNotes = notes.filter(note => isActiveNote(note));
  const agenda = relevantNotes.filter(note => getNoteReminderDateKey(note) === dateKey);
  const todo = relevantNotes.filter(note => isTaskNote(note) && (
    getNoteReminderDateKey(note) === dateKey ||
    getTaskInlineReminderDateKeys(note).includes(dateKey) ||
    getNoteCreatedDateKey(note) === dateKey
  ));
  const created = relevantNotes.filter(note => getNoteCreatedDateKey(note) === dateKey);
  return {
    agenda,
    todo,
    created
  };
}

function getDayDotTypes(dateKey) {
  const collections = getDayCollections(dateKey);
  const seen = new Set();
  return [...collections.agenda, ...collections.todo, ...collections.created].reduce((acc, note) => {
    const kind = getVisualNoteType(note);
    if (seen.has(kind)) return acc;
    seen.add(kind);
    acc.push(kind);
    return acc;
  }, []);
}

function getTaskSortWeight(note) {
  const primaryReminder = getTaskPrimaryReminder(note);
  const reminderDate = primaryReminder ? new Date(primaryReminder) : null;
  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const reminderKey = reminderDate && !Number.isNaN(reminderDate.getTime()) ? getLocalDateKey(reminderDate) : null;
  const completed = isTaskCompleted(note);

  if (completed) return 4;
  if (reminderDate && reminderDate.getTime() <= now.getTime()) return 0;
  if (reminderKey === todayKey) return 0;
  if (reminderDate) return 1;
  return 2;
}

function getFilteredProductivityTasks() {
  const query = searchInput.value.toLowerCase().trim();
  const todayKey = getLocalDateKey(new Date());
  return getTaskNotes()
    .filter(note => {
      if (query === '') return true;
      return `${note.title || ''} ${note.text || ''}`.toLowerCase().includes(query);
    })
    .filter(note => {
      const reminderKey = getTaskPrimaryReminder(note) ? getLocalDateKey(getTaskPrimaryReminder(note)) : '';
      const completed = isTaskCompleted(note);
      switch (selectedProductivityTaskFilter) {
        case 'today':
          return reminderKey === todayKey;
        case 'upcoming':
          return reminderKey && reminderKey > todayKey && !completed;
        case 'nodate':
          return !reminderKey && !completed;
        case 'completed':
          return completed;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const weightDiff = getTaskSortWeight(a) - getTaskSortWeight(b);
      if (weightDiff !== 0) return weightDiff;
      const aPrimaryReminder = getTaskPrimaryReminder(a);
      const bPrimaryReminder = getTaskPrimaryReminder(b);
      const aTime = aPrimaryReminder ? new Date(aPrimaryReminder).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bPrimaryReminder ? new Date(bPrimaryReminder).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

function formatCalendarDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

function getTaskPreviewLabel(note) {
  const lines = `${note?.text || ''}`
    .split('\n')
    .map(line => stripChecklistInlineReminder(line.replace(/^- \[(?: |x)\]\s*/, '')).trim())
    .filter(Boolean);
  return cleanTextTags(lines[0] || note?.title || 'Untitled task');
}

function getTaskPreviewSchedule(note, dateKey = '') {
  const inlineMatch = getTaskInlineReminderEntries(note).find(entry => entry.dateKey === dateKey);
  if (inlineMatch?.reminder) return formatReminderDate(inlineMatch.reminder);
  const primaryReminder = getTaskPrimaryReminder(note);
  return primaryReminder ? formatReminderDate(primaryReminder) : '';
}



function renderGrid(gridContainer, notesArray) {
  gridContainer.innerHTML = '';
  
  const validNotes = (notesArray || []).filter(note => note !== null && typeof note === 'object' && note.id);
  
  validNotes.forEach(note => {
    const card = document.createElement('div');
    const noteKind = getVisualNoteType(note);
    card.className = 'note-card';
    applyNoteAppearance(card, note);
    card.setAttribute('data-note-kind', noteKind);
    if (note.image || note.videoId) card.setAttribute('data-has-image', 'true');
    card.setAttribute('data-id', note.id);

    const boardHeader = document.createElement('div');
    boardHeader.className = 'note-board-header';
    const boardTitle = document.createElement('span');
    boardTitle.className = 'note-board-title';
    boardTitle.textContent = getFolderSummaryLabel(note, getVisualTypeLabel(noteKind));
    const boardHeaderMeta = document.createElement('div');
    boardHeaderMeta.className = 'note-board-meta';
    const boardAccent = document.createElement('span');
    boardAccent.className = 'note-board-accent';
    boardAccent.textContent = getVisualTypeLabel(noteKind);
    boardHeader.appendChild(boardTitle);
    boardHeader.appendChild(boardHeaderMeta);
    card.appendChild(boardHeader);

    const surface = document.createElement('div');
    surface.className = 'note-surface';
    card.appendChild(surface);
    
    // 1. Image Banner
    const bannerImage = note.image || null;
    if (bannerImage) {
      const banner = document.createElement('div');
      banner.className = 'card-image-banner';
      banner.innerHTML = `<img src="${bannerImage}" alt="Note banner" loading="lazy">`;
      banner.addEventListener('click', (e) => {
        e.stopPropagation();
        openImageViewer(bannerImage, cleanTitleTags(note.title || 'Note image'));
      });
      surface.appendChild(banner);
    }

    const cardMenu = document.createElement('div');
    cardMenu.className = 'note-card-menu';

    const menuToggle = document.createElement('button');
    menuToggle.className = 'icon-btn note-card-menu-toggle';
    menuToggle.setAttribute('aria-label', 'More note actions');
    menuToggle.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
      </svg>
    `;
    cardMenu.appendChild(menuToggle);

    const menuPanelEl = document.createElement('div');
    menuPanelEl.className = 'note-card-menu-panel';
    cardMenu.appendChild(menuPanelEl);
    boardHeaderMeta.appendChild(boardAccent);
    boardHeaderMeta.appendChild(cardMenu);

    // 3. Title (if not empty)
    const titleVal = note.title || '';
    if (titleVal.trim() !== '') {
      const titleEl = document.createElement('h4');
      titleEl.className = 'note-title';
      titleEl.textContent = cleanTitleTags(titleVal);
      surface.appendChild(titleEl);
    }

    const previewBody = document.createElement('div');
    previewBody.className = 'note-card-preview-body';
    surface.appendChild(previewBody);

    // 4. Content (Checklist vs Plain Text)
    note.type = note.recipeData || note.type === 'recipe' ? 'recipe' : getNoteType(note.text || '');
    const contentEl = renderNoteContent(note, {
      cleanTextTags,
      currentEditingNoteId: () => currentEditingNoteId,
      modalText: () => modalText,
      renderNotes,
      renderTextWithLinksFromApp: (text) => renderTextWithLinks(text, URL_REGEX),
      saveToLocalStorage,
      syncModalInputs,
      urlRegex: URL_REGEX,
      appSettings: () => appSettings
    });
    if (contentEl) {
      previewBody.appendChild(contentEl);
    }

    // 4.5 Audio Voice Note player rendering
    if (note.audio) {
      const audioChip = document.createElement('div');
      audioChip.className = 'audio-player-chip';
      audioChip.addEventListener('click', (e) => e.stopPropagation()); // prevent modal open
      
      const playBtn = document.createElement('button');
      playBtn.className = 'audio-play-btn';
      playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      
      const visualizer = document.createElement('div');
      visualizer.className = 'audio-wave-visualizer';
      for (let w = 0; w < 8; w++) {
        const bar = document.createElement('div');
        bar.className = 'audio-wave-bar';
        visualizer.appendChild(bar);
      }
      
      const durationLabel = document.createElement('span');
      durationLabel.className = 'audio-duration-label';
      durationLabel.textContent = `0:00 / ${note.audioDuration || '0:05'}`;
      
      let audioObj = null;
      let playInterval = null;
      
      playBtn.addEventListener('click', () => {
        if (audioObj && !audioObj.paused) {
          audioObj.pause();
          playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
          audioChip.classList.remove('playing');
          clearInterval(playInterval);
        } else {
          if (!audioObj) {
            audioObj = new Audio(note.audio);
            audioObj.addEventListener('ended', () => {
              playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
              audioChip.classList.remove('playing');
              durationLabel.textContent = `0:00 / ${note.audioDuration || '0:05'}`;
              clearInterval(playInterval);
              audioObj = null;
            });
          }
          
          audioObj.play();
          playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
          audioChip.classList.add('playing');
          
          playInterval = setInterval(() => {
            if (audioObj) {
              const curMin = Math.floor(audioObj.currentTime / 60);
              const curSec = Math.floor(audioObj.currentTime % 60).toString().padStart(2, '0');
              durationLabel.textContent = `${curMin}:${curSec} / ${note.audioDuration || '0:05'}`;
            }
          }, 250);
        }
      });
      
      audioChip.appendChild(playBtn);
      audioChip.appendChild(visualizer);
      audioChip.appendChild(durationLabel);
      const downloadAudioBtn = document.createElement('button');
      downloadAudioBtn.className = 'media-action-btn';
      downloadAudioBtn.type = 'button';
      downloadAudioBtn.textContent = 'Download';
      downloadAudioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadDataUrl(note.audio, `${getSafeFileName(note.title || 'voice-note')}.${getDataUrlExtension(note.audio, 'webm')}`);
      });
      audioChip.appendChild(downloadAudioBtn);
      previewBody.appendChild(audioChip);
    }

    renderNoteFileAttachments(previewBody, note, { compact: true });

    // 5. Dynamic Tag Badges & Reminders rendering inside note cards
    const tags = extractHashtags(`${note.title} ${note.text}`);
    if (tags.length > 0 || note.reminder) {
      const tagList = document.createElement('div');
      tagList.className = 'note-tags-list';
      
      // Prepend reminder chip if set
      if (note.reminder) {
        const chip = document.createElement('span');
        chip.className = 'reminder-chip';
        chip.innerHTML = `
          <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          <span>${formatReminderDate(note.reminder)}</span>
          <span class="reminder-chip-delete" title="Delete reminder">✕</span>
        `;
        chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          note.reminder = null;
          note.reminderTriggered = false;
          saveToLocalStorage();
          renderNotes();
        });
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('reminder-chip-delete')) return;
          e.stopPropagation();
          openEditModal(note);
        });
        tagList.appendChild(chip);
      }

      tags.forEach(tag => {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.textContent = `#${tag}`;
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          currentPage = 'notes';
          selectedTagFilter = tag;
          selectedFolderFilter = null;
          // Sync sidebar active styling
          document.querySelectorAll('.sidebar-item').forEach(el => {
            const lbl = el.querySelector('.sidebar-label');
            if (lbl && lbl.textContent === `#${tag}`) {
              el.classList.add('active');
            } else {
              el.classList.remove('active');
            }
          });
          renderAppView();
        });
        tagList.appendChild(badge);
      });
      previewBody.appendChild(tagList);
    }

    // 5.5 Link Preview Box rendering
    const firstUrl = getFirstUrlInText(note.text);
    if (firstUrl) {
      const domain = extractDomain(firstUrl);
      const cleanDomain = domain.replace(/^www\./, '');
      const mediaKind = getMediaKindFromUrl(firstUrl);
      const mockMeta = getLinkMetadata(firstUrl, note);

      if (mediaKind) {
        const mediaBox = document.createElement('div');
        mediaBox.className = `link-preview-box media-link-preview type-${mediaKind}`;
        mediaBox.addEventListener('click', (e) => e.stopPropagation());
        const media = document.createElement(mediaKind);
        media.className = 'link-media-player';
        media.src = firstUrl;
        media.controls = true;
        media.preload = 'metadata';
        if (mediaKind === 'video') media.playsInline = true;
        mediaBox.innerHTML = `
          <div class="link-preview-info">
            <div class="link-preview-title">${mediaKind === 'video' ? 'Video link' : 'Audio link'}</div>
            <a class="link-preview-url" href="${escapeHtml(firstUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>
          </div>
        `;
        mediaBox.prepend(media);
        previewBody.appendChild(mediaBox);
      } else {
        const previewBox = document.createElement('a');
        previewBox.href = firstUrl;
        previewBox.target = '_blank';
        previewBox.rel = 'noopener noreferrer';
        previewBox.className = 'link-preview-box';
        previewBox.addEventListener('click', (e) => e.stopPropagation());

        if (mockMeta) {
        previewBox.className = 'link-preview-box rich';
        const cover = document.createElement('img');
        cover.className = 'link-preview-cover';
        cover.src = mockMeta.image;
        cover.alt = `${mockMeta.title} preview`;
        cover.loading = 'lazy';
        cover.addEventListener('error', () => {
          cover.src = createPreviewFallbackImage(cleanDomain, mockMeta.title);
        }, { once: true });

        const richContent = document.createElement('div');
        richContent.className = 'link-preview-rich-content';
        richContent.innerHTML = `
          <div class="link-preview-domain">${escapeHtml(cleanDomain)}</div>
          <div class="link-preview-rich-title">${escapeHtml(mockMeta.title)}</div>
          <div class="link-preview-rich-desc">${escapeHtml(mockMeta.description)}</div>
          <div class="link-preview-badge">
            <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; margin-right: 2px;"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            ${escapeHtml(mockMeta.badge)}
          </div>
        `;
        previewBox.appendChild(cover);
        previewBox.appendChild(richContent);
        } else {
        previewBox.className = 'link-preview-box';
        previewBox.innerHTML = `
          <svg class="link-preview-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <div class="link-preview-info">
            <div class="link-preview-title">${escapeHtml(domain || 'Visit Link')}</div>
            <div class="link-preview-url">${escapeHtml(firstUrl)}</div>
          </div>
        `;
        }
        previewBody.appendChild(previewBox);
      }
    }

    // 6. Overflow Actions Menu
    const colorBtn = document.createElement('button');
    colorBtn.className = 'note-card-menu-action';
    colorBtn.setAttribute('aria-label', 'Change note theme');
    colorBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01l-.23-.25a.3.3 0 0 1-.03-.17c0-.09.06-.15.15-.15H15a6 6 0 0 0 6-6c0-4.97-4.03-9-9-9zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
      <span>Theme</span>
    `;
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openThemePickerV2({ type: 'note', note });
    });
    menuPanelEl.appendChild(colorBtn);

    if (getFirstUrlFromSharedText(note.title || '', note.text || '', note.recipeSourceUrl || '')) {
      const parseLinkBtn = document.createElement('button');
      parseLinkBtn.className = 'note-card-menu-action';
      parseLinkBtn.setAttribute('aria-label', 'Parse link metadata');
      parseLinkBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        <span>Parse Link</span>
      `;
      parseLinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        parseExistingNoteLink(note);
      });
      menuPanelEl.appendChild(parseLinkBtn);
    }

    if (note.recipeData) {
      const recipeBuilderBtn = document.createElement('button');
      recipeBuilderBtn.className = 'note-card-menu-action';
      recipeBuilderBtn.setAttribute('aria-label', 'Open recipe builder');
      recipeBuilderBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M7 2h2v8a2 2 0 1 1-2 0V2Zm8 0h2v7h1v2h-1v11h-2V11h-1V9h1V2Zm-5 12h4v2h-4v6H8v-6H4v-2h4v-2h2v2Z"/></svg>
        <span>Recipe Builder</span>
      `;
      recipeBuilderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllNoteCardMenus();
        openRecipeModal(note);
      });
      menuPanelEl.appendChild(recipeBuilderBtn);
    }

    if (!note.deleted) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'note-card-menu-action';
      shareBtn.setAttribute('aria-label', 'Share note');
      shareBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.2 3.2 0 0 0 0-1.39l7.05-4.11A3 3 0 1 0 15 5c0 .22.02.43.07.64L8.02 9.75a3 3 0 1 0 0 4.5l7.12 4.17c-.04.18-.06.37-.06.58a2.92 2.92 0 1 0 2.92-2.92Z"/></svg>
        <span>Share</span>
      `;
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllNoteCardMenus();
        openShareSheet(note);
      });
      menuPanelEl.appendChild(shareBtn);

      const pinBtn = document.createElement('button');
      pinBtn.className = 'note-card-menu-action';
      pinBtn.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
      pinBtn.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2zM9.8 4h4.4v8H9.8V4z" />
        </svg>
        <span>${note.pinned ? 'Unpin' : 'Pin'}</span>
      `;
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.pinned = !note.pinned;
        saveToLocalStorage();
        closeAllNoteCardMenus();
        renderNotes();
      });
      menuPanelEl.appendChild(pinBtn);
    }

    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'note-card-menu-action';
    if (note.deleted) {
      archiveBtn.setAttribute('aria-label', 'Restore note');
      archiveBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-5.65-4H4.26A8 8 0 0 0 12 23a8 8 0 0 0 0-16Z"/></svg>
        <span>Restore</span>
      `;
      archiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreDeletedNote(note.id);
      });
    } else if (note.archived) {
      archiveBtn.setAttribute('aria-label', 'Restore from archive');
      archiveBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-5.65-4H4.26A8 8 0 0 0 12 23a8 8 0 0 0 0-16Z"/></svg>
        <span>Restore</span>
      `;
      archiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreArchivedNote(note.id);
      });
    } else {
      archiveBtn.setAttribute('aria-label', 'Archive note');
      archiveBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M20.54 5.23 19.15 3.55A2 2 0 0 0 17.61 3H6.39a2 2 0 0 0-1.54.55L3.46 5.23A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.46-1.27ZM6.24 5h11.52l.81 1H5.43l.81-1ZM12 17l-4-4h2.5v-3h3v3H16l-4 4Z"/></svg>
        <span>Archive</span>
      `;
      archiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        archiveNote(note.id);
      });
    }
    menuPanelEl.appendChild(archiveBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'note-card-menu-action danger';
    deleteBtn.setAttribute('aria-label', note.deleted ? 'Delete forever' : 'Move note to delete page');
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      <span>${note.deleted ? 'Delete Forever' : 'Move to Trash'}</span>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (note.deleted) {
        deleteNotePermanently(note.id);
      } else {
        trashNote(note.id);
      }
    });
    menuPanelEl.appendChild(deleteBtn);

    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = cardMenu.classList.contains('open');
      closeAllNoteCardMenus();
      if (!isOpen) {
        cardMenu.classList.add('open');
      }
    });

    const stamp = document.createElement('div');
    stamp.className = 'note-stamp';
    stamp.textContent = formatCardTimestamp(note.updatedAt);
    surface.appendChild(stamp);

    // Open Edit Modal on Click
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.icon-btn') && !e.target.closest('.note-card-menu-action') && !e.target.closest('.color-picker-bubble') && !e.target.closest('.checklist-checkbox')) {
        if (!supportsHoverPreview()) {
          if (!card.classList.contains('touch-expanded')) {
            collapseExpandedTouchCards();
            card.classList.add('touch-expanded');
            return;
          }
          card.classList.remove('touch-expanded');
        }
        openEditModal(note);
      }
    });

    gridContainer.appendChild(card);
  });
}

// Helper to render lists inside note cards (separated & collapsible completed section)
function legacyRenderChecklistMarkup(note) {
  const container = document.createElement('div');
  container.className = 'checklist-container';
  
  const lines = note.text.split('\n');
  const uncheckedRows = [];
  const checkedRows = [];
  
  lines.forEach((line, index) => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const checked = line.startsWith('- [x] ');
      const cleanText = line.substring(6);
      
      const row = document.createElement('div');
      row.className = 'checklist-row';
      
      const checkbox = document.createElement('div');
      checkbox.className = `checklist-checkbox ${checked ? 'checked' : ''}`;
      checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const newPrefix = checked ? '- [ ] ' : '- [x] ';
        lines[index] = newPrefix + cleanText;
        note.text = lines.join('\n');
        
        debouncedSave();
        renderNotes();
        
        // Sync open modal if editing this note
        if (currentEditingNoteId === note.id) {
          modalText.value = note.text;
          syncModalInputs(note);
        }
      });

      const label = document.createElement('span');
      label.className = `checklist-text ${checked ? 'checked' : ''}`;
      label.appendChild(renderTextWithLinks(cleanText));

      row.appendChild(checkbox);
      row.appendChild(label);
      
      if (checked) {
        checkedRows.push(row);
      } else {
        uncheckedRows.push(row);
      }
    } else if (line.trim() !== '') {
      // Plain text row inside lists
      const row = document.createElement('div');
      row.className = 'checklist-row';
      row.style.paddingLeft = '28px'; // Align with checkbox labels
      row.textContent = line;
      uncheckedRows.push(row);
    }
  });

  // Append active list items
  uncheckedRows.forEach(row => container.appendChild(row));

  // Collapsible completed items list
  if (checkedRows.length > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRows.length} completed item${checkedRows.length > 1 ? 's' : ''}</span>
    `;
    
    const body = document.createElement('div');
    body.className = 'completed-items-body';
    checkedRows.forEach(row => body.appendChild(row));
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = body.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });
    
    container.appendChild(header);
    container.appendChild(body);
  }

  return container;
}

// Clean title/text of raw tags for presentation
function cleanTitleTags(title) {
  return title.replace(/#[a-zA-Z0-9]+/g, '').trim();
}

function cleanTextTags(text) {
  return text.split('\n')
    .map(line => line.replace(/#[a-zA-Z0-9]+/g, '').trim())
    .join('\n')
    .trim();
}

function extractHashtags(combinedText) {
  const tagsSet = new Set();
  const words = combinedText.split(/[\s,]+/);
  words.forEach(word => {
    if (word.startsWith('#') && word.length > 2) {
      const clean = word.substring(1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (clean) tagsSet.add(clean);
    }
  });
  return Array.from(tagsSet);
}

// ==========================================================================
// 11. Note Modal Editor Upgraded logic
// ==========================================================================

function openEditModal(note) {
  currentEditingNoteId = note.id;

  const modalAdvancedHeader = document.getElementById('modal-advanced-header');
  const modalFloatingToolbar = document.getElementById('modal-floating-toolbar');
  const modalMetadata = document.getElementById('modal-metadata');

  if (appSettings.advancedEditorEnabled) {
    editModalCard.classList.add('advanced-editor-active');
    if (modalAdvancedHeader) modalAdvancedHeader.style.display = 'flex';
    if (modalFloatingToolbar) modalFloatingToolbar.style.display = 'flex';
    if (modalMetadata) modalMetadata.style.display = 'block';
  } else {
    editModalCard.classList.remove('advanced-editor-active');
    if (modalAdvancedHeader) modalAdvancedHeader.style.display = 'flex';
    if (modalFloatingToolbar) modalFloatingToolbar.style.display = 'none';
    if (modalMetadata) modalMetadata.style.display = 'none';
  }

  if (!document.getElementById('modal-folder')) {
    const folderField = document.createElement('div');
    folderField.className = 'modal-folder-field';
    folderField.innerHTML = `
      <div class="modal-folder-label">Categories</div>
      <button type="button" class="modal-folder-trigger" id="modal-folder-trigger" aria-expanded="false"></button>
      <div class="modal-folder-options" id="modal-folder-options"></div>
      <label class="modal-folder-custom">
        <span class="modal-folder-custom-icon">${getFolderIconSvg('folder')}</span>
        <input type="text" id="modal-folder-custom" placeholder="Add category" autocomplete="off">
      </label>
      <input type="hidden" id="modal-folder">
    `;
    const folderSection = document.getElementById('modal-popover-folder-section');
    if (folderSection) {
      folderSection.appendChild(folderField);
    } else {
      editModalCard.querySelector('.modal-footer')?.insertAdjacentElement('beforebegin', folderField);
    }
  }

  modalFolderField = editModalCard.querySelector('.modal-folder-field');
  modalFolderInput = document.getElementById('modal-folder');
  modalFolderTrigger = document.getElementById('modal-folder-trigger');
  modalFolderOptions = document.getElementById('modal-folder-options');
  modalFolderCustomInput = document.getElementById('modal-folder-custom');

  if (modalFolderTrigger && !modalFolderTrigger.dataset.bound) {
    modalFolderTrigger.addEventListener('click', () => {
      if (isInlineModalFolderPicker()) return;
      const willOpen = !modalFolderField?.classList.contains('is-open');
      modalFolderField?.classList.toggle('is-open', willOpen);
      modalFolderTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    modalFolderTrigger.dataset.bound = 'true';
  }
  if (modalFolderCustomInput && !modalFolderCustomInput.dataset.bound) {
    modalFolderCustomInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const customFolder = modalFolderCustomInput.value.trim();
      if (!customFolder) return;
      setModalFolderValue([...getSelectedFolders(decodeFolderSelection(modalFolderInput?.value || '')), customFolder], { preserveDraft: false });
      closeModalFolderPicker();
    });
    modalFolderCustomInput.addEventListener('blur', () => {
      const customFolder = modalFolderCustomInput.value.trim();
      if (!customFolder) return;
      setModalFolderValue([...getSelectedFolders(decodeFolderSelection(modalFolderInput?.value || '')), customFolder], { preserveDraft: false });
    });
    modalFolderCustomInput.dataset.bound = 'true';
  }
  
  modalTitle.value = note.title;
  modalText.value = note.text;
  setModalFolderValue(getNoteFolders(note));
  closeModalFolderPicker();
  
  syncModalInputs(note);
  
  applyNoteAppearance(editModalCard, note);
  modalPin.classList.toggle('pinned', note.pinned);

  // Set Theme Preview label
  const activeTheme = note.theme || 'none';
  const themePreset = THEME_PRESETS.find(t => t.id === activeTheme);
  const themeValEl = document.getElementById('modal-theme-preview-val');
  if (themeValEl) {
    themeValEl.textContent = themePreset ? `${themePreset.title} ${themePreset.emoji}` : 'None';
  }

  // Set Reminder Preview label
  const reminderVal = note.reminder ? new Date(note.reminder).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'None';
  const reminderValEl = document.getElementById('modal-reminder-preview-val');
  if (reminderValEl) {
    reminderValEl.textContent = reminderVal;
  }

  // Set Favorite button state
  const favLabel = document.getElementById('modal-favorite-label');
  const favBtn = document.getElementById('modal-favorite');
  if (favLabel) favLabel.textContent = note.favorite ? 'Unfavorite' : 'Favorite';
  favBtn?.classList.toggle('active', !!note.favorite);

  // Set Lock button state
  const lockLabel = document.getElementById('modal-lock-label');
  const lockBtn = document.getElementById('modal-lock');
  if (lockLabel) lockLabel.textContent = note.locked ? 'Unlock Note' : 'Lock Note';
  lockBtn?.classList.toggle('active', !!note.locked);

  // Set Archive button state
  const archiveLabel = document.getElementById('modal-archive-label');
  const archiveBtn = document.getElementById('modal-archive');
  if (archiveLabel) archiveLabel.textContent = note.archived ? 'Send to Feed' : 'Archive Note';
  archiveBtn?.classList.toggle('active', !!note.archived);

  modalDelete.setAttribute('aria-label', note.deleted ? 'Delete forever' : 'Move note to delete page');
  modalDelete.setAttribute('title', note.deleted ? 'Delete forever' : 'Move to delete page');

  // Setup modal banner preview
  if (note.image) {
    modalImgPreview.src = note.image;
    modalImageBanner.style.display = 'block';
    modalImgPreview.onclick = (e) => {
      e.stopPropagation();
      openImageViewer(note.image, cleanTitleTags(note.title || 'Note image'));
    };
  } else {
    modalImageBanner.style.display = 'none';
    modalImgPreview.src = '';
    modalImgPreview.onclick = null;
  }
  
  // Render tag badges inside modal
  renderModalTags(note);
  renderModalReminderChip(note);
  renderModalAudioPreview(note);
  renderModalFileAttachments(note);

  // Seed the live markdown mirror
  requestAnimationFrame(() => {
    updateEditorMirror(modalText, document.getElementById('modal-text-mirror'));
  });
  
  // Rebuild modal color picker dynamically
  buildColorGrid(modalColorPicker, note.color, note.theme, note.customTheme, (type, value) => {
    applyAppearanceSelection(note, type, value);
    applyNoteAppearance(editModalCard, note);
    debouncedSave();
    renderNotes();
    modalColorPicker.classList.remove('visible');
  });

  // Modal reminder popover click trigger
  const modalReminderBtn = document.getElementById('modal-reminder-btn');
  const modalReminderPicker = document.getElementById('modal-reminder-picker');
  
  modalReminderBtn.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-picker-bubble, .reminder-picker-bubble').forEach(p => {
      if (p !== modalReminderPicker) p.classList.remove('visible');
    });

    const modalChecklistEditor = document.getElementById('modal-checklist-editor');
    const activeChecklistIndex = modalChecklistEditor?.style.display !== 'none'
      ? getActiveChecklistRowIndex(modalChecklistEditor)
      : -1;
    const activeChecklistLine = activeChecklistIndex >= 0
      ? (note.text.split('\n')[activeChecklistIndex] || '')
      : '';
    const activeChecklistReminder = activeChecklistIndex >= 0
      ? extractChecklistInlineReminder(activeChecklistLine.substring(6))
      : '';

    buildReminderPicker(modalReminderPicker, activeChecklistReminder || note.reminder, (dateTime) => {
      if (activeChecklistIndex >= 0) {
        note.text = applyInlineReminderToChecklistText(note.text, activeChecklistIndex, dateTime);
        note.type = note.recipeData ? 'recipe' : getNoteType(note.text);
        modalText.value = note.text;
        debouncedSave();
        renderNotes();
        syncModalInputs(note);
      } else {
        note.reminder = dateTime;
        note.reminderTriggered = false;
        debouncedSave();
        renderNotes();
        renderModalReminderChip(note);
      }
      modalReminderPicker.classList.remove('visible');
    }, () => {
      if (activeChecklistIndex >= 0) {
        note.text = applyInlineReminderToChecklistText(note.text, activeChecklistIndex, '');
        note.type = note.recipeData ? 'recipe' : getNoteType(note.text);
        modalText.value = note.text;
        debouncedSave();
        renderNotes();
        syncModalInputs(note);
      } else {
        note.reminder = null;
        note.reminderTriggered = false;
        debouncedSave();
        renderNotes();
        renderModalReminderChip(note);
      }
      modalReminderPicker.classList.remove('visible');
    });
    modalReminderPicker.classList.toggle('visible');
  };

  // Set date metadata subtitle
  const dateObj = new Date(note.createdAt || Date.now());
  const dateStr = dateObj.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ' • ' + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (modalMetadata) {
    modalMetadata.textContent = dateStr;
  }

  // Set breadcrumbs folder
  const modalBreadcrumb = document.getElementById('modal-breadcrumb');
  if (modalBreadcrumb) {
    const folders = getNoteFolders(note);
    modalBreadcrumb.textContent = `${folders[0] || 'Personal'} / Ideas`;
  }

  // Render modal inspector popover contents
  renderModalPopoverCategories(note);
  renderModalPopoverColors(note);
  initModalPopoverReminder(note);

  // Close popover on open
  const modalMorePopover = document.getElementById('modal-more-popover');
  if (modalMorePopover) {
    modalMorePopover.style.display = 'none';
  }

  editModal.classList.add('visible');
  document.body.classList.add('editor-focus-mode');
  
  setTimeout(() => {
    modalText.style.height = 'auto';
    modalText.style.height = modalText.scrollHeight + 'px';
  }, 50);
}

function renderModalTags(note) {
  modalTagsContainer.innerHTML = '';
  const tags = extractHashtags(`${note.title} ${note.text}`);
  tags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.textContent = `#${tag}`;
    modalTagsContainer.appendChild(badge);
  });
}

function renderCreatorPopoverTags() {
  const container = document.getElementById('creator-popover-tags-container');
  if (!container) return;
  container.innerHTML = '';
  const text = (document.getElementById('creator-title')?.value || '') + ' ' + (document.getElementById('creator-text')?.value || '');
  const tags = extractHashtags(text);
  tags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.textContent = `#${tag}`;
    container.appendChild(badge);
  });
}

function duplicateNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  const newNote = JSON.parse(JSON.stringify(note));
  newNote.id = 'note-' + Date.now();
  newNote.title = note.title ? `${note.title} (Copy)` : 'Untitled Note (Copy)';
  newNote.createdAt = Date.now();
  newNote.updatedAt = Date.now();
  notes.unshift(newNote);
  saveToLocalStorage();
  renderNotes();
  showToast({ title: 'Note Duplicated', text: 'New copy created successfully.' });
}

function closeEditModal() {
  if (currentEditingNoteId) {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      const title = modalTitle.value.trim();
      const text = modalText.value.trim();
      
      if (isNoteEffectivelyEmpty(title, text, note.image, note.audio, note.files)) {
        trashNote(currentEditingNoteId);
      } else {
        note.title = title;
        note.text = text;
        setNoteFolders(note, decodeFolderSelection(modalFolderInput?.value || ''));
        registerNoteFolders(note);
        note.type = note.recipeData ? 'recipe' : getNoteType(text);
        note.updatedAt = Date.now();
        saveToLocalStorage();
        renderNotes();
      }
    }
  }
  
  currentEditingNoteId = null;
  editModalCard.classList.remove('properties-sheet-open');
  editModal.classList.remove('visible');
  document.body.classList.remove('editor-focus-mode');
  modalColorPicker.classList.remove('visible');
}

function deleteNote(id) {
  trashNote(id);
}

// ==========================================================================
// 12. Layout UI Toggle Handlers
// ==========================================================================

// Unused toggleTheme replaced by setTheme framework

function toggleViewLayout() {
  const isListView = pinnedGrid.classList.contains('list-view');
  if (isListView) {
    pinnedGrid.classList.remove('list-view');
    othersGrid.classList.remove('list-view');
    localStorage.setItem(STORAGE_KEYS.view, 'grid');
    document.getElementById('grid-icon').style.display = 'none';
    document.getElementById('list-icon').style.display = 'block';
  } else {
    pinnedGrid.classList.add('list-view');
    othersGrid.classList.add('list-view');
    localStorage.setItem(STORAGE_KEYS.view, 'list');
    document.getElementById('grid-icon').style.display = 'block';
    document.getElementById('list-icon').style.display = 'none';
  }
}

// ==========================================================================
// 13. Helpers
// ==========================================================================

// Debounced save — coalesces rapid sequential calls into one write (400ms window)
let _saveTimer;
function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveToLocalStorage, 400);
}

function saveToLocalStorage() {
  try {
    notes.forEach((note, index) => {
      setNoteFolders(note, getNoteFolders(note, inferDefaultFolder(note, index)));
    });
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(customFolders));
    hasShownStorageWarning = false;

    if (currentUser) {
      notes.forEach(note => {
        saveNoteToCloud(currentUser.uid, note).catch(err => {
          console.warn('Failed to sync note to cloud:', err);
        });
      });
    }

    return true;
  } catch (error) {
    console.warn('Unable to save notes to localStorage:', error);
    if (!hasShownStorageWarning && document.getElementById('toast-container')) {
      hasShownStorageWarning = true;
      showToast({
        title: 'Storage full',
        text: 'Notes could not be saved locally. Remove large images or voice clips and try again.'
      });
    }
    return false;
  }
}

function autoGrowTextarea() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
}

// ── Live Markdown Mirror ──────────────────────────────────────────────────────
function parseInlineMarkdown(raw) {
  if (!raw) return '';
  const lines = raw.split('\n');
  const htmlLines = lines.map(line => {
    // Headings
    if (/^### /.test(line)) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    if (/^## /.test(line))  return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (/^# /.test(line))   return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    // Blockquote
    if (/^> /.test(line))   return `<blockquote>${applyInline(line.slice(2))}</blockquote>`;
    // Bullet list (-, *, •)
    if (/^[-*•] /.test(line)) return `<span class="mirror-bullet">${applyInline(line.slice(2))}</span>`;
    // Numbered list
    const numMatch = line.match(/^(\d+)\. (.*)/);
    if (numMatch) return `<span class="mirror-num">${numMatch[1]}. ${applyInline(numMatch[2])}</span>`;
    // Code block fence (single line pass-through handled in multi-line below)
    if (/^```/.test(line)) return `<code>${escapeHtml(line.slice(3))}</code>`;
    // Empty line becomes visible space
    if (line.trim() === '') return '\n';
    return applyInline(line);
  });
  return htmlLines.join('\n');
}

function applyInline(text) {
  if (!text) return '';
  // Escape HTML first, then re-apply tags
  let s = escapeHtml(text);
  // Bold-italic ***text***
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text* or _text_
  s = s.replace(/(?<![*])\*([^*]+?)\*(?![*])/g, '<em>$1</em>');
  s = s.replace(/_([^_]+?)_/g, '<em>$1</em>');
  // Inline code `text`
  s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Underline <u>text</u> (HTML passthrough — already escaped, re-open)
  s = s.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>');
  // Strikethrough ~~text~~
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}


function updateEditorMirror(textarea, mirror) {
  if (!mirror) return;
  const raw = textarea.value;
  // Sync scroll position
  mirror.scrollTop = textarea.scrollTop;
  // Handle fenced code blocks as a unit
  let html = '';
  const segments = raw.split(/(```[\s\S]*?```)/g);
  segments.forEach(seg => {
    if (seg.startsWith('```') && seg.endsWith('```')) {
      const inner = seg.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
      html += `<pre><code>${escapeHtml(inner)}</code></pre>`;
    } else {
      html += parseInlineMarkdown(seg);
    }
  });
  // Trailing newline keeps mirror same height as textarea
  if (raw.endsWith('\n')) html += '\n';
  mirror.innerHTML = html;
}

// ── Portrait Tablet: Virtual Keyboard Height Compensation ─────────────────────
function onViewportResize() {
  const vvh = window.visualViewport?.height ?? window.innerHeight;
  const fullH = window.innerHeight;
  const keyboardH = fullH - vvh;
  const isPortraitTablet = window.matchMedia(
    '(min-width: 768px) and (max-width: 1024px)'
  ).matches;

  const card = document.getElementById('edit-modal-card');
  const creator = document.querySelector('.note-creator');

  if (isPortraitTablet) {
    if (keyboardH > 100) {
      // Keyboard visible — shrink to fit visible area
      const targetH = Math.max(vvh - 40, 320);
      if (card && card.closest('.edit-modal-overlay')?.style.display !== 'none') {
        card.style.height = targetH + 'px';
        card.style.maxHeight = targetH + 'px';
      }
      if (creator && creator.closest('.creator-wrapper')?.classList.contains('advanced-editor-active')) {
        creator.style.height = targetH + 'px';
        creator.style.maxHeight = targetH + 'px';
      }
    } else {
      // Keyboard dismissed — restore CSS defaults
      if (card) { card.style.height = ''; card.style.maxHeight = ''; }
      if (creator) { creator.style.height = ''; creator.style.maxHeight = ''; }
    }
  }
}

// Attach viewport resize listeners (runs once at startup)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportResize);
} else {
  window.addEventListener('resize', onViewportResize);
}



function getContinuingListPrefix(line) {
  const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (orderedMatch) {
    const [, indent, number, content] = orderedMatch;
    if (content.trim() === '') return '';
    return `${indent}${Number(number) + 1}. `;
  }

  const bulletMatch = line.match(/^(\s*)([-*•])\s+(.*)$/);
  if (bulletMatch) {
    const [, indent, bullet, content] = bulletMatch;
    if (content.trim() === '') return '';
    return `${indent}${bullet} `;
  }

  return null;
}

function handleRichListEditing(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;

  const textarea = event.currentTarget;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const currentLine = value.slice(lineStart, safeLineEnd);
  const nextPrefix = getContinuingListPrefix(currentLine);

  if (nextPrefix === null) return;

  event.preventDefault();

  if (nextPrefix === '') {
    const before = value.slice(0, lineStart);
    const after = value.slice(safeLineEnd);
    const joiner = after.startsWith('\n') ? '' : (after.length > 0 ? '\n' : '');
    textarea.value = `${before}${joiner}${after}`;
    const nextCaret = before.length;
    textarea.selectionStart = nextCaret;
    textarea.selectionEnd = nextCaret;
  } else {
    const before = value.slice(0, end);
    const after = value.slice(end);
    textarea.value = `${before}\n${nextPrefix}${after}`;
    const nextCaret = before.length + 1 + nextPrefix.length;
    textarea.selectionStart = nextCaret;
    textarea.selectionEnd = nextCaret;
  }

  autoGrowTextarea.call(textarea);
  if (textarea === creatorText) {
    syncCreatorInputs();
  }
}

/* ==========================================================================
   Upgraded Note Reminders & URL Parser Helpers
   ========================================================================== */
const URL_REGEX = /(https?:\/\/[^\s\n\r]+)/g;

function isNoteEffectivelyEmpty(title, text, image, audio, files = []) {
  return title === '' && text === '' && image === null && audio === null && normalizeNoteFiles(files).length === 0;
}

function legacyRenderTextWithLinks(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const [url] = match;
    const start = match.index;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = new URL(url).toString();
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      fragment.appendChild(anchor);
    } catch (e) {
      fragment.appendChild(document.createTextNode(url));
    }

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

function legacyRenderFormattedText(text) {
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(text);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    URL_REGEX.lastIndex = 0;
    if (!URL_REGEX.test(node.textContent)) return;
    const replacement = renderTextWithLinks(node.textContent);
    node.parentNode.replaceChild(replacement, node);
  });

  return template.content;
}

function getFirstUrlInText(text) {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : null;
}

function getFirstUrlFromSharedText(...values) {
  return getFirstUrlInText(values.filter(Boolean).join(' '));
}

function extractDomain(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch (e) {
    return '';
  }
}

function buildAutofillTextFromPreview(preview, url) {
  const parts = [];
  if (preview?.description) parts.push(preview.description);
  if (url) parts.push(url);
  return parts.join('\n\n').trim();
}

function shouldApplyLinkPreview(url) {
  if (!url || creatorLinkPreviewUrl === url) return false;
  return creatorExpanded.style.display !== 'none';
}

function applyCreatorLinkPreview(preview, sourceUrl) {
  if (!preview || sourceUrl !== getFirstUrlFromSharedText(creatorTitle.value, creatorText.value)) return;

  const intent = preview.intent || {};
  if (!creatorTitle.value.trim() && preview.title) {
    creatorTitle.value = preview.title;
  }

  const previewText = buildAutofillTextFromPreview(preview, sourceUrl);
  if (!creatorText.value.trim() && previewText) {
    creatorText.value = previewText;
  } else if (creatorText.value.trim() === sourceUrl && previewText) {
    creatorText.value = previewText;
  }

  if (!creatorImage && preview.image) {
    creatorImage = preview.image;
    creatorImgPreview.src = preview.image;
    creatorImageBanner.style.display = 'block';
  }

  if (intent.folder) {
    setCreatorFolderValue([intent.folder], { preserveDraft: true });
  }

  if (intent.noteType) {
    creatorIntentType = intent.noteType;
  }

  if (intent.theme && creatorColor === 'default' && !creatorTheme) {
    creatorTheme = intent.theme;
    creatorCustomTheme = null;
    applyCreatorAppearance();
  }

  syncCreatorInputs();
  syncCreatorFolderInput();
  autoGrowTextarea.call(creatorText);
}

async function fetchCreatorLinkPreview(url) {
  if (!shouldApplyLinkPreview(url)) return;
  creatorLinkPreviewUrl = url;
  creatorLinkPreviewAbort?.abort();
  creatorLinkPreviewAbort = new AbortController();

  try {
    const preview = await fetchLinkPreviewMetadata(url, creatorLinkPreviewAbort.signal);
    applyCreatorLinkPreview(preview, url);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Link preview unavailable:', getRecipeImporterUnavailableMessage(), error);
    }
  }
}

async function fetchLinkPreviewMetadata(url, signal) {
  const response = await fetch('/api/link-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal
  });
  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (parseError) {
    console.error('Link preview response was not JSON:', response.status, rawText.slice(0, 500));
  }
  if (!response.ok) {
    const fallback = payload.error
      || (response.status === 504
        ? 'The link preview took too long to load and timed out.'
        : `Link parser failed (status ${response.status}).`);
    throw new Error(fallback);
  }
  return payload;
}

async function parseCreatorLinkManually() {
  expandCreator();
  const url = getFirstUrlFromSharedText(creatorTitle.value, creatorText.value);
  if (!url) {
    showToast({ title: 'No link found', text: 'Paste a URL in the title or note body first.' });
    return;
  }
  creatorLinkPreviewUrl = null;
  try {
    await fetchCreatorLinkPreview(url);
    showToast({ title: 'Link parsed', text: 'Title, notes, image, and category were updated where empty.' });
  } catch (error) {
    showToast({ title: 'Link parser unavailable', text: getRecipeImporterUnavailableMessage() });
  }
}

function applyLinkPreviewToNote(note, preview, sourceUrl) {
  if (!note || !preview) return;
  const intent = preview.intent || {};
  const previewText = buildAutofillTextFromPreview(preview, sourceUrl);

  if (!note.title?.trim() && preview.title) {
    note.title = preview.title;
  }
  if ((!note.text?.trim() || note.text.trim() === sourceUrl) && previewText) {
    note.text = previewText;
  }
  if (!note.image && preview.image) {
    note.image = preview.image;
  }
  if (intent.folder) {
    setNoteFolders(note, [...getNoteFolders(note), intent.folder]);
    registerNoteFolders(note);
  }
  if (intent.noteType) {
    note.type = intent.noteType;
  }
  if (intent.theme && note.color === 'default' && !note.theme) {
    note.theme = intent.theme;
  }
  note.updatedAt = Date.now();
}

async function parseExistingNoteLink(note) {
  const url = getFirstUrlFromSharedText(note?.title || '', note?.text || '', note?.recipeSourceUrl || '');
  if (!url) {
    showToast({ title: 'No link found', text: 'This note does not contain a URL to parse.' });
    return;
  }

  try {
    const preview = await fetchLinkPreviewMetadata(url);
    applyLinkPreviewToNote(note, preview, url);
    saveToLocalStorage();
    closeAllNoteCardMenus();
    renderNotes();
    showToast({ title: 'Link parsed', text: 'The note was enriched with available metadata.' });
  } catch (error) {
    showToast({ title: 'Link parser unavailable', text: error.message || getRecipeImporterUnavailableMessage() });
  }
}

function scheduleCreatorLinkPreview(delay = 350) {
  clearTimeout(creatorLinkPreviewTimer);
  const url = getFirstUrlFromSharedText(creatorTitle.value, creatorText.value);
  if (!url || !shouldApplyLinkPreview(url)) return;
  creatorLinkPreviewTimer = setTimeout(() => fetchCreatorLinkPreview(url), delay);
}

async function handleSharedLaunchData() {
  const params = new URLSearchParams(window.location.search);
  const sharedTitle = params.get('title') || '';
  const sharedText = params.get('text') || '';
  const sharedUrl = params.get('url') || '';
  const sharedImage = params.get('image') || '';
  const hasSharedFile = params.get('sharedFile') === '1';
  if (!sharedTitle && !sharedText && !sharedUrl && !hasSharedFile) return;

  expandCreator();
  if (!creatorTitle.value.trim() && sharedTitle) {
    creatorTitle.value = sharedTitle;
  }

  const url = getFirstUrlFromSharedText(sharedUrl, sharedText);
  const bodyParts = [];
  if (sharedText && sharedText !== sharedTitle) bodyParts.push(sharedText);
  if (sharedUrl && !sharedText.includes(sharedUrl)) bodyParts.push(sharedUrl);
  if (!creatorText.value.trim()) {
    creatorText.value = bodyParts.join('\n\n').trim();
  }

  syncCreatorInputs();
  syncCreatorFolderInput(true);
  autoGrowTextarea.call(creatorText);

  if (hasSharedFile && 'caches' in window) {
    try {
      const cache = await caches.open('atlasnest-share-temp');
      const response = await cache.match('shared-file');
      if (response) {
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        const sharedType = response.headers.get('Content-Type') || params.get('sharedFileType') || blob.type || 'application/octet-stream';
        const sharedName = decodeURIComponent(response.headers.get('X-AtlasNest-File-Name') || params.get('sharedFileName') || 'shared-file');
        if (sharedType.startsWith('image/') && !creatorImage) {
          creatorImage = dataUrl;
          creatorImageBanner.style.display = 'block';
        } else {
          const fileId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          let finalDataUrl = dataUrl;
          let storedInDB = false;
          if (blob.size > 100 * 1024) {
            await storeFileInDB(fileId, blob);
            finalDataUrl = 'db';
            storedInDB = true;
          }
          creatorFiles = [
            ...normalizeNoteFiles(creatorFiles),
            {
              id: fileId,
              name: sharedName,
              type: sharedType,
              size: blob.size,
              dataUrl: finalDataUrl,
              storedInDB,
              addedAt: Date.now()
            }
          ];
          renderCreatorFileAttachments();
        }
        await cache.delete('shared-file');
      }
    } catch (error) {
      console.warn('Could not read shared file from cache:', error);
    }
  } else if (sharedImage) {
    // Bookmarklet already supplied real scraped metadata (e.g. from a page
    // that blocks server-side fetches, like Facebook/Instagram). Apply it
    // directly instead of re-fetching via the backend, which would fail.
    if (!creatorImage) {
      creatorImage = sharedImage;
      creatorImageBanner.style.display = 'block';
    }
  }

  if (url && !hasSharedFile && !sharedImage) {
    creatorLinkPreviewUrl = null;
    fetchCreatorLinkPreview(url);
  } else if (url) {
    creatorLinkPreviewUrl = url;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getVisualTypeLabel(kind) {
  const labels = {
    text: 'Text',
    checklist: 'Checklist',
    voice: 'Voice',
    bookmark: 'Bookmark',
    recipe: 'Recipe',
    image: 'Visual'
  };
  return labels[kind] || 'Note';
}

function formatCardTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getLinkMetadata(url, note) {
  const domain = extractDomain(url).replace(/^www\./, '');
  const mockMeta = SOCIAL_MOCK_METADATA[domain];
  const inferredImage = inferPreviewImageFromUrl(url, note);
  if (mockMeta) {
    return {
      ...mockMeta,
      image: note.image || inferredImage || mockMeta.image
    };
  }
  return {
    title: cleanTitleTags(note.title || domain || 'Shared link'),
    description: (note.text || '').replace(url, '').trim().slice(0, 140) || `Saved from ${domain || 'the web'}`,
    image: note.image || inferredImage || `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop`,
    badge: 'Saved link'
  };
}

function createPreviewFallbackImage(domain, title) {
  const safeDomain = (domain || 'shared link').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = (title || 'Saved link').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fafc"/>
          <stop offset="55%" stop-color="#dbeafe"/>
          <stop offset="100%" stop-color="#fde68a"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" rx="42" fill="url(#g)"/>
      <circle cx="1030" cy="120" r="94" fill="rgba(251,188,4,0.18)"/>
      <circle cx="170" cy="510" r="110" fill="rgba(79,134,255,0.14)"/>
      <rect x="78" y="78" width="1044" height="474" rx="34" fill="rgba(255,255,255,0.82)" stroke="rgba(15,23,42,0.08)"/>
      <text x="132" y="180" fill="#64748b" font-family="Outfit, Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="6">${safeDomain.toUpperCase()}</text>
      <text x="132" y="276" fill="#0f172a" font-family="Outfit, Arial, sans-serif" font-size="62" font-weight="800">${safeTitle}</text>
      <text x="132" y="462" fill="#f59e0b" font-family="Outfit, Arial, sans-serif" font-size="28" font-weight="700">AtlasNest saved preview</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function inferPreviewImageFromUrl(url, note) {
  if (note.image) return note.image;

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '');

    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
      if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    if (domain.includes('github.com')) {
      const repoPath = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
      if (repoPath) return `https://opengraph.githubassets.com/1/${repoPath}`;
    }

    if (domain.includes('pinterest.com')) {
      return 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=900&auto=format&fit=crop';
    }

    if (domain.includes('amazon.')) {
      return 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=900&auto=format&fit=crop';
    }

    if (domain.includes('figma.com')) {
      return 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=900&auto=format&fit=crop';
    }

    if (domain.includes('notion.so')) {
      return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop';
    }

    const slug = parsed.pathname.split('/').filter(Boolean).pop();
    if (slug && slug.length > 4) {
      const query = encodeURIComponent(slug.replace(/[-_]/g, ' '));
      return `https://source.unsplash.com/featured/900x600/?${query}`;
    }
  } catch (e) {
    return null;
  }

  return null;
}

function formatReminderDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  
  // Check if today
  const isToday = date.toDateString() === now.toDateString();
  
  // Check if tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  // Format time
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;
  
  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow, ${timeStr}`;
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yearSuffix = date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : '';
    return `${months[date.getMonth()]} ${date.getDate()}${yearSuffix}, ${timeStr}`;
  }
}

function renderCreatorReminderChip() {
  const container = document.getElementById('creator-chips-container');
  container.innerHTML = '';
  if (creatorReminder) {
    const chip = document.createElement('div');
    chip.className = 'reminder-chip';
    chip.innerHTML = `
      <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
      <span>${formatReminderDate(creatorReminder)}</span>
      <span class="reminder-chip-delete" title="Delete reminder">✕</span>
    `;
    chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      creatorReminder = null;
      renderCreatorReminderChip();
    });
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('reminder-chip-delete')) return;
      e.stopPropagation();
      const picker = document.getElementById('creator-reminder-picker');
      picker.classList.toggle('visible');
    });
    container.appendChild(chip);
  }
}

function renderModalReminderChip(note) {
  const container = document.getElementById('modal-tags-container');
  container.querySelectorAll('.reminder-chip').forEach(el => el.remove());
  if (note.reminder) {
    const chip = document.createElement('div');
    chip.className = 'reminder-chip';
    chip.innerHTML = `
      <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
      <span>${formatReminderDate(note.reminder)}</span>
      <span class="reminder-chip-delete" title="Delete reminder">✕</span>
    `;
    chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      note.reminder = null;
      note.reminderTriggered = false;
      saveToLocalStorage();
      renderNotes();
      renderModalReminderChip(note);
    });
    container.appendChild(chip);
  }
}

function buildReminderPicker(pickerContainer, currentReminder, onSave, onDelete) {
  pickerContainer.innerHTML = '';

  const title = document.createElement('span');
  title.className = 'reminder-picker-title';
  title.textContent = 'Set Date & Time';
  pickerContainer.appendChild(title);

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.className = 'reminder-datetime-input';
  if (currentReminder) {
    input.value = currentReminder.substring(0, 16);
  }
  pickerContainer.appendChild(input);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'space-between';
  actions.style.marginTop = '6px';
  actions.style.width = '100%';

  if (currentReminder && onDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-btn';
    deleteBtn.style.color = '#ea4335';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    actions.appendChild(deleteBtn);
  } else {
    const spacer = document.createElement('div');
    actions.appendChild(spacer);
  }

  const setBtn = document.createElement('button');
  setBtn.className = 'text-btn save-btn';
  setBtn.textContent = 'Set';
  setBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = input.value;
    if (val) {
      onSave(val);
    }
  });
  actions.appendChild(setBtn);
  pickerContainer.appendChild(actions);
}

function showToast(note) {
  const container = document.getElementById('toast-container');
  
  let actionBtnHtml = '';
  if (note.action) {
    actionBtnHtml = `<button class="toast-action-btn" style="background: var(--primary, #1a73e8); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; margin-top: 6px; width: fit-content; border: 1px solid rgba(255,255,255,0.1);">${note.action.text}</button>`;
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <svg class="toast-bell-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
    <div class="toast-content" style="display: flex; flex-direction: column;">
      <div class="toast-title">${note.title || 'Reminder Alert!'}</div>
      <div class="toast-text">${note.text || 'You have a scheduled reminder.'}</div>
      ${actionBtnHtml}
    </div>
    <span class="toast-close">✕</span>
  `;
  
  if (note.action) {
    toast.querySelector('.toast-action-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      note.action.callback();
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 350);
    });
  }

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  });
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 350);
    }
  }, 8000);
}

function checkReminders() {
  const now = new Date();
  let changed = false;
  
  notes.forEach(note => {
    if (note.reminder && !note.reminderTriggered) {
      const reminderTime = new Date(note.reminder);
      if (now >= reminderTime) {
        note.reminderTriggered = true;
        showToast(note);
        changed = true;
      }
    }
  });
  
  if (changed) {
    saveToLocalStorage();
    renderNotes();
  }
}

/* ==========================================================================
   Upgraded Markdown & Social Previews & Recipe Scrapers
   ========================================================================== */
const SOCIAL_MOCK_METADATA = {
  'pinterest.com': {
    title: 'Beautiful Wood Cabin Forest Workspace - Inspiration Pin',
    description: 'Explore curated cozy cabin office aesthetic boards on Pinterest. Simple wood structures, warm lighting, and fall season setups.',
    image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=500',
    badge: 'Pinterest Inspiration'
  },
  'facebook.com': {
    title: 'Announcing HyperKeep 2.0 - Advanced Note Taking',
    description: 'We are thrilled to release HyperKeep 2.0! Full reminders, interactive checklists, voice notes transcribing, and custom themes are now live.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500',
    badge: 'Facebook Post'
  },
  'amazon.com': {
    title: 'Retro Typewriter Mechanical Keyboard - Walnut Wood Case',
    description: 'Vintage RGB Backlit Mechanical keyboard with round typewriter keycaps and walnut wood case. Order now on Amazon.',
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
    badge: 'Amazon Shopping'
  },
  'youtube.com': {
    title: 'Full Body HIIT Workout - 20 Minutes (No Equipment)',
    description: 'Follow this intense 20-minute bodyweight routine to build strength, endurance, and burn calories. Subscribe for weekly updates!',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500',
    badge: 'YouTube Video'
  },
  'figma.com': {
    title: 'Figma board with product directions and motion studies',
    description: 'Saved design explorations with color systems, interface states, and clickable prototype flows.',
    image: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=500',
    badge: 'Design Board'
  },
  'notion.so': {
    title: 'Notion workspace with product notes and linked references',
    description: 'Shared planning hub collecting docs, specs, and research links in one place.',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500',
    badge: 'Workspace'
  },
  'x.com': {
    title: 'Thread worth saving for later reference',
    description: 'A bookmarked post with commentary, media, and relevant follow-up links.',
    image: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=500',
    badge: 'Social Post'
  }
};

function legacyParseMarkdown(text) {
  if (!text) return '';
  
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  html = html.replace(/^### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');
  
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  let lines = html.split('\n');
  let inList = false;
  
  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      let content = trimmed.substring(2);
      let res = '';
      if (!inList) {
        inList = true;
        res += '<ul>';
      }
      res += `<li>${content}</li>`;
      return res;
    } else {
      let res = '';
      if (inList) {
        inList = false;
        res += '</ul>';
      }
      res += line;
      return res;
    }
  });
  if (inList) {
    lines.push('</ul>');
  }
  
  html = lines.join('<br>');
  
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<ul><br>/g, '<ul>');
  html = html.replace(/<\/li><br><li>/g, '</li><li>');
  html = html.replace(/<br><li>/g, '<li>');
  html = html.replace(/<\/li><br>/g, '</li>');
  
  return html;
}




/* ==========================================================================
   Upgraded Voice Recording Notes & Transcriber
   ========================================================================== */
let mediaRecorder = null;
let audioChunks = [];
let voiceRecognition = null;
let isRecordingVoice = false;
let activeVoiceTarget = null;
let voiceRecordingStartTime = null;
let voiceRecordingElapsedSeconds = 0;
let voiceRecordingTimer = null;

function ensureVoiceRecordingIndicators() {
  const configs = [
    { hostId: 'creator-chips-container', indicatorId: 'creator-recording-indicator', target: 'creator' },
    { hostId: 'modal-tags-container', indicatorId: 'modal-recording-indicator', target: 'modal' }
  ];

  configs.forEach(({ hostId, indicatorId, target }) => {
    const host = document.getElementById(hostId);
    if (!host || document.getElementById(indicatorId)) return;

    const indicator = document.createElement('div');
    indicator.id = indicatorId;
    indicator.className = 'voice-recording-indicator';
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = `
      <span class="voice-recording-dot" aria-hidden="true"></span>
      <span class="voice-recording-copy">
        <strong>${target === 'creator' ? 'Recording voice note' : 'Recording update'}</strong>
        <span class="voice-recording-timer">0:00</span>
      </span>
      <span class="voice-recording-bars" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
      <button type="button" class="voice-recording-stop">Stop</button>
    `;
    indicator.querySelector('.voice-recording-stop')?.addEventListener('click', stopVoiceRecording);
    host.appendChild(indicator);
  });
}

function updateVoiceRecordingIndicators() {
  ensureVoiceRecordingIndicators();
  const formattedTime = `${Math.floor(voiceRecordingElapsedSeconds / 60)}:${(voiceRecordingElapsedSeconds % 60).toString().padStart(2, '0')}`;
  const indicators = [
    { id: 'creator-recording-indicator', target: 'creator' },
    { id: 'modal-recording-indicator', target: 'modal' }
  ];

  indicators.forEach(({ id, target }) => {
    const indicator = document.getElementById(id);
    if (!indicator) return;
    const active = isRecordingVoice && activeVoiceTarget === target;
    indicator.classList.toggle('visible', active);
    const timer = indicator.querySelector('.voice-recording-timer');
    if (timer) {
      timer.textContent = active ? formattedTime : '0:00';
    }
  });
}

function toggleVoiceRecording(target) {
  if (isRecordingVoice) {
    stopVoiceRecording();
  } else {
    startVoiceRecording(target);
  }
}

function startVoiceRecording(target) {
  activeVoiceTarget = target;
  audioChunks = [];
  voiceRecordingElapsedSeconds = 0;
  updateVoiceRecordingIndicators();
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        // Calculate real duration
        const totalSecs = Math.max(1, Math.round((Date.now() - voiceRecordingStartTime) / 1000));
        const durMin = Math.floor(totalSecs / 60);
        const durSec = (totalSecs % 60).toString().padStart(2, '0');
        const duration = `${durMin}:${durSec}`;
        
        // Clear duration timer
        if (voiceRecordingTimer) {
          clearInterval(voiceRecordingTimer);
          voiceRecordingTimer = null;
        }
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          saveVoiceNoteAudio(base64Audio, duration);
        };
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      isRecordingVoice = true;
      voiceRecordingStartTime = Date.now();
      updateVoiceButtonsVisuals(true);
      updateVoiceRecordingIndicators();
      
      // Real-time elapsed counter displayed on buttons
      voiceRecordingTimer = setInterval(() => {
        voiceRecordingElapsedSeconds++;
        const m = Math.floor(voiceRecordingElapsedSeconds / 60);
        const s = (voiceRecordingElapsedSeconds % 60).toString().padStart(2, '0');
        const btns = [document.getElementById('creator-voice-btn'), document.getElementById('modal-voice-btn')];
        btns.forEach(btn => {
          if (btn) btn.setAttribute('title', `Recording ${m}:${s} — Click to stop`);
        });
        updateVoiceRecordingIndicators();
      }, 1000);
      
      if (SpeechRecognition) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        
        const targetTextarea = target === 'creator' ? creatorText : modalText;
        let startText = targetTextarea.value;
        if (startText.trim() !== '') startText += '\n';
        
        voiceRecognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          targetTextarea.value = startText + finalTranscript + interimTranscript;
          autoGrowTextarea.call(targetTextarea);
          
          if (target === 'creator') {
            syncCreatorInputs();
          } else {
            const note = notes.find(n => n.id === currentEditingNoteId);
            if (note) {
              note.text = targetTextarea.value;
              saveToLocalStorage();
              renderNotes();
            }
          }
        };
        
        voiceRecognition.start();
      }
    })
    .catch(err => {
      console.warn("Audio recording not supported or permitted:", err);
      showToast({ title: 'Recording Error', text: 'Mic permission is required to record voice notes.' });
    });
}

function stopVoiceRecording() {
  if (voiceRecordingTimer) {
    clearInterval(voiceRecordingTimer);
    voiceRecordingTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch(e) {}
  }
  isRecordingVoice = false;
  updateVoiceButtonsVisuals(false);
  updateVoiceRecordingIndicators();
}

function updateVoiceButtonsVisuals(active) {
  const btns = [
    { el: document.getElementById('creator-voice-btn'), target: 'creator' },
    { el: document.getElementById('modal-voice-btn'), target: 'modal' }
  ];
  btns.forEach(({ el, target }) => {
    const btn = el;
    if (!btn) return;

    const isActiveTarget = active && activeVoiceTarget === target;
    btn.classList.toggle('voice-recording-active', isActiveTarget);
    btn.classList.toggle('voice-recording-idle', active && !isActiveTarget);

    if (isActiveTarget) {
      btn.style.color = '#ea4335';
      btn.style.animation = 'bellWobble 1s infinite ease-in-out';
      btn.setAttribute('aria-pressed', 'true');
      return;
    }

    btn.style.color = '';
    btn.style.animation = '';
    btn.setAttribute('aria-pressed', 'false');
    if (!active) {
      btn.setAttribute('title', 'Record Voice');
    }
  });
}

function saveVoiceNoteAudio(base64Audio, duration) {
  const dur = duration || '0:05';
  if (activeVoiceTarget === 'creator') {
    creatorAudio = base64Audio;
    creatorAudioDuration = dur;
    renderCreatorAudioPreview();
    syncCreatorFolderInput();
    showToast({ title: '🎙️ Voice note recorded', text: `Duration: ${dur}` });
  } else {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.audio = base64Audio;
      note.audioDuration = dur;
      saveToLocalStorage();
      renderNotes();
      renderModalAudioPreview(note);
      showToast({ title: '🎙️ Voice note recorded', text: `Duration: ${dur}` });
    }
  }
}

function renderCreatorAudioPreview() {
  const container = document.getElementById('creator-chips-container');
  container.querySelectorAll('.audio-player-chip').forEach(el => el.remove());
  if (creatorAudio) {
    const chip = document.createElement('div');
    chip.className = 'audio-player-chip';
    chip.style.marginTop = '0';
    chip.style.padding = '4px 8px';
    chip.innerHTML = `
      <span style="font-size: 11px; font-weight: bold; color: var(--accent-color);">🎙️ Voice Clip (${creatorAudioDuration || '0:05'})</span>
      <button type="button" class="media-action-btn" id="download-creator-audio">Download</button>
      <span class="reminder-chip-delete" id="delete-creator-audio" title="Delete voice clip" style="margin-left: 6px; font-size: 12px; cursor: pointer; opacity: 0.6;">✕</span>
    `;
    chip.querySelector('#download-creator-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      downloadDataUrl(creatorAudio, `voice-note.${getDataUrlExtension(creatorAudio, 'webm')}`);
    });
    chip.querySelector('#delete-creator-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      creatorAudio = null;
      creatorAudioDuration = null;
      renderCreatorAudioPreview();
      syncCreatorFolderInput();
    });
    container.appendChild(chip);
  }
}

function renderModalAudioPreview(note) {
  const container = document.getElementById('modal-tags-container');
  container.querySelectorAll('.audio-player-chip').forEach(el => el.remove());
  if (note.audio) {
    const chip = document.createElement('div');
    chip.className = 'audio-player-chip';
    chip.style.marginTop = '0';
    chip.style.padding = '4px 8px';
    chip.innerHTML = `
      <span style="font-size: 11px; font-weight: bold; color: var(--accent-color);">🎙️ Voice Clip (${note.audioDuration || '0:05'})</span>
      <button type="button" class="media-action-btn" id="download-modal-audio">Download</button>
      <span class="reminder-chip-delete" id="delete-modal-audio" title="Delete voice clip" style="margin-left: 6px; font-size: 12px; cursor: pointer; opacity: 0.6;">✕</span>
    `;
    chip.querySelector('#download-modal-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      downloadDataUrl(note.audio, `${getSafeFileName(note.title || 'voice-note')}.${getDataUrlExtension(note.audio, 'webm')}`);
    });
    chip.querySelector('#delete-modal-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      note.audio = null;
      note.audioDuration = null;
      saveToLocalStorage();
      renderNotes();
      renderModalAudioPreview(note);
    });
    container.appendChild(chip);
  }
}

/* ==========================================================================
   Upgraded Interactive Checklist Editor logic
   ========================================================================== */
let checklistFocusIndex = null;
let checklistFocusIsNew = false;

function legacyRenderInteractiveChecklistEditor(container, rawText, onChange) {
  container.innerHTML = '';
  
  let lines = rawText.split('\n').map(line => line.trim());
  
  // Format any non-checklist lines to checklists
  let formatted = false;
  lines = lines.map(line => {
    if (!line.startsWith('- [ ] ') && !line.startsWith('- [x] ')) {
      formatted = true;
      return '- [ ] ' + line;
    }
    return line;
  });
  
  if (formatted) {
    onChange(lines.join('\n'));
  }

  const uncheckedContainer = document.createElement('div');
  uncheckedContainer.style.display = 'flex';
  uncheckedContainer.style.flexDirection = 'column';
  uncheckedContainer.style.gap = '6px';
  container.appendChild(uncheckedContainer);

  const checkedContainer = document.createElement('div');
  checkedContainer.className = 'completed-items-body';

  const uncheckedRowsCount = lines.filter(l => l.startsWith('- [ ] ')).length;
  const checkedRowsCount = lines.length - uncheckedRowsCount;

  lines.forEach((line, index) => {
    const isChecked = line.startsWith('- [x] ');
    const cleanText = line.substring(6);

    const row = document.createElement('div');
    row.className = 'checklist-editor-row';

    const checkbox = document.createElement('div');
    checkbox.className = `checklist-editor-checkbox ${isChecked ? 'checked' : ''}`;
    checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    
    checkbox.addEventListener('click', () => {
      const newPrefix = isChecked ? '- [ ] ' : '- [x] ';
      lines[index] = newPrefix + cleanText;
      checklistFocusIndex = index;
      onChange(lines.join('\n'));
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `checklist-editor-input ${isChecked ? 'checked' : ''}`;
    input.value = cleanText;
    input.placeholder = 'List item';

    // Handle cursor focus restore on re-render
    if (checklistFocusIndex === index) {
      setTimeout(() => {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
        checklistFocusIndex = null;
      }, 0);
    }

    input.addEventListener('input', () => {
      const prefix = isChecked ? '- [x] ' : '- [ ] ';
      lines[index] = prefix + input.value;
      onChange(lines.join('\n'), true); // Skip DOM re-render during typing to preserve input focus
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lines.splice(index + 1, 0, '- [ ] ');
        checklistFocusIndex = index + 1;
        onChange(lines.join('\n'));
      } else if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        lines.splice(index, 1);
        if (lines.length === 0) lines = ['- [ ] '];
        checklistFocusIndex = Math.max(0, index - 1);
        onChange(lines.join('\n'));
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'checklist-editor-delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      lines.splice(index, 1);
      if (lines.length === 0) lines = ['- [ ] '];
      checklistFocusIndex = Math.max(0, index - 1);
      onChange(lines.join('\n'));
    });

    row.appendChild(checkbox);
    row.appendChild(input);
    row.appendChild(deleteBtn);

    if (isChecked) {
      checkedContainer.appendChild(row);
    } else {
      uncheckedContainer.appendChild(row);
    }
  });

  // "Add item" placeholder row at the bottom of Unchecked items
  const addRow = document.createElement('div');
  addRow.className = 'checklist-editor-row';
  addRow.style.opacity = '0.65';

  const addPlus = document.createElement('div');
  addPlus.className = 'checklist-editor-checkbox';
  addPlus.style.borderStyle = 'dashed';
  addPlus.innerHTML = `<span style="font-size: 14px; font-weight: bold; color: var(--text-secondary);">+</span>`;

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'checklist-editor-input';
  addInput.placeholder = 'List item';

  if (checklistFocusIsNew) {
    setTimeout(() => {
      addInput.focus();
      checklistFocusIsNew = false;
    }, 0);
  }

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addInput.value.trim() !== '') {
      e.preventDefault();
      lines.push('- [ ] ' + addInput.value.trim());
      checklistFocusIsNew = true;
      onChange(lines.join('\n'));
    }
  });
  
  addInput.addEventListener('blur', () => {
    if (addInput.value.trim() !== '') {
      lines.push('- [ ] ' + addInput.value.trim());
      onChange(lines.join('\n'));
    }
  });

  addRow.appendChild(addPlus);
  addRow.appendChild(addInput);
  uncheckedContainer.appendChild(addRow);

  // Collapsible Checked Section
  if (checkedRowsCount > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRowsCount} completed item${checkedRowsCount > 1 ? 's' : ''}</span>
    `;

    header.addEventListener('click', () => {
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = checkedContainer.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });

    container.appendChild(header);
    container.appendChild(checkedContainer);
  }
}

function syncCreatorInputs() {
  const creatorText = document.getElementById('creator-text');
  const creatorChecklistEditor = document.getElementById('creator-checklist-editor');

  syncNoteTypeEditor({
    textareaEl: creatorText,
    checklistEditorEl: creatorChecklistEditor,
    rawText: creatorText.value,
    onChange: (newText, skipRedraw) => {
      creatorText.value = newText;
      if (!skipRedraw) {
        syncCreatorInputs();
      }
    }
  });
}

function syncModalInputs(note) {
  const modalText = document.getElementById('modal-text');
  const modalChecklistEditor = document.getElementById('modal-checklist-editor');

  syncNoteTypeEditor({
    textareaEl: modalText,
    checklistEditorEl: modalChecklistEditor,
    rawText: note.text,
    type: note.type,
    onChange: (newText, skipRedraw) => {
      note.text = newText;
      note.type = note.recipeData ? 'recipe' : getNoteType(newText);
      modalText.value = newText;
      saveToLocalStorage();
      renderNotes();
      if (!skipRedraw) {
        syncModalInputs(note);
      }
    }
  });
}


// ==========================================================================
// settings & Custom Themes Page Implementation (Google / MD3 Standards)
// ==========================================================================

function loadSettings() {
  const savedSettings = localStorage.getItem(STORAGE_KEYS.settings);
  if (savedSettings) {
    try {
      Object.assign(appSettings, JSON.parse(savedSettings));
    } catch (e) {
      console.warn('Failed to parse settings:', e);
    }
  }

  const savedCustomThemes = localStorage.getItem(STORAGE_KEYS.customThemes);
  if (savedCustomThemes) {
    try {
      customThemes.splice(0, customThemes.length, ...(JSON.parse(savedCustomThemes) || []));
      THEME_PRESETS.splice(0, THEME_PRESETS.length, ...DEFAULT_THEME_PRESETS, ...customThemes);
    } catch (e) {
      console.warn('Failed to parse custom themes:', e);
    }
  }

  // Apply layout style
  applyCardLayoutStyle(appSettings.cardLayoutStyle);
}

function applyCardLayoutStyle(style) {
  document.body.classList.remove('card-style-keep', 'card-style-glass');
  if (style === 'keep') {
    document.body.classList.add('card-style-keep');
  } else if (style === 'glass') {
    document.body.classList.add('card-style-glass');
  }
}




function clearAllCacheAndData() {
  if (!confirm('This will completely reset the app, unregister service workers, clear cache, and delete all local notes. Are you sure?')) return;

  // Clear LocalStorage
  localStorage.clear();

  // Unregister Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }

  // Clear Cache Storage
  if ('caches' in window) {
    caches.keys().then(names => {
      for (let name of names) {
        caches.delete(name);
      }
    });
  }

  showToast({ title: 'App Resetting', text: 'Reloading application to fresh state...' });
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

function updateSliderTrackFill(slider) {
  if (!slider) return;
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const val = Number(slider.value) || 0;
  const percentage = ((val - min) / (max - min)) * 100;
  
  const activeColor = 'var(--primary, #1a73e8)';
  const inactiveColor = document.body.classList.contains('dark-theme') || document.body.classList.contains('theme-dark') ? '#475569' : '#e2e8f0';
  
  slider.style.background = `linear-gradient(to right, ${activeColor} ${percentage}%, ${inactiveColor} ${percentage}%)`;
}

// ─────────────────────────────────────────────────────────────
// Dynamic Imports & Module Lazy Loading Hooks
// ─────────────────────────────────────────────────────────────

let settingsMod;
async function loadSettingsModule() {
  if (!settingsMod) {
    settingsMod = await import('./settings.js');
    settingsMod.initSettings();
  }
  return settingsMod;
}

export async function renderSettingsPage() {
  const mod = await loadSettingsModule();
  mod.renderSettingsPage();
}

let productivityMod;
async function loadProductivityModule() {
  if (!productivityMod) {
    productivityMod = await import('./productivity.js');
  }
  return productivityMod;
}

export async function renderProductivityPage() {
  const mod = await loadProductivityModule();
  mod.renderProductivityPage();
}

export async function createReminderPreviewCard(note, options) {
  const mod = await loadProductivityModule();
  return mod.createReminderPreviewCard(note, options);
}

export async function createProductivityNoteCard(note, options) {
  const mod = await loadProductivityModule();
  return mod.createProductivityNoteCard(note, options);
}

let recipeMod;
async function loadRecipeModule() {
  if (!recipeMod) {
    recipeMod = await import('./recipe.js');
    recipeMod.initRecipe();
  }
  return recipeMod;
}

export async function openRecipeModal(note = null) {
  const mod = await loadRecipeModule();
  mod.openRecipeModal(note);
}

// Setters for dynamic imports to write back variables safely
export function setSelectedCalendarDate(val) {
  selectedCalendarDate = val;
}
export function setCalendarCursorDate(val) {
  calendarCursorDate = val;
}
export function setSelectedProductivityDayView(val) {
  selectedProductivityDayView = val;
}

// Exports
export {
  setActivePage,
  saveToLocalStorage,
  debouncedSave,
  renderNotes,
  closeAllNoteCardMenus,
  openEditModal,
  showToast,
  clearAllCacheAndData,
  renderAppView,
  updateSliderTrackFill,
  getEmojiThemeControls,
  saveEmojiThemeControls,
  applyCardLayoutStyle,
  syncEmojiThemePresentation,
  buildColorPickers,
  setNoteFolders,
  registerNoteFolders,
  getNoteType,
  getVisualNoteType,
  cleanTitleTags,
  getLocalDateKey,
  getTaskInlineReminderDateKeys,
  isTaskCompleted,
  getTaskPreviewSchedule,
  getTaskPreviewLabel,
  getNoteTypeAccent,
  getVisualTypeLabel,
  getReminderNotes,
  getTaskNotes,
  getDayCollections,
  getDayDotTypes,
  getFilteredProductivityTasks,
  formatCalendarDayLabel,
  getFolderSummaryLabel,
  getTaskInlineReminderEntries,
  stripChecklistInlineReminder,
  cleanTextTags,
  formatReminderDate,
  formatCardTimestamp,
  escapeHtml,
  getChecklistStats,
  isTaskNote,
  setActiveSidebarPage
};

// ─────────────────────────────────────────────────────────────
// Firebase Authentication UI & Handler Logic
// ─────────────────────────────────────────────────────────────

function initAuth() {
  const avatarBtn = document.getElementById('user-avatar-btn');
  const dropdown = document.getElementById('profile-dropdown');
  
  const guestView = document.getElementById('profile-guest-view');
  const userView = document.getElementById('profile-user-view');
  const profileName = document.getElementById('profile-user-name');
  const profileEmail = document.getElementById('profile-user-email');
  const profileAvatarInner = document.getElementById('profile-user-avatar-inner');
  
  const signinBtn = document.getElementById('profile-signin-btn');
  const signoutBtn = document.getElementById('profile-signout-btn');
  
  const authModal = document.getElementById('auth-modal');
  const authClose = document.getElementById('auth-modal-close');
  const authForm = document.getElementById('auth-form');
  const authNameGroup = document.getElementById('auth-group-display-name');
  const authNameInput = document.getElementById('auth-name-input');
  const authEmailInput = document.getElementById('auth-email-input');
  const authPasswordInput = document.getElementById('auth-password-input');
  const authErrorMsg = document.getElementById('auth-error-msg');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  
  const authTabLogin = document.getElementById('auth-tab-login');
  const authTabRegister = document.getElementById('auth-tab-register');
  
  const pwToggleBtn = document.getElementById('auth-pw-toggle');
  const forgotBtn = document.getElementById('auth-forgot-btn');
  
  let activeTab = 'login'; // 'login' or 'register'

  // Toggle Dropdown
  avatarBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('is-open');
  });

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    dropdown?.classList.remove('is-open');
  });

  dropdown?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Open Auth Modal
  signinBtn?.addEventListener('click', () => {
    dropdown?.classList.remove('is-open');
    authModal?.classList.add('visible');
    if (authErrorMsg) authErrorMsg.style.display = 'none';
  });

  // Close Auth Modal
  authClose?.addEventListener('click', () => {
    authModal?.classList.remove('visible');
  });
  
  authModal?.addEventListener('click', (e) => {
    if (e.target === authModal) {
      authModal?.classList.remove('visible');
    }
  });

  // Tab switching
  authTabLogin?.addEventListener('click', () => {
    activeTab = 'login';
    authTabLogin.classList.add('active');
    authTabRegister?.classList.remove('active');
    authTabLogin.setAttribute('aria-selected', 'true');
    authTabRegister?.setAttribute('aria-selected', 'false');
    if (authNameGroup) authNameGroup.style.display = 'none';
    const forgotRow = document.getElementById('auth-forgot-row');
    if (forgotRow) forgotRow.style.display = '';
    if (authSubmitBtn) authSubmitBtn.textContent = 'Get Started';
    if (authErrorMsg) authErrorMsg.style.display = 'none';
  });

  authTabRegister?.addEventListener('click', () => {
    activeTab = 'register';
    authTabRegister.classList.add('active');
    authTabLogin?.classList.remove('active');
    authTabLogin?.setAttribute('aria-selected', 'false');
    authTabRegister.setAttribute('aria-selected', 'true');
    if (authNameGroup) authNameGroup.style.display = 'block';
    const forgotRow = document.getElementById('auth-forgot-row');
    if (forgotRow) forgotRow.style.display = 'none';
    if (authSubmitBtn) authSubmitBtn.textContent = 'Create Account';
    if (authErrorMsg) authErrorMsg.style.display = 'none';
  });

  // Password show/hide toggle
  pwToggleBtn?.addEventListener('click', () => {
    if (!authPasswordInput) return;
    const isPassword = authPasswordInput.type === 'password';
    authPasswordInput.type = isPassword ? 'text' : 'password';
    const showEye = pwToggleBtn.querySelector('.pw-eye-show');
    const hideEye = pwToggleBtn.querySelector('.pw-eye-hide');
    if (showEye) showEye.style.display = isPassword ? 'none' : '';
    if (hideEye) hideEye.style.display = isPassword ? '' : 'none';
  });

  // Forgot password (placeholder — show a toast for now)
  forgotBtn?.addEventListener('click', () => {
    showToast({ title: 'Reset Password', text: 'Password reset is coming soon. Contact support if needed.' });
  });

  // Form Submission
  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (authErrorMsg) authErrorMsg.style.display = 'none';
    const email = authEmailInput?.value.trim();
    const password = authPasswordInput?.value;
    const name = authNameInput?.value.trim();
    
    if (!email || !password) return;
    
    if (authSubmitBtn) {
      authSubmitBtn.disabled = true;
      const originalText = authSubmitBtn.textContent;
      authSubmitBtn.textContent = activeTab === 'login' ? 'Signing In...' : 'Creating Account...';
      
      try {
        if (activeTab === 'login') {
          await loginUser(email, password);
          showToast({ title: 'Welcome Back', text: 'Logged in successfully.' });
        } else {
          await registerUser(email, password, name);
          showToast({ title: 'Account Created', text: 'Your new account is ready.' });
        }
        authModal?.classList.remove('visible');
        if (authEmailInput) authEmailInput.value = '';
        if (authPasswordInput) authPasswordInput.value = '';
        if (authNameInput) authNameInput.value = '';
      } catch (err) {
        console.error(err);
        if (authErrorMsg) {
          authErrorMsg.textContent = getAuthFriendlyError(err.message);
          authErrorMsg.style.display = 'block';
        }
      } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = originalText;
      }
    }
  });

  // Sign Out
  signoutBtn?.addEventListener('click', async () => {
    await logoutUser();
    dropdown?.classList.remove('is-open');
    showToast({ title: 'Signed Out', text: 'Logged out of account.' });
  });

  // Profile picture upload handlers
  const profilePicInput = document.getElementById('profile-pic-input');
  profileAvatarInner?.addEventListener('click', (e) => {
    e.stopPropagation();
    profilePicInput?.click();
  });

  profilePicInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    handleImageUpload(file, async (compressedBase64) => {
      try {
        showToast({ title: 'Uploading...', text: 'Updating your profile picture...' });
        const updatedUser = await updateUserProfilePic(compressedBase64);
        currentUser = updatedUser;

        if (avatarBtn) {
          avatarBtn.textContent = '';
          avatarBtn.style.backgroundImage = `url(${compressedBase64})`;
        }
        if (profileAvatarInner) {
          profileAvatarInner.textContent = '';
          profileAvatarInner.style.backgroundImage = `url(${compressedBase64})`;
        }
        showToast({ title: 'Success', text: 'Profile picture updated successfully!' });
      } catch (err) {
        console.error('Failed to update profile pic:', err);
        showToast({ title: 'Error', text: 'Could not update profile picture.' });
      }
    }, () => {
      showToast({ title: 'Upload failed', text: 'Invalid image format.' });
    });

    e.target.value = ''; // Reset input
  });

  // Firebase Auth State Listener
  onAuthChange(async (user) => {
    if (user) {
      currentUser = user;
      
      const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
      
      if (user.photoURL) {
        if (avatarBtn) {
          avatarBtn.textContent = '';
          avatarBtn.style.backgroundImage = `url(${user.photoURL})`;
        }
        if (profileAvatarInner) {
          profileAvatarInner.textContent = '';
          profileAvatarInner.style.backgroundImage = `url(${user.photoURL})`;
        }
      } else {
        if (avatarBtn) {
          avatarBtn.textContent = initial;
          avatarBtn.style.backgroundImage = '';
        }
        if (profileAvatarInner) {
          profileAvatarInner.textContent = initial;
          profileAvatarInner.style.backgroundImage = '';
        }
      }

      if (profileName) profileName.textContent = user.displayName || user.email.split('@')[0];
      if (profileEmail) profileEmail.textContent = user.email;
      
      if (guestView) guestView.style.display = 'none';
      if (userView) userView.style.display = 'block';
      
      const syncText = document.getElementById('profile-sync-text');
      if (syncText) {
        syncText.textContent = isRealFirebase ? 'Cloud Sync Active' : 'Cloud Sync (Simulated)';
      }

      // Fetch cloud notes for this user
      try {
        const cloudNotes = await fetchNotesFromCloud(user.uid);
        notes = cloudNotes.map(normalizeNoteType);
        notes.sort((a, b) => b.updatedAt - a.updatedAt);
        notes.forEach(registerNoteFolders);
        renderNotes();
      } catch (err) {
        console.warn('Failed to load cloud notes:', err);
        showToast({ title: 'Sync Error', text: 'Could not fetch cloud notes. Using offline copy.' });
      }
    } else {
      currentUser = null;
      if (avatarBtn) {
        avatarBtn.textContent = 'G';
        avatarBtn.style.backgroundImage = '';
      }
      if (profileAvatarInner) {
        profileAvatarInner.textContent = 'G';
        profileAvatarInner.style.backgroundImage = '';
      }
      if (guestView) guestView.style.display = 'block';
      if (userView) userView.style.display = 'none';
      
      // Restore guest local notes
      initData();
      renderNotes();
      
      // Push welcoming toast for guest users
      showGuestWelcomeNotification();
    }
  });
}

function showGuestWelcomeNotification() {
  if (sessionStorage.getItem('guest-welcomed') === 'true') return;
  sessionStorage.setItem('guest-welcomed', 'true');
  
  setTimeout(() => {
    showToast({
      title: 'Welcome to AtlasNest! 🚀',
      text: 'You are in Guest Mode. Notes are saved locally. Sign in to activate Cloud Sync!'
    });
  }, 2000);
}

function getAuthFriendlyError(code) {
  if (code.includes('auth/email-already-in-use')) {
    return 'This email address is already in use by another account.';
  }
  if (code.includes('auth/invalid-credential')) {
    return 'Invalid email address or password. Please try again.';
  }
  if (code.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (code.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  return code || 'An error occurred during authentication.';
}

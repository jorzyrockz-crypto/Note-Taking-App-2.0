import {
  clamp,
  numericSetting,
  escapeCssUrl,
  escapeSvgText
} from './utils.js';

export const CUSTOM_THEME_ID = 'custom';
export const ENABLE_CUSTOM_THEME_UPLOAD = true;

export const DEFAULT_EMOJI_THEME_CONTROLS = Object.freeze({
  opacity: 8,
  size: 14,
  spacing: 96
});

export let globalEmojiThemeControls = { ...DEFAULT_EMOJI_THEME_CONTROLS };
export function setGlobalEmojiThemeControls(newControls) {
  globalEmojiThemeControls = { ...newControls };
}
export const emojiPatternCache = new Map();

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
  { id: 'celebration', emoji: '🎉', title: 'Celebration', emojis: ['🎉', '🎊', '✨'] },
  
  // Premium solid-color themes (optimized with dark mode palette variants)
  { id: 'sage-green', title: 'Sage Green', isSolid: true, colors: { bg: '#D0E8D3', border: '#D0E8D3', text: '#2D4732' }, darkColors: { bg: '#1c2e22', border: '#294231', text: '#e2f2e5' } },
  { id: 'soft-blue', title: 'Soft Blue', isSolid: true, colors: { bg: '#CAE0F5', border: '#CAE0F5', text: '#23405E' }, darkColors: { bg: '#172738', border: '#243b54', text: '#e1eeea' } },
  { id: 'lavender', title: 'Lavender', isSolid: true, colors: { bg: '#DCD2F5', border: '#DCD2F5', text: '#4B3F67' }, darkColors: { bg: '#251b38', border: '#392a54', text: '#f0e8ff' } },
  { id: 'warm-peach', title: 'Warm Peach', isSolid: true, colors: { bg: '#F7D4C1', border: '#F7D4C1', text: '#704436' }, darkColors: { bg: '#331d16', border: '#4a2c22', text: '#fce8de' } },
  { id: 'mint', title: 'Mint', isSolid: true, colors: { bg: '#C5EBE0', border: '#C5EBE0', text: '#1E463C' }, darkColors: { bg: '#152e27', border: '#21473d', text: '#dcfce7' } },
  { id: 'sand', title: 'Sand', isSolid: true, colors: { bg: '#E9DEC9', border: '#E9DEC9', text: '#4A3E3D' }, darkColors: { bg: '#2c251e', border: '#42372d', text: '#f2e8d8' } },
  { id: 'blush', title: 'Blush', isSolid: true, colors: { bg: '#F6CEDC', border: '#F6CEDC', text: '#6A364A' }, darkColors: { bg: '#331823', border: '#4d2536', text: '#fce7f3' } },
  { id: 'light-yellow', title: 'Light Yellow', isSolid: true, colors: { bg: '#FBECBD', border: '#FBECBD', text: '#5D4F1E' }, darkColors: { bg: '#302812', border: '#473c1c', text: '#fffbeb' } }
];

export let THEME_PRESETS = [...DEFAULT_THEME_PRESETS];
export let customThemes = [];

export function getThemePreset(themeId) {
  return THEME_PRESETS.find(theme => theme.id === themeId) || null;
}

export function getEmojiThemeControls() {
  return {
    opacity: clamp(numericSetting(globalEmojiThemeControls.opacity, DEFAULT_EMOJI_THEME_CONTROLS.opacity), 0, 28),
    size: clamp(numericSetting(globalEmojiThemeControls.size, DEFAULT_EMOJI_THEME_CONTROLS.size), 10, 34),
    spacing: clamp(numericSetting(globalEmojiThemeControls.spacing, DEFAULT_EMOJI_THEME_CONTROLS.spacing), 64, 160)
  };
}

export function buildEmojiThemePattern(themeId, controls = getEmojiThemeControls()) {
  const preset = getThemePreset(themeId);
  if (!preset || preset.isSolid) return 'none';

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

export function applyGeneratedEmojiThemeStyles(element, themeId) {
  if (!element || !themeId || themeId === CUSTOM_THEME_ID) return;
  const preset = getThemePreset(themeId);
  if (preset && preset.isSolid) {
    clearGeneratedEmojiThemeStyles(element);
    return;
  }
  const controls = getEmojiThemeControls();
  element.style.setProperty('--theme-pattern', buildEmojiThemePattern(themeId, controls));
  element.style.setProperty('--note-theme-pattern-size', `${controls.spacing}px ${controls.spacing}px`);
}

export function clearGeneratedEmojiThemeStyles(element) {
  if (!element) return;
  element.style.removeProperty('--theme-pattern');
  element.style.removeProperty('--note-theme-pattern-size');
  element.style.removeProperty('--note-color');
}

export function clearCustomThemeStyles(element) {
  if (!element) return;
  element.style.removeProperty('--custom-theme-image');
  element.style.removeProperty('--note-theme-accent');
  element.style.removeProperty('--note-theme-soft');
  element.style.removeProperty('--note-theme-text');
  element.style.removeProperty('--note-theme-muted-text');
  element.style.removeProperty('--note-theme-surface');
  element.style.removeProperty('--note-theme-header-scrim');
}

export function applyNoteAppearance(element, noteLike = {}) {
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
  element.removeAttribute('data-theme-solid');

  if (theme && theme !== CUSTOM_THEME_ID) {
    applyGeneratedEmojiThemeStyles(element, theme);
    clearCustomThemeStyles(element);
    const preset = getThemePreset(theme);
    if (preset && preset.isSolid) {
      const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('dark-theme');
      const activeColors = isDark && preset.darkColors ? preset.darkColors : preset.colors;
      element.setAttribute('data-theme-solid', 'true');
      element.style.setProperty('--note-frame', activeColors.bg);
      element.style.setProperty('--note-color', activeColors.bg);
      element.style.setProperty('--note-border-color', activeColors.border);
      element.style.setProperty('--note-text-color', activeColors.text);
      element.style.setProperty('--note-text-muted-color', activeColors.text + 'b3'); // b3 is 70% in hex
      element.style.setProperty('--bg-current-creator', activeColors.bg);
      element.style.backgroundColor = '';
      element.style.borderColor = '';
    } else if (preset && preset.customBg) {
      const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('dark-theme');
      const bgVal = isDark && preset.customBg.dark ? preset.customBg.dark : (preset.customBg.light || preset.customBg);
      element.style.setProperty('--note-frame', bgVal);
      element.style.setProperty('--note-color', bgVal);
      element.style.setProperty('--bg-current-creator', bgVal);
      element.style.backgroundColor = '';
      element.style.removeProperty('--note-border-color');
      element.style.removeProperty('--note-text-color');
      element.style.removeProperty('--note-text-muted-color');
      element.style.borderColor = '';
    } else {
      element.style.removeProperty('--note-frame');
      element.style.removeProperty('--note-color');
      element.style.removeProperty('--bg-current-creator');
      element.style.backgroundColor = '';
      element.style.removeProperty('--note-border-color');
      element.style.removeProperty('--note-text-color');
      element.style.removeProperty('--note-text-muted-color');
      element.style.borderColor = '';
    }
  } else if (customTheme?.image) {
    clearGeneratedEmojiThemeStyles(element);
    element.style.removeProperty('--note-frame');
    element.style.setProperty('--custom-theme-image', `url("${escapeCssUrl(customTheme.image)}")`);
    element.style.setProperty('--note-theme-accent', customTheme.accent || '#64748b');
    element.style.setProperty('--note-theme-soft', customTheme.soft || 'rgba(100, 116, 139, 0.18)');
    element.style.setProperty('--note-theme-text', customTheme.textColor || '#0f172a');
    element.style.setProperty('--note-theme-muted-text', customTheme.mutedText || 'rgba(15, 23, 42, 0.62)');
    element.style.setProperty('--note-theme-surface', customTheme.surface || 'rgba(255, 255, 255, 0.88)');
    element.style.setProperty('--note-theme-header-scrim', customTheme.headerScrim || 'rgba(255, 255, 255, 0.18)');
    element.style.removeProperty('--note-border-color');
    element.style.removeProperty('--note-text-color');
    element.style.removeProperty('--note-text-muted-color');
    element.style.borderColor = '';
  } else {
    clearGeneratedEmojiThemeStyles(element);
    clearCustomThemeStyles(element);
    element.style.removeProperty('--note-frame');
    element.style.removeProperty('--bg-current-creator');
    element.style.backgroundColor = '';
    element.style.removeProperty('--note-border-color');
    element.style.removeProperty('--note-text-color');
    element.style.removeProperty('--note-text-muted-color');
    element.style.borderColor = '';
  }
}

/**
 * Theme configuration module.
 * Defines supported theme IDs, metadata, background gradients,
 * dark-mode backgrounds, and legacy preset mappings.
 *
 * Source of truth for JS theme configurations while maintaining
 * a clear boundary with CSS variables defined in styles.css.
 */

export const DEFAULT_THEME_ID = 'slate';

export const SUPPORTED_THEME_IDS = Object.freeze([
  'slate',
  'lavender',
  'sky',
  'aqua',
  'mint',
  'blush',
  'peach',
  'rose',
  'honey',
  'paper',
  'auto'
]);

export const LEGACY_PRESET_MAP = Object.freeze({
  lilac: 'lavender',
  sage: 'mint',
  coolgray: 'slate',
  offwhite: 'slate',
  white: 'slate',
  sky: 'sky',
  peach: 'peach',
  paper: 'paper',
  base: 'slate'
});

export const THEME_CONFIGS = Object.freeze({
  slate: {
    id: 'slate',
    name: 'Slate Grey',
    bgPreset: 'coolgray',
    lightBg: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    darkBg: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)'
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    bgPreset: 'lilac',
    lightBg: 'linear-gradient(180deg, #f3e8ff 0%, #faf5ff 45%, #faf9fc 100%)',
    darkBg: 'linear-gradient(180deg, #19122a 0%, #0d0916 100%)'
  },
  sky: {
    id: 'sky',
    name: 'Sky Blue',
    bgPreset: 'sky',
    lightBg: 'linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 45%, #fafafd 100%)',
    darkBg: 'linear-gradient(180deg, #0f1a38 0%, #080d1c 100%)'
  },
  aqua: {
    id: 'aqua',
    name: 'Aqua',
    bgPreset: 'sky',
    lightBg: 'linear-gradient(180deg, #ecfeff 0%, #f0fdfa 45%, #fafdff 100%)',
    darkBg: 'linear-gradient(180deg, #071f24 0%, #030f12 100%)'
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    bgPreset: 'sage',
    lightBg: 'linear-gradient(180deg, #dcfce7 0%, #f0fdf4 45%, #f9fbf9 100%)',
    darkBg: 'linear-gradient(180deg, #0e2219 0%, #08120d 100%)'
  },
  blush: {
    id: 'blush',
    name: 'Blush',
    bgPreset: 'lilac',
    lightBg: 'linear-gradient(180deg, #fce7f3 0%, #fdf2f8 45%, #fff1f2 100%)',
    darkBg: 'linear-gradient(180deg, #2b1120 0%, #170911 100%)'
  },
  peach: {
    id: 'peach',
    name: 'Peach',
    bgPreset: 'peach',
    lightBg: 'linear-gradient(180deg, #ffedd5 0%, #fff7ed 45%, #fdfbf8 100%)',
    darkBg: 'linear-gradient(180deg, #28170a 0%, #170d05 100%)'
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    bgPreset: 'peach',
    lightBg: 'linear-gradient(180deg, #ffe4e6 0%, #fff1f2 45%, #fff5f5 100%)',
    darkBg: 'linear-gradient(180deg, #2c1216 0%, #18090c 100%)'
  },
  honey: {
    id: 'honey',
    name: 'Honey',
    bgPreset: 'peach',
    lightBg: 'linear-gradient(180deg, #fef3c7 0%, #fffbeb 45%, #fffdf5 100%)',
    darkBg: 'linear-gradient(180deg, #281e0a 0%, #171105 100%)'
  },
  paper: {
    id: 'paper',
    name: 'Paper (Notebook Moss)',
    bgPreset: 'paper',
    lightBg: 'linear-gradient(180deg, #efede3 0%, #f6f4ec 100%)',
    darkBg: 'linear-gradient(180deg, #1d1a14 0%, #15130f 100%)'
  },
  auto: {
    id: 'auto',
    name: 'Auto (Match Background)',
    bgPreset: 'base',
    lightBg: 'linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 100%)',
    darkBg: 'linear-gradient(180deg, #131e35 0%, #0d1424 100%)'
  }
});

export function isValidThemeId(themeId) {
  return typeof themeId === 'string' && SUPPORTED_THEME_IDS.includes(themeId);
}

export function getThemeConfig(themeId) {
  if (isValidThemeId(themeId)) {
    return THEME_CONFIGS[themeId];
  }
  return THEME_CONFIGS[DEFAULT_THEME_ID];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function numericSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbaFromRgb(r, g, b, alpha) {
  return `rgba(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)}, ${alpha})`;
}

export function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const normalized = clamp(channel, 0, 255) / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * rs) + (0.7152 * gs) + (0.0722 * bs);
}

export function escapeCssUrl(url = '') {
  return url.replace(/["\\\n\r]/g, match => `\\${match}`);
}

export function escapeSvgText(text = '') {
  return `${text}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

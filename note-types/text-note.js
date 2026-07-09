import { renderFormattedText } from './shared.js';

export function renderTextNoteContent(note, options) {
  const { cleanTextTags, urlRegex } = options;
  const textVal = note.text || '';

  if (textVal.trim() === '') {
    return null;
  }

  const textEl = document.createElement('div');
  textEl.className = 'note-text';
  textEl.appendChild(renderFormattedText(cleanTextTags(textVal), { urlRegex }));
  return textEl;
}

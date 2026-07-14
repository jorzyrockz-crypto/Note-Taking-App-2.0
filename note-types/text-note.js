import { renderFormattedText } from './shared.js';

export function renderTextNoteContent(note, options) {
  const { cleanTextTags, urlRegex } = options;
  const textVal = note.text || '';

  if (textVal.trim() === '') {
    return null;
  }

  const textEl = document.createElement('div');
  textEl.className = 'note-text';
  if (note.isRichText) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = textVal;
    
    // Strip unsafe elements
    tempDiv.querySelectorAll('script, style, iframe, object, embed, link').forEach(el => el.remove());
    
    // Ensure contenteditable is stripped
    tempDiv.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
    });

    // Disable all checkbox inputs in preview note card
    tempDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.setAttribute('disabled', 'disabled');
    });

    textEl.innerHTML = tempDiv.innerHTML;
    textEl.classList.add('rich-preview');
  } else {
    textEl.appendChild(renderFormattedText(cleanTextTags(textVal), { urlRegex }));
  }
  return textEl;
}

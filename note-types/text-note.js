import { renderFormattedText } from './shared.js';

/**
 * Explicit rich-text classifier based on documented Paperuss property markers.
 * @param {object} note
 * @returns {boolean}
 */
export function isRichTextNote(note) {
  if (!note || typeof note !== 'object') return false;
  return Boolean(
    note.isRichText === true ||
    note.editorMode === 'glass'
  );
}

/**
 * Sanitizes rich-text HTML DOM tree inside tempDiv.
 * Removes unsafe element tags, inline event handler attributes, unsafe URL protocols (javascript:, vbscript:, unsafe data:),
 * contenteditable, and disables preview checkboxes.
 * @param {HTMLElement} tempDiv
 * @param {{ preserveEditorControls?: boolean }} options
 */
export function sanitizeRichTextHtml(tempDiv, options = {}) {
  if (!tempDiv) return;
  const { preserveEditorControls = false } = options;

  // 1. Remove prohibited/unsafe element tags
  const unsafeTags = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'foreignobject'];
  unsafeTags.forEach(tag => {
    tempDiv.querySelectorAll(tag).forEach(el => el.remove());
  });

  // 2. Helper to check URL safety
  const isSafeUrl = (urlStr, attrName, element) => {
    if (!urlStr || typeof urlStr !== 'string') return false;
    const trimmed = urlStr.trim();
    if (!trimmed) return false;

    // Strip control characters & whitespace for protocol check
    const normalized = trimmed.replace(/[\x00-\x1F\x7F-\x9F\s]/g, '').toLowerCase();

    if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) {
      return false;
    }

    if (normalized.startsWith('data:')) {
      const tagName = String(element?.tagName || '').toUpperCase();
      const normalizedAttrName = String(attrName || '').toLowerCase();
      const safeImageDataPrefixes = [
        'data:image/png',
        'data:image/jpeg',
        'data:image/jpg',
        'data:image/gif',
        'data:image/webp'
      ];

      if (tagName === 'IMG' && normalizedAttrName === 'src') {
        return safeImageDataPrefixes.some(prefix => normalized.startsWith(prefix));
      }

      if (tagName === 'AUDIO' && normalizedAttrName === 'src') {
        return normalized.startsWith('data:audio/');
      }

      return false;
    }

    return true;
  };

  // 3. Inspect all elements in the tree (HTML, SVG, MathML)
  const allElements = Array.from(tempDiv.querySelectorAll('*'));
  allElements.forEach(el => {
    // A. Remove contenteditable
    if (!preserveEditorControls && typeof el.hasAttribute === 'function' && el.hasAttribute('contenteditable')) {
      el.removeAttribute('contenteditable');
    }

    // B. Disable checkboxes
    if (!preserveEditorControls && el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'checkbox') {
      el.setAttribute('disabled', 'disabled');
    }

    // C. Inspect and sanitize all attributes
    if (el.attributes) {
      const attrsList = Array.from(el.attributes);
      const attrsToRemove = [];
      const urlAttrs = ['href', 'src', 'poster', 'action', 'formaction', 'xlink:href', 'data'];

      attrsList.forEach(attr => {
        if (!attr || !attr.name) return;
        const attrName = attr.name.toLowerCase();
        const attrValue = attr.value || '';

        // Remove any inline event handler attribute (starts with 'on')
        if (attrName.startsWith('on')) {
          attrsToRemove.push(attr.name);
          return;
        }

        // Remove unsafe URLs from URL attributes
        if (urlAttrs.includes(attrName)) {
          if (!isSafeUrl(attrValue, attrName, el)) {
            attrsToRemove.push(attr.name);
          }
        }
      });

      attrsToRemove.forEach(attrName => {
        el.removeAttribute(attrName);
      });
    }
  });
}

export function renderTextNoteContent(note, options) {
  const { cleanTextTags, urlRegex } = options || {};
  const textVal = note?.text || '';

  if (textVal.trim() === '') {
    return null;
  }

  const textEl = document.createElement('div');
  textEl.className = 'note-text';

  if (isRichTextNote(note)) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = textVal;

    sanitizeRichTextHtml(tempDiv);

    textEl.innerHTML = tempDiv.innerHTML;
    textEl.classList.add('rich-preview');
  } else {
    const cleanedText = typeof cleanTextTags === 'function' ? cleanTextTags(textVal) : textVal;
    textEl.appendChild(renderFormattedText(cleanedText, { urlRegex }));
  }

  return textEl;
}

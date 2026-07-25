/**
 * Media Deduplication Module
 * Prevents displaying the same image/photo twice on a single note card
 * by suppressing images in the body preview if already rendered in the media deck.
 */

/**
 * Normalizes a URL or data reference string for stable comparison.
 * @param {string} urlStr
 * @returns {string}
 */
export function normalizeMediaKey(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const trimmed = urlStr.trim();
  if (!trimmed) return '';
  try {
    // Strip trailing slashes and hash fragments if standard URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      return `${u.origin}${u.pathname}${u.search}`;
    }
  } catch (_) {}
  return trimmed;
}

/**
 * Extracts set of stable media keys from note media deck slides and note metadata.
 * Uses attachment IDs, normalized source/data URLs, and video IDs.
 * @param {object} note
 * @param {Array} [slides]
 * @returns {Set<string>} Set of normalized stable keys
 */
export function extractHubMediaKeys(note, slides = []) {
  const keys = new Set();
  if (!note) return keys;

  // 1. Direct note properties
  if (note.image) {
    const norm = normalizeMediaKey(note.image);
    if (norm) keys.add(norm);
  }
  if (note.videoId) {
    keys.add(`video:${note.videoId}`);
  }

  // 2. Attachments & files
  const attachments = Array.isArray(note.fileAttachments) && note.fileAttachments.length > 0
    ? note.fileAttachments
    : (Array.isArray(note.files) ? note.files : []);

  attachments.forEach(file => {
    if (!file) return;
    if (file.id) keys.add(`id:${file.id}`);
    if (file.attachmentId) keys.add(`id:${file.attachmentId}`);
    if (file.url) keys.add(normalizeMediaKey(file.url));
    if (file.src) keys.add(normalizeMediaKey(file.src));
    if (file.path) keys.add(normalizeMediaKey(file.path));
    if (file.data) keys.add(normalizeMediaKey(file.data));
  });

  // 3. Slide objects
  if (Array.isArray(slides)) {
    slides.forEach(slide => {
      if (!slide) return;
      if (slide.id) keys.add(`slide:${slide.id}`);
      if (slide.attachmentId) keys.add(`id:${slide.attachmentId}`);
      if (slide.videoId) keys.add(`video:${slide.videoId}`);
      if (slide.url) keys.add(normalizeMediaKey(slide.url));
      if (slide.src) keys.add(normalizeMediaKey(slide.src));
      if (slide.image) keys.add(normalizeMediaKey(slide.image));
    });
  }

  return keys;
}

/**
 * Checks if an <img> element matches any key in hubKeys using stable identifiers.
 * Prevents false positives by NOT matching on raw filename alone.
 * @param {HTMLElement} imgEl
 * @param {Set<string>} hubKeys
 * @returns {boolean}
 */
export function isImageInHubKeys(imgEl, hubKeys) {
  if (!imgEl || !hubKeys || hubKeys.size === 0) return false;

  // Check data-attachment-id or data-id
  const attachId = imgEl.getAttribute ? (imgEl.getAttribute('data-attachment-id') || imgEl.getAttribute('data-id')) : null;
  if (attachId && hubKeys.has(`id:${attachId}`)) {
    return true;
  }

  const src = imgEl.getAttribute ? (imgEl.getAttribute('src') || imgEl.src) : null;
  if (src) {
    const normSrc = normalizeMediaKey(src);
    if (normSrc && hubKeys.has(normSrc)) {
      return true;
    }
  }

  const dataSrc = imgEl.getAttribute ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('data-url')) : null;
  if (dataSrc) {
    const normData = normalizeMediaKey(dataSrc);
    if (normData && hubKeys.has(normData)) {
      return true;
    }
  }

  return false;
}

/**
 * Suppresses images in a body content element that are already present in hub keys.
 * Removes empty container wrappers cleanly after image removal.
 * @param {HTMLElement} contentEl
 * @param {Set<string>} hubKeys
 * @returns {number} Number of images removed
 */
export function deduplicateBodyMedia(contentEl, hubKeys) {
  if (!contentEl || !hubKeys || hubKeys.size === 0) return 0;

  const collectImages = (el) => {
    const res = [];
    if (!el) return res;
    if (el.tagName === 'IMG') res.push(el);
    if (el.children) {
      for (let i = 0; i < el.children.length; i++) {
        res.push(...collectImages(el.children[i]));
      }
    }
    return res;
  };

  const images = typeof contentEl.querySelectorAll === 'function' && contentEl.querySelectorAll('img').length > 0
    ? Array.from(contentEl.querySelectorAll('img'))
    : collectImages(contentEl);

  const toRemove = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (isImageInHubKeys(img, hubKeys)) {
      toRemove.push(img);
    }
  }

  toRemove.forEach(img => {
    const parent = img.parentElement || img.parentNode;
    if (parent) {
      if (typeof parent.removeChild === 'function') {
        parent.removeChild(img);
      } else if (Array.isArray(parent.children)) {
        const idx = parent.children.indexOf(img);
        if (idx !== -1) parent.children.splice(idx, 1);
      }
      // Clean up parent wrappers recursively if now empty (no text and no element children)
      let currParent = parent;
      const topBoundary = contentEl ? (contentEl.parentElement || contentEl.parentNode) : null;
      while (
        currParent &&
        currParent !== topBoundary &&
        typeof currParent.textContent === 'string' &&
        currParent.textContent.trim() === '' &&
        (!currParent.children || currParent.children.length === 0)
      ) {
        const ancestor = currParent.parentElement || currParent.parentNode;
        if (ancestor) {
          if (typeof ancestor.removeChild === 'function') {
            ancestor.removeChild(currParent);
          } else if (Array.isArray(ancestor.children)) {
            const idx = ancestor.children.indexOf(currParent);
            if (idx !== -1) ancestor.children.splice(idx, 1);
          }
        }
        currParent = ancestor;
      }
    }
  });

  return toRemove.length;
}

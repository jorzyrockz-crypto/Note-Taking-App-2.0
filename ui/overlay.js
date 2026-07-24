/**
 * UI Overlay Infrastructure Module
 * Handles reusable overlay mechanics: reference-counted scroll locking, per-owner focus management,
 * backdrop click-outside dismissal, and Escape key dismissal.
 */

let activeScrollLockCount = 0;
let originalPaddingRight = '';
const ownerFocusMap = new Map();

/**
 * Saves the currently focused element associated with a specific owner (e.g. dialog element).
 * Re-saving for an already open owner preserves the original focus target.
 * @param {Object|HTMLElement} [owner]
 */
export function saveFocusedElement(owner) {
  if (typeof document === 'undefined' || !document.activeElement) return;
  const key = owner || 'global';
  if (!ownerFocusMap.has(key)) {
    ownerFocusMap.set(key, document.activeElement);
  }
}

/**
 * Restores focus to the previously saved element for the specified owner.
 * @param {Object|HTMLElement} [owner]
 */
export function restoreFocusedElement(owner) {
  const key = owner || 'global';
  const elementToFocus = ownerFocusMap.get(key);
  if (elementToFocus && typeof elementToFocus.focus === 'function') {
    try {
      elementToFocus.focus({ preventScroll: true });
    } catch (_) {}
  }
  ownerFocusMap.delete(key);
}

/**
 * Locks body scroll using reference counting and dynamically compensates for scrollbar width layout shifts.
 * Body scroll is locked when activeScrollLockCount > 0.
 */
export function lockBodyScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  activeScrollLockCount++;
  if (activeScrollLockCount === 1) {
    if (typeof window !== 'undefined' && document.documentElement) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        originalPaddingRight = document.body.style.paddingRight || '';
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    document.body.classList.add('scroll-locked');
  }
}

/**
 * Unlocks body scroll using reference counting.
 * Scroll remains locked as long as activeScrollLockCount > 0.
 */
export function unlockBodyScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  if (activeScrollLockCount > 0) {
    activeScrollLockCount--;
  }
  if (activeScrollLockCount === 0) {
    document.body.classList.remove('scroll-locked');
    document.body.style.paddingRight = originalPaddingRight;
    originalPaddingRight = '';
  }
}

/**
 * Gets current active scroll lock count (for testing).
 * @returns {number}
 */
export function getActiveScrollLockCount() {
  return activeScrollLockCount;
}

/**
 * Resets scroll lock state (for testing).
 */
export function resetScrollLockForTesting() {
  activeScrollLockCount = 0;
  originalPaddingRight = '';
  ownerFocusMap.clear();
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('scroll-locked');
    document.body.style.paddingRight = '';
  }
}

/**
 * Binds a click handler on the overlay backdrop to invoke a dismiss callback when clicked outside.
 * @param {HTMLElement} overlayEl
 * @param {function(): void} dismissFn
 * @returns {function(): void} Cleanup function
 */
export function setupOverlayOutsideClick(overlayEl, dismissFn) {
  if (!overlayEl || typeof dismissFn !== 'function') return () => {};

  const handler = (e) => {
    if (e.target === overlayEl) {
      dismissFn();
    }
  };

  overlayEl.addEventListener('click', handler);
  return () => {
    overlayEl.removeEventListener('click', handler);
  };
}

/**
 * Binds an Escape key listener to dismiss the target overlay when active.
 * @param {HTMLElement} overlayEl
 * @param {function(): void} dismissFn
 * @returns {function(): void} Cleanup function
 */
export function setupOverlayEscapeKey(overlayEl, dismissFn) {
  if (typeof document === 'undefined' || !overlayEl || typeof dismissFn !== 'function') return () => {};

  const handler = (e) => {
    if (e.key === 'Escape') {
      const isVisible = overlayEl.classList.contains('visible') ||
                        overlayEl.classList.contains('active') ||
                        overlayEl.getAttribute('aria-hidden') === 'false';
      if (isVisible) {
        e.preventDefault();
        dismissFn();
      }
    }
  };

  document.addEventListener('keydown', handler);
  return () => {
    document.removeEventListener('keydown', handler);
  };
}

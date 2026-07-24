/**
 * UI Dialog Infrastructure Module
 * Manages generic dialog visibility, ARIA attributes, per-dialog focus capture/restoration,
 * reference-counted scroll locking, and stacked Escape/outside-click dismissal.
 */

import {
  saveFocusedElement,
  restoreFocusedElement,
  lockBodyScroll,
  unlockBodyScroll,
  setupOverlayOutsideClick
} from './overlay.js';

const activeDialogCleanups = new Map();
const activeDialogScrollLocks = new Set();
const openDialogStack = [];

let escapeListenerBound = false;

function ensureGlobalEscapeListener() {
  if (escapeListenerBound || typeof document === 'undefined') return;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDialogStack.length > 0) {
      const topDialogInfo = openDialogStack[openDialogStack.length - 1];
      if (topDialogInfo && topDialogInfo.options.dismissOnEscape !== false) {
        e.preventDefault();
        hideDialog(topDialogInfo.dialogEl, topDialogInfo.options);
        if (typeof topDialogInfo.options.onDismiss === 'function') {
          topDialogInfo.options.onDismiss();
        }
      }
    }
  });

  escapeListenerBound = true;
}

/**
 * Resets dialog state for testing environment.
 */
export function resetDialogStateForTesting() {
  activeDialogCleanups.clear();
  activeDialogScrollLocks.clear();
  openDialogStack.length = 0;
  escapeListenerBound = false;
}

/**
 * Displays a dialog element with ARIA states, per-dialog focus management,
 * reference-counted body scroll locking, and stacked Escape/outside dismissal.
 * @param {HTMLElement} dialogEl
 * @param {Object} [options]
 * @param {string} [options.visibleClass='visible']
 * @param {boolean} [options.lockScroll=true]
 * @param {boolean} [options.restoreFocus=true]
 * @param {boolean} [options.dismissOnEscape=true]
 * @param {boolean} [options.dismissOnOutsideClick=false]
 * @param {function(): void} [options.onDismiss]
 */
export function showDialog(dialogEl, options = {}) {
  if (!dialogEl) return;

  ensureGlobalEscapeListener();

  const visibleClass = options.visibleClass || 'visible';
  const shouldLockScroll = options.lockScroll !== false;
  const shouldRestoreFocus = options.restoreFocus !== false;
  const shouldDismissOutside = options.dismissOnOutsideClick === true;

  const isAlreadyOpen = dialogEl.classList.contains(visibleClass);

  if (shouldRestoreFocus && !isAlreadyOpen) {
    saveFocusedElement(dialogEl);
  }

  dialogEl.classList.add(visibleClass);
  dialogEl.setAttribute('aria-hidden', 'false');
  dialogEl.setAttribute('aria-modal', 'true');

  if (shouldLockScroll && !activeDialogScrollLocks.has(dialogEl)) {
    activeDialogScrollLocks.add(dialogEl);
    lockBodyScroll();
  }

  // Manage stack order: remove if existing and push to top
  const stackIndex = openDialogStack.findIndex(item => item.dialogEl === dialogEl);
  if (stackIndex !== -1) {
    openDialogStack.splice(stackIndex, 1);
  }
  openDialogStack.push({ dialogEl, options });

  // Cleanup any previous outside-click listeners registered for this specific dialog instance
  const existingCleanup = activeDialogCleanups.get(dialogEl);
  if (existingCleanup) {
    existingCleanup();
    activeDialogCleanups.delete(dialogEl);
  }

  const cleanups = [];

  const handleDismiss = () => {
    hideDialog(dialogEl, options);
    if (typeof options.onDismiss === 'function') {
      options.onDismiss();
    }
  };

  if (shouldDismissOutside) {
    cleanups.push(setupOverlayOutsideClick(dialogEl, handleDismiss));
  }

  activeDialogCleanups.set(dialogEl, () => {
    cleanups.forEach(fn => fn());
  });

  // Focus initial focusable element inside dialog if available
  const initialFocusEl = dialogEl.querySelector('[autofocus], input, button, select, textarea');
  if (initialFocusEl && typeof initialFocusEl.focus === 'function') {
    try {
      initialFocusEl.focus({ preventScroll: true });
    } catch (_) {}
  }
}

/**
 * Hides a dialog element and cleans up scroll lock, ARIA state, listeners, and focus.
 * @param {HTMLElement} dialogEl
 * @param {Object} [options]
 * @param {string} [options.visibleClass='visible']
 * @param {boolean} [options.lockScroll=true]
 * @param {boolean} [options.restoreFocus=true]
 */
export function hideDialog(dialogEl, options = {}) {
  if (!dialogEl) return;

  const visibleClass = options.visibleClass || 'visible';
  const shouldLockScroll = options.lockScroll !== false;
  const shouldRestoreFocus = options.restoreFocus !== false;

  const isAlreadyClosed = !dialogEl.classList.contains(visibleClass);
  if (isAlreadyClosed) return;

  dialogEl.classList.remove(visibleClass);
  dialogEl.setAttribute('aria-hidden', 'true');
  dialogEl.removeAttribute('aria-modal');

  // Remove from open stack
  const stackIndex = openDialogStack.findIndex(item => item.dialogEl === dialogEl);
  if (stackIndex !== -1) {
    openDialogStack.splice(stackIndex, 1);
  }

  if (shouldLockScroll && activeDialogScrollLocks.has(dialogEl)) {
    activeDialogScrollLocks.delete(dialogEl);
    unlockBodyScroll();
  }

  const cleanup = activeDialogCleanups.get(dialogEl);
  if (cleanup) {
    cleanup();
    activeDialogCleanups.delete(dialogEl);
  }

  if (shouldRestoreFocus) {
    restoreFocusedElement(dialogEl);
  }
}

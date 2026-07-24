/**
 * UI Infrastructure Package Entrance
 * Re-exports public API for toast notifications, overlay mechanics, and generic dialog visibility.
 */

export {
  showToast,
  getOrCreateToastContainer,
  configureToastProvider,
  normalizeToastPosition
} from './toast.js';

export {
  saveFocusedElement,
  restoreFocusedElement,
  lockBodyScroll,
  unlockBodyScroll,
  getActiveScrollLockCount,
  resetScrollLockForTesting,
  setupOverlayOutsideClick,
  setupOverlayEscapeKey
} from './overlay.js';

export {
  showDialog,
  hideDialog,
  resetDialogStateForTesting
} from './dialog.js';

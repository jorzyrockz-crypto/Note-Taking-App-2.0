/**
 * PWA Infrastructure Package Entrance
 * Re-exports public API for PWA installation, service worker lifecycle, and version/changelog metadata.
 */

import { initPwaInstall } from './install.js';
import {
  registerPaperussServiceWorker,
  getWaitingWorker,
  checkServiceWorkerUpdate
} from './service-worker.js';
import { initVersionAndChangelog } from './version.js';

export {
  getDeferredPrompt,
  clearDeferredPrompt,
  promptInstall,
  showInstallNotification,
  resetInstallStateForTesting,
  initPwaInstall
} from './install.js';

export {
  activateWaitingWorker,
  handleServiceWorkerUpdate,
  registerPaperussServiceWorker,
  resetServiceWorkerStateForTesting,
  getWaitingWorker,
  checkServiceWorkerUpdate
} from './service-worker.js';

export {
  CURRENT_VERSION,
  DEFAULT_CHANGELOG,
  renderCollapsibleChangelog,
  initVersionAndChangelog,
  resetVersionStateForTesting
} from './version.js';

let pwaInitialized = false;
let pwaInitPromise = null;

/**
 * Resets overall PWA initialization state for testing.
 */
export function resetPwaInitializationForTesting() {
  pwaInitialized = false;
  pwaInitPromise = null;
}

/**
 * Initializes all PWA capabilities (install prompt capture, service worker, versioning).
 * Idempotent: repeated calls do not duplicate listeners or registrations and return the retained promise.
 * @param {Object} options
 * @param {function(Object): void} [options.showToast]
 * @param {function(function): void} [options.subscribeToVersionUpdates]
 * @param {string} [options.swUrl='./sw.js']
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export function initializePwa(options = {}) {
  if (pwaInitialized && pwaInitPromise) {
    return pwaInitPromise;
  }

  const showToast = options.showToast;
  const subscribeToVersionUpdates = options.subscribeToVersionUpdates;
  const swUrl = options.swUrl || './sw.js';

  initPwaInstall({ showToast });

  pwaInitPromise = registerPaperussServiceWorker({ swUrl, showToast });

  initVersionAndChangelog({
    subscribeToVersionUpdates,
    showToast,
    getWaitingWorker,
    checkServiceWorkerUpdate
  });

  pwaInitialized = true;
  return pwaInitPromise;
}

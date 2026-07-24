/**
 * PWA Service Worker Module
 * Handles service worker registration, update detection, waiting-worker activation,
 * and single-reload controllerchange coordination.
 */

let isReloading = false;
let swBound = false;
let lastNotifiedWorker = null;
let currentWaitingWorker = null;
let activeRegistrationPromise = null;
let activeRegistration = null;

/**
 * Gets current waiting service worker if available.
 * @returns {ServiceWorker|null}
 */
export function getWaitingWorker() {
  return currentWaitingWorker;
}

/**
 * Explicitly triggers update check on active registration.
 * @returns {Promise<void|null>}
 */
export async function checkServiceWorkerUpdate() {
  if (activeRegistration && typeof activeRegistration.update === 'function') {
    return await activeRegistration.update();
  }
  return null;
}

/**
 * Resets service worker state for testing.
 */
export function resetServiceWorkerStateForTesting() {
  isReloading = false;
  swBound = false;
  lastNotifiedWorker = null;
  currentWaitingWorker = null;
  activeRegistrationPromise = null;
  activeRegistration = null;
  if (typeof window !== 'undefined') {
    delete window.__swUpdateWaiting;
    delete window.__swWaitingWorker;
  }
}

/**
 * Activates a waiting service worker by sending SKIP_WAITING postMessage.
 * @param {ServiceWorker} [waitingWorker]
 */
export function activateWaitingWorker(waitingWorker) {
  const targetWorker = waitingWorker || currentWaitingWorker;
  if (targetWorker && typeof targetWorker.postMessage === 'function') {
    targetWorker.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Handles presenting an update notification when a new service worker is waiting.
 * @param {ServiceWorker} waitingWorker
 * @param {function(Object): void} [showToast]
 */
export function handleServiceWorkerUpdate(waitingWorker, showToast) {
  if (!waitingWorker || waitingWorker === lastNotifiedWorker) return;
  lastNotifiedWorker = waitingWorker;
  currentWaitingWorker = waitingWorker;

  if (typeof window !== 'undefined') {
    window.__swUpdateWaiting = true;
    window.__swWaitingWorker = waitingWorker;
  }

  if (typeof document !== 'undefined') {
    const splash = document.getElementById('pwa-splash');
    if (splash && document.body.contains(splash)) {
      if (typeof window !== 'undefined' && typeof window.__showSplashUpdateUI === 'function') {
        window.__showSplashUpdateUI();
        return;
      }
    }
  }

  if (typeof showToast === 'function') {
    showToast({
      title: 'Update Available',
      text: 'A new version of Paperuss is ready. Click update to load the new features.',
      duration: 0,
      action: {
        text: 'Update',
        callback: () => {
          activateWaitingWorker(waitingWorker);
        }
      }
    });
  }
}

/**
 * Registers the Paperuss service worker and sets up update listeners.
 * Idempotent: caches and returns active registration promise on subsequent calls.
 * @param {Object} [options]
 * @param {string} [options.swUrl='./sw.js']
 * @param {function(Object): void} [options.showToast]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerPaperussServiceWorker(options = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (activeRegistrationPromise) {
    return activeRegistrationPromise;
  }

  const swUrl = options.swUrl || './sw.js';
  const showToast = options.showToast;

  if (!swBound) {
    swBound = true;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isReloading) {
        isReloading = true;
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    });

    if (typeof document !== 'undefined') {
      const splashUpdateBtn = document.getElementById('splash-update-btn');
      if (splashUpdateBtn && !splashUpdateBtn.dataset.swBound) {
        splashUpdateBtn.dataset.swBound = 'true';
        splashUpdateBtn.addEventListener('click', () => {
          const worker = currentWaitingWorker || (typeof window !== 'undefined' ? window.__swWaitingWorker : null);
          if (worker) {
            activateWaitingWorker(worker);
          }
        });
      }
    }
  }

  activeRegistrationPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register(swUrl);
      activeRegistration = reg;
      console.log('Service Worker registered successfully:', reg.scope);

      if (reg.waiting && navigator.serviceWorker.controller) {
        currentWaitingWorker = reg.waiting;
        handleServiceWorkerUpdate(reg.waiting, showToast);
      }

      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              currentWaitingWorker = installingWorker;
              handleServiceWorkerUpdate(installingWorker, showToast);
            }
          }
        });
      });

      return reg;
    } catch (err) {
      console.error('Service Worker registration failed:', err);
      return null;
    }
  })();

  return activeRegistrationPromise;
}

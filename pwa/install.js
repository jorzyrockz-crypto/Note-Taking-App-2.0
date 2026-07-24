/**
 * PWA Install Lifecycle Module
 * Owns capturing beforeinstallprompt, storing deferred prompt, toggling install controls,
 * handling appinstalled events, and invoking install flow.
 */

let deferredPrompt = null;
let installBound = false;

/**
 * Gets currently captured deferred install prompt event.
 * @returns {Event|null}
 */
export function getDeferredPrompt() {
  return deferredPrompt;
}

/**
 * Clears stored deferred install prompt.
 */
export function clearDeferredPrompt() {
  deferredPrompt = null;
}

/**
 * Triggers native install prompt if captured.
 * @param {Object} [options]
 * @param {function(Object): void} [options.showToast]
 * @returns {Promise<boolean>} Resolves to true if prompt was shown and accepted
 */
export async function promptInstall(options = {}) {
  if (!deferredPrompt) return false;

  try {
    const promptEvent = deferredPrompt;
    promptEvent.prompt();
    const choiceResult = await promptEvent.userChoice;
    deferredPrompt = null;

    const installRow = typeof document !== 'undefined' ? document.getElementById('settings-install-row') : null;
    if (installRow) {
      installRow.style.display = 'none';
    }

    if (choiceResult && choiceResult.outcome === 'accepted') {
      console.log('User accepted PWA installation');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('PWA install prompt failed:', err);
    deferredPrompt = null;
    return false;
  }
}

/**
 * Shows session-bound PWA install notification toast once.
 * @param {function(Object): void} showToast
 */
export function showInstallNotification(showToast) {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem('install-prompted')) return;
  sessionStorage.setItem('install-prompted', 'true');

  if (typeof showToast === 'function') {
    showToast({
      title: 'Install App',
      text: 'Install Paperuss on your device for offline support and standalone launch.',
      action: {
        text: 'Install',
        callback: () => {
          promptInstall({ showToast });
        }
      }
    });
  }
}

/**
 * Resets install state for testing.
 */
export function resetInstallStateForTesting() {
  deferredPrompt = null;
  installBound = false;
}

/**
 * Initializes PWA install listeners.
 * Idempotent: repeated calls do not duplicate listeners.
 * @param {Object} options
 * @param {function(Object): void} [options.showToast]
 */
export function initPwaInstall(options = {}) {
  if (typeof window === 'undefined' || installBound) return;
  installBound = true;

  const showToast = options.showToast;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installRow = document.getElementById('settings-install-row');
    if (installRow) {
      installRow.style.display = 'flex';
    }

    const installBtn = document.getElementById('settings-install-btn');
    if (installBtn && !installBtn.dataset.pwaBound) {
      installBtn.dataset.pwaBound = 'true';
      installBtn.addEventListener('click', () => {
        promptInstall({ showToast });
      });
    }

    showInstallNotification(showToast);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const installRow = document.getElementById('settings-install-row');
    if (installRow) {
      installRow.style.display = 'none';
    }

    if (typeof showToast === 'function') {
      showToast({ title: 'App Installed', text: 'Paperuss has been installed successfully!' });
    }
  });
}

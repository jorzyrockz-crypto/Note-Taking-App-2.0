/**
 * UI Toast Infrastructure Module
 * Handles toast notification rendering, positioning, auto-dismiss timers, and safe text insertion.
 */

const ALLOWED_POSITIONS = new Set([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]);

let settingsProvider = () => ({
  notificationsEnabled: true,
  notificationsDnd: false,
  notificationsReminders: true,
  toastPosition: 'top-right'
});

let quietHoursCheck = () => false;
let notificationChime = () => {};
let notificationVibrate = () => {};

/**
 * Configures the toast infrastructure providers.
 * Evaluates getSettings dynamically on every toast invocation.
 * @param {Object} providers
 * @param {function(): Object} [providers.getSettings]
 * @param {function(): boolean} [providers.isQuietHours]
 * @param {function(): void} [providers.playChime]
 * @param {function(): void} [providers.triggerVibrate]
 */
export function configureToastProvider(providers = {}) {
  if (typeof providers.getSettings === 'function') {
    settingsProvider = providers.getSettings;
  }
  if (typeof providers.isQuietHours === 'function') {
    quietHoursCheck = providers.isQuietHours;
  }
  if (typeof providers.playChime === 'function') {
    notificationChime = providers.playChime;
  }
  if (typeof providers.triggerVibrate === 'function') {
    notificationVibrate = providers.triggerVibrate;
  }
}

/**
 * Normalizes toast position string to allowed set, falling back to top-right.
 * @param {string} pos
 * @returns {string}
 */
export function normalizeToastPosition(pos) {
  if (typeof pos === 'string' && ALLOWED_POSITIONS.has(pos)) {
    return pos;
  }
  return 'top-right';
}

/**
 * Gets or creates the toast container element in the DOM.
 * @param {Object} settings
 * @returns {HTMLElement|null}
 */
export function getOrCreateToastContainer(settings = {}) {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Update position class safely
  const rawPos = settings.toastPosition;
  const pos = normalizeToastPosition(rawPos);

  if (container.classList && typeof container.classList.forEach === 'function') {
    container.classList.forEach(className => {
      if (className.startsWith('pos-')) {
        container.classList.remove(className);
      }
    });
  } else if (container.className) {
    container.className = container.className.split(' ').filter(c => !c.startsWith('pos-')).join(' ');
  }
  container.classList.add(`pos-${pos}`);

  return container;
}

/**
 * Displays a toast notification.
 * Safe against XSS: titles and text are inserted via textContent.
 * @param {Object} options - Toast options or legacy note object
 * @returns {HTMLElement|null} The created toast element
 */
export function showToast(options = {}) {
  if (typeof document === 'undefined') return null;

  const settings = (typeof settingsProvider === 'function' ? settingsProvider() : null) || {};

  // 1. Notifications enabled check
  if (settings.notificationsEnabled === false) {
    return null;
  }

  // 2. Do Not Disturb check
  if (settings.notificationsDnd) {
    return null;
  }

  // 3. Quiet Hours check
  if (typeof quietHoursCheck === 'function' && quietHoursCheck()) {
    return null;
  }

  // 4. Note reminder filter check
  const isNoteReminder = !!(options && options.id && options.reminder);
  if (isNoteReminder && settings.notificationsReminders === false) {
    return null;
  }

  const container = getOrCreateToastContainer(settings);

  // Trigger optional sound/vibration
  if (typeof notificationChime === 'function') {
    try { notificationChime(); } catch (_) {}
  }
  if (typeof notificationVibrate === 'function') {
    try { notificationVibrate(); } catch (_) {}
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';

  // Bell icon
  const bellSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  bellSvg.setAttribute('class', 'toast-bell-icon');
  bellSvg.setAttribute('viewBox', '0 0 24 24');
  const bellPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bellPath.setAttribute('fill', 'currentColor');
  bellPath.setAttribute('d', 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z');
  bellSvg.appendChild(bellPath);
  toast.appendChild(bellSvg);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'toast-content';
  contentWrapper.style.display = 'flex';
  contentWrapper.style.flexDirection = 'column';

  // Title (safe textContent)
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = options.title || 'Reminder Alert!';
  contentWrapper.appendChild(titleEl);

  // Text (safe textContent)
  const textEl = document.createElement('div');
  textEl.className = 'toast-text';
  textEl.textContent = options.text || 'You have a scheduled reminder.';
  contentWrapper.appendChild(textEl);

  let dismissTimer = null;

  const removeToast = () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 350);
  };

  // Optional Action Button
  if (options.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.style.cssText = 'background: var(--primary, #1a73e8); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; margin-top: 6px; width: fit-content; border: 1px solid rgba(255,255,255,0.1);';
    actionBtn.textContent = options.action.text || 'Action';

    let actionFired = false;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!actionFired) {
        actionFired = true;
        if (typeof options.action.callback === 'function') {
          options.action.callback();
        }
      }
      removeToast();
    });
    contentWrapper.appendChild(actionBtn);
  }

  toast.appendChild(contentWrapper);

  // Close Button with explicit UTF-8 '✕' glyph
  const closeBtn = document.createElement('span');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeToast();
  });
  toast.appendChild(closeBtn);

  if (container) {
    container.appendChild(toast);
  }

  // Automatic dismissal timer
  const duration = options.duration !== undefined ? options.duration : 8000;
  if (duration !== 0) {
    dismissTimer = setTimeout(() => {
      removeToast();
    }, duration);
  }

  return toast;
}

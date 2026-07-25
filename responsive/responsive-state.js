/**
 * Centralized Responsive State Runtime Module
 *
 * Maintains application-wide responsive layout, orientation, and input capability state.
 * Synchronizes DOM attributes/classes and provides subscription hooks for responsive state changes.
 *
 * Dependency Rules:
 * responsive/ must not import app.js, navigation, settings, or feature modules.
 */

import { classifyEnvironment } from './responsive-config.js';

let currentState = null;
let targetWindow = null;
let isInitialized = false;
const subscribers = new Set();
const activeListeners = [];

/**
 * Compares two responsive state snapshots to determine if any property changed.
 * @param {object} prev
 * @param {object} next
 * @returns {boolean}
 */
function hasStateChanged(prev, next) {
  if (!prev || !next) return true;
  return (
    prev.layoutMode !== next.layoutMode ||
    prev.orientation !== next.orientation ||
    prev.pointer !== next.pointer ||
    prev.hover !== next.hover ||
    prev.hasTouch !== next.hasTouch ||
    prev.isStandalone !== next.isStandalone ||
    prev.prefersReducedMotion !== next.prefersReducedMotion
  );
}

/**
 * Synchronizes body element dataset attributes and capability boolean classes.
 * @param {object} state
 */
function syncDomState(state) {
  const doc = (typeof document !== 'undefined' && document) || (targetWindow && targetWindow.document) || null;
  if (!doc || !doc.body || !state) return;

  const { body } = doc;
  if (body.dataset) {
    body.dataset.layout = state.layoutMode;
    body.dataset.orientation = state.orientation;
    body.dataset.pointer = state.pointer;
    body.dataset.hover = state.hover;
  }

  if (body.classList) {
    body.classList.toggle('touch-capable', state.hasTouch);
    body.classList.toggle('pwa-standalone', state.isStandalone);
    body.classList.toggle('prefers-reduced-motion', state.prefersReducedMotion);
  }
}

/**
 * Recalculates current responsive environment state.
 * If state has changed, updates DOM attributes and notifies subscribers.
 */
function updateState() {
  const nextState = Object.freeze(classifyEnvironment(targetWindow));
  if (hasStateChanged(currentState, nextState)) {
    currentState = nextState;
    syncDomState(currentState);
    subscribers.forEach(callback => {
      try {
        callback(currentState);
      } catch (err) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Error in responsive state subscriber:', err);
        }
      }
    });
  }
}

/**
 * Subscribes a callback function to responsive state changes.
 * The callback receives an immutable snapshot of the updated state when genuine changes occur.
 * @param {function(object): void} callback
 * @returns {function(): void} Unsubscribe function
 */
export function subscribeToResponsiveState(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Returns an immutable snapshot of the current responsive state.
 * @returns {object}
 */
export function getResponsiveState() {
  if (!currentState) {
    currentState = Object.freeze(classifyEnvironment(targetWindow));
  }
  return currentState;
}

/**
 * Initializes responsive state observation, DOM dataset synchronization, and media query listeners.
 * Initialization is idempotent: repeated calls return current state without duplicating listeners.
 * @param {object} [envWindow]
 * @returns {object} Immutable snapshot of initialized state
 */
export function initResponsiveState(envWindow) {
  if (isInitialized) {
    return getResponsiveState();
  }

  targetWindow = envWindow || (typeof window !== 'undefined' ? window : null);
  currentState = Object.freeze(classifyEnvironment(targetWindow));
  syncDomState(currentState);

  const win = targetWindow;
  if (win && typeof win.addEventListener === 'function') {
    const handleUpdate = () => updateState();

    win.addEventListener('resize', handleUpdate);
    activeListeners.push(() => win.removeEventListener('resize', handleUpdate));

    win.addEventListener('orientationchange', handleUpdate);
    activeListeners.push(() => win.removeEventListener('orientationchange', handleUpdate));

    if (typeof win.matchMedia === 'function') {
      const mediaQueries = [
        '(orientation: portrait)',
        '(orientation: landscape)',
        '(pointer: coarse)',
        '(pointer: fine)',
        '(pointer: none)',
        '(hover: hover)',
        '(hover: none)',
        '(display-mode: standalone)',
        '(prefers-reduced-motion: reduce)'
      ];

      mediaQueries.forEach(query => {
        try {
          const mql = win.matchMedia(query);
          if (mql) {
            if (typeof mql.addEventListener === 'function') {
              mql.addEventListener('change', handleUpdate);
              activeListeners.push(() => mql.removeEventListener('change', handleUpdate));
            } else if (typeof mql.addListener === 'function') {
              mql.addListener(handleUpdate);
              activeListeners.push(() => mql.removeListener(handleUpdate));
            }
          }
        } catch (_) {}
      });
    }
  }

  isInitialized = true;
  return currentState;
}

/**
 * Removes all installed window and media query listeners, clears subscribers, and resets state.
 * Allows safe re-initialization via initResponsiveState().
 */
export function destroyResponsiveState() {
  while (activeListeners.length > 0) {
    const cleanup = activeListeners.pop();
    try {
      cleanup();
    } catch (_) {}
  }
  subscribers.clear();
  currentState = null;
  targetWindow = null;
  isInitialized = false;
}

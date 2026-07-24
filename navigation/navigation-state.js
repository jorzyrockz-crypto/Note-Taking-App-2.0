/**
 * Navigation State Management
 * Holds active page identity without DOM dependencies or app.js imports.
 */

import { DEFAULT_PAGE, normalizePageId } from './navigation-config.js';

export let currentPage = DEFAULT_PAGE;
const subscribers = new Set();

/**
 * Returns the currently active page ID.
 * @returns {string}
 */
export function getActivePage() {
  return currentPage;
}

/**
 * Sets the active page state and notifies subscribers if changed.
 * @param {string} pageId
 * @returns {string} The normalized active page ID
 */
export function setActivePageState(pageId) {
  const normalized = normalizePageId(pageId);
  const previous = currentPage;
  currentPage = normalized;

  if (previous !== normalized) {
    subscribers.forEach(callback => {
      try {
        callback(normalized, previous);
      } catch (err) {
        console.error('Error in navigation subscriber callback:', err);
      }
    });
  }

  return currentPage;
}

/**
 * Subscribes a listener callback to page state changes.
 * @param {function(string, string): void} callback
 * @returns {function(): void} Unsubscribe function
 */
export function subscribeToPageChanges(callback) {
  if (typeof callback === 'function') {
    subscribers.add(callback);
  }
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Resets state back to DEFAULT_PAGE for testing purposes.
 */
export function resetPageStateForTesting() {
  currentPage = DEFAULT_PAGE;
  subscribers.clear();
}

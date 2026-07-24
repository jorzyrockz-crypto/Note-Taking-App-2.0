/**
 * Navigation Module Entrance
 * Central coordination for state management, page container rendering, navigation listeners, and lifecycle hooks.
 */

import { VALID_PAGES, DEFAULT_PAGE, normalizePageId, isValidPageId } from './navigation-config.js';
import { getActivePage, setActivePageState, subscribeToPageChanges, resetPageStateForTesting, currentPage } from './navigation-state.js';
import {
  showPageContainer,
  setActiveSidebarPage,
  updateMobileDockState,
  collapseSidebarAfterSelection,
  clearSidebarActiveStates
} from './navigation-renderer.js';

const pageLifecycleHooks = new Map();
let globalNavigationCallback = null;
let hapticCallback = null;
let isInitialized = false;

/**
 * Configures navigation module options, such as injecting a haptic feedback provider.
 * @param {{ triggerHaptic?: function(string): void }} options
 */
export function configureNavigation(options = {}) {
  if (options && typeof options.triggerHaptic === 'function') {
    hapticCallback = options.triggerHaptic;
  }
}

/**
 * Registers lifecycle hooks (e.g., onEnter) for specific pages.
 * @param {string} pageId
 * @param {{ onEnter?: function(string, string): void, onLeave?: function(string, string): void }} hooks
 */
export function registerPageLifecycle(pageId, hooks) {
  if (isValidPageId(pageId) && hooks && typeof hooks === 'object') {
    pageLifecycleHooks.set(pageId, hooks);
  }
}

/**
 * Registers a global callback invoked on page transitions.
 * @param {function(string, string): void} callback
 */
export function onPageChange(callback) {
  if (typeof callback === 'function') {
    globalNavigationCallback = callback;
  }
}

/**
 * Sets the active page, updates DOM containers, updates navigation active classes,
 * dispatches custom event, and invokes lifecycle hooks.
 * @param {string} page
 * @param {{ force?: boolean }} [options]
 * @returns {string} The active page ID
 */
export function setActivePage(page, { force = false } = {}) {
  const previousPage = getActivePage();
  const nextPage = normalizePageId(page);

  updateMobileDockState(nextPage);
  setActiveSidebarPage(nextPage);
  collapseSidebarAfterSelection();
  showPageContainer(nextPage);

  // If navigating to the current active page without explicit force, avoid duplicate expensive rendering
  if (previousPage === nextPage && !force) {
    return nextPage;
  }

  const activePage = setActivePageState(nextPage);

  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('pagechange', { detail: { page: activePage, previousPage } }));
  }

  // Invoke page-specific onEnter hook
  const hooks = pageLifecycleHooks.get(activePage);
  if (hooks && typeof hooks.onEnter === 'function') {
    hooks.onEnter(activePage, previousPage);
  }

  // Invoke global navigation callback
  if (typeof globalNavigationCallback === 'function') {
    globalNavigationCallback(activePage, previousPage);
  }

  return activePage;
}

/**
 * Checks if required navigation DOM elements exist for initialization.
 * @returns {boolean}
 */
export function hasRequiredNavigationDOM() {
  if (typeof document === 'undefined' || !document.body) return false;
  return Boolean(
    document.querySelector('.app-sidebar') ||
    document.querySelector('.mobile-bottom-dock') ||
    document.getElementById('sidebar-all-notes') ||
    document.getElementById('settings-page')
  );
}

/**
 * Initializes navigation event listeners idempotently.
 * Returns false without setting initialized flag if DOM is not ready.
 * @returns {boolean}
 */
export function initNavigation() {
  if (isInitialized) return true;

  if (!hasRequiredNavigationDOM()) {
    return false;
  }

  // Bind Sidebar Navigation Items
  const sidebarBindings = [
    { id: 'sidebar-all-notes', page: 'notes' },
    { id: 'sidebar-favorites', page: 'favorites' },
    { id: 'sidebar-search', page: 'search' },
    { id: 'sidebar-productivity', page: 'productivity' },
    { id: 'sidebar-archive', page: 'archive' },
    { id: 'sidebar-deleted', page: 'deleted' },
    { id: 'sidebar-settings', page: 'settings' }
  ];

  sidebarBindings.forEach(({ id, page }) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', (e) => {
      e.stopPropagation();
      setActivePage(page);
    });
  });

  // Bind Settings Top Bar Button
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setActivePage('settings');
  });

  // Bind Tablet Dock Navigation Items
  document.querySelectorAll('[data-tablet-page]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetPage = button.dataset.tabletPage;
      if (targetPage === 'search') {
        setActivePage('search');
      } else if (targetPage === 'productivity') {
        setActivePage('productivity');
      } else {
        setActivePage('notes');
      }
    });
  });

  // Bind Mobile Bottom Dock Items
  const dockItems = document.querySelectorAll('.mobile-bottom-dock .mobile-dock-item[data-target-page]');
  dockItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = item.getAttribute('data-target-page');
      if (targetPage) {
        if (typeof hapticCallback === 'function') {
          hapticCallback('tap');
        }
        setActivePage(targetPage);
      }
    });
  });

  const dockSettingsBtn = document.getElementById('mobile-dock-settings-btn');
  dockSettingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof hapticCallback === 'function') {
      hapticCallback('tap');
    }
    setActivePage('settings');
  });

  // Synchronize mobile dock state on pagechange or hashchange
  const syncDockState = () => {
    updateMobileDockState(getActivePage());
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', syncDockState);
  }
  document.addEventListener('pagechange', syncDockState);

  isInitialized = true;
  return true;
}

/**
 * Resets initialization and state for testing purposes.
 */
export function resetNavigationForTesting() {
  resetPageStateForTesting();
  pageLifecycleHooks.clear();
  globalNavigationCallback = null;
  hapticCallback = null;
  isInitialized = false;
}

export {
  currentPage,
  VALID_PAGES,
  DEFAULT_PAGE,
  isValidPageId,
  normalizePageId,
  getActivePage,
  subscribeToPageChanges,
  showPageContainer,
  setActiveSidebarPage,
  updateMobileDockState,
  collapseSidebarAfterSelection,
  clearSidebarActiveStates
};

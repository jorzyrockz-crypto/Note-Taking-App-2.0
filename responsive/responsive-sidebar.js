import { getResponsiveState, subscribeToResponsiveState } from './responsive-state.js';

let activeSidebarUnsubscribe = null;
let activeMenuBtnListener = null;
let activeOutsideClickListener = null;
let activeMenuBtnElement = null;
let wasDesktopUnpinnedByUser = false;
let closeAllNoteCardMenusCallback = null;
let lastSynchronizedLayoutMode = null;

/**
 * Configures responsive sidebar options such as callbacks.
 * @param {{ closeAllNoteCardMenus?: Function }} [config]
 */
export function configureResponsiveSidebar(config = {}) {
  const opts = config || {};
  if (typeof opts.closeAllNoteCardMenus === 'function') {
    closeAllNoteCardMenusCallback = opts.closeAllNoteCardMenus;
  } else if (opts.closeAllNoteCardMenus === null) {
    closeAllNoteCardMenusCallback = null;
  }
}

/**
 * Synchronizes the sidebar element classes and body layout classes based on responsive state.
 */
export function syncSidebarLayoutState(state) {
  if (typeof document === 'undefined') return;

  const current = state || (typeof getResponsiveState === 'function' ? getResponsiveState() : null);
  if (!current) return;

  const { layoutMode } = current;
  const sidebar = document.querySelector('.app-sidebar');
  const isTransition = lastSynchronizedLayoutMode === null || lastSynchronizedLayoutMode !== layoutMode;

  if (layoutMode === 'phone' || layoutMode === 'tablet-portrait') {
    // Drawer modes: remove pinned layout class and close stale drawer on mode transition
    document.body.classList.remove('sidebar-pinned');
    if (isTransition && sidebar && sidebar.classList.contains('sidebar-open')) {
      sidebar.classList.remove('sidebar-open');
    }
  } else if (layoutMode === 'tablet-landscape') {
    // Rail mode: remove drawer state and unpin from desktop layout
    document.body.classList.remove('sidebar-pinned');
    if (isTransition && sidebar && sidebar.classList.contains('sidebar-open')) {
      sidebar.classList.remove('sidebar-open');
    }
  } else if (layoutMode === 'desktop') {
    // Desktop mode: remove stale drawer state on mode transition
    if (isTransition && sidebar && sidebar.classList.contains('sidebar-open')) {
      sidebar.classList.remove('sidebar-open');
    }
    // Restore or preserve desktop pinned state unless explicitly unpinned by user on desktop
    if (!wasDesktopUnpinnedByUser) {
      document.body.classList.add('sidebar-pinned');
    }
  }

  lastSynchronizedLayoutMode = layoutMode;
}

/**
 * Handles menu button click according to current responsive layout mode.
 */
export function handleSidebarMenuClick(e) {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }

  const current = typeof getResponsiveState === 'function' ? getResponsiveState() : null;
  const layoutMode = current ? current.layoutMode : 'desktop';
  const sidebar = document.querySelector('.app-sidebar');

  if (layoutMode === 'phone' || layoutMode === 'tablet-portrait') {
    // Drawer modes: toggle sidebar drawer only, never toggle sidebar-pinned
    document.body.classList.remove('sidebar-pinned');
    if (sidebar) {
      sidebar.classList.toggle('sidebar-open');
    }
  } else if (layoutMode === 'tablet-landscape') {
    // Tablet landscape rail mode: do NOT toggle desktop pin state or drawer
    document.body.classList.remove('sidebar-pinned');
    if (sidebar) {
      sidebar.classList.remove('sidebar-open');
    }
  } else if (layoutMode === 'desktop') {
    // Desktop mode: toggle sidebar-pinned only, never toggle sidebar-open
    if (sidebar) {
      sidebar.classList.remove('sidebar-open');
    }
    const isCurrentlyPinned = document.body.classList.contains('sidebar-pinned');
    if (isCurrentlyPinned) {
      document.body.classList.remove('sidebar-pinned');
      wasDesktopUnpinnedByUser = true;
    } else {
      document.body.classList.add('sidebar-pinned');
      wasDesktopUnpinnedByUser = false;
    }
  }

  if (typeof closeAllNoteCardMenusCallback === 'function') {
    closeAllNoteCardMenusCallback();
  }
}

/**
 * Initializes responsive sidebar state management and event handlers.
 * @param {{ closeAllNoteCardMenus?: Function }} [config]
 */
export function initResponsiveSidebarState(config) {
  if (config) {
    configureResponsiveSidebar(config);
  }
  if (typeof document === 'undefined') return;

  // Initial synchronization
  syncSidebarLayoutState();

  // Attach menu button handler if element exists and not already bound
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn && menuBtn !== activeMenuBtnElement) {
    if (activeMenuBtnElement && activeMenuBtnListener) {
      activeMenuBtnElement.removeEventListener('click', activeMenuBtnListener);
    }
    activeMenuBtnElement = menuBtn;
    activeMenuBtnListener = (e) => handleSidebarMenuClick(e);
    menuBtn.addEventListener('click', activeMenuBtnListener);
  }

  // Attach outside click listener for drawer closing
  if (!activeOutsideClickListener) {
    activeOutsideClickListener = (e) => {
      const sidebar = document.querySelector('.app-sidebar');
      if (sidebar && sidebar.classList.contains('sidebar-open')) {
        const target = e.target;
        const btn = activeMenuBtnElement || document.querySelector('.menu-btn');
        if (!sidebar.contains(target) && target !== btn && (!btn || !btn.contains(target))) {
          sidebar.classList.remove('sidebar-open');
        }
      }
    };
    document.addEventListener('click', activeOutsideClickListener);
  }

  // Subscribe to responsive layout state changes
  if (!activeSidebarUnsubscribe) {
    activeSidebarUnsubscribe = subscribeToResponsiveState((newState) => {
      syncSidebarLayoutState(newState);
    });
  }
}

/**
 * Tears down responsive sidebar event listeners and state subscriptions.
 */
export function destroyResponsiveSidebarState() {
  if (activeSidebarUnsubscribe) {
    activeSidebarUnsubscribe();
    activeSidebarUnsubscribe = null;
  }

  if (activeMenuBtnElement && activeMenuBtnListener) {
    if (typeof activeMenuBtnElement.removeEventListener === 'function') {
      activeMenuBtnElement.removeEventListener('click', activeMenuBtnListener);
    }
    activeMenuBtnElement = null;
    activeMenuBtnListener = null;
  }

  if (activeOutsideClickListener) {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('click', activeOutsideClickListener);
    }
    activeOutsideClickListener = null;
  }

  wasDesktopUnpinnedByUser = false;
  closeAllNoteCardMenusCallback = null;
  lastSynchronizedLayoutMode = null;
}

export function resetSidebarStateForTesting() {
  destroyResponsiveSidebarState();
  wasDesktopUnpinnedByUser = false;
  closeAllNoteCardMenusCallback = null;
  lastSynchronizedLayoutMode = null;
}

/**
 * Navigation Renderer
 * Handles showing and hiding page containers, active navigation states, accessibility, and sidebar layout.
 */

import { PAGE_CONTAINER_SELECTORS, SIDEBAR_PAGE_ELEMENT_IDS } from './navigation-config.js';

/**
 * Updates DOM visibility of top-level page containers according to the active page ID.
 * @param {string} pageId
 */
export function showPageContainer(pageId) {
  if (typeof document === 'undefined') return;

  const settingsPage = document.querySelector(PAGE_CONTAINER_SELECTORS.settings);
  const productivityPage = document.querySelector(PAGE_CONTAINER_SELECTORS.productivity);
  const searchPage = document.querySelector(PAGE_CONTAINER_SELECTORS.search);
  const notesFeed = document.querySelector(PAGE_CONTAINER_SELECTORS.notesFeed);
  const creatorWrapper = document.querySelector(PAGE_CONTAINER_SELECTORS.creatorWrapper);
  const feedFilterRow = document.querySelector(PAGE_CONTAINER_SELECTORS.feedFilterRow);

  if (settingsPage) settingsPage.style.display = (pageId === 'settings') ? 'flex' : 'none';
  if (productivityPage) productivityPage.style.display = (pageId === 'productivity') ? 'flex' : 'none';
  if (searchPage) searchPage.style.display = (pageId === 'search') ? 'flex' : 'none';

  const isNotesView = (pageId === 'notes' || pageId === 'archive' || pageId === 'deleted' || pageId === 'favorites');

  if (notesFeed) {
    notesFeed.style.display = isNotesView ? '' : 'none';
  }

  if (creatorWrapper) {
    creatorWrapper.style.display = (pageId === 'notes' && creatorWrapper.classList.contains('visible')) ? 'block' : 'none';
  }

  if (feedFilterRow) {
    feedFilterRow.style.display = (pageId === 'notes') ? '' : 'none';
  }
}

/**
 * Clears active class and aria-current from all sidebar item elements.
 */
export function clearSidebarActiveStates() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.remove('active');
    el.removeAttribute('aria-current');
  });
}

/**
 * Highlights active sidebar item and tablet dock button based on the active page ID.
 * @param {string} pageId
 */
export function setActiveSidebarPage(pageId) {
  if (typeof document === 'undefined') return;

  clearSidebarActiveStates();

  // Update tablet dock active state
  document.querySelectorAll('.tablet-dock-item[data-tablet-page]').forEach(item => {
    const target = item.dataset.tabletPage;
    const isNotesTab = target === 'notes' && pageId !== 'search' && pageId !== 'productivity';
    const isActive = target === pageId || isNotesTab;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  // Update sidebar item active state
  const elementIdMap = {
    settings: SIDEBAR_PAGE_ELEMENT_IDS.settings,
    productivity: SIDEBAR_PAGE_ELEMENT_IDS.productivity,
    archive: SIDEBAR_PAGE_ELEMENT_IDS.archive,
    deleted: SIDEBAR_PAGE_ELEMENT_IDS.deleted,
    favorites: SIDEBAR_PAGE_ELEMENT_IDS.favorites,
    search: SIDEBAR_PAGE_ELEMENT_IDS.search
  };

  const activeElementId = elementIdMap[pageId] || SIDEBAR_PAGE_ELEMENT_IDS.notes;
  const activeEl = document.getElementById(activeElementId);
  if (activeEl) {
    activeEl.classList.add('active');
    activeEl.setAttribute('aria-current', 'page');
  }
}

/**
 * Updates active class on mobile bottom dock navigation items.
 * @param {string} pageId
 */
export function updateMobileDockState(pageId) {
  if (typeof document === 'undefined') return;

  const dockItems = document.querySelectorAll('.mobile-bottom-dock .mobile-dock-item');
  dockItems.forEach(item => {
    const target = item.getAttribute('data-target-page');
    const isNotesItem = (pageId === 'notes' || pageId === 'favorites' || pageId === 'archive' || pageId === 'deleted') && target === 'notes';
    const isActive = target === pageId || isNotesItem;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

/**
 * Collapses the responsive mobile sidebar overlay after navigation selection.
 */
export function collapseSidebarAfterSelection() {
  if (typeof document === 'undefined') return;

  const sidebar = document.querySelector('.app-sidebar');
  if (sidebar?.classList.contains('sidebar-open')) {
    sidebar.classList.remove('sidebar-open');
  }
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    document.body.classList.remove('sidebar-pinned');
  }
}

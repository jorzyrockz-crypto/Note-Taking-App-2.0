/**
 * Navigation Configuration
 * Defines valid application pages, default page, and DOM selectors for navigation components.
 */

export const VALID_PAGES = Object.freeze([
  'notes',
  'favorites',
  'archive',
  'deleted',
  'search',
  'productivity',
  'settings'
]);

export const DEFAULT_PAGE = 'notes';

export const PAGE_CONTAINER_SELECTORS = Object.freeze({
  settings: '#settings-page',
  productivity: '#productivity-page',
  search: '#search-page',
  notesFeed: '#notes-feed',
  creatorWrapper: '.creator-wrapper',
  feedFilterRow: '#feed-filter-row'
});

export const SIDEBAR_PAGE_ELEMENT_IDS = Object.freeze({
  settings: 'sidebar-settings',
  productivity: 'sidebar-productivity',
  archive: 'sidebar-archive',
  deleted: 'sidebar-deleted',
  favorites: 'sidebar-favorites',
  search: 'sidebar-search',
  notes: 'sidebar-all-notes'
});

/**
 * Validates whether a page ID is a supported application page.
 * @param {string} pageId
 * @returns {boolean}
 */
export function isValidPageId(pageId) {
  return typeof pageId === 'string' && VALID_PAGES.includes(pageId);
}

/**
 * Returns a valid page ID or falls back to DEFAULT_PAGE.
 * @param {string} pageId
 * @returns {string}
 */
export function normalizePageId(pageId) {
  return isValidPageId(pageId) ? pageId : DEFAULT_PAGE;
}

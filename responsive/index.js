/**
 * Responsive Module Entry Point
 * Exports responsive constants, classifiers, state getters, initialization, and subscription hooks.
 */

export {
  RESPONSIVE_MODES,
  RESPONSIVE_BREAKPOINTS,
  POINTER_TYPES,
  HOVER_TYPES,
  classifyLayout,
  classifyEnvironment
} from './responsive-config.js';

export {
  initResponsiveState,
  destroyResponsiveState,
  getResponsiveState,
  subscribeToResponsiveState
} from './responsive-state.js';

export {
  configureResponsiveSidebar,
  syncSidebarLayoutState,
  handleSidebarMenuClick,
  initResponsiveSidebarState,
  destroyResponsiveSidebarState,
  resetSidebarStateForTesting
} from './responsive-sidebar.js';

export {
  normalizeMediaKey,
  extractHubMediaKeys,
  isImageInHubKeys,
  deduplicateBodyMedia
} from './media-deduplicator.js';

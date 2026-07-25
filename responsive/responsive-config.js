/**
 * Responsive Configuration & Classifier Helper
 * Defines canonical layout modes, breakpoints, pointer/hover types, and pure classifiers.
 *
 * Dependency Rule:
 * responsive/ must not import app.js, navigation, settings, or feature modules.
 */

export const RESPONSIVE_MODES = Object.freeze({
  PHONE: 'phone',
  TABLET_PORTRAIT: 'tablet-portrait',
  TABLET_LANDSCAPE: 'tablet-landscape',
  DESKTOP: 'desktop'
});

export const RESPONSIVE_BREAKPOINTS = Object.freeze({
  PHONE_MAX_WIDTH: 699,
  COMPACT_LANDSCAPE_MAX_WIDTH: 932,
  COMPACT_LANDSCAPE_MAX_HEIGHT: 500,
  TABLET_PORTRAIT_MAX_WIDTH: 1024,
  TABLET_LANDSCAPE_MAX_WIDTH: 1180
});

export const POINTER_TYPES = Object.freeze({
  COARSE: 'coarse',
  FINE: 'fine',
  NONE: 'none'
});

export const HOVER_TYPES = Object.freeze({
  HOVER: 'hover',
  NONE: 'none'
});

/**
 * Classifies layout mode purely based on width, height, and orientation.
 * @param {{ width: number, height: number, orientation?: 'portrait'|'landscape' }} viewport
 * @returns {'phone'|'tablet-portrait'|'tablet-landscape'|'desktop'}
 */
export function classifyLayout(viewport = {}) {
  const vp = viewport || {};
  const width = typeof vp.width === 'number' && !isNaN(vp.width) && vp.width > 0 ? vp.width : 0;
  const height = typeof vp.height === 'number' && !isNaN(vp.height) && vp.height > 0 ? vp.height : 0;

  if (width <= 0) {
    return RESPONSIVE_MODES.DESKTOP;
  }

  if (width < 700) {
    return RESPONSIVE_MODES.PHONE;
  }

  // Determine orientation if not explicitly provided
  const orientation = vp.orientation || (height >= width ? 'portrait' : 'landscape');

  // Check compact landscape phone boundary (e.g. iPhone 12/13/14 Pro/Pro Max landscape)
  if (
    orientation === 'landscape' &&
    width <= RESPONSIVE_BREAKPOINTS.COMPACT_LANDSCAPE_MAX_WIDTH &&
    height <= RESPONSIVE_BREAKPOINTS.COMPACT_LANDSCAPE_MAX_HEIGHT
  ) {
    return RESPONSIVE_MODES.PHONE;
  }

  if (orientation === 'portrait') {
    if (width <= RESPONSIVE_BREAKPOINTS.TABLET_PORTRAIT_MAX_WIDTH) {
      return RESPONSIVE_MODES.TABLET_PORTRAIT;
    }
    return RESPONSIVE_MODES.DESKTOP;
  } else {
    if (width <= RESPONSIVE_BREAKPOINTS.TABLET_LANDSCAPE_MAX_WIDTH) {
      return RESPONSIVE_MODES.TABLET_LANDSCAPE;
    }
    return RESPONSIVE_MODES.DESKTOP;
  }
}

/**
 * Extracts responsive environment capabilities from a window or custom env object.
 * Separates structural layout from pointer, hover, touch, standalone PWA, and reduced motion.
 * @param {object} [envWindow]
 * @returns {object}
 */
export function classifyEnvironment(envWindow) {
  const win = envWindow || (typeof window !== 'undefined' ? window : null);

  if (!win) {
    return {
      layoutMode: RESPONSIVE_MODES.DESKTOP,
      pointer: POINTER_TYPES.FINE,
      hover: HOVER_TYPES.HOVER,
      hasTouch: false,
      orientation: 'landscape',
      isStandalone: false,
      prefersReducedMotion: false
    };
  }

  const width = typeof win.innerWidth === 'number' && !isNaN(win.innerWidth) && win.innerWidth > 0 ? win.innerWidth : 0;
  const height = typeof win.innerHeight === 'number' && !isNaN(win.innerHeight) && win.innerHeight > 0 ? win.innerHeight : 0;

  if (width <= 0 && height <= 0) {
    return {
      layoutMode: RESPONSIVE_MODES.DESKTOP,
      pointer: POINTER_TYPES.FINE,
      hover: HOVER_TYPES.HOVER,
      hasTouch: false,
      orientation: 'landscape',
      isStandalone: false,
      prefersReducedMotion: false
    };
  }

  let orientation = null;

  if (win.matchMedia) {
    if (win.matchMedia('(orientation: portrait)').matches) {
      orientation = 'portrait';
    } else if (win.matchMedia('(orientation: landscape)').matches) {
      orientation = 'landscape';
    }
  }

  if (!orientation && width > 0 && height > 0) {
    orientation = height >= width ? 'portrait' : 'landscape';
  }

  if (!orientation && win.screen?.orientation?.type) {
    orientation = win.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
  }

  if (!orientation) {
    orientation = 'landscape';
  }

  const layoutMode = classifyLayout({ width, height, orientation });

  // Pointer capability
  let pointer = POINTER_TYPES.FINE;
  if (win.matchMedia) {
    if (win.matchMedia('(pointer: coarse)').matches) {
      pointer = POINTER_TYPES.COARSE;
    } else if (win.matchMedia('(pointer: none)').matches) {
      pointer = POINTER_TYPES.NONE;
    }
  }

  // Hover availability
  let hover = HOVER_TYPES.HOVER;
  if (win.matchMedia) {
    if (win.matchMedia('(hover: none)').matches) {
      hover = HOVER_TYPES.NONE;
    }
  }

  // Touch capability
  const hasTouch = Boolean(
    (win.navigator?.maxTouchPoints > 0) ||
    (win.navigator?.msMaxTouchPoints > 0) ||
    ('ontouchstart' in win)
  );

  // Standalone PWA detection
  const isStandalone = Boolean(
    (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) ||
    (win.navigator && win.navigator.standalone === true)
  );

  // Reduced motion preference
  const prefersReducedMotion = Boolean(
    win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  return {
    layoutMode,
    pointer,
    hover,
    hasTouch,
    orientation,
    isStandalone,
    prefersReducedMotion
  };
}

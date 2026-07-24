/**
 * PWA Version & Changelog Module
 * Serves as the single JavaScript source of truth for current version and changelog metadata.
 */

export const CURRENT_VERSION = '3.2.6';

export const DEFAULT_CHANGELOG = [
  'User-Controlled PWA Updates (v3.2.6): Refactored service worker install handler to wait for user activation before taking control, enabling non-disruptive background updates and clean one-tap reload coordination.',
  'Responsive Productivity & Sidebar Profile Fix (v3.2.5): Simplified the Productivity calendar, focused tasks on the selected day with a responsive open-task expander and New Task action, and repaired the mobile/tablet sidebar profile menu by rendering it above the drawer.',
  'Purpose-Built Slide Decks & Revised Media Hub Layout (v3.2.4): Refactored note media hubs into type-aware purpose-built slide decks (Text, Checklist, Voice, Link, Recipe, Visual, File) and aligned Media Hub in normal document flow inside .note-surface 6px flush above the footer with zero overlap.',
  'Canonical Note-Type Registry & Dynamic Feed Filters (v3.2.3): Introduced a single canonical note-type registry (All, Text, Checklist, Voice, Link, Recipe, Visual, File), dynamic filter pills with Lucide icons and live note counts, tightened top workspace spacing, and hid Groups from the sidebar.',
  'Hidden Quick Launch & New Note Action (v3.2.2): Hid the inline note creator by default on All Notes to preserve a clean grid-only layout. Added a dedicated New Note sidebar action for desktop and updated tablet dock to reveal and expand creator on demand.',
  'Neutralize Background Tints (v3.2.1): Neutralized the soft light-blue background tint from the light-theme app canvas and sidebar, and completely disabled the dynamic color overlay tint (#workspace-tint-overlay).',
  'High-Density Tablet Portrait Layout (v3.2.0): Optimized iPad/tablet portrait layout with a 3-column note grid, decreased card collapsed height, tighter margins, and a compact, scaled-down bottom navigation dock.',
  'Fix Lucide Icon Instantiation (v3.1.1): Resolved bug where quick action icons disappeared on sidebar page navigation and single card DOM updates by anchoring lucide.createIcons inside updateNoteCardUI and renderGrid.',
  'Remove Workspace Density Control (v3.1.0): Removed Workspace Density configurations from the Appearance settings panel and refactored underlying settings syncing scripts.',
  'Hide Context Menu Scrollbar (v3.0.9): Hid default scrollbar styling for context menu panels across all layout viewports for a cleaner, unified flat UI.',
  'Desktop Context Menu Rendering Fix (v3.0.8): Resolved desktop context menu visibility bug by appending cardMenu directly to card (rather than the hidden mobile-only header) and hidden three-dots toggle on desktop viewport.',
  'Lucide Icons & Context Menu Polish (v3.0.7): Refactored Notebook Spine quick actions to use flat, theme-responsive Lucide icons with bouncy interactions. Elevated Context Menu Z-level and implemented responsive scrolling for overflow action toggles.',
  'Desktop Notebook Spine UI (v2.8.3): Completely redesigned desktop and tablet note cards to feature a horizontal flex layout with a vibrant colored spine, pinned topbar metadata, and quick access action buttons (Pin, Star, Theme, More) without needing to open a menu. Added functional Star/Favorite flag.',
  'Mobile Layout Refinements & Context Menu Overhaul (v2.8.2): Tightened mobile top nav bar height to 54px, added 12px left clearance to feed filter pills, unlocked context menu overflow for un-clipped ellipsis popovers with 500ms touch long-press support, unified Edit Modal scrolling, and removed legacy bottom toolbar in favor of a single floating pill toolbar.',
  'New Phone Layout Card View (v2.8.1): Refined 2-column mobile grid cards with a fixed 280px height, preserved inner surface elevation with rich content fill, micro header row, 2-line title clamping, pinned timestamp, and bottom gradient fade.',
  'Phone Experience Enhancement (v2.8.0): Integrated user profile avatar into top header navigation bar on mobile, introduced experimental 2-column compact mobile grid card view with 2-line title clamping and 3-line text previews, and enabled 1-tap view layout toggling.',
  'Mobile Ergonomics & UI Polish (v2.7.3): Added high-density compact mobile spacing across note cards, creator, and workspace; scaled Edit Modal title font size to prevent word splitting; automatically concealed bottom navigation dock during note editing; fixed filter bar left padding; and cleared toast notifications below the app header.',
  'Settings Panel Mobile Overflow Fix (v2.7.2): Resolved mobile viewport overflow across all settings tabs by converting two-column layouts to fluid single-column cards, wrapping segmented controls & color swatches, stacking time pickers, and enabling touch horizontal tab scrolling.',
  'Universal Multi-Page Mobile Responsiveness (v2.7.1): Ensured full mobile viewport adaptation across every page (Search, Productivity, Settings, Recipe Importer, and Modals) with responsive bottom dock page sync, horizontal scrollable tab bars, and 100vw touch safe-area layouts.',
  'Sectioned Overview & Checklist Refinements (v2.6.19): Aligned Checklist genre card icon and orange gradient, fixed HTML and markdown checklist detection, resolved matchingNotes extraction for sectioned overview layout, ensured non-sticky search header, and verified guaranteed search page re-rendering on page switch',
  'Unified Search & Content Browser (v2.6.18): Enhanced dedicated Search page into a unified media browser with interactive fluid genre filters, compact notes feed, photo gallery with glassmorphic Lightbox viewer, file attachment list, voice memo audio player, link tiles, contextual action popovers with touch long-press support, and canonical attachment deletion',
  'Null Pointer Fix (v2.6.17): Resolved uncaught TypeError on app load caused by null searchInput reference after top-bar search removal, restoring normal workspace note rendering',
  'Spotlight Search Page & Tag Relocation (v2.6.16): Moved Tags section from sidebar to the dedicated Search page directly under search bar, removed global top-bar search across app views, updated Ctrl/Cmd+K to navigate to Search page and focus input, and verified 100% test pass',
  'Runtime Error Repair (v2.6.15): Repaired workspace scroll state (_savedWorkspaceScrollY), parseMarkdown export, saveSingleNoteToLocalStorage import, restoreArchivedNote reference, getVideoBlob attachment getter, formatSelectedText helper, and replaced popup error alerts with non-blocking toasts',
  'Glass Editor Performance & Polish (Phase 7): Completed interaction and accessibility polish, added ARIA expanded/controls attributes, focus restoration on Escape, touch target sizing (44px), viewport containment, and validated 100% test pass',
  'Glass Editor Performance (Phases 4–6): Paused background animations and disabled workspace pointer events when an editor is active, applied CSS containment to note cards, preserved scroll position, added async image decoding, and eliminated full workspace re-renders from voice recording and file attachment callbacks',
  'Glass Editor Performance (Phases 1–3): Eliminated typing lag by updating notes in-memory on input without workspace re-renders, debounced single-note disk persistence, added immediate save flushes on modal close/switch/pagehide, throttled selectionchange with requestAnimationFrame, and coalesced cloud sync writes',
  'Glass Editor Reliability: Kept voice and attachment chips above the floating toolbar, rendered local attachments immediately, restored the Scheduler overlay, and fixed contextual highlight tools for title and body selections',
  'Bug Fix: Glass reminder popover now successfully triggers from the Add menu; fixed inline mousedown handler preventing click events',
  'Scheduler Overhaul: Fixed glass reminder popover hidden behind modal (z-index), added multi-clip audio recording, browser push notifications, snooze (5m/15m/1h), per-line inline reminder chips, and whole-note+inline reminder co-existence',
  'Voice Recording Fix: Disabled automatic SpeechRecognition live typing so voice recording solely records audio clips without modifying note text',
  'Cleaned up UI: Removed redundant floating voice recording overlay pill in favor of the clean top banner indicator',
  'Bug Fix: Fixed floating Voice Recording overlay indicator staying visible permanently due to conflicting inline CSS styles',
  'Glass UI Enhancements: Restored chip visibility for voice recordings and reminders in the Glass Editor, and upgraded voice note chips with playable HTML5 audio controls',
  'Bug Fix: Added null checks when referencing deleted legacy editor-textarea-wrap elements in openEditModal and expandCreator',
  'Bug Fix: Added compatibility shims for syncModalInputs, syncCreatorInputs, and legacy text functions to prevent startup ReferenceError crashes',
  'Glass UI Enhancements: Voice Recording now uses a sleek global floating indicator, and the Reminder Scheduler is now a floating context menu integrated directly into the new UI',
  'Legacy Editor Cleanup: Removed legacy textarea editor code to finalize transition to the rich text Glass Editor',
  'Toolbar Refactor (Phases 1–7): Simplified glass editor toolbar to core tools (Bold, Italic, Underline, Heading, Lists, Link, Checklist) with a new Add (+) content insertion menu and a context-aware floating toolbar appearing on text selection, image click, link hover, and checklist focus',
  'Added Workspace Density settings with Auto, Compact, Comfortable, Touch, and Spacious modes plus an optional Tablet-first Navigation testing feature',
  'Tablet-first workspace with an adaptive portrait dock, landscape navigation rail, roomier note grid, and touch-friendly controls',
  'Upgraded tablet editor to a focused near-full-screen canvas with safer spacing, sticky actions, and better portrait/landscape behavior',
  'Added resilient Facebook, X, and Pinterest capture cards with editable captions, screenshot fallback, canonical links, and richer public metadata handling',
  'Upgraded social link parsing with clean canonical URLs, official previews where available, safe fallbacks, and stronger redirect protection',
  'Fixed modern glass editor modal opening empty note when receiving shared PWA launch data (loads data directly into modal note draft and enriches website metadata in modal)',
  'Robust Web Share Target: supports receiving multiple shared files and resolves query parameters correctly offline',
  'Robust Note Sharing: wraps individual file formatting in try-catch to avoid crashes and falls back to clipboard copy if navigator.share fails',
  'Organized two-column tabbed settings layout (General, Appearance, Themes, Reminders, Notifications)',
  'Frosted glass translucent settings cards supporting both light and dark themes',
  'Notifications configuration panel: Quiet Hours time picker, Do Not Disturb, sound chimes, haptics, and a 2x3 toast position grid selector',
  'Dedicated Functional Search Page accessible from the side menu',
  'Spotify-inspired fluid genre cards (Checklists, Photos, Voice Memos, Bookmarks, Notebooks, Tags)',
  'Consolidated media hubs: full-bleed Photos gallery, Audio wave visualizer cards, and domain-rich Link tiles',
  'Redesigned Quick Launch note creator-styled Search Bar with floating glass, Ctrl+K shortcut, and crisp inner background',
  'Service worker update checking & prompt during splash screen loading and active background usage',
  'Instant dark/light theme detection on splash screen loading (preventing white flashing)',
  'Workspace background image fitting settings (Fill, Fit, Stretch, Tile, Center) in Appearance settings',
  'Note background image upload button styled as a native card in the theme slider picker',
  'Productivity page hero banner horizontal gradient adapting to the active workspace theme background',
  'Productivity page todo widget surfacing individual unchecked checklist items across notes'
];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders changelog items grouped into version accordion sections.
 * @param {HTMLElement} changelogList
 */
export function renderCollapsibleChangelog(changelogList) {
  if (!changelogList || typeof document === 'undefined') return;
  const items = Array.from(changelogList.querySelectorAll(':scope > li'));
  if (items.length === 0) return;

  const groups = [];
  items.forEach((item) => {
    const versionMatch = item.textContent.match(/\(v(\d+(?:\.\d+)+)\)/i);
    const version = versionMatch ? `v${versionMatch[1]}` : 'Earlier updates';
    let group = groups.find(entry => entry.version === version);
    if (!group) {
      group = { version, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });

  changelogList.innerHTML = '';
  changelogList.classList.add('changelog-accordion');
  groups.forEach((group, index) => {
    const details = document.createElement('details');
    details.className = 'changelog-version';
    details.open = index === 0;

    const summary = document.createElement('summary');
    summary.className = 'changelog-version-summary';
    summary.innerHTML = `
      <span>${escapeHtml(group.version)}</span>
      <span class="changelog-version-count">${group.items.length} ${group.items.length === 1 ? 'change' : 'changes'}</span>
    `;

    const updates = document.createElement('ul');
    updates.className = 'changelog-version-items';
    group.items.forEach(item => updates.appendChild(item));
    details.append(summary, updates);
    changelogList.appendChild(details);
  });
}

let versionSubscribed = false;
let versionBound = false;

/**
 * Resets version bound state for testing.
 */
export function resetVersionStateForTesting() {
  versionSubscribed = false;
  versionBound = false;
}

/**
 * Initializes application version label, changelog rendering, and update button state.
 * @param {Object} options
 * @param {function(): void} [options.subscribeToVersionUpdates]
 * @param {function(Object): void} [options.showToast]
 * @param {function(): ServiceWorker|null} [options.getWaitingWorker]
 * @param {function(): Promise<void>} [options.checkServiceWorkerUpdate]
 */
export function initVersionAndChangelog(options = {}) {
  if (typeof document === 'undefined') return;

  const changelogList = document.querySelector('.changelog-list');
  renderCollapsibleChangelog(changelogList);

  const versionLabel = document.querySelector('.version-label');
  if (versionLabel) {
    versionLabel.textContent = `Version ${CURRENT_VERSION}`;
  }

  const appUpdateBtn = document.getElementById('app-update-btn');

  if (typeof options.subscribeToVersionUpdates === 'function' && !versionSubscribed) {
    versionSubscribed = true;
    options.subscribeToVersionUpdates((serverConfig) => {
      if (!appUpdateBtn) return;
      const serverVersion = serverConfig?.version || CURRENT_VERSION;
      const serverChangelog = serverConfig?.changelog || DEFAULT_CHANGELOG;

      const liveChangelogList = document.querySelector('.changelog-list');
      if (liveChangelogList && serverChangelog.length > 0) {
        liveChangelogList.innerHTML = serverChangelog.map(item => `<li>${escapeHtml(item)}</li>`).join('');
        renderCollapsibleChangelog(liveChangelogList);
      }

      if (versionLabel) {
        versionLabel.textContent = `Version ${CURRENT_VERSION}`;
      }

      if (serverVersion && serverVersion !== CURRENT_VERSION) {
        appUpdateBtn.disabled = false;
        appUpdateBtn.textContent = 'Update';
        appUpdateBtn.classList.add('update-available');
      } else {
        appUpdateBtn.disabled = true;
        appUpdateBtn.textContent = 'Latest';
        appUpdateBtn.classList.remove('update-available');
      }
    });
  }

  if (appUpdateBtn && !versionBound) {
    versionBound = true;
    appUpdateBtn.addEventListener('click', async () => {
      appUpdateBtn.disabled = true;
      appUpdateBtn.textContent = 'Updating...';

      if (typeof options.showToast === 'function') {
        options.showToast({ title: 'Updating App', text: 'Checking for updates and reloading...' });
      }

      try {
        const waitingWorker = typeof options.getWaitingWorker === 'function' ? options.getWaitingWorker() : null;
        if (waitingWorker && typeof waitingWorker.postMessage === 'function') {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
          return;
        }

        if (typeof options.checkServiceWorkerUpdate === 'function') {
          await options.checkServiceWorkerUpdate();
        }

        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }, 800);
      } catch (err) {
        console.warn('Failed update check:', err);
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }, 800);
      }
    });
  }
}

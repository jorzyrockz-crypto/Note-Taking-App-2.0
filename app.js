import {
  checklistToPlain,
  getNoteType,
  isChecklistFormat,
  normalizeNoteType,
  plainToChecklist,
  renderNoteContent,
  renderTextWithLinks,
  syncNoteTypeEditor
} from './note-types/index.js';

// ==========================================================================
// 1. Initial State & Data Definition (Upgraded)
// ==========================================================================

const COLOR_PRESETS = [
  'default', 'red', 'orange', 'yellow', 
  'green', 'teal', 'blue', 'darkblue', 
  'purple', 'pink', 'brown', 'grey'
];

let notes = [];
let currentEditingNoteId = null;
let creatorColor = 'default';
let creatorTheme = null; // Pattern theme preset
let creatorReminder = null; // Target ISO datetime string
let creatorAudio = null;
let creatorAudioDuration = null;
let creatorPinned = false;
let creatorImage = null; // Stores Base64 drawing/image upload
let creatorFolder = '';
let selectedTagFilter = null; // Sidebar selected filter tag
let selectedFolderFilter = null;
let selectedTypeFilter = 'all';
let hasShownStorageWarning = false;

const STORAGE_KEYS = {
  notes: 'keep_notes',
  theme: 'keep_theme',
  view: 'keep_view',
  starterSeeded: 'keep_starter_seeded',
  updatesSeeded: 'keep_updates_seeded'
};

const APP_UPDATE_NOTE = {
  id: 'release-atlasnest-v2',
  type: 'text',
  title: 'AtlasNest Update #mobile',
  text: '# AtlasNest mobile refresh\n\n1. Tablet and phone layouts now come first with a cleaner stacked header and easier spacing\n2. Per-note actions moved into the new ellipsis menu for pin, theme, and delete\n3. Folders and groups now live in the sidebar for faster browsing\n4. Voice notes have a live recording animation and visible save flow\n5. Global themes were simplified into a clean light and dark mode switch\n\nOpen AtlasNest on mobile, swipe through note-type filters, and try the new card menus.',
  color: 'orange',
  theme: 'summer',
  folder: 'Product Updates',
  pinned: true,
  archived: false,
  image: null,
  updatedAt: Date.now() - 1000
};

// Default starter notes populated with checklists and tags
const STARTER_NOTES = [
  {
    id: 'starter-1',
    title: '🚀 Welcome to HyperKeep 2.0',
    text: 'This is a premium, feature-rich Google Keep clone.\n\nKey features at a glance:\n• 🎨 Note Themes: Single-row horizontal scroll under "Note Themes"\n• 🔔 Date/Time Reminders: Choose a time and get custom toast alerts\n• 🔗 URL Link Previews: Detects websites and attaches a premium preview box\n• ✏️ Canvas Drawing: Sketch sketches directly from the editor\n\nTry filtering tags like #welcome or #guide in the sidebar!',
    color: 'default',
    pinned: true,
    archived: false,
    image: null,
    updatedAt: Date.now() - 100000
  },
  {
    id: 'starter-2',
    title: '🎙️ Voice Note: Morning Brainstorm #voice',
    text: 'Brainstorming ideas for HyperKeep. We need to implement a fully offline-first database sync, native voice recording transcriber, and a premium checklist editor. This sounds like an amazing roadmap!',
    audio: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAD',
    audioDuration: '0:05',
    color: 'default',
    pinned: true,
    archived: false,
    image: null,
    updatedAt: Date.now() - 90000
  },
  {
    id: 'starter-3',
    title: '📌 Pinterest Inspiration #aesthetic',
    text: 'Found this gorgeous wood cabin workspace on Pinterest: https://pinterest.com/pin/cabin-aesthetic',
    color: 'default',
    pinned: true,
    archived: false,
    image: null,
    updatedAt: Date.now() - 80000
  },
  {
    id: 'starter-4',
    title: '🍽️ Recipe: Creamy Garlic Tuscan Salmon #cooking',
    text: 'Ingredients:\n- [x] 4 salmon fillets\n- [ ] 1 tbsp olive oil\n- [ ] 1 cup heavy cream\n- [ ] 1/2 cup chicken broth\n- [ ] 1 tsp garlic powder\n- [x] 1 cup spinach\n- [ ] 1/2 cup sun-dried tomatoes\n\nInstructions:\n# Prep Steps\n1. Season salmon fillets on both sides with salt and pepper.\n2. Heat olive oil in a large skillet over medium-high heat.\n3. Sear salmon for 5 minutes on each side until golden.\n\n# Sauce Steps\n4. Add garlic and cook until fragrant.\n5. Pour in heavy cream, broth, and simmer. Stir in spinach and tomatoes.',
    color: 'default',
    theme: 'plants',
    pinned: false,
    archived: false,
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500',
    updatedAt: Date.now() - 70000
  },
  {
    id: 'starter-5',
    title: '💡 Formatting Cheat Sheet #guide',
    text: '# Markdown Formatting Guide\n\nMake notes structured and visually rich:\n\n* **Bold text** using double asterisks\n* *Italic text* using single asterisks\n* `Inline code` using backticks\n\n### Headers and Bullet Lists\nUse headers to separate sections. Bullet lists organize thoughts quickly. Keep notes clean and concise!',
    color: 'teal',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 60000
  },
  {
    id: 'starter-6',
    title: '💪 Gym Checklist #fitness',
    text: '- [x] Warm-up stretching (10 mins)\n- [ ] Bench press 4x8\n- [ ] Weighted pull-ups 3x8\n- [x] Romanian deadlifts 3x10\n- [ ] Core planks (3 mins)\n- [ ] Cool-down cardio: https://youtube.com',
    color: 'default',
    theme: 'plants',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 50000
  },
  {
    id: 'starter-7',
    title: '🔗 Developer Bookmarks #coding',
    text: 'Here are some essential websites I visit daily for learning and development:\n\n• Advanced coding and web guidance: https://github.com\n• Knowledgebase and reference lookups: https://wikipedia.org\n• Frontend web animations and layouts: https://css-tricks.com',
    color: 'blue',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 40000
  },
  {
    id: 'starter-8',
    title: '⏰ Meeting with Design Team #schedule',
    text: 'Review the mockups for the new landing page, check contrast ratios, and finalize dark mode styles. Ask about mobile layouts.',
    color: 'default',
    theme: 'winter',
    reminder: new Date(Date.now() + 3600000).toISOString(),
    reminderTriggered: false,
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 30000
  },
  {
    id: 'starter-9',
    title: '❄️ Winter Cabin Trip #travel',
    text: '- [x] Pack thermal jackets and socks\n- [ ] Book skiing gear rentals\n- [ ] Buy hot cocoa mix\n- [ ] Check cabin weather: https://weather.com',
    color: 'default',
    theme: 'winter',
    pinned: false,
    archived: false,
    image: null,
    updatedAt: Date.now() - 20000
  }
];

// ==========================================================================
// 2. DOM Elements & References
// ==========================================================================

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const viewToggle = document.getElementById('view-toggle');
const themeBtn = document.getElementById('theme-btn');

const noteCreator = document.getElementById('note-creator');
const creatorCollapsed = document.getElementById('creator-collapsed');
const creatorExpanded = document.getElementById('creator-expanded');
const creatorTitle = document.getElementById('creator-title');
const creatorText = document.getElementById('creator-text');
const creatorSave = document.getElementById('creator-save');
const creatorClose = document.getElementById('creator-close');
const creatorPin = document.getElementById('creator-pin');
const creatorColorPicker = document.getElementById('creator-color-picker');
const creatorImageBanner = document.getElementById('creator-image-banner');
const creatorImgPreview = document.getElementById('creator-img-preview');
const creatorRemoveImg = document.getElementById('creator-remove-img');
const creatorImageBtn = document.getElementById('creator-image-btn');
const creatorImageInput = document.getElementById('creator-image-input');
const creatorListBtn = document.getElementById('creator-list-btn');
const creatorListToggleBtn = document.getElementById('creator-list-toggle');
const creatorDrawBtn = document.getElementById('creator-palette-draw');
const creatorDrawToggleBtn = document.getElementById('creator-draw-toggle');

const pinnedSection = document.getElementById('pinned-section');
const pinnedGrid = document.getElementById('pinned-grid');
const othersSection = document.getElementById('others-section');
const othersGrid = document.getElementById('others-grid');
const othersSectionTitle = document.getElementById('others-section-title');
const emptyState = document.getElementById('empty-state');
const sidebarTagsList = document.getElementById('sidebar-tags-list');
const sidebarAllNotes = document.getElementById('sidebar-all-notes');
let sidebarFoldersList = null;
let creatorFolderInput = null;
let folderSuggestions = null;
let feedFilterRow = null;
let menuPanel = null;
let folderDrawer = null;
let folderDrawerList = null;

const editModal = document.getElementById('edit-modal');
const editModalCard = document.getElementById('edit-modal-card');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const modalPin = document.getElementById('modal-pin');
const modalDelete = document.getElementById('modal-delete');
const modalClose = document.getElementById('modal-close');
const modalColorPicker = document.getElementById('modal-color-picker');
const modalImageBanner = document.getElementById('modal-image-banner');
const modalImgPreview = document.getElementById('modal-img-preview');
const modalRemoveImg = document.getElementById('modal-remove-img');
const modalImageBtn = document.getElementById('modal-image-btn');
const modalImageInput = document.getElementById('modal-image-input');
const modalListBtn = document.getElementById('modal-list-btn');
const modalDrawBtn = document.getElementById('modal-draw-btn');
const modalTagsContainer = document.getElementById('modal-tags-container');
let modalFolderInput = null;

// Canvas Sketch Overlay elements
const sketchModal = document.getElementById('sketch-modal');
const sketchCanvas = document.getElementById('sketch-canvas');
const sketchClear = document.getElementById('sketch-clear');
const sketchClose = document.getElementById('sketch-close');
const sketchSave = document.getElementById('sketch-save');
const sketchEraser = document.getElementById('sketch-eraser');
const sketchBrushSize = document.getElementById('sketch-brush-size');
const sketchColors = document.getElementById('sketch-colors');

// Drawing context variables
let canvasCtx = null;
let isDrawing = false;
let lastDrawX = 0;
let lastDrawY = 0;
let brushColor = '#202124';
let brushSize = 6;
let isEraserActive = false;
let activeSketchTarget = null; // 'creator' or 'modal'

function enhanceShell() {
  document.title = 'AtlasNest - Visual Bookmark Studio';

  const logoTitle = document.querySelector('.logo-title');
  if (logoTitle) logoTitle.textContent = 'AtlasNest';
  const allNotesLabel = sidebarAllNotes?.querySelector('.sidebar-label');
  if (allNotesLabel) allNotesLabel.textContent = 'All Notes';

  const logoContainer = document.querySelector('.logo-container');
  if (logoContainer && !logoContainer.querySelector('.brand-lockup')) {
    const titleText = logoContainer.querySelector('.logo-title');
    const lockup = document.createElement('div');
    lockup.className = 'brand-lockup';
    if (titleText) {
      titleText.replaceWith(lockup);
      const brand = document.createElement('span');
      brand.className = 'logo-title';
      brand.textContent = 'AtlasNest';
      const sub = document.createElement('span');
      sub.className = 'logo-subtitle';
      sub.textContent = 'Visual bookmarking studio';
      lockup.appendChild(brand);
      lockup.appendChild(sub);
    }
  }

  const sidebar = document.querySelector('.app-sidebar');
  if (sidebar && !document.getElementById('sidebar-folders-list')) {
    const divider = document.createElement('div');
    divider.className = 'sidebar-divider';
    const title = document.createElement('div');
    title.className = 'sidebar-section-title sidebar-label';
    title.textContent = 'GROUPS';
    sidebarFoldersList = document.createElement('div');
    sidebarFoldersList.className = 'sidebar-tags-container';
    sidebarFoldersList.id = 'sidebar-folders-list';
    sidebar.insertBefore(sidebarFoldersList, sidebarTagsList);
    sidebar.insertBefore(title, sidebarFoldersList);
    sidebar.insertBefore(divider, title);
  } else {
    sidebarFoldersList = document.getElementById('sidebar-folders-list');
  }

  const chipsContainer = document.getElementById('creator-chips-container');
  if (chipsContainer && !document.getElementById('creator-folder')) {
    const metaRow = document.createElement('div');
    metaRow.className = 'creator-meta-row';
    metaRow.innerHTML = `
      <div class="creator-folder-field">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 4l2 2h8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4z"/></svg>
        <input type="text" id="creator-folder" list="folder-suggestions" placeholder="Add to a group">
      </div>
      <datalist id="folder-suggestions"></datalist>
    `;
    chipsContainer.insertAdjacentElement('afterend', metaRow);
  }

  creatorFolderInput = document.getElementById('creator-folder');
  folderSuggestions = document.getElementById('folder-suggestions');

  const creatorWrapper = document.querySelector('.creator-wrapper');
  if (creatorWrapper && !document.getElementById('feed-filter-row')) {
    feedFilterRow = document.createElement('div');
    feedFilterRow.className = 'feed-filter-row';
    feedFilterRow.id = 'feed-filter-row';
    feedFilterRow.innerHTML = `
      <button class="filter-pill active" data-type-filter="all">All</button>
      <button class="filter-pill" data-type-filter="text">Text</button>
      <button class="filter-pill" data-type-filter="checklist">Checklist</button>
      <button class="filter-pill" data-type-filter="voice">Voice</button>
      <button class="filter-pill" data-type-filter="bookmark">Bookmark</button>
      <button class="filter-pill" data-type-filter="recipe">Recipe</button>
      <button class="filter-pill" data-type-filter="image">Visual</button>
    `;
    creatorWrapper.insertAdjacentElement('afterend', feedFilterRow);
  } else {
    feedFilterRow = document.getElementById('feed-filter-row');
  }

  menuPanel = document.getElementById('menu-panel');

  if (!document.getElementById('folder-drawer')) {
    folderDrawer = document.createElement('div');
    folderDrawer.className = 'folder-drawer';
    folderDrawer.id = 'folder-drawer';
    folderDrawer.innerHTML = `
      <div class="folder-drawer-backdrop"></div>
      <div class="folder-drawer-panel">
        <div class="folder-drawer-header">
          <div>
            <div class="folder-drawer-title">Folder View</div>
            <div class="folder-drawer-subtitle">Browse notes by group</div>
          </div>
          <button class="icon-btn folder-drawer-close" id="folder-drawer-close" aria-label="Close folder view">✕</button>
        </div>
        <div class="folder-drawer-list" id="folder-drawer-list"></div>
      </div>
    `;
    document.body.appendChild(folderDrawer);
  } else {
    folderDrawer = document.getElementById('folder-drawer');
  }

  folderDrawerList = document.getElementById('folder-drawer-list');
}

// ==========================================================================
// 3. Core Initialization & Event Listeners
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  enhanceShell();
  initTheme();
  initViewLayout();
  initData();
  setupEventHandlers();
  buildColorPickers();
  initCanvasDrawEngine();
  renderNotes();
  
  // Start background checks for note reminders
  setInterval(checkReminders, 10000);
});

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${normalizedTheme}`);

  const isDark = normalizedTheme === 'dark';
  if (isDark) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }

  if (themeBtn) {
    themeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 0 1 11.21 3c0-.34.02-.68.06-1.01A1 1 0 0 0 9.8.93a10 10 0 1 0 13.27 13.27 1 1 0 0 0-.06-1.41c-.33.04-.67.06-1.01.06z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-16h1v3h-1V2zm0 17h1v3h-1v-3zM2 11h3v1H2v-1zm17 0h3v1h-3v-1zM4.93 4.22l.71-.71 2.12 2.12-.71.71-2.12-2.12zm11.31 11.31l.71-.71 2.12 2.12-.71.71-2.12-2.12zM4.93 19.07l2.12-2.12.71.71-2.12 2.12-.71-.71zm11.31-11.31l2.12-2.12.71.71-2.12 2.12-.71-.71z"/></svg>';
  }

  localStorage.setItem(STORAGE_KEYS.theme, normalizedTheme);
}

function initViewLayout() {
  const viewMode = localStorage.getItem(STORAGE_KEYS.view) || 'grid';
  if (viewMode === 'list') {
    pinnedGrid.classList.add('list-view');
    othersGrid.classList.add('list-view');
    document.getElementById('grid-icon').style.display = 'block';
    document.getElementById('list-icon').style.display = 'none';
  } else {
    pinnedGrid.classList.remove('list-view');
    othersGrid.classList.remove('list-view');
    document.getElementById('grid-icon').style.display = 'none';
    document.getElementById('list-icon').style.display = 'block';
  }
}

function initData() {
  const localData = localStorage.getItem(STORAGE_KEYS.notes);
  let loadedNotes = [];
  
  if (localData) {
    try {
      loadedNotes = JSON.parse(localData);
      if (!Array.isArray(loadedNotes)) {
        loadedNotes = [];
      } else {
        loadedNotes = loadedNotes.map(normalizeNoteType);
      }
    } catch (e) {
      loadedNotes = [];
    }
  }
  
  // Seed starter notes only once so user deletions stay deleted after reload.
  const hasSeededStarterNotes = localStorage.getItem(STORAGE_KEYS.starterSeeded) === 'true';
  if (!hasSeededStarterNotes && loadedNotes.length === 0) {
    loadedNotes = STARTER_NOTES.map(starterNote => normalizeNoteType({ ...starterNote }));
    localStorage.setItem(STORAGE_KEYS.starterSeeded, 'true');
  }

  loadedNotes = loadedNotes.map((note, index) => ({
    ...note,
    folder: note.folder || inferDefaultFolder(note, index)
  }));

  const hasSeededUpdates = localStorage.getItem(STORAGE_KEYS.updatesSeeded) === 'true';
  const hasUpdateNote = loadedNotes.some(note => note.id === APP_UPDATE_NOTE.id);
  if (!hasSeededUpdates || !hasUpdateNote) {
    loadedNotes.unshift(normalizeNoteType({ ...APP_UPDATE_NOTE }));
    loadedNotes = loadedNotes.filter((note, index, arr) => arr.findIndex(other => other.id === note.id) === index);
    localStorage.setItem(STORAGE_KEYS.updatesSeeded, 'true');
  }
  
  // Sort notes by updatedAt descending to keep new notes at the top
  loadedNotes.sort((a, b) => b.updatedAt - a.updatedAt);
  
  notes = loadedNotes;
  saveToLocalStorage();
}

function setupEventHandlers() {
  // Toggle sidebar drawer on mobile / pin layout on desktop
  const menuBtn = document.querySelector('.menu-btn');
  const sidebar = document.querySelector('.app-sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth < 600) {
        sidebar.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-pinned');
      }
      closeAllNoteCardMenus();
    });
  }

  document.getElementById('folder-drawer-close')?.addEventListener('click', closeFolderDrawer);
  folderDrawer?.querySelector('.folder-drawer-backdrop')?.addEventListener('click', closeFolderDrawer);

  // Close sidebar drawer on mobile when clicking outside
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('sidebar-open')) {
      if (!sidebar.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('sidebar-open');
      }
    }
    if (!e.target.closest('.note-card-menu')) {
      closeAllNoteCardMenus();
    }
  });

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isDark = document.body.classList.contains('dark-theme');
    setTheme(isDark ? 'light' : 'dark');
  });

  // View toggle (Grid / List)
  viewToggle.addEventListener('click', toggleViewLayout);

  // Search filter
  searchInput.addEventListener('input', () => {
    searchClear.style.display = searchInput.value.trim() !== '' ? 'block' : 'none';
    renderNotes();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    renderNotes();
    searchInput.focus();
  });

  // Sidebar navigation resets hashtag filter
  sidebarAllNotes.addEventListener('click', () => {
    selectedTagFilter = null;
    selectedFolderFilter = null;
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    sidebarAllNotes.classList.add('active');
    renderNotes();
  });

  if (creatorFolderInput) {
    creatorFolderInput.addEventListener('input', () => {
      creatorFolder = creatorFolderInput.value.trim();
    });
  }

  if (feedFilterRow) {
    feedFilterRow.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedTypeFilter = btn.getAttribute('data-type-filter') || 'all';
        feedFilterRow.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
        btn.classList.add('active');
        renderNotes();
      });
    });
  }

  // Note Creator Focus / Expand
  creatorCollapsed.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
  });

  // Collapse checklist shortcut in creator
  creatorListToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
    creatorText.value = '- [ ] ';
    syncCreatorInputs();
    autoGrowTextarea.call(creatorText);
  });

  // Collapse sketch shortcut in creator
  creatorDrawToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandCreator();
    openDrawingWorkspace('creator');
  });
  
  // Auto-grow textareas
  creatorText.addEventListener('input', () => {
    autoGrowTextarea.call(creatorText);
    if (creatorText.value.startsWith('- [ ] ') || creatorText.value.startsWith('- [x] ')) {
      syncCreatorInputs();
    }
  });
  creatorText.addEventListener('keydown', handleRichListEditing);
  modalText.addEventListener('input', autoGrowTextarea);
  modalText.addEventListener('keydown', handleRichListEditing);

  // Creator pin state
  creatorPin.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorPinned = !creatorPinned;
    creatorPin.classList.toggle('pinned', creatorPinned);
  });

  // Creator palette toggle
  const paletteTrigger = document.querySelector('.creator-palette-trigger');
  paletteTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorColorPicker.classList.toggle('visible');
  });

  // Creator reminder trigger
  const creatorReminderBtn = document.getElementById('creator-reminder-btn');
  const creatorReminderPicker = document.getElementById('creator-reminder-picker');
  creatorReminderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-picker-bubble, .reminder-picker-bubble').forEach(p => {
      if (p !== creatorReminderPicker) p.classList.remove('visible');
    });
    
    buildReminderPicker(creatorReminderPicker, creatorReminder, (dateTime) => {
      creatorReminder = dateTime;
      creatorReminderPicker.classList.remove('visible');
      renderCreatorReminderChip();
    }, () => {
      creatorReminder = null;
      creatorReminderPicker.classList.remove('visible');
      renderCreatorReminderChip();
    });
    creatorReminderPicker.classList.toggle('visible');
  });

  // Creator checklists convert trigger
  creatorListBtn.addEventListener('click', () => {
    const isList = isChecklistFormat(creatorText.value);
    if (isList) {
      creatorText.value = checklistToPlain(creatorText.value);
    } else {
      creatorText.value = plainToChecklist(creatorText.value);
    }
    syncCreatorInputs();
    autoGrowTextarea.call(creatorText);
  });

  // Creator Drawing Canvas trigger
  creatorDrawBtn.addEventListener('click', () => {
    openDrawingWorkspace('creator');
  });

  // Creator Image upload trigger
  creatorImageBtn.addEventListener('click', () => creatorImageInput.click());
  creatorImageInput.addEventListener('change', (e) => {
    handleImageUpload(e.target.files[0], (base64) => {
      creatorImage = base64;
      creatorImgPreview.src = base64;
      creatorImageBanner.style.display = 'block';
    });
  });

  // Remove Creator image banner
  creatorRemoveImg.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorImage = null;
    creatorImageBanner.style.display = 'none';
    creatorImgPreview.src = '';
    creatorImageInput.value = ''; // reset file input
  });

  // Close / Save Note Creator
  creatorSave.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNote();
    collapseCreator();
  });

  creatorClose.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCreatorNote();
    collapseCreator();
  });

  // Click outside Note Creator auto-saves
  document.addEventListener('click', (e) => {
    if (creatorExpanded.style.display !== 'none' && !noteCreator.contains(e.target)) {
      if (!e.target.closest('.color-picker-bubble') && !e.target.closest('.reminder-trigger-wrapper') && !e.target.closest('.edit-modal-overlay')) {
        saveCreatorNote();
        collapseCreator();
      }
    }
    
    // Close color pickers
    if (!e.target.closest('.color-palette-trigger-wrapper')) {
      document.querySelectorAll('.color-picker-bubble').forEach(el => el.classList.remove('visible'));
    }

    // Close reminder pickers
    if (!e.target.closest('.reminder-trigger-wrapper')) {
      document.querySelectorAll('.reminder-picker-bubble').forEach(el => el.classList.remove('visible'));
    }

  });

  // Edit Modal Event Handlers
  modalClose.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });

  // Modal Pin toggle
  modalPin.addEventListener('click', () => {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.pinned = !note.pinned;
      modalPin.classList.toggle('pinned', note.pinned);
      saveToLocalStorage();
      renderNotes();
    }
  });

  // Modal Delete note
  modalDelete.addEventListener('click', () => {
    if (currentEditingNoteId) {
      deleteNote(currentEditingNoteId);
      closeEditModal();
    }
  });

  // Modal Color picker toggle
  document.getElementById('modal-palette-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    modalColorPicker.classList.toggle('visible');
  });

  // Modal Checklist convert trigger
  modalListBtn.addEventListener('click', () => {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (!note) return;

    const isList = isChecklistFormat(note.text);
    if (isList) {
      note.text = checklistToPlain(note.text);
      modalText.value = note.text;
    } else {
      note.text = plainToChecklist(note.text);
      modalText.value = note.text;
    }
    note.type = getNoteType(note.text);
    saveToLocalStorage();
    renderNotes();
    syncModalInputs(note);
    autoGrowTextarea.call(modalText);
  });

  // Modal drawing canvas trigger
  modalDrawBtn.addEventListener('click', () => {
    openDrawingWorkspace('modal');
  });

  // Creator voice note trigger
  const creatorVoiceBtn = document.getElementById('creator-voice-btn');
  creatorVoiceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVoiceRecording('creator');
  });

  // Modal voice note trigger
  const modalVoiceBtn = document.getElementById('modal-voice-btn');
  modalVoiceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVoiceRecording('modal');
  });

  // Recipe Importer trigger actions
  const creatorRecipeBtn = document.getElementById('creator-recipe-btn');
  creatorRecipeBtn.addEventListener('click', openRecipeModal);
  const globalRecipeBtn = document.getElementById('global-recipe-import-btn');
  globalRecipeBtn.addEventListener('click', openRecipeModal);

  const recipeCancel = document.getElementById('recipe-modal-cancel');
  recipeCancel.addEventListener('click', () => {
    document.getElementById('recipe-modal').classList.remove('visible');
  });

  const recipeImport = document.getElementById('recipe-modal-import');
  recipeImport.addEventListener('click', handleRecipeImportAction);

  // Modal Image upload trigger
  modalImageBtn.addEventListener('click', () => modalImageInput.click());
  modalImageInput.addEventListener('change', (e) => {
    handleImageUpload(e.target.files[0], (base64) => {
      const note = notes.find(n => n.id === currentEditingNoteId);
      if (note) {
        note.image = base64;
        modalImgPreview.src = base64;
        modalImageBanner.style.display = 'block';
        saveToLocalStorage();
        renderNotes();
      }
    });
  });

  // Remove Modal image banner
  modalRemoveImg.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.image = null;
      modalImageBanner.style.display = 'none';
      modalImgPreview.src = '';
      modalImageInput.value = '';
      saveToLocalStorage();
      renderNotes();
    }
  });
}

// ==========================================================================
// 4. Color Palette Builders
// ==========================================================================

const THEME_PRESETS = [
  { id: 'plants', emoji: '🌿', title: 'Plants' },
  { id: 'animals', emoji: '🦊', title: 'Animals' },
  { id: 'spring', emoji: '🌸', title: 'Spring' },
  { id: 'summer', emoji: '☀️', title: 'Summer' },
  { id: 'autumn', emoji: '🍂', title: 'Autumn' },
  { id: 'winter', emoji: '❄️', title: 'Winter' }
];

function buildColorPickers() {
  buildColorGrid(creatorColorPicker, creatorColor, creatorTheme, (type, value) => {
    if (type === 'color') {
      creatorColor = value;
      creatorTheme = null;
      noteCreator.setAttribute('data-color', value);
      noteCreator.removeAttribute('data-theme');
    } else {
      creatorColor = 'default';
      creatorTheme = value === 'none' ? null : value;
      noteCreator.setAttribute('data-color', 'default');
      if (creatorTheme) {
        noteCreator.setAttribute('data-theme', creatorTheme);
      } else {
        noteCreator.removeAttribute('data-theme');
      }
    }
    creatorColorPicker.classList.remove('visible');
  });
}

function buildColorGrid(container, activeColor, activeTheme, onSelect) {
  container.innerHTML = '';

  // Title
  const title = document.createElement('span');
  title.className = 'picker-section-title';
  title.textContent = 'Note Themes';
  container.appendChild(title);

  // Single unified row
  const row = document.createElement('div');
  row.className = 'picker-row';

  // 1. Color options
  COLOR_PRESETS.forEach(color => {
    const option = document.createElement('div');
    option.className = 'color-option';
    option.setAttribute('data-color', color);
    option.title = color.charAt(0).toUpperCase() + color.slice(1);
    
    const isSelected = !activeTheme && color === activeColor;
    if (isSelected) option.classList.add('selected');

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
      option.classList.add('selected');
      onSelect('color', color);
    });
    row.appendChild(option);
  });

  // 2. Add "None" Reset Theme Option
  const resetOption = document.createElement('div');
  resetOption.className = 'color-option';
  resetOption.setAttribute('data-theme-option', 'none');
  resetOption.title = 'No Theme';
  resetOption.style.display = 'flex';
  resetOption.style.alignItems = 'center';
  resetOption.style.justifyContent = 'center';
  resetOption.style.fontSize = '12px';
  resetOption.style.color = 'var(--text-secondary)';
  resetOption.style.fontWeight = 'bold';
  resetOption.style.backgroundColor = 'rgba(128,128,128,0.15)';
  resetOption.textContent = '✕';
  
  const isResetSelected = !activeTheme;
  if (isResetSelected) resetOption.classList.add('selected');

  resetOption.addEventListener('click', (e) => {
    e.stopPropagation();
    container.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    resetOption.classList.add('selected');
    onSelect('theme', 'none');
  });
  row.appendChild(resetOption);

  // 3. Theme options
  THEME_PRESETS.forEach(theme => {
    const option = document.createElement('div');
    option.className = 'color-option';
    option.setAttribute('data-theme-option', theme.id);
    option.title = theme.title;
    option.style.display = 'flex';
    option.style.alignItems = 'center';
    option.style.justifyContent = 'center';
    option.style.fontSize = '14px';
    option.textContent = theme.emoji;
    
    const isSelected = activeTheme ? theme.id === activeTheme : false;
    if (isSelected) option.classList.add('selected');

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
      option.classList.add('selected');
      onSelect('theme', theme.id);
    });
    row.appendChild(option);
  });

  container.appendChild(row);
}

// ==========================================================================
// 5. Note Creation
// ==========================================================================

function expandCreator() {
  creatorCollapsed.style.display = 'none';
  creatorExpanded.style.display = 'flex';
  creatorPin.style.display = 'flex'; // Show pin button when expanded
  syncCreatorInputs();
  creatorText.focus();
}

function collapseCreator() {
  creatorCollapsed.style.display = 'flex';
  creatorExpanded.style.display = 'none';
  creatorPin.style.display = 'none'; // Hide pin button when collapsed
  
  creatorTitle.value = '';
  creatorText.value = '';
  creatorText.style.height = 'auto';
  
  creatorColor = 'default';
  creatorTheme = null; // Reset pattern theme
  creatorReminder = null; // Reset reminder
  creatorAudio = null; // Reset audio
  creatorFolder = '';
  creatorAudioDuration = null;
  creatorPinned = false;
  creatorImage = null;
  
  noteCreator.setAttribute('data-color', 'default');
  noteCreator.removeAttribute('data-theme');
  creatorPin.classList.remove('pinned');
  if (creatorFolderInput) creatorFolderInput.value = '';
  creatorImageBanner.style.display = 'none';
  creatorImgPreview.src = '';
  creatorImageInput.value = '';
  
  renderCreatorReminderChip();
  renderCreatorAudioPreview();
  
  // Rebuild creator picker to clear selection styling
  buildColorGrid(creatorColorPicker, creatorColor, creatorTheme, (type, value) => {
    if (type === 'color') {
      creatorColor = value;
      creatorTheme = null;
      noteCreator.setAttribute('data-color', value);
      noteCreator.removeAttribute('data-theme');
    } else {
      creatorColor = 'default';
      creatorTheme = value === 'none' ? null : value;
      noteCreator.setAttribute('data-color', 'default');
      if (creatorTheme) {
        noteCreator.setAttribute('data-theme', creatorTheme);
      } else {
        noteCreator.removeAttribute('data-theme');
      }
    }
    creatorColorPicker.classList.remove('visible');
  });
  creatorColorPicker.classList.remove('visible');
}

function saveCreatorNote() {
  const title = creatorTitle.value.trim();
  const text = creatorText.value.trim();
  
  // Don't save if completely empty (allow save when audio or image exists)
  if (isNoteEffectivelyEmpty(title, text, creatorImage, creatorAudio)) {
    return;
  }
  
  const newNote = {
    id: 'note-' + Date.now(),
    type: getNoteType(text),
    title: title,
    text: text,
    color: creatorColor,
    theme: creatorTheme,
    reminder: creatorReminder,
    reminderTriggered: false,
    audio: creatorAudio,
    audioDuration: creatorAudioDuration,
    folder: creatorFolderInput?.value.trim() || creatorFolder || 'Inbox',
    pinned: creatorPinned,
    archived: false,
    image: creatorImage,
    updatedAt: Date.now()
  };
  
  notes.unshift(newNote);
  saveToLocalStorage();
  renderNotes();
}

// ==========================================================================
// 6. Dynamic Hashtag Extractor
// ==========================================================================

function inferDefaultFolder(note, index = 0) {
  const kind = getVisualNoteType(note);
  const defaults = {
    voice: 'Voice Memos',
    recipe: 'Kitchen Board',
    bookmark: 'Inspiration Wall',
    checklist: 'Action Lists',
    image: 'Moodboard',
    text: 'Inbox'
  };
  return note.folder || defaults[kind] || (index === 0 ? 'Welcome' : 'Inbox');
}

function getVisualNoteType(note) {
  const rawType = note.type || getNoteType(note.text || '');
  if (note.audio) return 'voice';
  if ((note.title || '').toLowerCase().includes('recipe')) return 'recipe';
  if (note.image) return rawType === 'checklist' ? 'checklist' : 'image';
  if (getFirstUrlInText(note.text || '')) return 'bookmark';
  return rawType;
}

function getAllFolders() {
  return Array.from(new Set(notes.map(note => note.folder || 'Inbox'))).sort();
}

function renderSidebarFolders() {
  if (!sidebarFoldersList) return;
  sidebarFoldersList.innerHTML = '';
  getAllFolders().forEach(folder => {
    const item = document.createElement('div');
    item.className = `sidebar-item ${selectedFolderFilter === folder ? 'active' : ''}`;
    item.innerHTML = `
      <span class="sidebar-icon folder-icon">▣</span>
      <span class="sidebar-label">${folder}</span>
    `;
    item.addEventListener('click', () => {
      selectedFolderFilter = folder;
      selectedTagFilter = null;
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderNotes();
    });
    sidebarFoldersList.appendChild(item);
  });
}

function renderFolderDrawer() {
  if (!folderDrawerList) return;
  folderDrawerList.innerHTML = '';

  getAllFolders().forEach(folder => {
    const relatedNotes = notes.filter(note => (note.folder || 'Inbox') === folder && !note.archived);
    const item = document.createElement('button');
    item.className = `folder-drawer-item ${selectedFolderFilter === folder ? 'active' : ''}`;
    item.innerHTML = `
      <span class="folder-drawer-item-icon">▣</span>
      <span class="folder-drawer-item-content">
        <span class="folder-drawer-item-title">${folder}</span>
        <span class="folder-drawer-item-meta">${relatedNotes.length} note${relatedNotes.length === 1 ? '' : 's'}</span>
      </span>
      <span class="folder-drawer-item-trailing">${relatedNotes.slice(0, 2).map(note => getVisualTypeLabel(getVisualNoteType(note))).join(' · ') || 'Empty'}</span>
    `;
    item.addEventListener('click', () => {
      selectedFolderFilter = folder;
      selectedTagFilter = null;
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      renderNotes();
      closeFolderDrawer();
    });
    folderDrawerList.appendChild(item);
  });
}

function openFolderDrawer() {
  renderFolderDrawer();
  folderDrawer?.classList.add('visible');
}

function closeFolderDrawer() {
  folderDrawer?.classList.remove('visible');
}

function renderFolderSuggestions() {
  if (!folderSuggestions) return;
  folderSuggestions.innerHTML = '';
  getAllFolders().forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    folderSuggestions.appendChild(option);
  });
}

function closeAllNoteCardMenus() {
  document.querySelectorAll('.note-card-menu.open').forEach(menu => {
    menu.classList.remove('open');
  });
  document.querySelectorAll('.note-card-menu-panel .color-picker-bubble.visible').forEach(picker => {
    picker.classList.remove('visible');
  });
}

function scanUniqueTags() {
  const tagsSet = new Set();
  notes.forEach(note => {
    if (note.archived) return;
    const words = `${note.title} ${note.text}`.split(/[\s,]+/);
    words.forEach(word => {
      // Find hashtags like #work or #urgent (strictly letters/numbers)
      if (word.startsWith('#') && word.length > 2) {
        const cleanTag = word.substring(1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanTag) tagsSet.add(cleanTag);
      }
    });
  });
  return Array.from(tagsSet).sort();
}

function renderSidebarTags() {
  sidebarTagsList.innerHTML = '';
  const tags = scanUniqueTags();
  
  tags.forEach(tag => {
    const item = document.createElement('div');
    item.className = `sidebar-item ${selectedTagFilter === tag ? 'active' : ''}`;
    item.innerHTML = `
      <span class="sidebar-icon sidebar-chip-icon">#</span>
      <span class="sidebar-label">#${tag}</span>
    `;
    item.addEventListener('click', () => {
      selectedTagFilter = tag;
      selectedFolderFilter = null;
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderNotes();
    });
    sidebarTagsList.appendChild(item);
  });
}

// ==========================================================================
// 8. Image Handling & Compression
// ==========================================================================

function handleImageUpload(file, onCompressComplete) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Compress to prevent LocalStorage overflows
      const canvas = document.createElement('canvas');
      const maxW = 500;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Export as compressed JPEG
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      onCompressComplete(compressedDataUrl);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// ==========================================================================
// 9. Canvas Sketching Workspace (Touch-enabled)
// ==========================================================================

function initCanvasDrawEngine() {
  canvasCtx = sketchCanvas.getContext('2d');
  
  // Mouse Draw Event Listeners
  sketchCanvas.addEventListener('mousedown', startDrawing);
  sketchCanvas.addEventListener('mousemove', draw);
  sketchCanvas.addEventListener('mouseup', stopDrawing);
  sketchCanvas.addEventListener('mouseout', stopDrawing);

  // Touch Draw Event Listeners (Optimized for stylus / physical tablet drag drawing)
  sketchCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault(); // Stop scroll bouncing on tablet
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch);
      isDrawing = true;
      lastDrawX = coords.x;
      lastDrawY = coords.y;
    }
  });

  sketchCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDrawing) {
      e.preventDefault();
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch);
      drawStroke(coords.x, coords.y);
    }
  });

  sketchCanvas.addEventListener('touchend', stopDrawing);
  sketchCanvas.addEventListener('touchcancel', stopDrawing);

  // Brush Color Selections
  document.querySelectorAll('.sketch-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sketch-color').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      isEraserActive = false;
      sketchEraser.classList.remove('active');
      brushColor = btn.getAttribute('data-color');
    });
  });

  // Toggle Eraser tool
  sketchEraser.addEventListener('click', () => {
    isEraserActive = !isEraserActive;
    sketchEraser.classList.toggle('active', isEraserActive);
  });

  // Brush Size
  sketchBrushSize.addEventListener('input', (e) => {
    brushSize = e.target.value;
  });

  // Clear Canvas
  sketchClear.addEventListener('click', () => {
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  });

  // Cancel Drawing
  sketchClose.addEventListener('click', () => {
    sketchModal.classList.remove('visible');
  });

  // Save Canvas Sketch
  sketchSave.addEventListener('click', () => {
    // Compress sketch
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const maxW = 500;
    const scale = Math.min(1, maxW / sketchCanvas.width);
    tempCanvas.width = sketchCanvas.width * scale;
    tempCanvas.height = sketchCanvas.height * scale;
    
    // Draw white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(sketchCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);

    // Save target
    if (activeSketchTarget === 'creator') {
      creatorImage = dataUrl;
      creatorImgPreview.src = dataUrl;
      creatorImageBanner.style.display = 'block';
    } else if (activeSketchTarget === 'modal' && currentEditingNoteId) {
      const note = notes.find(n => n.id === currentEditingNoteId);
      if (note) {
        note.image = dataUrl;
        modalImgPreview.src = dataUrl;
        modalImageBanner.style.display = 'block';
        saveToLocalStorage();
        renderNotes();
      }
    }

    sketchModal.classList.remove('visible');
  });
}

function openDrawingWorkspace(target) {
  activeSketchTarget = target;
  sketchModal.classList.add('visible');
  
  // Set dimensions matching canvas wrapper
  const wrapper = sketchCanvas.parentNode;
  sketchCanvas.width = wrapper.clientWidth;
  sketchCanvas.height = wrapper.clientHeight;
  
  // Fill canvas white
  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
}

function getCanvasCoords(eventOrTouch) {
  const rect = sketchCanvas.getBoundingClientRect();
  return {
    x: eventOrTouch.clientX - rect.left,
    y: eventOrTouch.clientY - rect.top
  };
}

function startDrawing(e) {
  isDrawing = true;
  const coords = getCanvasCoords(e);
  lastDrawX = coords.x;
  lastDrawY = coords.y;
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);
  drawStroke(coords.x, coords.y);
}

function drawStroke(x, y) {
  canvasCtx.beginPath();
  canvasCtx.moveTo(lastDrawX, lastDrawY);
  canvasCtx.lineTo(x, y);
  
  canvasCtx.strokeStyle = isEraserActive ? '#ffffff' : brushColor;
  canvasCtx.lineWidth = brushSize;
  canvasCtx.lineCap = 'round';
  canvasCtx.lineJoin = 'round';
  
  canvasCtx.stroke();
  
  lastDrawX = x;
  lastDrawY = y;
}

function stopDrawing() {
  isDrawing = false;
}

// ==========================================================================
// 10. Rendering Engine (Grids, Checklists & Hashtags)
// ==========================================================================

function renderNotes() {
  const query = searchInput.value.toLowerCase().trim();
  
  // Apply Search + Tag filters
  const filteredNotes = notes.filter(note => {
    if (note.archived) return false;
    
    if (selectedFolderFilter && (note.folder || 'Inbox') !== selectedFolderFilter) return false;

    // Tag filter matching
    if (selectedTagFilter) {
      const tags = extractHashtags(`${note.title || ''} ${note.text || ''}`);
      if (!tags.includes(selectedTagFilter)) return false;
    }

    if (selectedTypeFilter !== 'all') {
      const noteKind = getVisualNoteType(note);
      if (noteKind !== selectedTypeFilter) return false;
    }
    
    // Search query matching
    if (query === '') return true;
    return (note.title || '').toLowerCase().includes(query) || (note.text || '').toLowerCase().includes(query);
  });

  const pinnedList = filteredNotes.filter(n => n.pinned);
  const othersList = filteredNotes.filter(n => !n.pinned);

  renderGrid(pinnedGrid, pinnedList);
  renderGrid(othersGrid, othersList);

  // Section Headers
  pinnedSection.style.display = pinnedList.length > 0 ? 'flex' : 'none';

  if (othersList.length > 0) {
    othersSection.style.display = 'flex';
    othersSectionTitle.style.display = pinnedList.length > 0 ? 'block' : 'none';
  } else {
    othersSection.style.display = 'none';
  }

  // Handle Empty State
  if (filteredNotes.length === 0) {
    emptyState.style.display = 'flex';
    emptyState.querySelector('.empty-text').textContent = 
      query !== '' ? 'No matching notes found' : (selectedTagFilter ? `No notes tagged #${selectedTagFilter}` : 'Notes you add appear here');
  } else {
    emptyState.style.display = 'none';
  }

  // Sidebar tag listing update
  renderSidebarFolders();
  renderFolderSuggestions();
  renderSidebarTags();
}

function renderGrid(gridContainer, notesArray) {
  gridContainer.innerHTML = '';
  
  const validNotes = (notesArray || []).filter(note => note !== null && typeof note === 'object' && note.id);
  
  validNotes.forEach(note => {
    const card = document.createElement('div');
    const noteKind = getVisualNoteType(note);
    card.className = 'note-card';
    card.setAttribute('data-color', note.color);
    card.setAttribute('data-note-kind', noteKind);
    if (note.theme) {
      card.setAttribute('data-theme', note.theme);
    } else {
      card.removeAttribute('data-theme');
    }
    card.setAttribute('data-id', note.id);

    const boardHeader = document.createElement('div');
    boardHeader.className = 'note-board-header';
    const boardTitle = document.createElement('span');
    boardTitle.className = 'note-board-title';
    boardTitle.textContent = note.folder || getVisualTypeLabel(noteKind);
    const boardAccent = document.createElement('span');
    boardAccent.className = 'note-board-accent';
    boardAccent.textContent = getVisualTypeLabel(noteKind);
    boardHeader.appendChild(boardTitle);
    boardHeader.appendChild(boardAccent);
    card.appendChild(boardHeader);

    const surface = document.createElement('div');
    surface.className = 'note-surface';
    card.appendChild(surface);
    
    // 1. Image Banner
    const bannerImage = note.image || null;
    if (bannerImage) {
      const banner = document.createElement('div');
      banner.className = 'card-image-banner';
      banner.innerHTML = `<img src="${bannerImage}" alt="Note banner">`;
      surface.appendChild(banner);
    }

    const cardMenu = document.createElement('div');
    cardMenu.className = 'note-card-menu';

    const menuToggle = document.createElement('button');
    menuToggle.className = 'icon-btn note-card-menu-toggle';
    menuToggle.setAttribute('aria-label', 'More note actions');
    menuToggle.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
      </svg>
    `;
    cardMenu.appendChild(menuToggle);

    const menuPanelEl = document.createElement('div');
    menuPanelEl.className = 'note-card-menu-panel';
    cardMenu.appendChild(menuPanelEl);
    card.appendChild(cardMenu);

    // 3. Title (if not empty)
    const titleVal = note.title || '';
    if (titleVal.trim() !== '') {
      const titleEl = document.createElement('h4');
      titleEl.className = 'note-title';
      titleEl.textContent = cleanTitleTags(titleVal);
      surface.appendChild(titleEl);
    }

    const metaRow = document.createElement('div');
    metaRow.className = 'note-meta-row';
    const typePill = document.createElement('span');
    typePill.className = `note-kind-pill type-${noteKind}`;
    typePill.textContent = getVisualTypeLabel(noteKind);
    const folderPill = document.createElement('span');
    folderPill.className = 'note-folder-pill';
    folderPill.textContent = note.folder || 'Inbox';
    folderPill.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFolderFilter = note.folder || 'Inbox';
      renderNotes();
    });
    metaRow.appendChild(typePill);
    metaRow.appendChild(folderPill);
    surface.appendChild(metaRow);

    // 4. Content (Checklist vs Plain Text)
    note.type = getNoteType(note.text || '');
    const contentEl = renderNoteContent(note, {
      cleanTextTags,
      currentEditingNoteId: () => currentEditingNoteId,
      modalText: () => modalText,
      renderNotes,
      renderTextWithLinksFromApp: (text) => renderTextWithLinks(text, URL_REGEX),
      saveToLocalStorage,
      syncModalInputs,
      urlRegex: URL_REGEX
    });
    if (contentEl) {
      surface.appendChild(contentEl);
    }

    // 4.5 Audio Voice Note player rendering
    if (note.audio) {
      const audioChip = document.createElement('div');
      audioChip.className = 'audio-player-chip';
      audioChip.addEventListener('click', (e) => e.stopPropagation()); // prevent modal open
      
      const playBtn = document.createElement('button');
      playBtn.className = 'audio-play-btn';
      playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      
      const visualizer = document.createElement('div');
      visualizer.className = 'audio-wave-visualizer';
      for (let w = 0; w < 8; w++) {
        const bar = document.createElement('div');
        bar.className = 'audio-wave-bar';
        visualizer.appendChild(bar);
      }
      
      const durationLabel = document.createElement('span');
      durationLabel.className = 'audio-duration-label';
      durationLabel.textContent = `0:00 / ${note.audioDuration || '0:05'}`;
      
      let audioObj = null;
      let playInterval = null;
      
      playBtn.addEventListener('click', () => {
        if (audioObj && !audioObj.paused) {
          audioObj.pause();
          playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
          audioChip.classList.remove('playing');
          clearInterval(playInterval);
        } else {
          if (!audioObj) {
            audioObj = new Audio(note.audio);
            audioObj.addEventListener('ended', () => {
              playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
              audioChip.classList.remove('playing');
              durationLabel.textContent = `0:00 / ${note.audioDuration || '0:05'}`;
              clearInterval(playInterval);
              audioObj = null;
            });
          }
          
          audioObj.play();
          playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
          audioChip.classList.add('playing');
          
          playInterval = setInterval(() => {
            if (audioObj) {
              const curMin = Math.floor(audioObj.currentTime / 60);
              const curSec = Math.floor(audioObj.currentTime % 60).toString().padStart(2, '0');
              durationLabel.textContent = `${curMin}:${curSec} / ${note.audioDuration || '0:05'}`;
            }
          }, 250);
        }
      });
      
      audioChip.appendChild(playBtn);
      audioChip.appendChild(visualizer);
      audioChip.appendChild(durationLabel);
      surface.appendChild(audioChip);
    }

    // 5. Dynamic Tag Badges & Reminders rendering inside note cards
    const tags = extractHashtags(`${note.title} ${note.text}`);
    if (tags.length > 0 || note.reminder) {
      const tagList = document.createElement('div');
      tagList.className = 'note-tags-list';
      
      // Prepend reminder chip if set
      if (note.reminder) {
        const chip = document.createElement('span');
        chip.className = 'reminder-chip';
        chip.innerHTML = `
          <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          <span>${formatReminderDate(note.reminder)}</span>
          <span class="reminder-chip-delete" title="Delete reminder">✕</span>
        `;
        chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          note.reminder = null;
          note.reminderTriggered = false;
          saveToLocalStorage();
          renderNotes();
        });
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('reminder-chip-delete')) return;
          e.stopPropagation();
          openEditModal(note);
        });
        tagList.appendChild(chip);
      }

      tags.forEach(tag => {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.textContent = `#${tag}`;
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedTagFilter = tag;
          selectedFolderFilter = null;
          // Sync sidebar active styling
          document.querySelectorAll('.sidebar-item').forEach(el => {
            const lbl = el.querySelector('.sidebar-label');
            if (lbl && lbl.textContent === `#${tag}`) {
              el.classList.add('active');
            } else {
              el.classList.remove('active');
            }
          });
          renderNotes();
        });
        tagList.appendChild(badge);
      });
      surface.appendChild(tagList);
    }

    // 5.5 Link Preview Box rendering
    const firstUrl = getFirstUrlInText(note.text);
    if (firstUrl) {
      const domain = extractDomain(firstUrl);
      const cleanDomain = domain.replace(/^www\./, '');
      
      const previewBox = document.createElement('a');
      previewBox.href = firstUrl;
      previewBox.target = '_blank';
      previewBox.rel = 'noopener noreferrer';
      previewBox.className = 'link-preview-box';
      previewBox.addEventListener('click', (e) => e.stopPropagation());
      
      const mockMeta = getLinkMetadata(firstUrl, note);
      if (mockMeta) {
        previewBox.className = 'link-preview-box rich';
        previewBox.innerHTML = `
          <img class="link-preview-cover" src="${mockMeta.image}" alt="Preview image">
          <div class="link-preview-rich-content">
            <div class="link-preview-domain">${cleanDomain}</div>
            <div class="link-preview-rich-title">${mockMeta.title}</div>
            <div class="link-preview-rich-desc">${mockMeta.description}</div>
            <div class="link-preview-badge">
              <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; margin-right: 2px;"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
              ${mockMeta.badge}
            </div>
          </div>
        `;
      } else {
        previewBox.className = 'link-preview-box';
        previewBox.innerHTML = `
          <svg class="link-preview-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <div class="link-preview-info">
            <div class="link-preview-title">${domain || 'Visit Link'}</div>
            <div class="link-preview-url">${firstUrl}</div>
          </div>
        `;
      }
      surface.appendChild(previewBox);
    }

    // 6. Overflow Actions Menu
    const colorBtnWrapper = document.createElement('div');
    colorBtnWrapper.className = 'color-palette-trigger-wrapper note-card-menu-item note-card-menu-theme';
    
    const colorBtn = document.createElement('button');
    colorBtn.className = 'note-card-menu-action';
    colorBtn.setAttribute('aria-label', 'Change note theme');
    colorBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01l-.23-.25a.3.3 0 0 1-.03-.17c0-.09.06-.15.15-.15H15a6 6 0 0 0 6-6c0-4.97-4.03-9-9-9zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
      <span>Theme</span>
    `;
    
    const picker = document.createElement('div');
    picker.className = 'color-picker-bubble note-card-theme-picker';
    
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.color-picker-bubble').forEach(p => {
        if (p !== picker) p.classList.remove('visible');
      });
      // Rebuild dynamically to ensure it is in sync
      buildColorGrid(picker, note.color, note.theme, (type, value) => {
        if (type === 'color') {
          note.color = value;
          note.theme = null;
        } else {
          note.color = 'default';
          note.theme = value === 'none' ? null : value;
        }
        saveToLocalStorage();
        picker.classList.remove('visible');
        renderNotes();
      });
      picker.classList.toggle('visible');
    });

    // Initial build
    buildColorGrid(picker, note.color, note.theme, (type, value) => {
      if (type === 'color') {
        note.color = value;
        note.theme = null;
      } else {
        note.color = 'default';
        note.theme = value === 'none' ? null : value;
      }
      saveToLocalStorage();
      picker.classList.remove('visible');
      renderNotes();
    });

    colorBtnWrapper.appendChild(colorBtn);
    colorBtnWrapper.appendChild(picker);
    menuPanelEl.appendChild(colorBtnWrapper);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'note-card-menu-action';
    pinBtn.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
    pinBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2zM9.8 4h4.4v8H9.8V4z" />
      </svg>
      <span>${note.pinned ? 'Unpin' : 'Pin'}</span>
    `;
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      note.pinned = !note.pinned;
      saveToLocalStorage();
      closeAllNoteCardMenus();
      renderNotes();
    });
    menuPanelEl.appendChild(pinBtn);

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'note-card-menu-action danger';
    deleteBtn.setAttribute('aria-label', 'Delete note');
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      <span>Delete</span>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(note.id);
    });
    menuPanelEl.appendChild(deleteBtn);

    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = cardMenu.classList.contains('open');
      closeAllNoteCardMenus();
      if (!isOpen) {
        cardMenu.classList.add('open');
      }
    });

    const stamp = document.createElement('div');
    stamp.className = 'note-stamp';
    stamp.textContent = formatCardTimestamp(note.updatedAt);
    surface.appendChild(stamp);

    // Open Edit Modal on Click
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.icon-btn') && !e.target.closest('.note-card-menu-action') && !e.target.closest('.color-picker-bubble') && !e.target.closest('.checklist-checkbox')) {
        openEditModal(note);
      }
    });

    gridContainer.appendChild(card);
  });
}

// Helper to render lists inside note cards (separated & collapsible completed section)
function legacyRenderChecklistMarkup(note) {
  const container = document.createElement('div');
  container.className = 'checklist-container';
  
  const lines = note.text.split('\n');
  const uncheckedRows = [];
  const checkedRows = [];
  
  lines.forEach((line, index) => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const checked = line.startsWith('- [x] ');
      const cleanText = line.substring(6);
      
      const row = document.createElement('div');
      row.className = 'checklist-row';
      
      const checkbox = document.createElement('div');
      checkbox.className = `checklist-checkbox ${checked ? 'checked' : ''}`;
      checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const newPrefix = checked ? '- [ ] ' : '- [x] ';
        lines[index] = newPrefix + cleanText;
        note.text = lines.join('\n');
        
        saveToLocalStorage();
        renderNotes();
        
        // Sync open modal if editing this note
        if (currentEditingNoteId === note.id) {
          modalText.value = note.text;
          syncModalInputs(note);
        }
      });

      const label = document.createElement('span');
      label.className = `checklist-text ${checked ? 'checked' : ''}`;
      label.appendChild(renderTextWithLinks(cleanText));

      row.appendChild(checkbox);
      row.appendChild(label);
      
      if (checked) {
        checkedRows.push(row);
      } else {
        uncheckedRows.push(row);
      }
    } else if (line.trim() !== '') {
      // Plain text row inside lists
      const row = document.createElement('div');
      row.className = 'checklist-row';
      row.style.paddingLeft = '28px'; // Align with checkbox labels
      row.textContent = line;
      uncheckedRows.push(row);
    }
  });

  // Append active list items
  uncheckedRows.forEach(row => container.appendChild(row));

  // Collapsible completed items list
  if (checkedRows.length > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRows.length} completed item${checkedRows.length > 1 ? 's' : ''}</span>
    `;
    
    const body = document.createElement('div');
    body.className = 'completed-items-body';
    checkedRows.forEach(row => body.appendChild(row));
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = body.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });
    
    container.appendChild(header);
    container.appendChild(body);
  }

  return container;
}

// Clean title/text of raw tags for presentation
function cleanTitleTags(title) {
  return title.replace(/#[a-zA-Z0-9]+/g, '').trim();
}

function cleanTextTags(text) {
  return text.split('\n')
    .map(line => line.replace(/#[a-zA-Z0-9]+/g, '').trim())
    .join('\n')
    .trim();
}

function extractHashtags(combinedText) {
  const tagsSet = new Set();
  const words = combinedText.split(/[\s,]+/);
  words.forEach(word => {
    if (word.startsWith('#') && word.length > 2) {
      const clean = word.substring(1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (clean) tagsSet.add(clean);
    }
  });
  return Array.from(tagsSet);
}

// ==========================================================================
// 11. Note Modal Editor Upgraded logic
// ==========================================================================

function openEditModal(note) {
  currentEditingNoteId = note.id;

  if (!document.getElementById('modal-folder')) {
    const folderField = document.createElement('div');
    folderField.className = 'modal-folder-field';
    folderField.innerHTML = `
      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 4l2 2h8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4z"/></svg>
      <input type="text" id="modal-folder" list="folder-suggestions" placeholder="Group">
    `;
    modalTitle.insertAdjacentElement('afterend', folderField);
  }
  modalFolderInput = document.getElementById('modal-folder');
  
  modalTitle.value = note.title;
  modalText.value = note.text;
  if (modalFolderInput) modalFolderInput.value = note.folder || 'Inbox';
  
  syncModalInputs(note);
  renderModalAudioPreview(note);
  
  editModalCard.setAttribute('data-color', note.color);
  if (note.theme) {
    editModalCard.setAttribute('data-theme', note.theme);
  } else {
    editModalCard.removeAttribute('data-theme');
  }
  modalPin.classList.toggle('pinned', note.pinned);

  // Setup modal banner preview
  if (note.image) {
    modalImgPreview.src = note.image;
    modalImageBanner.style.display = 'block';
  } else {
    modalImageBanner.style.display = 'none';
    modalImgPreview.src = '';
  }
  
  // Render tag badges inside modal
  renderModalTags(note);
  renderModalReminderChip(note);
  
  // Rebuild modal color picker dynamically
  buildColorGrid(modalColorPicker, note.color, note.theme, (type, value) => {
    if (type === 'color') {
      note.color = value;
      note.theme = null;
      editModalCard.setAttribute('data-color', value);
      editModalCard.removeAttribute('data-theme');
    } else {
      note.color = 'default';
      note.theme = value === 'none' ? null : value;
      editModalCard.setAttribute('data-color', 'default');
      if (note.theme) {
        editModalCard.setAttribute('data-theme', note.theme);
      } else {
        editModalCard.removeAttribute('data-theme');
      }
    }
    saveToLocalStorage();
    renderNotes();
    modalColorPicker.classList.remove('visible');
  });

  // Modal reminder popover click trigger
  const modalReminderBtn = document.getElementById('modal-reminder-btn');
  const modalReminderPicker = document.getElementById('modal-reminder-picker');
  
  modalReminderBtn.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-picker-bubble, .reminder-picker-bubble').forEach(p => {
      if (p !== modalReminderPicker) p.classList.remove('visible');
    });
    
    buildReminderPicker(modalReminderPicker, note.reminder, (dateTime) => {
      note.reminder = dateTime;
      note.reminderTriggered = false;
      saveToLocalStorage();
      renderNotes();
      renderModalReminderChip(note);
      modalReminderPicker.classList.remove('visible');
    }, () => {
      note.reminder = null;
      note.reminderTriggered = false;
      saveToLocalStorage();
      renderNotes();
      renderModalReminderChip(note);
      modalReminderPicker.classList.remove('visible');
    });
    modalReminderPicker.classList.toggle('visible');
  };

  editModal.classList.add('visible');
  
  setTimeout(() => {
    modalText.style.height = 'auto';
    modalText.style.height = modalText.scrollHeight + 'px';
  }, 50);
}

function renderModalTags(note) {
  modalTagsContainer.innerHTML = '';
  const tags = extractHashtags(`${note.title} ${note.text}`);
  tags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.textContent = `#${tag}`;
    modalTagsContainer.appendChild(badge);
  });
}

function closeEditModal() {
  if (currentEditingNoteId) {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      const title = modalTitle.value.trim();
      const text = modalText.value.trim();
      
      if (isNoteEffectivelyEmpty(title, text, note.image, note.audio)) {
        deleteNote(currentEditingNoteId);
      } else {
        note.title = title;
        note.text = text;
        note.folder = modalFolderInput?.value.trim() || 'Inbox';
        note.type = getNoteType(text);
        note.updatedAt = Date.now();
        saveToLocalStorage();
        renderNotes();
      }
    }
  }
  
  currentEditingNoteId = null;
  editModal.classList.remove('visible');
  modalColorPicker.classList.remove('visible');
}

function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  saveToLocalStorage();
  renderNotes();
}

// ==========================================================================
// 12. Layout UI Toggle Handlers
// ==========================================================================

// Unused toggleTheme replaced by setTheme framework

function toggleViewLayout() {
  const isListView = pinnedGrid.classList.contains('list-view');
  if (isListView) {
    pinnedGrid.classList.remove('list-view');
    othersGrid.classList.remove('list-view');
    localStorage.setItem(STORAGE_KEYS.view, 'grid');
    document.getElementById('grid-icon').style.display = 'none';
    document.getElementById('list-icon').style.display = 'block';
  } else {
    pinnedGrid.classList.add('list-view');
    othersGrid.classList.add('list-view');
    localStorage.setItem(STORAGE_KEYS.view, 'list');
    document.getElementById('grid-icon').style.display = 'block';
    document.getElementById('list-icon').style.display = 'none';
  }
}

// ==========================================================================
// 13. Helpers
// ==========================================================================

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    hasShownStorageWarning = false;
    return true;
  } catch (error) {
    console.warn('Unable to save notes to localStorage:', error);
    if (!hasShownStorageWarning && document.getElementById('toast-container')) {
      hasShownStorageWarning = true;
      showToast({
        title: 'Storage full',
        text: 'Notes could not be saved locally. Remove large images or voice clips and try again.'
      });
    }
    return false;
  }
}

function autoGrowTextarea() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
}

function getContinuingListPrefix(line) {
  const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (orderedMatch) {
    const [, indent, number, content] = orderedMatch;
    if (content.trim() === '') return '';
    return `${indent}${Number(number) + 1}. `;
  }

  const bulletMatch = line.match(/^(\s*)([-*•])\s+(.*)$/);
  if (bulletMatch) {
    const [, indent, bullet, content] = bulletMatch;
    if (content.trim() === '') return '';
    return `${indent}${bullet} `;
  }

  return null;
}

function handleRichListEditing(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;

  const textarea = event.currentTarget;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const currentLine = value.slice(lineStart, safeLineEnd);
  const nextPrefix = getContinuingListPrefix(currentLine);

  if (nextPrefix === null) return;

  event.preventDefault();

  if (nextPrefix === '') {
    const before = value.slice(0, lineStart);
    const after = value.slice(safeLineEnd);
    const joiner = after.startsWith('\n') ? '' : (after.length > 0 ? '\n' : '');
    textarea.value = `${before}${joiner}${after}`;
    const nextCaret = before.length;
    textarea.selectionStart = nextCaret;
    textarea.selectionEnd = nextCaret;
  } else {
    const before = value.slice(0, end);
    const after = value.slice(end);
    textarea.value = `${before}\n${nextPrefix}${after}`;
    const nextCaret = before.length + 1 + nextPrefix.length;
    textarea.selectionStart = nextCaret;
    textarea.selectionEnd = nextCaret;
  }

  autoGrowTextarea.call(textarea);
  if (textarea === creatorText) {
    syncCreatorInputs();
  }
}

/* ==========================================================================
   Upgraded Note Reminders & URL Parser Helpers
   ========================================================================== */
const URL_REGEX = /(https?:\/\/[^\s\n\r]+)/g;

function isNoteEffectivelyEmpty(title, text, image, audio) {
  return title === '' && text === '' && image === null && audio === null;
}

function legacyRenderTextWithLinks(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const [url] = match;
    const start = match.index;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = new URL(url).toString();
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      fragment.appendChild(anchor);
    } catch (e) {
      fragment.appendChild(document.createTextNode(url));
    }

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

function legacyRenderFormattedText(text) {
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(text);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    URL_REGEX.lastIndex = 0;
    if (!URL_REGEX.test(node.textContent)) return;
    const replacement = renderTextWithLinks(node.textContent);
    node.parentNode.replaceChild(replacement, node);
  });

  return template.content;
}

function getFirstUrlInText(text) {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : null;
}

function extractDomain(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch (e) {
    return '';
  }
}

function getVisualTypeLabel(kind) {
  const labels = {
    text: 'Text',
    checklist: 'Checklist',
    voice: 'Voice',
    bookmark: 'Bookmark',
    recipe: 'Recipe',
    image: 'Visual'
  };
  return labels[kind] || 'Note';
}

function formatCardTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getLinkMetadata(url, note) {
  const domain = extractDomain(url).replace(/^www\./, '');
  const mockMeta = SOCIAL_MOCK_METADATA[domain];
  const inferredImage = inferPreviewImageFromUrl(url, note);
  if (mockMeta) {
    return {
      ...mockMeta,
      image: note.image || inferredImage || mockMeta.image
    };
  }
  return {
    title: cleanTitleTags(note.title || domain || 'Shared link'),
    description: (note.text || '').replace(url, '').trim().slice(0, 140) || `Saved from ${domain || 'the web'}`,
    image: note.image || inferredImage || `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop`,
    badge: 'Saved link'
  };
}

function inferPreviewImageFromUrl(url, note) {
  if (note.image) return note.image;

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '');

    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
      if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    if (domain.includes('github.com')) {
      const repoPath = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
      if (repoPath) return `https://opengraph.githubassets.com/1/${repoPath}`;
    }

    if (domain.includes('pinterest.com')) {
      return 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=900&auto=format&fit=crop';
    }

    if (domain.includes('amazon.')) {
      return 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=900&auto=format&fit=crop';
    }

    if (domain.includes('figma.com')) {
      return 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=900&auto=format&fit=crop';
    }

    if (domain.includes('notion.so')) {
      return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop';
    }

    const slug = parsed.pathname.split('/').filter(Boolean).pop();
    if (slug && slug.length > 4) {
      const query = encodeURIComponent(slug.replace(/[-_]/g, ' '));
      return `https://source.unsplash.com/featured/900x600/?${query}`;
    }
  } catch (e) {
    return null;
  }

  return null;
}

function formatReminderDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  
  // Check if today
  const isToday = date.toDateString() === now.toDateString();
  
  // Check if tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  // Format time
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;
  
  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow, ${timeStr}`;
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
  }
}

function renderCreatorReminderChip() {
  const container = document.getElementById('creator-chips-container');
  container.innerHTML = '';
  if (creatorReminder) {
    const chip = document.createElement('div');
    chip.className = 'reminder-chip';
    chip.innerHTML = `
      <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
      <span>${formatReminderDate(creatorReminder)}</span>
      <span class="reminder-chip-delete" title="Delete reminder">✕</span>
    `;
    chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      creatorReminder = null;
      renderCreatorReminderChip();
    });
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('reminder-chip-delete')) return;
      e.stopPropagation();
      const picker = document.getElementById('creator-reminder-picker');
      picker.classList.toggle('visible');
    });
    container.appendChild(chip);
  }
}

function renderModalReminderChip(note) {
  const container = document.getElementById('modal-tags-container');
  container.querySelectorAll('.reminder-chip').forEach(el => el.remove());
  if (note.reminder) {
    const chip = document.createElement('div');
    chip.className = 'reminder-chip';
    chip.innerHTML = `
      <svg class="reminder-chip-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
      <span>${formatReminderDate(note.reminder)}</span>
      <span class="reminder-chip-delete" title="Delete reminder">✕</span>
    `;
    chip.querySelector('.reminder-chip-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      note.reminder = null;
      note.reminderTriggered = false;
      saveToLocalStorage();
      renderNotes();
      renderModalReminderChip(note);
    });
    container.appendChild(chip);
  }
}

function buildReminderPicker(pickerContainer, currentReminder, onSave, onDelete) {
  pickerContainer.innerHTML = '';

  const title = document.createElement('span');
  title.className = 'reminder-picker-title';
  title.textContent = 'Set Date & Time';
  pickerContainer.appendChild(title);

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.className = 'reminder-datetime-input';
  if (currentReminder) {
    input.value = currentReminder.substring(0, 16);
  }
  pickerContainer.appendChild(input);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'space-between';
  actions.style.marginTop = '6px';
  actions.style.width = '100%';

  if (currentReminder && onDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-btn';
    deleteBtn.style.color = '#ea4335';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    actions.appendChild(deleteBtn);
  } else {
    const spacer = document.createElement('div');
    actions.appendChild(spacer);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'text-btn save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = input.value;
    if (val) {
      onSave(val);
    }
  });
  actions.appendChild(saveBtn);
  pickerContainer.appendChild(actions);
}

function showToast(note) {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <svg class="toast-bell-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
    <div class="toast-content">
      <div class="toast-title">${note.title || 'Reminder Alert!'}</div>
      <div class="toast-text">${note.text || 'You have a scheduled reminder.'}</div>
    </div>
    <span class="toast-close">✕</span>
  `;
  
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  });
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 350);
    }
  }, 8000);
}

function checkReminders() {
  const now = new Date();
  let changed = false;
  
  notes.forEach(note => {
    if (note.reminder && !note.reminderTriggered) {
      const reminderTime = new Date(note.reminder);
      if (now >= reminderTime) {
        note.reminderTriggered = true;
        showToast(note);
        changed = true;
      }
    }
  });
  
  if (changed) {
    saveToLocalStorage();
    renderNotes();
  }
}

/* ==========================================================================
   Upgraded Markdown & Social Previews & Recipe Scrapers
   ========================================================================== */
const SOCIAL_MOCK_METADATA = {
  'pinterest.com': {
    title: 'Beautiful Wood Cabin Forest Workspace - Inspiration Pin',
    description: 'Explore curated cozy cabin office aesthetic boards on Pinterest. Simple wood structures, warm lighting, and fall season setups.',
    image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=500',
    badge: 'Pinterest Inspiration'
  },
  'facebook.com': {
    title: 'Announcing HyperKeep 2.0 - Advanced Note Taking',
    description: 'We are thrilled to release HyperKeep 2.0! Full reminders, interactive checklists, voice notes transcribing, and custom themes are now live.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500',
    badge: 'Facebook Post'
  },
  'amazon.com': {
    title: 'Retro Typewriter Mechanical Keyboard - Walnut Wood Case',
    description: 'Vintage RGB Backlit Mechanical keyboard with round typewriter keycaps and walnut wood case. Order now on Amazon.',
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
    badge: 'Amazon Shopping'
  },
  'youtube.com': {
    title: 'Full Body HIIT Workout - 20 Minutes (No Equipment)',
    description: 'Follow this intense 20-minute bodyweight routine to build strength, endurance, and burn calories. Subscribe for weekly updates!',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500',
    badge: 'YouTube Video'
  },
  'figma.com': {
    title: 'Figma board with product directions and motion studies',
    description: 'Saved design explorations with color systems, interface states, and clickable prototype flows.',
    image: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=500',
    badge: 'Design Board'
  },
  'notion.so': {
    title: 'Notion workspace with product notes and linked references',
    description: 'Shared planning hub collecting docs, specs, and research links in one place.',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500',
    badge: 'Workspace'
  },
  'x.com': {
    title: 'Thread worth saving for later reference',
    description: 'A bookmarked post with commentary, media, and relevant follow-up links.',
    image: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=500',
    badge: 'Social Post'
  }
};

function legacyParseMarkdown(text) {
  if (!text) return '';
  
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  html = html.replace(/^### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');
  
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  let lines = html.split('\n');
  let inList = false;
  
  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      let content = trimmed.substring(2);
      let res = '';
      if (!inList) {
        inList = true;
        res += '<ul>';
      }
      res += `<li>${content}</li>`;
      return res;
    } else {
      let res = '';
      if (inList) {
        inList = false;
        res += '</ul>';
      }
      res += line;
      return res;
    }
  });
  if (inList) {
    lines.push('</ul>');
  }
  
  html = lines.join('<br>');
  
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<ul><br>/g, '<ul>');
  html = html.replace(/<\/li><br><li>/g, '</li><li>');
  html = html.replace(/<br><li>/g, '<li>');
  html = html.replace(/<\/li><br>/g, '</li>');
  
  return html;
}

function openRecipeModal() {
  document.getElementById('recipe-url-input').value = '';
  document.getElementById('recipe-title-input').value = '';
  document.getElementById('recipe-ingredients-input').value = '';
  document.getElementById('recipe-instructions-input').value = '';
  document.getElementById('recipe-modal').classList.add('visible');
}

const MOCK_RECIPE_DATABASE = {
  'salmon': {
    title: '🍽️ Recipe: Creamy Garlic Tuscan Salmon #cooking',
    ingredients: [
      '4 salmon fillets',
      '1 tbsp olive oil',
      '1 cup heavy cream',
      '1/2 cup chicken broth',
      '1 tsp garlic powder',
      '1 cup spinach',
      '1/2 cup sun-dried tomatoes'
    ],
    instructions: '# Prep Steps\n1. Season salmon fillets on both sides with salt and pepper.\n2. Heat olive oil in a large skillet over medium-high heat.\n3. Sear salmon for 5 minutes on each side until golden.\n\n# Sauce Steps\n4. Add garlic and cook until fragrant.\n5. Pour in heavy cream, broth, and simmer. Stir in spinach and tomatoes.',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500'
  },
  'taco': {
    title: '🍽️ Recipe: Street Style Beef Tacos #cooking',
    ingredients: [
      '1 lb flank steak',
      '1/2 cup chopped cilantro',
      '1/2 cup white onion diced',
      '8 corn tortillas',
      '2 limes cut into wedges',
      '1 tbsp chili powder'
    ],
    instructions: '# Prep Steps\n1. Rub steak with chili powder, salt, and pepper.\n2. Grill steak on high heat for 4 mins each side.\n3. Slice steak thinly against the grain.\n\n# Assembly\n4. Warm corn tortillas on skillet.\n5. Load steak, garnish with cilantro and onions. Serve with lime.',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500'
  }
};

function handleRecipeImportAction() {
  let title = document.getElementById('recipe-title-input').value.trim();
  let ingredientsRaw = document.getElementById('recipe-ingredients-input').value.trim();
  let instructions = document.getElementById('recipe-instructions-input').value.trim();
  let image = null;
  
  const urlVal = document.getElementById('recipe-url-input').value.toLowerCase();
  
  if (urlVal.includes('salmon')) {
    const data = MOCK_RECIPE_DATABASE.salmon;
    title = data.title;
    ingredientsRaw = data.ingredients.join('\n');
    instructions = data.instructions;
    image = data.image;
  } else if (urlVal.includes('taco') || urlVal.includes('beef')) {
    const data = MOCK_RECIPE_DATABASE.taco;
    title = data.title;
    ingredientsRaw = data.ingredients.join('\n');
    instructions = data.instructions;
    image = data.image;
  }
  
  if (!title) title = '🍽️ Recipe: New Culinary Dish';
  
  let text = 'Ingredients:\n';
  if (ingredientsRaw) {
    ingredientsRaw.split('\n').forEach(line => {
      if (line.trim() !== '') {
        text += `- [ ] ${line.trim()}\n`;
      }
    });
  } else {
    text += '- [ ] No ingredients specified\n';
  }
  
  if (instructions) {
    text += `\nInstructions:\n${instructions}`;
  }
  
  if (!image) {
    image = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500';
  }
  
  const newNote = {
    id: 'note-' + Date.now(),
    type: getNoteType(text),
    title: title,
    text: text,
    folder: 'Kitchen Board',
    color: 'default',
    theme: 'plants',
    pinned: false,
    archived: false,
    image: image,
    updatedAt: Date.now()
  };
  
  notes.unshift(newNote);
  saveToLocalStorage();
  renderNotes();
  
  document.getElementById('recipe-modal').classList.remove('visible');
}

/* ==========================================================================
   Upgraded Voice Recording Notes & Transcriber
   ========================================================================== */
let mediaRecorder = null;
let audioChunks = [];
let voiceRecognition = null;
let isRecordingVoice = false;
let activeVoiceTarget = null;
let voiceRecordingStartTime = null;
let voiceRecordingElapsedSeconds = 0;
let voiceRecordingTimer = null;

function ensureVoiceRecordingIndicators() {
  const configs = [
    { hostId: 'creator-chips-container', indicatorId: 'creator-recording-indicator', target: 'creator' },
    { hostId: 'modal-tags-container', indicatorId: 'modal-recording-indicator', target: 'modal' }
  ];

  configs.forEach(({ hostId, indicatorId, target }) => {
    const host = document.getElementById(hostId);
    if (!host || document.getElementById(indicatorId)) return;

    const indicator = document.createElement('div');
    indicator.id = indicatorId;
    indicator.className = 'voice-recording-indicator';
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = `
      <span class="voice-recording-dot" aria-hidden="true"></span>
      <span class="voice-recording-copy">
        <strong>${target === 'creator' ? 'Recording voice note' : 'Recording update'}</strong>
        <span class="voice-recording-timer">0:00</span>
      </span>
      <span class="voice-recording-bars" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
    `;
    host.appendChild(indicator);
  });
}

function updateVoiceRecordingIndicators() {
  ensureVoiceRecordingIndicators();
  const formattedTime = `${Math.floor(voiceRecordingElapsedSeconds / 60)}:${(voiceRecordingElapsedSeconds % 60).toString().padStart(2, '0')}`;
  const indicators = [
    { id: 'creator-recording-indicator', target: 'creator' },
    { id: 'modal-recording-indicator', target: 'modal' }
  ];

  indicators.forEach(({ id, target }) => {
    const indicator = document.getElementById(id);
    if (!indicator) return;
    const active = isRecordingVoice && activeVoiceTarget === target;
    indicator.classList.toggle('visible', active);
    const timer = indicator.querySelector('.voice-recording-timer');
    if (timer) {
      timer.textContent = active ? formattedTime : '0:00';
    }
  });
}

function toggleVoiceRecording(target) {
  if (isRecordingVoice) {
    stopVoiceRecording();
  } else {
    startVoiceRecording(target);
  }
}

function startVoiceRecording(target) {
  activeVoiceTarget = target;
  audioChunks = [];
  voiceRecordingElapsedSeconds = 0;
  updateVoiceRecordingIndicators();
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        // Calculate real duration
        const totalSecs = Math.max(1, Math.round((Date.now() - voiceRecordingStartTime) / 1000));
        const durMin = Math.floor(totalSecs / 60);
        const durSec = (totalSecs % 60).toString().padStart(2, '0');
        const duration = `${durMin}:${durSec}`;
        
        // Clear duration timer
        if (voiceRecordingTimer) {
          clearInterval(voiceRecordingTimer);
          voiceRecordingTimer = null;
        }
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          saveVoiceNoteAudio(base64Audio, duration);
        };
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      isRecordingVoice = true;
      voiceRecordingStartTime = Date.now();
      updateVoiceButtonsVisuals(true);
      updateVoiceRecordingIndicators();
      
      // Real-time elapsed counter displayed on buttons
      voiceRecordingTimer = setInterval(() => {
        voiceRecordingElapsedSeconds++;
        const m = Math.floor(voiceRecordingElapsedSeconds / 60);
        const s = (voiceRecordingElapsedSeconds % 60).toString().padStart(2, '0');
        const btns = [document.getElementById('creator-voice-btn'), document.getElementById('modal-voice-btn')];
        btns.forEach(btn => {
          if (btn) btn.setAttribute('title', `Recording ${m}:${s} — Click to stop`);
        });
        updateVoiceRecordingIndicators();
      }, 1000);
      
      if (SpeechRecognition) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        
        const targetTextarea = target === 'creator' ? creatorText : modalText;
        let startText = targetTextarea.value;
        if (startText.trim() !== '') startText += '\n';
        
        voiceRecognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          targetTextarea.value = startText + finalTranscript + interimTranscript;
          autoGrowTextarea.call(targetTextarea);
          
          if (target === 'creator') {
            syncCreatorInputs();
          } else {
            const note = notes.find(n => n.id === currentEditingNoteId);
            if (note) {
              note.text = targetTextarea.value;
              saveToLocalStorage();
              renderNotes();
            }
          }
        };
        
        voiceRecognition.start();
      }
    })
    .catch(err => {
      console.warn("Audio recording not supported or permitted:", err);
      showToast({ title: 'Recording Error', text: 'Mic permission is required to record voice notes.' });
    });
}

function stopVoiceRecording() {
  if (voiceRecordingTimer) {
    clearInterval(voiceRecordingTimer);
    voiceRecordingTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch(e) {}
  }
  isRecordingVoice = false;
  updateVoiceButtonsVisuals(false);
  updateVoiceRecordingIndicators();
}

function updateVoiceButtonsVisuals(active) {
  const btns = [
    { el: document.getElementById('creator-voice-btn'), target: 'creator' },
    { el: document.getElementById('modal-voice-btn'), target: 'modal' }
  ];
  btns.forEach(({ el, target }) => {
    const btn = el;
    if (!btn) return;

    const isActiveTarget = active && activeVoiceTarget === target;
    btn.classList.toggle('voice-recording-active', isActiveTarget);
    btn.classList.toggle('voice-recording-idle', active && !isActiveTarget);

    if (isActiveTarget) {
      btn.style.color = '#ea4335';
      btn.style.animation = 'bellWobble 1s infinite ease-in-out';
      btn.setAttribute('aria-pressed', 'true');
      return;
    }

    btn.style.color = '';
    btn.style.animation = '';
    btn.setAttribute('aria-pressed', 'false');
    if (!active) {
      btn.setAttribute('title', 'Record Voice');
    }
  });
}

function saveVoiceNoteAudio(base64Audio, duration) {
  const dur = duration || '0:05';
  if (activeVoiceTarget === 'creator') {
    creatorAudio = base64Audio;
    creatorAudioDuration = dur;
    renderCreatorAudioPreview();
    showToast({ title: '🎙️ Voice note recorded', text: `Duration: ${dur}` });
  } else {
    const note = notes.find(n => n.id === currentEditingNoteId);
    if (note) {
      note.audio = base64Audio;
      note.audioDuration = dur;
      saveToLocalStorage();
      renderNotes();
      renderModalAudioPreview(note);
      showToast({ title: '🎙️ Voice note recorded', text: `Duration: ${dur}` });
    }
  }
}

function renderCreatorAudioPreview() {
  const container = document.getElementById('creator-chips-container');
  container.querySelectorAll('.audio-player-chip').forEach(el => el.remove());
  if (creatorAudio) {
    const chip = document.createElement('div');
    chip.className = 'audio-player-chip';
    chip.style.marginTop = '0';
    chip.style.padding = '4px 8px';
    chip.innerHTML = `
      <span style="font-size: 11px; font-weight: bold; color: var(--accent-color);">🎙️ Voice Clip (${creatorAudioDuration || '0:05'})</span>
      <span class="reminder-chip-delete" id="delete-creator-audio" title="Delete voice clip" style="margin-left: 6px; font-size: 12px; cursor: pointer; opacity: 0.6;">✕</span>
    `;
    chip.querySelector('#delete-creator-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      creatorAudio = null;
      creatorAudioDuration = null;
      renderCreatorAudioPreview();
    });
    container.appendChild(chip);
  }
}

function renderModalAudioPreview(note) {
  const container = document.getElementById('modal-tags-container');
  container.querySelectorAll('.audio-player-chip').forEach(el => el.remove());
  if (note.audio) {
    const chip = document.createElement('div');
    chip.className = 'audio-player-chip';
    chip.style.marginTop = '0';
    chip.style.padding = '4px 8px';
    chip.innerHTML = `
      <span style="font-size: 11px; font-weight: bold; color: var(--accent-color);">🎙️ Voice Clip (${note.audioDuration || '0:05'})</span>
      <span class="reminder-chip-delete" id="delete-modal-audio" title="Delete voice clip" style="margin-left: 6px; font-size: 12px; cursor: pointer; opacity: 0.6;">✕</span>
    `;
    chip.querySelector('#delete-modal-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      note.audio = null;
      note.audioDuration = null;
      saveToLocalStorage();
      renderNotes();
      renderModalAudioPreview(note);
    });
    container.appendChild(chip);
  }
}

/* ==========================================================================
   Upgraded Interactive Checklist Editor logic
   ========================================================================== */
let checklistFocusIndex = null;
let checklistFocusIsNew = false;

function legacyRenderInteractiveChecklistEditor(container, rawText, onChange) {
  container.innerHTML = '';
  
  let lines = rawText.split('\n').map(line => line.trim());
  
  // Format any non-checklist lines to checklists
  let formatted = false;
  lines = lines.map(line => {
    if (!line.startsWith('- [ ] ') && !line.startsWith('- [x] ')) {
      formatted = true;
      return '- [ ] ' + line;
    }
    return line;
  });
  
  if (formatted) {
    onChange(lines.join('\n'));
  }

  const uncheckedContainer = document.createElement('div');
  uncheckedContainer.style.display = 'flex';
  uncheckedContainer.style.flexDirection = 'column';
  uncheckedContainer.style.gap = '6px';
  container.appendChild(uncheckedContainer);

  const checkedContainer = document.createElement('div');
  checkedContainer.className = 'completed-items-body';

  const uncheckedRowsCount = lines.filter(l => l.startsWith('- [ ] ')).length;
  const checkedRowsCount = lines.length - uncheckedRowsCount;

  lines.forEach((line, index) => {
    const isChecked = line.startsWith('- [x] ');
    const cleanText = line.substring(6);

    const row = document.createElement('div');
    row.className = 'checklist-editor-row';

    const checkbox = document.createElement('div');
    checkbox.className = `checklist-editor-checkbox ${isChecked ? 'checked' : ''}`;
    checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    
    checkbox.addEventListener('click', () => {
      const newPrefix = isChecked ? '- [ ] ' : '- [x] ';
      lines[index] = newPrefix + cleanText;
      checklistFocusIndex = index;
      onChange(lines.join('\n'));
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `checklist-editor-input ${isChecked ? 'checked' : ''}`;
    input.value = cleanText;
    input.placeholder = 'List item';

    // Handle cursor focus restore on re-render
    if (checklistFocusIndex === index) {
      setTimeout(() => {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
        checklistFocusIndex = null;
      }, 0);
    }

    input.addEventListener('input', () => {
      const prefix = isChecked ? '- [x] ' : '- [ ] ';
      lines[index] = prefix + input.value;
      onChange(lines.join('\n'), true); // Skip DOM re-render during typing to preserve input focus
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lines.splice(index + 1, 0, '- [ ] ');
        checklistFocusIndex = index + 1;
        onChange(lines.join('\n'));
      } else if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        lines.splice(index, 1);
        if (lines.length === 0) lines = ['- [ ] '];
        checklistFocusIndex = Math.max(0, index - 1);
        onChange(lines.join('\n'));
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'checklist-editor-delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      lines.splice(index, 1);
      if (lines.length === 0) lines = ['- [ ] '];
      checklistFocusIndex = Math.max(0, index - 1);
      onChange(lines.join('\n'));
    });

    row.appendChild(checkbox);
    row.appendChild(input);
    row.appendChild(deleteBtn);

    if (isChecked) {
      checkedContainer.appendChild(row);
    } else {
      uncheckedContainer.appendChild(row);
    }
  });

  // "Add item" placeholder row at the bottom of Unchecked items
  const addRow = document.createElement('div');
  addRow.className = 'checklist-editor-row';
  addRow.style.opacity = '0.65';

  const addPlus = document.createElement('div');
  addPlus.className = 'checklist-editor-checkbox';
  addPlus.style.borderStyle = 'dashed';
  addPlus.innerHTML = `<span style="font-size: 14px; font-weight: bold; color: var(--text-secondary);">+</span>`;

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'checklist-editor-input';
  addInput.placeholder = 'List item';

  if (checklistFocusIsNew) {
    setTimeout(() => {
      addInput.focus();
      checklistFocusIsNew = false;
    }, 0);
  }

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addInput.value.trim() !== '') {
      e.preventDefault();
      lines.push('- [ ] ' + addInput.value.trim());
      checklistFocusIsNew = true;
      onChange(lines.join('\n'));
    }
  });
  
  addInput.addEventListener('blur', () => {
    if (addInput.value.trim() !== '') {
      lines.push('- [ ] ' + addInput.value.trim());
      onChange(lines.join('\n'));
    }
  });

  addRow.appendChild(addPlus);
  addRow.appendChild(addInput);
  uncheckedContainer.appendChild(addRow);

  // Collapsible Checked Section
  if (checkedRowsCount > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRowsCount} completed item${checkedRowsCount > 1 ? 's' : ''}</span>
    `;

    header.addEventListener('click', () => {
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = checkedContainer.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });

    container.appendChild(header);
    container.appendChild(checkedContainer);
  }
}

function syncCreatorInputs() {
  const creatorText = document.getElementById('creator-text');
  const creatorChecklistEditor = document.getElementById('creator-checklist-editor');

  syncNoteTypeEditor({
    textareaEl: creatorText,
    checklistEditorEl: creatorChecklistEditor,
    rawText: creatorText.value,
    onChange: (newText, skipRedraw) => {
      creatorText.value = newText;
      if (!skipRedraw) {
        syncCreatorInputs();
      }
    }
  });
}

function syncModalInputs(note) {
  const modalText = document.getElementById('modal-text');
  const modalChecklistEditor = document.getElementById('modal-checklist-editor');

  syncNoteTypeEditor({
    textareaEl: modalText,
    checklistEditorEl: modalChecklistEditor,
    rawText: note.text,
    onChange: (newText, skipRedraw) => {
      note.text = newText;
      note.type = getNoteType(newText);
      modalText.value = newText;
      saveToLocalStorage();
      renderNotes();
      if (!skipRedraw) {
        syncModalInputs(note);
      }
    }
  });
}

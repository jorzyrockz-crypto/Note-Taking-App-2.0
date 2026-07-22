import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, deleteDoc, collection, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

let app, auth, db, storage;
export let isRealFirebase = false;

export const CONFIG_KEY = 'paperuss_firebase_config';
const OLD_CONFIG_KEY = 'atlasnest_firebase_config';
let savedConfig = null;

// 1. Try Environment Variables first (guarded for non-Vite environments)
const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const envConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID
};

if (envConfig.apiKey && envConfig.projectId) {
  savedConfig = envConfig;
} else {
  // 2. Fall back to LocalStorage
  try {
    if (typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(CONFIG_KEY);
      if (!stored) {
        stored = localStorage.getItem(OLD_CONFIG_KEY);
        if (stored) {
          localStorage.setItem(CONFIG_KEY, stored);
        }
      }
      if (stored) {
        savedConfig = JSON.parse(stored);
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved Firebase config:', e);
  }
}

if (savedConfig && savedConfig.apiKey && savedConfig.projectId) {
  try {
    app = initializeApp(savedConfig);
    auth = getAuth(app);
    
    // Check if IndexedDB is supported in the current environment (e.g. mobile PWAs / sandbox WebView)
    const isIndexedDBSupported = typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
    let firestoreConfig = {};
    if (isIndexedDBSupported) {
      try {
        firestoreConfig = {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        };
      } catch (cacheErr) {
        console.warn('Failed to configure Firestore local cache:', cacheErr);
      }
    }
    
    try {
      db = initializeFirestore(app, firestoreConfig);
    } catch (dbErr) {
      console.warn('initializeFirestore failed with config, trying default:', dbErr);
      try {
        db = initializeFirestore(app, {});
      } catch (alreadyInitErr) {
        // If already initialized, get the existing instance
        db = getFirestore(app);
      }
    }
    
    storage = getStorage(app);
    isRealFirebase = true;
    console.log('Firebase initialized successfully in Real Mode.');
  } catch (error) {
    console.error('Firebase initialization failed, falling back to Simulated Mode:', error);
  }
}

if (!isRealFirebase) {
  console.log('No valid Firebase configuration found. Running in Simulated Firebase Mode.');
}

// ─────────────────────────────────────────────────────────────
// Simulated/Mock Authentication and Database Logic
// ─────────────────────────────────────────────────────────────

const MOCK_USERS_KEY = 'paperuss_mock_users';
const MOCK_NOTES_PREFIX = 'paperuss_mock_notes_';
let mockCurrentUser = null;
let authCallbacks = [];

// Try to auto-restore mock session if page is reloaded
try {
  if (typeof localStorage !== 'undefined') {
    let activeSession = localStorage.getItem('paperuss_active_mock_session');
    if (!activeSession) {
      activeSession = localStorage.getItem('atlasnest_active_mock_session');
      if (activeSession) {
        localStorage.setItem('paperuss_active_mock_session', activeSession);
      }
    }
    if (activeSession) {
      mockCurrentUser = JSON.parse(activeSession);
    }
  }
} catch (e) {
  console.warn('Failed to restore active mock session:', e);
}

function getMockUsers() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_USERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveMockUsers(users) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

// ─────────────────────────────────────────────────────────────
// Authentication API
// ─────────────────────────────────────────────────────────────

export async function registerUser(email, password, displayName) {
  if (isRealFirebase) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      displayName: displayName || userCredential.user.displayName,
      photoURL: userCredential.user.photoURL,
      isReal: true
    };
  } else {
    const users = getMockUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('auth/email-already-in-use');
    }
    const newUser = {
      uid: 'mock-uid-' + Date.now(),
      email: email,
      password: password,
      displayName: displayName || email.split('@')[0],
      photoURL: null
    };
    users.push(newUser);
    saveMockUsers(users);
    
    mockCurrentUser = { uid: newUser.uid, email: newUser.email, displayName: newUser.displayName, photoURL: newUser.photoURL };
    localStorage.setItem('paperuss_active_mock_session', JSON.stringify(mockCurrentUser));
    triggerAuthCallbacks();
    return mockCurrentUser;
  }
}

export async function loginUser(email, password) {
  if (isRealFirebase) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      displayName: userCredential.user.displayName,
      photoURL: userCredential.user.photoURL,
      isReal: true
    };
  } else {
    const users = getMockUsers();
    const match = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!match) {
      throw new Error('auth/invalid-credential');
    }
    mockCurrentUser = { uid: match.uid, email: match.email, displayName: match.displayName, photoURL: match.photoURL };
    localStorage.setItem('paperuss_active_mock_session', JSON.stringify(mockCurrentUser));
    triggerAuthCallbacks();
    return mockCurrentUser;
  }
}

export async function logoutUser() {
  if (isRealFirebase) {
    await signOut(auth);
  } else {
    mockCurrentUser = null;
    localStorage.removeItem('paperuss_active_mock_session');
    triggerAuthCallbacks();
  }
}

export async function updateUserProfilePic(photoURL) {
  if (isRealFirebase) {
    if (auth.currentUser) {
      // Save Base64 profile pic directly in user's document in Firestore (Spark Plan friendly)
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userRef, { photoURL }, { merge: true });
      } catch (err) {
        console.warn('Failed to save profile picture to Firestore:', err);
      }
      
      return {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: auth.currentUser.displayName,
        photoURL: photoURL,
        isReal: true
      };
    }
  } else {
    if (mockCurrentUser) {
      mockCurrentUser.photoURL = photoURL;
      localStorage.setItem('paperuss_active_mock_session', JSON.stringify(mockCurrentUser));
      
      const users = getMockUsers();
      const match = users.find(u => u.uid === mockCurrentUser.uid);
      if (match) {
        match.photoURL = photoURL;
        saveMockUsers(users);
      }
      
      triggerAuthCallbacks();
      return mockCurrentUser;
    }
  }
  throw new Error('No user is currently signed in.');
}

export function onAuthChange(callback) {
  if (isRealFirebase) {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        let photoURL = user.photoURL;
        if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && userDoc.data().photoURL) {
              photoURL = userDoc.data().photoURL;
            }
          } catch (e) {
            console.warn('Failed to load profile picture from Firestore:', e);
          }
        }
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: photoURL,
          isReal: true
        });
      } else {
        callback(null);
      }
    });
  } else {
    authCallbacks.push(callback);
    callback(mockCurrentUser);
    return () => {
      authCallbacks = authCallbacks.filter(c => c !== callback);
    };
  }
}

function triggerAuthCallbacks() {
  authCallbacks.forEach(cb => cb(mockCurrentUser));
}

// ─────────────────────────────────────────────────────────────
// Cloud Notes Sync API
// ─────────────────────────────────────────────────────────────

export async function saveNoteToCloud(uid, note) {
  if (!note || !note.id) return;
  if (isRealFirebase) {
    const noteRef = doc(db, 'users', uid, 'notes', note.id);
    const payload = { ...note, serverUpdatedAt: serverTimestamp() };
    await setDoc(noteRef, payload, { merge: true });
  } else {
    const mockNotes = getMockCloudNotes(uid);
    const index = mockNotes.findIndex(n => n.id === note.id);
    const mockNote = { ...note, serverUpdatedAt: Date.now() };
    if (index >= 0) {
      mockNotes[index] = { ...mockNotes[index], ...mockNote };
    } else {
      mockNotes.push(mockNote);
    }
    saveMockCloudNotes(uid, mockNotes);
  }
}

export async function deleteNoteFromCloud(uid, noteId) {
  if (!noteId) return;
  if (isRealFirebase) {
    const noteRef = doc(db, 'users', uid, 'notes', noteId);
    await deleteDoc(noteRef);
  } else {
    let mockNotes = getMockCloudNotes(uid);
    mockNotes = mockNotes.filter(n => n.id !== noteId);
    saveMockCloudNotes(uid, mockNotes);
  }
}

export async function fetchNotesFromCloud(uid) {
  if (isRealFirebase) {
    const notesColl = collection(db, 'users', uid, 'notes');
    const snapshot = await getDocs(notesColl);
    const notesList = [];
    snapshot.forEach(docSnap => {
      notesList.push(docSnap.data());
    });
    return notesList;
  } else {
    return getMockCloudNotes(uid);
  }
}

function getMockCloudNotes(uid) {
  try {
    return JSON.parse(localStorage.getItem(MOCK_NOTES_PREFIX + uid)) || [];
  } catch (e) {
    return [];
  }
}

function saveMockCloudNotes(uid, notes) {
  localStorage.setItem(MOCK_NOTES_PREFIX + uid, JSON.stringify(notes));
}

// ─────────────────────────────────────────────────────────────
// Configuration Settings
// ─────────────────────────────────────────────────────────────

export function getFirebaseConfig() {
  return savedConfig;
}

export function saveFirebaseConfig(config) {
  if (config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(CONFIG_KEY);
  }
}

// ─────────────────────────────────────────────────────────────
// Cloud Storage API
// ─────────────────────────────────────────────────────────────

export async function uploadFileToCloud(uid, fileId, blob, type = '') {
  if (isRealFirebase) {
    const fileRef = ref(storage, `users/${uid}/attachments/${fileId}`);
    await uploadBytes(fileRef, blob, { contentType: type || blob.type });
    return await getDownloadURL(fileRef);
  } else {
    return 'simulated-db-url-' + fileId;
  }
}

export async function deleteFileFromCloud(uid, fileId) {
  if (isRealFirebase) {
    try {
      const fileRef = ref(storage, `users/${uid}/attachments/${fileId}`);
      await deleteObject(fileRef);
    } catch (e) {
      console.warn('Failed to delete file from Firebase Storage:', fileId, e);
    }
  }
}

export function subscribeToCloudNotes(uid, callback) {
  if (isRealFirebase) {
    const notesColl = collection(db, 'users', uid, 'notes');
    return onSnapshot(notesColl, (snapshot) => {
      const notesList = [];
      snapshot.forEach(docSnap => {
        notesList.push(docSnap.data());
      });
      callback(notesList);
    }, (error) => {
      console.error('Real-time sync listener failed:', error);
    });
  } else {
    setTimeout(() => {
      callback(getMockCloudNotes(uid));
    }, 0);
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────
// Deletion Tombstones
// A note deleted on one device must be recognized as deleted by
// every other device — not just the one that deleted it. Without
// this, a device that still has the note cached locally will see
// it "missing" from the cloud, assume it's an unsynced local note,
// and re-upload it (resurrecting a deleted note).
// ─────────────────────────────────────────────────────────────

const MOCK_TOMBSTONES_PREFIX = 'paperuss_mock_tombstones_';

function getMockTombstoneIds(uid) {
  try {
    return JSON.parse(localStorage.getItem(MOCK_TOMBSTONES_PREFIX + uid)) || [];
  } catch (e) {
    return [];
  }
}

function saveMockTombstoneIds(uid, ids) {
  localStorage.setItem(MOCK_TOMBSTONES_PREFIX + uid, JSON.stringify(ids));
}

export async function saveDeletedNoteTombstone(uid, noteId) {
  if (!uid || !noteId) return;
  if (isRealFirebase) {
    const tombstoneRef = doc(db, 'users', uid, 'deletedNotes', noteId);
    await setDoc(tombstoneRef, { deletedAt: Date.now() });
  } else {
    const ids = getMockTombstoneIds(uid);
    if (!ids.includes(noteId)) {
      ids.push(noteId);
      saveMockTombstoneIds(uid, ids);
    }
  }
}

export function subscribeToDeletedNoteTombstones(uid, callback) {
  if (isRealFirebase) {
    const tombstonesColl = collection(db, 'users', uid, 'deletedNotes');
    return onSnapshot(tombstonesColl, (snapshot) => {
      const ids = [];
      snapshot.forEach(docSnap => ids.push(docSnap.id));
      callback(ids);
    }, (error) => {
      console.error('Deletion tombstone sync listener failed:', error);
    });
  } else {
    setTimeout(() => {
      callback(getMockTombstoneIds(uid));
    }, 0);
    return () => {};
  }
}

export function subscribeToVersionUpdates(callback) {
  if (isRealFirebase) {
    try {
      const configDoc = doc(db, 'system', 'config');
      return onSnapshot(configDoc, (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
        } else {
          callback(null);
        }
      }, (error) => {
        console.warn('Failed to listen to repo version updates:', error);
        callback(null);
      });
    } catch (e) {
      console.warn('Failed to initialize version update subscription:', e);
      callback(null);
      return () => {};
    }
  } else {
    setTimeout(() => {
      callback({
        version: '2.8.3',
        changelog: [
          'View Toggle Architecture Refactor (v2.8.3): Separated desktop and mobile view toggling into dedicated handlers (toggleViewLayout, toggleViewLayoutMobile, and smart router toggleViewLayoutAuto) with haptic feedback and eliminated duplicate function declarations',
          'Vercel & SW Reliability Hotfix (v2.8.2): Removed unsupported Service Worker fetch cache mode options, added resilient offline fallbacks, and resolved Vercel build compatibility',
          'Guaranteed PWA Cache Buster & Network-First Sync (v2.8.1): Implemented Network-First service worker fetch strategy for app scripts and enabled 1-tap cache purge force update button',
          'Phone Experience Enhancement (v2.8.0): Anchored User Profile avatar in top mobile header, introduced experimental 2-Column Compact Grid View for smaller note cards (inspired by Spotify Browse All cards), and enabled 1-tap view switching',
          'Mobile Ergonomics & UI Polish (v2.7.3): Added high-density compact mobile spacing across note cards, creator, and workspace; scaled Edit Modal title font size to prevent word splitting; automatically concealed bottom navigation dock during note editing; fixed filter bar left padding; and cleared toast notifications below the app header',
          'Settings Panel Mobile Overflow Fix (v2.7.2): Resolved mobile viewport overflow across all settings tabs by converting two-column layouts to fluid single-column cards, wrapping segmented controls & color swatches, stacking time pickers, and enabling touch horizontal tab scrolling',
          'Universal Multi-Page Mobile Responsiveness (v2.7.1): Ensured full mobile viewport adaptation across every page (Search, Productivity, Settings, Recipe Importer, and Modals) with responsive bottom dock page sync, horizontal scrollable tab bars, and 100vw touch safe-area layouts',
          'Enhanced Phone Experience (v2.7.0): Introduced glassmorphic Mobile Bottom Dock navigation, Mobile Quick Creator Bottom Sheet, interactive touch card swipe gestures (pin/archive/delete), pull-to-refresh sync, visual viewport keyboard elevation handling, and haptic feedback',
          'Rectangular Checklist Cards & High-Contrast Elevation (v2.6.20): Introduced rectangular checklist cards matching photo grid aspect ratios with top glowing progress bars and completion statistics, and updated card container styling across Files, Voice Memos, Links, and Checklists with crisp solid backgrounds and elevated borders to prevent blending into light themes',
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
          'Added "Auto" tint color option which automatically selects an appropriate workspace accent color matching your background (works for custom uploads too)',
          'Accent color now syncs with the Windows title bar and Android status bar for installed PWAs',
          'Fixed productivity page panels being transparent in light mode',
          'Fixed mobile portrait UI layout issues with workspace tint overlay breaking the sidebar and header z-index stack',
          'Improved mobile portrait note sizing by allowing auto-height and min-height expansion for list view',
          'Fixed bug where custom note background images were visually overridden by glassmorphism repeating pattern styles',
          'Service worker update checking & prompt during splash screen loading and active background usage',
          'Instant dark/light theme detection on splash screen loading (preventing white flashing)',
          'Workspace background image fitting settings (Fill, Fit, Stretch, Tile, Center) in Appearance settings',
          'Note background image upload button styled as a native card in the theme slider picker',
          'Productivity page hero banner horizontal gradient adapting to the active workspace theme background',
          'Productivity page todo widget surfacing individual unchecked checklist items across notes',
          'Fixed raw HTML tag leak in productivity preview cards (agenda lines & todo list) by parsing rich text content',
          'Optimized mobile responsiveness: horizontally scrollable markdown toolbars, grid-aligned productivity stats, and touch swipe gestures to toggle the sidebar drawer',
          'Dynamic Workspace Tint System: accent color now generates a subtle wallpaper tint overlay, glass surface tints, ambient glow blobs, and accent-driven focus rings across the entire workspace',
          'Fixed custom app background image fitting (sizing, repetition, positioning) and resolved issue where note custom theme background uploads were visually overridden by glassmorphism overrides'
        ]
      });
    }, 0);
    return () => {};
  }
}

export async function saveSettingsToCloud(uid, data) {
  if (isRealFirebase) {
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      await setDoc(docRef, data);
    } catch (e) {
      console.warn('Failed to save settings to cloud:', e);
      throw e;
    }
  } else {
    localStorage.setItem(`paperuss_mock_settings_${uid}`, JSON.stringify(data));
  }
}

export async function fetchSettingsFromCloud(uid) {
  if (isRealFirebase) {
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (e) {
      console.warn('Failed to fetch settings from cloud:', e);
      return null;
    }
  } else {
    try {
      let raw = localStorage.getItem(`paperuss_mock_settings_${uid}`);
      if (!raw) {
        raw = localStorage.getItem(`atlasnest_mock_settings_${uid}`);
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
}

export function subscribeToSettings(uid, callback) {
  if (isRealFirebase) {
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
        } else {
          callback(null);
        }
      }, (error) => {
        console.warn('Real-time settings sync listener failed:', error);
      });
    } catch (e) {
      console.warn('Failed to initialize settings subscription:', e);
      callback(null);
      return () => {};
    }
  } else {
    const handleStorageChange = (e) => {
      if (e.key === `paperuss_mock_settings_${uid}` || e.key === `atlasnest_mock_settings_${uid}`) {
        try {
          const raw = localStorage.getItem(e.key);
          callback(raw ? JSON.parse(raw) : null);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    setTimeout(() => {
      try {
        const raw = localStorage.getItem(`paperuss_mock_settings_${uid}`) || localStorage.getItem(`atlasnest_mock_settings_${uid}`);
        callback(raw ? JSON.parse(raw) : null);
      } catch (err) {
        callback(null);
      }
    }, 0);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }
}

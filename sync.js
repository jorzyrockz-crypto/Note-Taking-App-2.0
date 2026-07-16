import {
  normalizeNoteAppearance,
  getVisualNoteType,
  inferDefaultFolder,
  STORAGE_KEYS
} from './app.js';

import {
  normalizeNoteType,
  getNoteType
} from './note-types/index.js';

import {
  saveNoteToCloud,
  deleteNoteFromCloud,
  subscribeToCloudNotes,
  subscribeToDeletedNoteTombstones,
  saveDeletedNoteTombstone
} from './firebase.js';

// Configuration injected at runtime to break circular dependencies
let config = {
  getCurrentUser: () => null,
  getNotes: () => [],
  setNotes: () => {},
  getCustomFolders: () => [],
  getAppSettings: () => ({}),
  getRecentlyDeletedNoteIds: () => new Set(),
  getPermanentlyDeletedNoteIds: () => new Set(),
  getIsBulkActive: () => false,
  onSyncComplete: () => {},
  showToast: () => {}
};

// Internal cloud cache
const _lastSyncedCloudNotes = new Map();

// Service Worker listener handle
export let cloudNotesUnsubscribe = null;
export let deletedTombstonesUnsubscribe = null;

export function initSync(injectedConfig) {
  config = { ...config, ...injectedConfig };
}

// ==========================================================================
// Sync Timestamps and Equality Helpers
// ==========================================================================

export function getNoteSyncTimestamp(note) {
  let serverMs = 0;
  if (note?.serverUpdatedAt) {
    if (typeof note.serverUpdatedAt.toMillis === 'function') {
      serverMs = note.serverUpdatedAt.toMillis();
    } else if (typeof note.serverUpdatedAt === 'number') {
      serverMs = note.serverUpdatedAt;
    } else if (note.serverUpdatedAt.seconds !== undefined) {
      serverMs = note.serverUpdatedAt.seconds * 1000 + Math.floor((note.serverUpdatedAt.nanoseconds || 0) / 1000000);
    }
  }

  return Math.max(
    serverMs,
    Number(note?.updatedAt) || 0,
    Number(note?.deletedAt) || 0,
    Number(note?.archivedAt) || 0,
    Number(note?.createdAt) || 0
  );
}

export function isFieldEqual(val1, val2, fieldName) {
  const normalize = (v) => {
    if (v === undefined || v === null || v === "") return null;
    if (Array.isArray(v) && v.length === 0) return null;
    if (typeof v === 'object' && v !== null && Object.keys(v).length === 0) return null;
    return v;
  };
  
  const n1 = normalize(val1);
  const n2 = normalize(val2);
  
  if (n1 === n2) return true;
  if (n1 === null || n2 === null) return false;

  // Custom reminder comparison
  if (fieldName === 'reminder') {
    const d1 = new Date(n1).getTime();
    const d2 = new Date(n2).getTime();
    if (Number.isNaN(d1) || Number.isNaN(d2)) return n1 === n2;
    return d1 === d2;
  }

  // Custom folders comparison (order-insensitive)
  if (fieldName === 'folders') {
    const arr1 = Array.isArray(n1) ? n1 : [n1];
    const arr2 = Array.isArray(n2) ? n2 : [n2];
    if (arr1.length !== arr2.length) return false;
    const set1 = new Set(arr1);
    return arr2.every(item => set1.has(item));
  }

  // Custom files comparison (ignore local IndexedDB flags)
  if (fieldName === 'files') {
    const arr1 = Array.isArray(n1) ? n1 : [];
    const arr2 = Array.isArray(n2) ? n2 : [];
    if (arr1.length !== arr2.length) return false;
    const map1 = new Map(arr1.map(f => [f.id, f.cloudUrl || null]));
    return arr2.every(f => map1.has(f.id) && map1.get(f.id) === (f.cloudUrl || null));
  }
  
  if (typeof n1 === 'object' && typeof n2 === 'object') {
    return JSON.stringify(n1) === JSON.stringify(n2);
  }
  
  return false;
}

export function areNotesEqual(n1, n2) {
  if (!n1 || !n2) return false;
  const fields = [
    'title', 'text', 'color', 'theme', 'customTheme', 'pinned', 'archived', 'deleted',
    'folders', 'isRichText', 'editorMode', 'audio', 'audioDuration', 'files',
    'reminder', 'recipeData', 'drawingData', 'favorite', 'locked', 'image'
  ];
  return fields.every(field => isFieldEqual(n1[field], n2[field], field));
}

export function mergeNoteThreeWay(localNote, cloudNote, lastSyncedNote) {
  if (!lastSyncedNote) {
    const localTimestamp = getNoteSyncTimestamp(localNote);
    const cloudTimestamp = getNoteSyncTimestamp(cloudNote);
    return localTimestamp >= cloudTimestamp ? localNote : cloudNote;
  }

  const mergedNote = { ...localNote };
  const fields = [
    'title', 'text', 'color', 'theme', 'customTheme', 'pinned', 'archived', 'deleted',
    'folders', 'isRichText', 'editorMode', 'audio', 'audioDuration', 'files',
    'reminder', 'recipeData', 'drawingData', 'favorite', 'locked', 'image'
  ];

  fields.forEach(field => {
    const localVal = localNote[field];
    const cloudVal = cloudNote[field];
    const lastVal = lastSyncedNote[field];

    const localChanged = !isFieldEqual(localVal, lastVal, field);
    const cloudChanged = !isFieldEqual(cloudVal, lastVal, field);

    if (localChanged && cloudChanged) {
      const localTimestamp = getNoteSyncTimestamp(localNote);
      const cloudTimestamp = getNoteSyncTimestamp(cloudNote);
      if (cloudTimestamp > localTimestamp) {
        mergedNote[field] = cloudVal;
      }
    } else if (cloudChanged) {
      mergedNote[field] = cloudVal;
    }
  });

  mergedNote.updatedAt = Math.max(Number(localNote.updatedAt) || 0, Number(cloudNote.updatedAt) || 0);
  if (cloudNote.serverUpdatedAt) {
    mergedNote.serverUpdatedAt = cloudNote.serverUpdatedAt;
  }

  return mergedNote;
}

// ==========================================================================
// Offline Queues and Storage
// ==========================================================================

export function getPermanentlyDeletedNoteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.permanentlyDeletedNotes);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    console.warn('Unable to read permanently deleted note IDs:', error);
    return new Set();
  }
}

export function savePermanentlyDeletedNoteIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEYS.permanentlyDeletedNotes, JSON.stringify(Array.from(ids)));
  } catch (error) {
    console.warn('Unable to save permanently deleted note IDs:', error);
  }
}

export function rememberPermanentlyDeletedNoteIds(noteIds = []) {
  const ids = getPermanentlyDeletedNoteIds();
  const recentlyDeleted = config.getRecentlyDeletedNoteIds();
  noteIds.filter(Boolean).forEach(id => {
    recentlyDeleted.add(id);
    ids.add(id);
  });
  savePermanentlyDeletedNoteIds(ids);
}

export function prunePermanentlyDeletedNoteIds(cloudIds = new Set()) {
  const ids = getPermanentlyDeletedNoteIds();
  let changed = false;
  for (const deletedId of ids) {
    if (!cloudIds.has(deletedId)) {
      ids.delete(deletedId);
      changed = true;
    }
  }
  if (changed) {
    savePermanentlyDeletedNoteIds(ids);
  }
}

function getPendingSyncQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pendingSyncQueue);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && item.noteId && item.operation) : [];
  } catch (error) {
    console.warn('Unable to read pending sync queue:', error);
    return [];
  }
}

function savePendingSyncQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEYS.pendingSyncQueue, JSON.stringify(queue));
  } catch (error) {
    console.warn('Unable to save pending sync queue:', error);
  }
}

function upsertPendingSyncOperation(operation, note) {
  const currentUser = config.getCurrentUser();
  if (!currentUser) return;
  const queue = getPendingSyncQueue();
  const index = queue.findIndex(item => item.uid === currentUser.uid && item.noteId === note.id && item.operation === operation);

  const operationData = {
    uid: currentUser.uid,
    noteId: note.id,
    operation,
    timestamp: Date.now(),
    note: operation === 'delete' ? null : normalizeNoteType({ ...note })
  };

  if (index >= 0) {
    queue[index] = operationData;
  } else {
    queue.push(operationData);
  }

  savePendingSyncQueue(queue);
}

function removePendingSyncOperation(uid, noteId, operation = null) {
  let queue = getPendingSyncQueue();
  queue = queue.filter(item => {
    if (item.uid !== uid || item.noteId !== noteId) return true;
    return operation ? item.operation !== operation : false;
  });
  savePendingSyncQueue(queue);
}

export async function processPendingSyncQueue(uid = config.getCurrentUser()?.uid) {
  if (!uid || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;

  const queue = getPendingSyncQueue();
  const remaining = [];

  for (const item of queue) {
    if (item.uid !== uid) {
      remaining.push(item);
      continue;
    }

    try {
      if (item.operation === 'delete') {
        await deleteNoteFromCloud(uid, item.noteId);
      } else if (item.operation === 'upsert' && item.note) {
        await saveNoteToCloud(uid, item.note);
      }
    } catch (err) {
      console.warn('Pending sync operation failed; keeping queued:', item, err);
      remaining.push(item);
    }
  }

  savePendingSyncQueue(remaining);
}

// ==========================================================================
// Local Storage Operations
// ==========================================================================

export function saveNotesLocalOnly() {
  const notes = config.getNotes();
  const customFolders = config.getCustomFolders();
  notes.forEach((note, index) => {
    setNoteFolders(note, getNoteFolders(note, inferDefaultFolder(note, index)));
  });
  localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(customFolders));
}

let _saveTimer;
export function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveToLocalStorage, 400);
}

export function saveToLocalStorage() {
  try {
    const notes = config.getNotes();
    const currentUser = config.getCurrentUser();
    const customFolders = config.getCustomFolders();

    notes.sort((a, b) => getNoteSyncTimestamp(b) - getNoteSyncTimestamp(a));
    notes.forEach((note, index) => {
      setNoteFolders(note, getNoteFolders(note, inferDefaultFolder(note, index)));
    });
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(customFolders));

    if (currentUser) {
      notes.forEach(note => {
        const currentTs = getNoteSyncTimestamp(note);
        const lastTs = getNoteSyncTimestamp(_lastSyncedCloudNotes.get(note.id));
        if (currentTs > lastTs) {
          syncNoteToCloudWithQueue(note);
        }
      });
    }

    return true;
  } catch (error) {
    console.warn('Unable to save notes to localStorage:', error);
    return false;
  }
}

// ==========================================================================
// Cloud Sync Integration
// ==========================================================================

export async function syncNoteToCloudWithQueue(note) {
  const currentUser = config.getCurrentUser();
  if (!currentUser || !note?.id) return;

  const lastCloudNote = _lastSyncedCloudNotes.get(note.id);
  let diff;
  if (!lastCloudNote) {
    diff = { ...note };
  } else {
    diff = {};
    let hasChanged = false;
    const fieldsToDiff = [
      'title', 'text', 'color', 'theme', 'customTheme', 'pinned', 'archived', 'deleted',
      'folders', 'isRichText', 'editorMode', 'audio', 'audioDuration', 'files',
      'reminder', 'recipeData', 'drawingData', 'favorite', 'locked', 'image'
    ];
    fieldsToDiff.forEach(field => {
      if (!isFieldEqual(note[field], lastCloudNote[field], field)) {
        diff[field] = note[field];
        hasChanged = true;
      }
    });
    if (hasChanged) {
      diff.id = note.id;
      diff.updatedAt = note.updatedAt;
      if (note.serverUpdatedAt !== undefined) {
        diff.serverUpdatedAt = note.serverUpdatedAt;
      }
    } else {
      diff = null;
    }
  }

  if (!diff) return;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    upsertPendingSyncOperation('upsert', note);
    return;
  }

  try {
    await saveNoteToCloud(currentUser.uid, diff);
    if (lastCloudNote) {
      Object.assign(lastCloudNote, JSON.parse(JSON.stringify(diff)));
    } else {
      _lastSyncedCloudNotes.set(note.id, JSON.parse(JSON.stringify(note)));
    }
    removePendingSyncOperation(currentUser.uid, note.id, 'upsert');
  } catch (err) {
    upsertPendingSyncOperation('upsert', note);
    console.warn('Failed to sync note to cloud; queued for retry:', err);
  }
}

export async function deleteNoteFromCloudWithQueue(noteId, snapshot = null) {
  const currentUser = config.getCurrentUser();
  if (!currentUser || !noteId) return;
  const noteForQueue = snapshot || { id: noteId, updatedAt: Date.now() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    upsertPendingSyncOperation('delete', noteForQueue);
    return;
  }

  try {
    await deleteNoteFromCloud(currentUser.uid, noteId);
    removePendingSyncOperation(currentUser.uid, noteId);
  } catch (err) {
    upsertPendingSyncOperation('delete', noteForQueue);
    console.warn('Failed to delete note from cloud; queued for retry:', err);
  }
}

export function mergeCloudNotesWithLocal(cloudNotes = []) {
  const currentUser = config.getCurrentUser();
  let localNotes = config.getNotes();
  const recentlyDeletedNoteIds = config.getRecentlyDeletedNoteIds();

  if (currentUser) {
    cloudNotes = cloudNotes.filter(n => !n.id.startsWith('starter-'));
  }
  const mergedById = new Map();
  const dirtyLocalNotes = [];
  const normalizedCloudNotes = cloudNotes.map(normalizeNoteType);

  const permanentlyDeletedNoteIds = getPermanentlyDeletedNoteIds();

  normalizedCloudNotes.forEach((cloudNote, index) => {
    if (recentlyDeletedNoteIds.has(cloudNote.id) || permanentlyDeletedNoteIds.has(cloudNote.id)) {
      if (currentUser && permanentlyDeletedNoteIds.has(cloudNote.id)) {
        deleteNoteFromCloudWithQueue(cloudNote.id, cloudNote);
      }
      return;
    }
    const normalized = normalizeNoteAppearance(cloudNote);
    _lastSyncedCloudNotes.set(normalized.id, JSON.parse(JSON.stringify(normalized)));
    setNoteFolders(normalized, getNoteFolders(normalized, inferDefaultFolder(normalized, index)));
    mergedById.set(normalized.id, normalized);
  });

  localNotes.map(normalizeNoteType).forEach((localNote, index) => {
    const normalized = normalizeNoteAppearance(localNote);
    setNoteFolders(normalized, getNoteFolders(normalized, inferDefaultFolder(normalized, index)));
    const cloudNote = mergedById.get(normalized.id);

    if (cloudNote) {
      const lastSynced = _lastSyncedCloudNotes.get(normalized.id);
      const merged = mergeNoteThreeWay(normalized, cloudNote, lastSynced);
      mergedById.set(normalized.id, merged);
      
      if (!areNotesEqual(merged, cloudNote)) {
        dirtyLocalNotes.push(merged);
      }
    } else {
      if (currentUser && normalized.id.startsWith('starter-')) {
        return;
      }
      const isStarter = normalized.id && normalized.id.startsWith('starter-');
      const isExistingUser = currentUser && sessionStorage.getItem('paperuss_just_registered') !== 'true';
      if (isStarter && isExistingUser && !cloudNote) {
        return;
      }

      mergedById.set(normalized.id, normalized);
      dirtyLocalNotes.push(normalized);
    }
  });

  const appSettings = config.getAppSettings();
  if (currentUser && !appSettings.welcomeNoteDismissed) {
    const hasWelcomeNote = mergedById.has('user-welcome-changelog');
    if (!hasWelcomeNote) {
      const welcomeNote = {
        id: 'user-welcome-changelog',
        title: '🚀 Welcome to Paperuss v2.2.1',
        text: '<h3>Welcome to Paperuss v2.2.1! 🚀</h3><p>Paperuss is updated with the latest fixes and improvements. Here\'s what\'s new in this release:</p><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Implemented Delta Syncing to prevent devices from overwriting each other\'s checklist states</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Fixed checklist persistence and event binding issues on note reload</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Synchronized category choices inside the Properties drawer</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Added Tab key text indentation support for all editors</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Added dynamic saving color indicator (red: saving, green: saved)</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Fixed sidebar and header overlay transparent layout bugs on mobile/portrait viewports</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><div class="checklist-item"><div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></div><input type="checkbox" checked="checked"><span contenteditable="true">Automatically reset pinned status when trashing or archiving notes</span><button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div><p>Once you dismiss/delete this note from trash, it won\'t appear again on future logins.</p>',
        color: 'default',
        theme: 'celebration',
        pinned: true,
        archived: false,
        deleted: false,
        isRichText: true,
        editorMode: 'glass',
        image: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      mergedById.set(welcomeNote.id, welcomeNote);
      dirtyLocalNotes.push(welcomeNote);
    }
  }

  const sortedNotes = Array.from(mergedById.values()).sort((a, b) => getNoteSyncTimestamp(b) - getNoteSyncTimestamp(a));
  config.setNotes(sortedNotes);
  
  // Re-read mutated notes array
  localNotes = config.getNotes();
  localNotes.forEach(registerNoteFoldersInternal);
  saveNotesLocalOnly();

  const cloudIds = new Set(cloudNotes.map(n => n.id));
  for (const deletedId of recentlyDeletedNoteIds) {
    if (!cloudIds.has(deletedId)) {
      recentlyDeletedNoteIds.delete(deletedId);
    }
  }
  prunePermanentlyDeletedNoteIds(cloudIds);

  return dirtyLocalNotes;
}

function registerNoteFoldersInternal(note) {
  // folders list registration done internally
  if (note.folders) {
    note.folders.forEach(folder => {
      if (folder && !config.getCustomFolders().some(f => f.name === folder)) {
        config.getCustomFolders().push({ name: folder, icon: 'folder', accent: '#5f6368' });
      }
    });
  }
}

export function pushDirtyLocalNotesToCloud(uid, dirtyLocalNotes = []) {
  dirtyLocalNotes.forEach(note => {
    syncNoteToCloudWithQueue(note);
    // syncLocalFilesToCloud will be run in caller or via injection
  });
}

export function clearSyncCache() {
  _lastSyncedCloudNotes.clear();
}

export function stopCloudSync() {
  if (cloudNotesUnsubscribe) {
    try {
      cloudNotesUnsubscribe();
    } catch (e) {}
    cloudNotesUnsubscribe = null;
  }
  if (deletedTombstonesUnsubscribe) {
    try {
      deletedTombstonesUnsubscribe();
    } catch (e) {}
    deletedTombstonesUnsubscribe = null;
  }
}

export function initCloudNotesSync(user) {
  if (!user) return;

  // Clean up any existing real-time subscription
  if (cloudNotesUnsubscribe) {
    try {
      cloudNotesUnsubscribe();
    } catch (e) {}
    cloudNotesUnsubscribe = null;
  }
  if (deletedTombstonesUnsubscribe) {
    try {
      deletedTombstonesUnsubscribe();
    } catch (e) {}
    deletedTombstonesUnsubscribe = null;
  }

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    console.log('Offline — skipping cloud notes subscription.');
    return;
  }

  // Subscribe to real-time cloud updates
  try {
    cloudNotesUnsubscribe = subscribeToCloudNotes(user.uid, (cloudNotes) => {
      if (config.getIsBulkActive()) return;

      const dirtyLocalNotes = mergeCloudNotesWithLocal(cloudNotes);
      pushDirtyLocalNotesToCloud(user.uid, dirtyLocalNotes);
      config.onSyncComplete();
    });
  } catch (err) {
    console.warn('Failed to initialize real-time sync:', err);
    config.showToast({ title: 'Sync Error', text: 'Could not connect to real-time sync. Using offline copy.' });
  }

  // Subscribe to deletion tombstones from other devices
  try {
    deletedTombstonesUnsubscribe = subscribeToDeletedNoteTombstones(user.uid, (tombstoneIds) => {
      if (!tombstoneIds || tombstoneIds.length === 0) return;
      const existingIds = getPermanentlyDeletedNoteIds();
      let addedNew = false;
      tombstoneIds.forEach(id => {
        if (!existingIds.has(id)) {
          existingIds.add(id);
          addedNew = true;
        }
        config.getRecentlyDeletedNoteIds().add(id);
      });
      if (addedNew) {
        savePermanentlyDeletedNoteIds(existingIds);
      }

      const beforeCount = config.getNotes().length;
      const filtered = config.getNotes().filter(n => !tombstoneIds.includes(n.id));
      if (filtered.length !== beforeCount) {
        config.setNotes(filtered);
        saveNotesLocalOnly();
        config.onSyncComplete();
      }
    });
  } catch (err) {
    console.warn('Failed to initialize deletion tombstone sync:', err);
  }
}

// Helpers for folder structures
function getNoteFolders(note, defaultFolder = 'Inbox') {
  if (note.folders && note.folders.length > 0) {
    return note.folders;
  }
  return [note.folder || defaultFolder];
}

function setNoteFolders(note, foldersList) {
  note.folders = foldersList;
  if (foldersList && foldersList.length > 0) {
    note.folder = foldersList[0];
  } else {
    note.folder = 'Inbox';
  }
  return note;
}

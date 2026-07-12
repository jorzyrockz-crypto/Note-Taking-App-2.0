import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let app, auth, db;
export let isRealFirebase = false;

// Load config from LocalStorage or Environment Variables
export const CONFIG_KEY = 'atlasnest_firebase_config';
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
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      savedConfig = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to parse saved Firebase config:', e);
  }
}

if (savedConfig && savedConfig.apiKey && savedConfig.projectId) {
  try {
    app = initializeApp(savedConfig);
    auth = getAuth(app);
    db = getFirestore(app);
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

const MOCK_USERS_KEY = 'atlasnest_mock_users';
const MOCK_NOTES_PREFIX = 'atlasnest_mock_notes_';
let mockCurrentUser = null;
let authCallbacks = [];

// Try to auto-restore mock session if page is reloaded
try {
  const activeSession = localStorage.getItem('atlasnest_active_mock_session');
  if (activeSession) {
    mockCurrentUser = JSON.parse(activeSession);
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
      displayName: displayName || email.split('@')[0]
    };
    users.push(newUser);
    saveMockUsers(users);
    
    mockCurrentUser = { uid: newUser.uid, email: newUser.email, displayName: newUser.displayName };
    localStorage.setItem('atlasnest_active_mock_session', JSON.stringify(mockCurrentUser));
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
      isReal: true
    };
  } else {
    const users = getMockUsers();
    const match = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!match) {
      throw new Error('auth/invalid-credential');
    }
    mockCurrentUser = { uid: match.uid, email: match.email, displayName: match.displayName };
    localStorage.setItem('atlasnest_active_mock_session', JSON.stringify(mockCurrentUser));
    triggerAuthCallbacks();
    return mockCurrentUser;
  }
}

export async function logoutUser() {
  if (isRealFirebase) {
    await signOut(auth);
  } else {
    mockCurrentUser = null;
    localStorage.removeItem('atlasnest_active_mock_session');
    triggerAuthCallbacks();
  }
}

export function onAuthChange(callback) {
  if (isRealFirebase) {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          isReal: true
        });
      } else {
        callback(null);
      }
    });
  } else {
    authCallbacks.push(callback);
    // Trigger immediately with current state
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
    await setDoc(noteRef, note, { merge: true });
  } else {
    const mockNotes = getMockCloudNotes(uid);
    const index = mockNotes.findIndex(n => n.id === note.id);
    if (index >= 0) {
      mockNotes[index] = { ...note };
    } else {
      mockNotes.push({ ...note });
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

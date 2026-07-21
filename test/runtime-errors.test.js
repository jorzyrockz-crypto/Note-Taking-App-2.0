import test from 'node:test';
import assert from 'node:assert/strict';

// Set minimal browser globals for headless Node environment testing
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

import { syncNoteToCloudWithQueue, saveSingleNoteToLocalStorage } from '../sync.js';
import { getRecipeImporterUnavailableMessage } from '../recipe.js';
import { parseMarkdown } from '../note-types/shared.js';

test('syncNoteToCloudWithQueue is exported as an async function', () => {
  assert.equal(typeof syncNoteToCloudWithQueue, 'function');
});

test('getRecipeImporterUnavailableMessage is exported and returns fallback message', () => {
  assert.equal(typeof getRecipeImporterUnavailableMessage, 'function');
  const msg = getRecipeImporterUnavailableMessage();
  assert.equal(typeof msg, 'string');
  assert.ok(msg.length > 0);
});

test('parseMarkdown is exported and parses text markdown correctly', () => {
  assert.equal(typeof parseMarkdown, 'function');
  const html = parseMarkdown('**Bold**');
  assert.equal(typeof html, 'string');
  assert.ok(html.includes('strong') || html.includes('Bold'));
});

test('saveSingleNoteToLocalStorage is callable without ReferenceError', () => {
  assert.equal(typeof saveSingleNoteToLocalStorage, 'function');
});

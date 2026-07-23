import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM & Storage mocks for headless testing
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

import { buildNoteMediaDeck, getVisualNoteType, NOTE_TYPE_REGISTRY } from '../app.js';
import { isChecklistFormat } from '../note-types/shared.js';

test('NOTE_TYPE_REGISTRY defines all 8 canonical note types with Lucide icons', () => {
  assert.ok(Array.isArray(NOTE_TYPE_REGISTRY));
  assert.equal(NOTE_TYPE_REGISTRY.length, 8);
  const ids = NOTE_TYPE_REGISTRY.map(t => t.id);
  assert.deepEqual(ids, ['all', 'text', 'checklist', 'voice', 'link', 'recipe', 'visual', 'file']);
});

test('getVisualNoteType classifies plain text notes as text', () => {
  const note = { id: '1', title: 'Hello', text: 'Just a plain note' };
  assert.equal(getVisualNoteType(note), 'text');
});

test('getVisualNoteType classifies checklist notes and markdown checklists', () => {
  const note1 = { id: '2', type: 'checklist', text: '' };
  const note2 = { id: '3', text: '- [ ] Buy milk' };
  const note3 = { id: '3b', text: '  * [X] Finished task' };
  assert.equal(getVisualNoteType(note1), 'checklist');
  assert.equal(getVisualNoteType(note2), 'checklist');
  assert.equal(getVisualNoteType(note3), 'checklist');
  assert.equal(isChecklistFormat(note3.text), true);
});

test('getVisualNoteType classifies audio and voice clips correctly', () => {
  const note1 = { id: '4', type: 'audio', text: '' };
  const note2 = { id: '5', audioClips: [{ id: 'a1', data: 'data:audio/webm;base64,...' }] };
  assert.equal(getVisualNoteType(note1), 'voice');
  assert.equal(getVisualNoteType(note2), 'voice');
});

test('getVisualNoteType classifies links and bookmarks correctly', () => {
  const note1 = { id: '6', type: 'bookmark', text: '' };
  const note2 = { id: '7', text: 'Check out https://github.com' };
  const note3 = { id: '8', linkPreview: { url: 'https://example.com' } };
  const richProviderNote = {
    id: '8b',
    image: 'https://example.com/provider-cover.jpg',
    linkPreview: { canonicalUrl: 'https://www.pinterest.com/pin/123', platform: 'pinterest' }
  };
  const spotifyProviderNote = {
    id: '8c',
    type: 'audio',
    image: 'https://i.scdn.co/image/cover.jpg',
    linkPreview: { canonicalUrl: 'https://open.spotify.com/track/123', platform: 'spotify' }
  };
  assert.equal(getVisualNoteType(note1), 'link');
  assert.equal(getVisualNoteType(note2), 'link');
  assert.equal(getVisualNoteType(note3), 'link');
  assert.equal(getVisualNoteType(richProviderNote), 'link');
  assert.equal(getVisualNoteType(spotifyProviderNote), 'link');
});

test('getVisualNoteType classifies recipe data', () => {
  const note1 = { id: '9', type: 'recipe', text: '' };
  const note2 = { id: '10', recipeData: { ingredients: [] } };
  const note3 = { id: '11', title: 'Grandma Recipe for Pie' };
  assert.equal(getVisualNoteType(note1), 'recipe');
  assert.equal(getVisualNoteType(note2), 'recipe');
  assert.equal(getVisualNoteType(note3), 'recipe');
});

test('getVisualNoteType classifies photos, drawings, and images as visual', () => {
  const note1 = { id: '12', type: 'photo', text: '' };
  const note2 = { id: '13', type: 'drawing', text: '' };
  const note3 = { id: '14', image: 'data:image/png;base64,...' };
  assert.equal(getVisualNoteType(note1), 'visual');
  assert.equal(getVisualNoteType(note2), 'visual');
  assert.equal(getVisualNoteType(note3), 'visual');
});

test('getVisualNoteType classifies file attachments as file', () => {
  const note1 = { id: '15', type: 'file', text: '' };
  const note2 = { id: '16', files: [{ name: 'document.pdf', type: 'application/pdf' }] };
  assert.equal(getVisualNoteType(note1), 'file');
  assert.equal(getVisualNoteType(note2), 'file');
});

test('buildNoteMediaDeck builds purpose-built decks for all 7 note kinds', () => {
  // 1. Text note deck (empty when no media)
  const textNoteNoMedia = { id: 't1', title: 'Plain', text: 'No media' };
  assert.equal(buildNoteMediaDeck(textNoteNoMedia, 'text').length, 0);

  const textNoteWithMedia = { id: 't2', title: 'With media', text: 'Check https://example.com', image: 'https://example.com/img.jpg' };
  assert.ok(buildNoteMediaDeck(textNoteWithMedia, 'text').length >= 2);

  // 2. Checklist deck (always has progress summary slide)
  const checklistNote = { id: 'c1', type: 'checklist', text: '- [x] Done\n- [ ] Todo' };
  const checklistDeck = buildNoteMediaDeck(checklistNote, 'checklist');
  assert.ok(checklistDeck.length >= 1);
  assert.equal(checklistDeck[0].kind, 'checklist-summary');

  // 3. Voice deck
  const voiceNote = { id: 'v1', audioClips: [{ id: 'a1', data: 'data:audio/webm;base64,...' }] };
  const voiceDeck = buildNoteMediaDeck(voiceNote, 'voice');
  assert.ok(voiceDeck.length >= 1);
  assert.equal(voiceDeck[0].kind, 'voice');

  // 4. Link deck
  const linkNote = { id: 'l1', text: 'Visit https://github.com' };
  const linkDeck = buildNoteMediaDeck(linkNote, 'link');
  assert.ok(linkDeck.length >= 1);
  assert.equal(linkDeck[0].kind, 'link');

  // 5. Recipe deck
  const recipeNote = { id: 'r1', type: 'recipe', recipeData: { name: 'Soup', ingredients: ['Water', 'Salt'] } };
  const recipeDeck = buildNoteMediaDeck(recipeNote, 'recipe');
  assert.ok(recipeDeck.length >= 2);

  // 6. Visual deck
  const visualNote = { id: 'img1', image: 'https://example.com/photo.jpg' };
  const visualDeck = buildNoteMediaDeck(visualNote, 'visual');
  assert.ok(visualDeck.length >= 1);
  assert.equal(visualDeck[0].kind, 'image');

  // 7. File deck
  const fileNote = { id: 'f1', files: [{ name: 'report.pdf', size: 1024 }] };
  const fileDeck = buildNoteMediaDeck(fileNote, 'file');
  assert.ok(fileDeck.length >= 1);
  assert.equal(fileDeck[0].kind, 'file');
});

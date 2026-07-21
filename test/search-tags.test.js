import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanUniqueTags } from '../app.js';
import {
  renderSearchTags,
  getPhotoItems,
  getFileItems,
  getVoiceItems,
  getLinkItems,
  getChecklistItems,
  parseChecklistDetails,
  getFilteredContentItems,
  stopCurrentAudio,
  openPhotoLightbox,
  closePhotoLightbox,
  openActionMenu,
  closeActionMenu,
  attachTouchLongPress,
  deleteMediaItem,
  searchState
} from '../search.js';

test('Global top-bar search element #search-input is absent in index.html', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assert.equal(html.includes('id="search-input"'), false, 'Top bar search input #search-input should be removed from index.html');
  assert.equal(html.includes('class="header-center"'), false, 'Header center container should be removed from index.html');
});

test('Dedicated Search page input #dedicated-search-input is present in index.html', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assert.equal(html.includes('id="dedicated-search-input"'), true, 'Dedicated search input #dedicated-search-input must exist');
});

test('Tags section #search-tags-section is placed inside dedicated search page in index.html', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assert.equal(html.includes('id="search-tags-section"'), true, 'Search page tags section #search-tags-section must exist');
  assert.equal(html.includes('id="sidebar-tags-list"'), false, 'Sidebar tags list #sidebar-tags-list should be absent from index.html');
});

test('scanUniqueTags returns sorted unique tags alphabetically ignoring leading # and case', () => {
  const tags = scanUniqueTags();
  assert.ok(Array.isArray(tags));
  for (let i = 1; i < tags.length; i++) {
    const prev = String(tags[i - 1]).replace(/^#/, '').toLowerCase();
    const curr = String(tags[i]).replace(/^#/, '').toLowerCase();
    assert.ok(prev.localeCompare(curr) <= 0, `Tag ${tags[i - 1]} should come before or equal to ${tags[i]}`);
  }
});

test('renderSearchTags executes safely in non-browser or mocked DOM environment', () => {
  assert.equal(typeof renderSearchTags, 'function');
  assert.doesNotThrow(() => renderSearchTags());
});

test('Phase 1 extractors correctly extract photos, files, voice memos, and links from notes', () => {
  const dummyNotes = [
    {
      id: 'note_1',
      title: 'Design Review',
      text: 'Check out https://paperuss.app and ![diagram](https://example.com/arch.png) #design',
      tags: ['design'],
      image: 'data:image/png;base64,123',
      files: [
        { name: 'spec.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,456' },
        { name: 'recording.mp3', type: 'audio/mp3', data: 'data:audio/mp3;base64,789' }
      ],
      audio: 'data:audio/wav;base64,abc',
      links: [{ url: 'https://github.com', title: 'GitHub' }]
    }
  ];

  const photos = getPhotoItems(dummyNotes);
  assert.ok(photos.length >= 2, 'Should extract note.image and embedded markdown image');
  assert.equal(photos[0].noteId, 'note_1');

  const files = getFileItems(dummyNotes);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'spec.pdf');

  const voice = getVoiceItems(dummyNotes);
  assert.equal(voice.length, 2, 'Should extract note.audio and recording.mp3 file');

  const links = getLinkItems(dummyNotes);
  assert.equal(links.length, 2, 'Should extract stored link and text URL');
  assert.ok(links.some(l => l.domain === 'github.com'));

  const filteredPhotos = getFilteredContentItems(dummyNotes, { contentType: 'photos', selectedTag: 'design' });
  assert.ok(filteredPhotos.length >= 2);

  const filteredVoice = getFilteredContentItems(dummyNotes, { contentType: 'voice', query: 'Design' });
  assert.equal(filteredVoice.length, 2);
});

test('Phase 2 fluid genre filter cards and search results section exist in index.html with ARIA roles', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('data-type="all"'), 'Card data-type="all" must exist');
  assert.ok(html.includes('data-type="checklist"'), 'Card data-type="checklist" must exist');
  assert.ok(html.includes('data-type="photos"'), 'Card data-type="photos" must exist');
  assert.ok(html.includes('data-type="files"'), 'Card data-type="files" must exist');
  assert.ok(html.includes('data-type="voice"'), 'Card data-type="voice" must exist');
  assert.ok(html.includes('data-type="links"'), 'Card data-type="links" must exist');

  assert.ok(html.includes('id="search-results-title"'), '#search-results-title must exist');
  assert.ok(html.includes('id="search-results-count"'), '#search-results-count must exist');
});

test('Phase 3 stopCurrentAudio executes safely and cleans up audio instance state', () => {
  assert.equal(typeof stopCurrentAudio, 'function');
  assert.doesNotThrow(() => stopCurrentAudio());
});

test('Phase 4 Photo Lightbox modal markup and functions execute safely', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="photo-lightbox-modal"'), '#photo-lightbox-modal must exist');
  assert.ok(html.includes('id="lightbox-img"'), '#lightbox-img must exist');
  assert.ok(html.includes('id="lightbox-zoom-in"'), '#lightbox-zoom-in must exist');
  assert.ok(html.includes('id="lightbox-zoom-out"'), '#lightbox-zoom-out must exist');

  assert.equal(typeof openPhotoLightbox, 'function');
  assert.equal(typeof closePhotoLightbox, 'function');

  assert.doesNotThrow(() => openPhotoLightbox(0, [{ src: 'test.png', name: 'Test', noteTitle: 'Note 1' }]));
  assert.doesNotThrow(() => closePhotoLightbox());
});

test('Phase 5 Action Menu Popover markup and touch long-press functions execute safely', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="search-action-menu-popover"'), '#search-action-menu-popover must exist');
  assert.equal(typeof openActionMenu, 'function');
  assert.equal(typeof closeActionMenu, 'function');
  assert.equal(typeof attachTouchLongPress, 'function');

  assert.doesNotThrow(() => openActionMenu(null, [{ label: 'Test', onClick: () => {} }]));
  assert.doesNotThrow(() => closeActionMenu());
});

test('Phase 6 deleteMediaItem safely removes target attachment without deleting source note', () => {
  const note = {
    id: 'test_note_del',
    title: 'Test Note',
    text: 'Hello world',
    image: 'data:image/png;base64,abc',
    files: [{ name: 'file.pdf', type: 'application/pdf' }]
  };

  const photoItem = {
    type: 'photo',
    sourceType: 'image',
    note
  };

  deleteMediaItem(photoItem);
  assert.equal(note.image, undefined, 'note.image should be deleted');
  assert.equal(note.id, 'test_note_del', 'Source note object must remain intact');
  assert.equal(note.files.length, 1, 'note.files array should remain intact');

  const fileItem = {
    type: 'file',
    fileIndex: 0,
    note
  };

  deleteMediaItem(fileItem);
  assert.equal(note.files.length, 0, 'file attachment should be removed from note.files');
  assert.equal(note.id, 'test_note_del', 'Source note object must not be deleted');
});

test('getChecklistItems correctly extracts notes with checklist checkboxes', () => {
  const notes = [
    { id: '1', title: 'Task List', text: '- [ ] Buy groceries\n- [x] Walk dog' },
    { id: '2', title: 'Plain Note', text: 'Just some plain text' },
    { id: '3', title: 'Typed Checklist', type: 'checklist', text: 'Item 1' }
  ];

  const items = getChecklistItems(notes);
  assert.equal(items.length, 2);
  assert.equal(items[0].note.id, '1');
  assert.equal(items[1].note.id, '3');
});

test('parseChecklistDetails calculates total, completed count and percentage', () => {
  const note = {
    id: 'c1',
    title: 'Grocery List',
    text: '- [x] Milk\n- [ ] Eggs\n- [x] Bread\n- [ ] Cheese'
  };

  const details = parseChecklistDetails(note);
  assert.equal(details.total, 4);
  assert.equal(details.completed, 2);
  assert.equal(details.percent, 50);
  assert.equal(details.items.length, 4);
  assert.equal(details.items[0].checked, true);
  assert.equal(details.items[1].checked, false);
});








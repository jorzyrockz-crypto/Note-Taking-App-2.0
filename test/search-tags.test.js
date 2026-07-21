import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanUniqueTags } from '../app.js';
import { renderSearchTags } from '../search.js';

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
  // Verify array is sorted case-insensitively
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

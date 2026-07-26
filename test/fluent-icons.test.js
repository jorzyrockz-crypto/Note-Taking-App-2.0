import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLUENT_ICON_CATEGORIES,
  FLUENT_ICON_VERSION,
  getFluentIcon,
  getFluentIconUrl,
  isFluentIcon
} from '../fluent-icons.js';

test('Fluent icon catalog has the five picker categories and approved entries', () => {
  assert.deepEqual(FLUENT_ICON_CATEGORIES.map(category => category.id), ['home', 'work', 'personal', 'projects', 'finances']);
  assert.ok(getFluentIcon('folder'));
  assert.equal(getFluentIcon('unapproved-icon'), null);
});

test('Fluent icon URLs are pinned and accept only supported variants', () => {
  assert.equal(
    getFluentIconUrl('folder'),
    `https://cdn.jsdelivr.net/npm/@fluentui/svg-icons@${FLUENT_ICON_VERSION}/icons/folder_24_regular.svg`
  );
  assert.equal(getFluentIconUrl('folder', 'filled').endsWith('/folder_24_filled.svg'), true);
  assert.equal(getFluentIconUrl('not-approved'), '');
  assert.equal(getFluentIconUrl('folder', 'color'), '');
});

test('only catalog-backed Fluent note values are recognized', () => {
  assert.equal(isFluentIcon({ type: 'fluent', value: 'folder', variant: 'regular' }), true);
  assert.equal(isFluentIcon({ type: 'fluent', value: 'not-approved' }), false);
  assert.equal(isFluentIcon({ type: 'lucide', value: 'folder' }), false);
});

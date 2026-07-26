import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('Media Hub permits vertical page scrolling from every slide surface', () => {
  assert.match(
    stylesSource,
    /\.note-media-hub\s*\{[\s\S]*?touch-action:\s*auto;[\s\S]*?overscroll-behavior-x:\s*contain;[\s\S]*?\}/
  );
  assert.match(
    stylesSource,
    /\.note-media-hub \.note-carousel-track\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?touch-action:\s*auto;[\s\S]*?\}/
  );
  assert.match(
    stylesSource,
    /\.notes-grid \.note-card \.note-media-hub,[\s\S]*?\.note-slide-item\s*\{[\s\S]*?touch-action:\s*auto;[\s\S]*?\}/
  );
});

test('phone card gestures do not capture touches originating in the Media Hub', () => {
  const exclusions = appSource.match(
    /e\.target\.closest\('\.note-media-hub, \.note-carousel-track, \.note-slide-item'\)/
  ) || [];
  assert.ok(exclusions.length >= 1);
});

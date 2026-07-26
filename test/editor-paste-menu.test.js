import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('Glass editor exposes the context-aware paste chooser at a collapsed caret', () => {
  assert.match(appSource, /function initGlassEditorPasteChooser\(\)/);
  assert.match(appSource, /editor\.addEventListener\('contextmenu'/);
  assert.match(appSource, /selection\?\.isCollapsed/);
  assert.match(appSource, /openEditorPasteMenu\(editor, event\.clientX, event\.clientY\)/);
});

test('paste chooser reads and offers supported clipboard content', () => {
  assert.match(appSource, /navigator\.clipboard\.read\(\)/);
  assert.match(appSource, /'image\/png', 'image\/jpeg', 'image\/webp', 'image\/gif'/);
  assert.match(appSource, /Paste as plain text/);
  assert.match(appSource, /Paste with formatting/);
  assert.match(appSource, /Paste link/);
  assert.match(appSource, /Paste image/);
  assert.match(appSource, /Ctrl\/Cmd \+ Shift \+ V/);
});

test('formatted clipboard HTML is sanitized before insertion', () => {
  assert.match(appSource, /sanitizeRichTextHtml\(container\)/);
  assert.match(appSource, /const allowedTags = new Set/);
  assert.match(appSource, /commitGlassEditorChange\('modal'/);
});

test('paste chooser has dedicated viewport-safe menu styling', () => {
  assert.match(stylesSource, /\.editor-paste-menu\s*\{/);
  assert.match(stylesSource, /position:\s*fixed/);
  assert.match(stylesSource, /@media \(pointer:\s*coarse\)/);
});

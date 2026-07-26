import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clearGlassEditorSession,
  configureGlassEditorController,
  glassEditorController
} from '../glass-editor.js';

test('glass editor controller routes new notes through the modal session', () => {
  const calls = [];
  configureGlassEditorController({
    open: (note, autoFocus) => calls.push(['open', note.id, autoFocus]),
    save: () => calls.push(['save']),
    flush: () => calls.push(['flush']),
    close: () => calls.push(['close'])
  });

  glassEditorController.openNewNote({ id: 'note-1', isNewDraft: true });
  assert.deepEqual(glassEditorController.getSession(), {
    noteId: 'note-1',
    kind: 'new',
    surface: 'modal'
  });
  glassEditorController.saveActiveNote();
  glassEditorController.flushPendingSave();
  glassEditorController.closeEditor();

  assert.deepEqual(calls, [
    ['open', 'note-1', true],
    ['save'],
    ['flush'],
    ['close']
  ]);
  assert.equal(glassEditorController.getSession(), null);
});

test('glass editor controller identifies existing-note sessions', () => {
  configureGlassEditorController({ open: () => {} });
  glassEditorController.openExistingNote({ id: 'note-2' });
  assert.equal(glassEditorController.getSession()?.kind, 'edit');
  assert.equal(glassEditorController.getActiveSurface(), null);
  clearGlassEditorSession();
});

test('application entry points do not bypass the glass editor controller', () => {
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const directCalls = source.match(/\bopenEditModal\s*\(/g) || [];
  assert.equal(directCalls.length, 1, 'only the private openEditModal implementation may remain');
});

test('legacy creator Glass editing surface is retired', () => {
  const markup = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const glassSource = fs.readFileSync(new URL('../glass-editor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(markup, /id="creator-(?:glass|add-menu|context-toolbar)/);
  assert.doesNotMatch(appSource, /initGlassToolbarExtensions\(['"]creator['"]\)/);
  assert.doesNotMatch(appSource, /creator-glass-(?:workspace|title|editor|floating-toolbar)/);
  assert.doesNotMatch(glassSource, /getGlassSurface\(['"]creator['"]\)/);
  assert.equal(glassEditorController.getActiveSurface(), null);
});

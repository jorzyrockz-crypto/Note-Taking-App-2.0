import { renderChecklistNoteContent, renderTextWithLinks, syncChecklistEditor } from './checklist-note.js';
import { checklistToPlain, isChecklistFormat, plainToChecklist } from './shared.js';
import { renderTextNoteContent } from './text-note.js';

const NOTE_TYPES = {
  checklist: 'checklist',
  text: 'text'
};

export function getNoteTypeFromText(text = '') {
  return isChecklistFormat(text) ? NOTE_TYPES.checklist : NOTE_TYPES.text;
}

export function normalizeNoteType(note) {
  return {
    ...note,
    type: note?.type || getNoteTypeFromText(note?.text || '')
  };
}

export function renderNoteContent(note, options) {
  const noteType = note.type || getNoteTypeFromText(note.text || '');

  if (noteType === NOTE_TYPES.checklist) {
    return renderChecklistNoteContent(note, options);
  }

  return renderTextNoteContent(note, options);
}

export function syncNoteTypeEditor({ textareaEl, checklistEditorEl, rawText, onChange }) {
  if (getNoteTypeFromText(rawText) === NOTE_TYPES.checklist) {
    textareaEl.style.display = 'none';
    checklistEditorEl.style.display = 'block';
    syncChecklistEditor(checklistEditorEl, rawText, onChange);
  } else {
    textareaEl.style.display = 'block';
    checklistEditorEl.style.display = 'none';
  }
}

export {
  checklistToPlain,
  getNoteTypeFromText as getNoteType,
  isChecklistFormat,
  plainToChecklist,
  renderTextWithLinks
};

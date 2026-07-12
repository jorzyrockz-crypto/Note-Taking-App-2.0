import { renderChecklistNoteContent, renderTextWithLinks, syncChecklistEditor } from './checklist-note.js';
import {
  applyChecklistInlineReminder,
  checklistToPlain,
  extractChecklistInlineReminder,
  isChecklistFormat,
  plainToChecklist,
  stripChecklistInlineReminder
} from './shared.js';
import { renderTextNoteContent } from './text-note.js';

const NOTE_TYPES = {
  checklist: 'checklist',
  text: 'text'
};

export function getNoteTypeFromText(text = '') {
  return isChecklistFormat(text) ? NOTE_TYPES.checklist : NOTE_TYPES.text;
}

export function normalizeNoteType(note) {
  const normalizedCustomTheme = note?.customTheme && typeof note.customTheme === 'object'
    ? {
        image: typeof note.customTheme.image === 'string' ? note.customTheme.image : '',
        accent: typeof note.customTheme.accent === 'string' ? note.customTheme.accent : '#64748b',
        soft: typeof note.customTheme.soft === 'string' ? note.customTheme.soft : 'rgba(100, 116, 139, 0.18)',
        textColor: typeof note.customTheme.textColor === 'string' ? note.customTheme.textColor : '#0f172a',
        mutedText: typeof note.customTheme.mutedText === 'string' ? note.customTheme.mutedText : 'rgba(15, 23, 42, 0.62)',
        surface: typeof note.customTheme.surface === 'string' ? note.customTheme.surface : 'rgba(255, 255, 255, 0.88)'
      }
    : null;

  return {
    ...note,
    type: note?.type || (note?.recipeData ? 'recipe' : getNoteTypeFromText(note?.text || '')),
    archived: note?.archived === true,
    archivedAt: typeof note?.archivedAt === 'number' ? note.archivedAt : null,
    deleted: note?.deleted === true,
    deletedAt: typeof note?.deletedAt === 'number' ? note.deletedAt : null,
    theme: note?.theme === 'custom' && !normalizedCustomTheme ? null : note?.theme || null,
    customTheme: normalizedCustomTheme
  };
}

export function renderNoteContent(note, options) {
  const noteType = note.type || getNoteTypeFromText(note.text || '');

  if (noteType === NOTE_TYPES.checklist) {
    return renderChecklistNoteContent(note, options);
  }

  return renderTextNoteContent(note, options);
}

export function syncNoteTypeEditor({ textareaEl, checklistEditorEl, rawText, onChange, type }) {
  const isChecklist = type === 'checklist' || (!type && getNoteTypeFromText(rawText) === NOTE_TYPES.checklist);
  if (isChecklist && type !== 'recipe') {
    textareaEl.style.display = 'none';
    checklistEditorEl.style.display = 'block';
    syncChecklistEditor(checklistEditorEl, rawText, onChange);
  } else {
    textareaEl.style.display = 'block';
    checklistEditorEl.style.display = 'none';
  }
}

export {
  applyChecklistInlineReminder,
  checklistToPlain,
  extractChecklistInlineReminder,
  getNoteTypeFromText as getNoteType,
  isChecklistFormat,
  plainToChecklist,
  stripChecklistInlineReminder,
  renderTextWithLinks
};

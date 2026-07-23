/**
 * Editor Settings Module
 * Handles editor behavior, link preview preferences, and checklist item positioning options.
 */

import { SettingsDOM } from './settings-dom.js';
import { appSettings } from '../app.js';

export function populateEditorForm() {
  const dom = SettingsDOM;
  if (dom.linkPreviews) dom.linkPreviews.checked = appSettings.linkPreviewsEnabled;
  if (dom.checkedBottom) dom.checkedBottom.checked = appSettings.checkedItemsToBottom;
  if (dom.newBottom) dom.newBottom.checked = appSettings.newChecklistItemsToBottom;
  if (dom.advancedEditor) dom.advancedEditor.checked = appSettings.advancedEditorEnabled;
  if (dom.modernGlassEditor) dom.modernGlassEditor.checked = appSettings.modernGlassEditorEnabled || false;
}

/**
 * Account & Data Operations Module
 * Controls reset data and cache clearing actions with confirmation protection.
 */

import { SettingsDOM } from './settings-dom.js';
import { clearAllCacheAndData } from '../app.js';

export function bindAccountEvents() {
  const dom = SettingsDOM;
  dom.resetDataBtn?.addEventListener('click', clearAllCacheAndData);
}

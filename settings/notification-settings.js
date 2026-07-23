/**
 * Notification Settings Module
 * Handles notification switches, quiet hours range, reminders, DND,
 * toast positioning grid, and disabled state dimming.
 */

import { SettingsDOM } from './settings-dom.js';
import { saveSettingsAndSync, showToast } from './settings-store.js';
import { appSettings } from '../app.js';

export function bindNotificationEvents() {
  const dom = SettingsDOM;

  // Master notification switch
  dom.notifEnabled?.addEventListener('change', () => {
    const enabled = dom.notifEnabled.checked;
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    updateNotifControlsDisabledState();
  });

  // Quiet hours visibility
  dom.notifQuietHours?.addEventListener('change', () => {
    if (dom.quietHoursRange) {
      dom.quietHoursRange.style.display = dom.notifQuietHours.checked ? 'flex' : 'none';
    }
  });

  // Toast position grid
  const positionGrid = dom.notifPositionGrid;
  positionGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.notif-pos-btn');
    if (!btn) return;
    positionGrid.querySelectorAll('.notif-pos-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appSettings.toastPosition = btn.dataset.pos;
    saveSettingsAndSync();
    showToast({ title: 'Position Updated', text: 'Toasts will now appear here.' });
  });
}

export function populateNotificationForm() {
  const dom = SettingsDOM;

  if (dom.reminderMorning) dom.reminderMorning.value = appSettings.reminderTimes?.morning || '08:00';
  if (dom.reminderAfternoon) dom.reminderAfternoon.value = appSettings.reminderTimes?.afternoon || '13:00';
  if (dom.reminderEvening) dom.reminderEvening.value = appSettings.reminderTimes?.evening || '18:00';

  if (dom.notifEnabled) dom.notifEnabled.checked = appSettings.notificationsEnabled !== false;
  if (dom.notifReminders) dom.notifReminders.checked = appSettings.notificationsReminders !== false;
  if (dom.notifDnd) dom.notifDnd.checked = !!appSettings.notificationsDnd;
  if (dom.notifQuietHours) dom.notifQuietHours.checked = !!appSettings.notificationsQuietHours;
  if (dom.quietFrom) dom.quietFrom.value = appSettings.quietHoursFrom || '22:00';
  if (dom.quietTo) dom.quietTo.value = appSettings.quietHoursTo || '07:00';
  if (dom.notifSound) dom.notifSound.checked = appSettings.notificationsSound !== false;
  if (dom.notifVibrate) dom.notifVibrate.checked = appSettings.notificationsVibrate !== false;

  const toastPos = appSettings.toastPosition || 'top-right';
  document.querySelectorAll('#settings-notif-position-grid .notif-pos-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pos === toastPos);
  });

  if (dom.quietHoursRange) {
    dom.quietHoursRange.style.display = appSettings.notificationsQuietHours ? 'flex' : 'none';
  }

  updateNotifControlsDisabledState();
}

export function updateNotifControlsDisabledState() {
  const dom = SettingsDOM;
  const enabled = dom.notifEnabled ? dom.notifEnabled.checked : true;
  [
    dom.notifReminders,
    dom.notifDnd,
    dom.notifQuietHours,
    dom.quietFrom,
    dom.quietTo,
    dom.notifSound,
    dom.notifVibrate
  ].forEach(el => {
    if (el) {
      el.disabled = !enabled;
      const row = el.closest('.settings-row');
      if (row) {
        row.style.opacity = enabled ? '1' : '0.5';
        row.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    }
  });

  const positionGrid = dom.notifPositionGrid;
  if (positionGrid) {
    positionGrid.style.opacity = enabled ? '1' : '0.5';
    positionGrid.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

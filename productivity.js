import {
  notes,
  appSettings,
  selectedCalendarDate,
  calendarCursorDate,
  selectedProductivityDayView,
  getVisualNoteType,
  getTaskInlineReminderEntries,
  stripChecklistInlineReminder,
  cleanTextTags,
  cleanTitleTags,
  formatReminderDate,
  getVisualTypeLabel,
  formatCardTimestamp,
  openEditModal,
  escapeHtml,
  getChecklistStats,
  isTaskNote,
  isTaskCompleted,
  getFolderSummaryLabel,
  getReminderNotes,
  getTaskNotes,
  getDayCollections,
  getLocalDateKey,
  getDayDotTypes,
  getNoteTypeAccent,
  getFilteredProductivityTasks,
  formatCalendarDayLabel,
  getTaskPreviewSchedule,
  getTaskPreviewLabel,
  renderAppView,
  setActiveSidebarPage,
  setSelectedCalendarDate,
  setCalendarCursorDate,
  setSelectedProductivityDayView,
  getTaskInlineReminderDateKeys
} from './app.js';

// Map workspace background preset → hero gradient colors [light, dark]
const BG_HERO_GRADIENTS = {
  base:     ['#dbeafe, #eff6ff',         '#1a2540, #0f1a30'],
  sky:      ['#e0f2fe, #f0f9ff',         '#0f1a38, #080d1c'],
  lilac:    ['#f3e8ff, #ede9fe',         '#2a1a40, #1a1030'],
  sage:     ['#dcfce7, #ecfdf5',         '#0e2a1a, #081510'],
  peach:    ['#ffedd5, #fff7ed',         '#2e1a0a, #1a0f05'],
  offwhite: ['#fdfcf8, #f9f9f6',         '#1e1c18, #161410'],
  white:    ['#f8fafc, #f1f5f9',         '#111827, #0d1424'],
  coolgray: ['#f1f5f9, #e2e8f0',         '#1f2937, #111827'],
  paper:    ['#f0ede3, #f6f4ec',         '#1d1a14, #15130f'],
};

function getHeroGradient() {
  const isDark = document.body.classList.contains('dark-theme');
  const bgColor = appSettings?.appBgColor || 'base';
  const hasCustomImage = appSettings?.appBgType === 'custom-image' && appSettings?.appBgImage?.src;
  if (hasCustomImage) {
    return isDark
      ? 'rgba(15,23,42,0.82), rgba(15,23,42,0.72)'
      : 'rgba(255,255,255,0.82), rgba(241,246,255,0.72)';
  }
  const pair = BG_HERO_GRADIENTS[bgColor] || BG_HERO_GRADIENTS.base;
  return isDark ? pair[1] : pair[0];
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// Collect all unchecked items across notes, returning [{text, note}, ...]
function getAllUncheckedItems(noteList = notes) {
  const items = [];
  for (const note of noteList) {
    if (!note || note.deleted) continue;
    const lines = `${note.text || ''}`.split('\n');
    for (const line of lines) {
      if (line.startsWith('- [ ] ')) {
        const text = line.slice(6).replace(/\s*@remind\([^)]*\)/g, '').trim();
        if (text) items.push({ text, note });
      }
    }
  }
  return items;
}

let productivityPage;

export function ensureProductivityPage() {
  if (productivityPage) return;
  
  const notesFeed = document.getElementById('notes-feed');
  if (!document.getElementById('productivity-page')) {
    productivityPage = document.createElement('section');
    productivityPage.className = 'productivity-page';
    productivityPage.id = 'productivity-page';
    productivityPage.style.display = 'none';
    productivityPage.innerHTML = `
      <div class="productivity-hero" id="productivity-hero">
        <div class="productivity-hero-copy">
          <div class="productivity-hero-date" id="productivity-hero-date"></div>
          <h2 class="productivity-title">Calendar Flow</h2>
          <p class="productivity-subtitle">A clean month view with type-colored note dots and a focused day panel for agenda, tasks, and notes created that day.</p>
        </div>
        <div class="productivity-summary" id="productivity-summary"></div>
      </div>

      <div class="productivity-layout">
        <section class="productivity-panel productivity-calendar-panel">
          <div class="productivity-panel-header">
            <div>
              <div class="productivity-panel-kicker">Calendar</div>
              <h3>Reminder map</h3>
            </div>
            <div class="calendar-controls">
              <button class="text-btn productivity-nav-btn" id="calendar-prev-btn" type="button">Prev</button>
              <button class="text-btn productivity-nav-btn" id="calendar-today-btn" type="button">Today</button>
              <button class="text-btn productivity-nav-btn" id="calendar-next-btn" type="button">Next</button>
            </div>
          </div>
          <div class="calendar-month-label" id="calendar-month-label"></div>
          <div class="calendar-weekdays" id="calendar-weekdays"></div>
          <div class="calendar-grid" id="calendar-grid"></div>
        </section>

        <section class="productivity-panel productivity-todo-panel">
          <div class="productivity-todo-widget" id="productivity-todo-widget"></div>
        </section>

        <section class="productivity-panel productivity-agenda-panel">
          <div class="agenda-header productivity-panel-header">
            <div>
              <div class="productivity-panel-kicker">Day View</div>
              <h4 id="agenda-date-label">Selected day</h4>
              <div class="agenda-date-meta" id="agenda-date-meta">Choose a date to reveal reminders and notes.</div>
            </div>
            <span class="agenda-count" id="agenda-count"></span>
          </div>
          <div class="productivity-day-section-label">
            <span>Agenda</span>
            <span id="agenda-section-caption">Only notes with reminders are shown here.</span>
          </div>
          <div class="productivity-day-stream" id="productivity-day-stream"></div>
          <div class="productivity-empty" id="productivity-day-empty" style="display: none;">Nothing is linked to this day yet.</div>
          <div class="productivity-day-notes" id="productivity-day-notes" style="display: none;">
            <div class="productivity-notes-label">Notes made this day</div>
            <div class="productivity-note-pills" id="productivity-note-pills"></div>
          </div>
        </section>
      </div>
    `;
    notesFeed?.insertAdjacentElement('afterend', productivityPage);

    // Bind event handlers since the elements are now in the DOM
    document.getElementById('calendar-prev-btn')?.addEventListener('click', () => {
      setCalendarCursorDate(new Date(calendarCursorDate.getFullYear(), calendarCursorDate.getMonth() - 1, 1));
      renderAppView();
    });

    document.getElementById('calendar-next-btn')?.addEventListener('click', () => {
      setCalendarCursorDate(new Date(calendarCursorDate.getFullYear(), calendarCursorDate.getMonth() + 1, 1));
      renderAppView();
    });

    document.getElementById('calendar-today-btn')?.addEventListener('click', () => {
      const today = new Date();
      setSelectedCalendarDate(getLocalDateKey(today));
      setCalendarCursorDate(new Date(today.getFullYear(), today.getMonth(), 1));
      renderAppView();
    });
  } else {
    productivityPage = document.getElementById('productivity-page');
  }
}

export function renderProductivityPage() {
  ensureProductivityPage();
  const settingsPage = document.getElementById('settings-page');
  const creatorWrapper = document.querySelector('.creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');

  if (settingsPage) settingsPage.style.display = 'none';
  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (productivityPage) productivityPage.style.display = 'flex';

  setActiveSidebarPage('productivity');

  // Apply workspace-adaptive gradient
  const heroEl = document.getElementById('productivity-hero');
  if (heroEl) {
    const [gradFrom, gradTo] = getHeroGradient().split(', ');
    heroEl.style.background = `linear-gradient(120deg, ${gradFrom.trim()} 0%, ${gradTo.trim()} 100%)`;
  }

  // Live date eyebrow
  const heroDate = document.getElementById('productivity-hero-date');
  if (heroDate) heroDate.textContent = getTodayLabel();

  const reminderNotes = getReminderNotes();
  const taskNotes = getTaskNotes();
  const summary = document.getElementById('productivity-summary');
  if (summary) {
    const selectedDay = getDayCollections(selectedCalendarDate);
    summary.innerHTML = `
      <div class="productivity-stat">
        <span class="productivity-stat-icon-badge productivity-stat-icon--reminder" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </span>
        <span class="productivity-stat-value">${reminderNotes.length}</span>
        <span class="productivity-stat-label">Reminders</span>
      </div>
      <div class="productivity-stat-divider"></div>
      <div class="productivity-stat">
        <span class="productivity-stat-icon-badge productivity-stat-icon--tasks" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </span>
        <span class="productivity-stat-value">${taskNotes.length}</span>
        <span class="productivity-stat-label">Tasks</span>
      </div>
      <div class="productivity-stat-divider"></div>
      <div class="productivity-stat">
        <span class="productivity-stat-icon-badge productivity-stat-icon--today" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </span>
        <span class="productivity-stat-value">${selectedDay.created.length}</span>
        <span class="productivity-stat-label">Notes Today</span>
      </div>
    `;
  }

  const weekdayContainer = document.getElementById('calendar-weekdays');
  if (weekdayContainer && weekdayContainer.childElementCount === 0) {
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      const el = document.createElement('div');
      el.className = 'calendar-weekday';
      el.textContent = day;
      weekdayContainer.appendChild(el);
    });
  }

  const calendarMonthLabel = document.getElementById('calendar-month-label');
  if (calendarMonthLabel) {
    calendarMonthLabel.textContent = calendarCursorDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  const calendarGrid = document.getElementById('calendar-grid');
  if (calendarGrid) {
    calendarGrid.innerHTML = '';
    const year = calendarCursorDate.getFullYear();
    const month = calendarCursorDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const totalCalendarDays = monthStart.getDay() + monthEnd.getDate();
    const totalCells = Math.ceil(totalCalendarDays / 7) * 7;

    for (let index = 0; index < totalCells; index += 1) {
      const dayDate = new Date(gridStart);
      dayDate.setDate(gridStart.getDate() + index);
      const dateKey = getLocalDateKey(dayDate);
      const dayDotTypes = getDayDotTypes(dateKey);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar-day';
      if (dayDate.getMonth() !== month) cell.classList.add('is-outside-month');
      if (dateKey === getLocalDateKey(new Date())) cell.classList.add('is-today');
      if (dateKey === selectedCalendarDate) cell.classList.add('is-selected');
      cell.innerHTML = `
        <span class="calendar-day-number-wrap">
          <span class="calendar-day-number">${dayDate.getDate()}</span>
        </span>
        <span class="calendar-day-dots">
          ${dayDotTypes.slice(0, 4).map(kind => `<span class="calendar-day-dot" style="--dot-color:${getNoteTypeAccent(kind)}" title="${getVisualTypeLabel(kind)}"></span>`).join('')}
        </span>
      `;
      cell.addEventListener('click', () => {
        setSelectedCalendarDate(dateKey);
        if (dayDate.getMonth() !== calendarCursorDate.getMonth()) {
          setCalendarCursorDate(new Date(dayDate.getFullYear(), dayDate.getMonth(), 1));
        }
        renderAppView();
      });
      calendarGrid.appendChild(cell);
    }
  }

  const agendaLabel = document.getElementById('agenda-date-label');
  const agendaCount = document.getElementById('agenda-count');
  const agendaMeta = document.getElementById('agenda-date-meta');
  const agendaCaption = document.getElementById('agenda-section-caption');
  const dayStream = document.getElementById('productivity-day-stream');
  const dayEmpty = document.getElementById('productivity-day-empty');
  const notePillsContainer = document.getElementById('productivity-note-pills');
  const notesMadeWrap = document.getElementById('productivity-day-notes');
  const todoWidget = document.getElementById('productivity-todo-widget');
  const dayCollections = getDayCollections(selectedCalendarDate);
  const searchInput = document.getElementById('search-input');
  const queryMatches = note => {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (query === '') return true;
    return `${note.title || ''} ${note.text || ''}`.toLowerCase().includes(query);
  };
  const agendaNotes = dayCollections.agenda.filter(queryMatches);
  const todoNotes = dayCollections.todo.filter(queryMatches);
  const createdNotes = dayCollections.created.filter(queryMatches);
  const agendaDisplayNotes = [...agendaNotes];
  const agendaDisplayIds = new Set(agendaNotes.map(note => note.id));
  todoNotes
    .filter(note => !agendaDisplayIds.has(note.id) && getTaskInlineReminderDateKeys(note).includes(selectedCalendarDate))
    .forEach(note => {
      agendaDisplayIds.add(note.id);
      agendaDisplayNotes.push(note);
    });

  if (agendaLabel) agendaLabel.textContent = formatCalendarDayLabel(selectedCalendarDate);
  if (agendaMeta) {
    agendaMeta.textContent = `${agendaDisplayNotes.length} reminder${agendaDisplayNotes.length === 1 ? '' : 's'} • ${createdNotes.length} note${createdNotes.length === 1 ? '' : 's'} made`;
  }
  if (agendaCount) {
    agendaCount.textContent = `${agendaDisplayNotes.length} reminder${agendaDisplayNotes.length === 1 ? '' : 's'}`;
  }
  if (agendaCaption) {
    agendaCaption.textContent = agendaDisplayNotes.length > 0
      ? 'Only notes with reminders are shown here.'
      : 'No reminder notes are linked to this day.';
  }
  if (dayStream) {
    dayStream.innerHTML = '';
    agendaDisplayNotes.forEach(note => {
      dayStream.appendChild(createReminderPreviewCard(note, { dateKey: selectedCalendarDate }));
    });
  }
  if (dayEmpty) {
    const visibleAgendaCount = dayStream ? dayStream.children.length : agendaDisplayNotes.length;
    dayEmpty.style.display = visibleAgendaCount === 0 ? 'block' : 'none';
  }
  if (notePillsContainer) {
    notePillsContainer.innerHTML = '';
    createdNotes.forEach(note => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `productivity-created-pill type-${getVisualNoteType(note)}`;
      pill.textContent = cleanTitleTags(note.title || 'Untitled note');
      pill.addEventListener('click', () => {
        openEditModal(note);
      });
      notePillsContainer.appendChild(pill);
    });
  }
  if (notesMadeWrap) {
    notesMadeWrap.style.display = createdNotes.length > 0 ? 'flex' : 'none';
  }
  if (todoWidget) {
    // Gather task-level notes for the selected day
    const dayTaskItems = todoNotes.map(note => ({ type: 'note', note, text: cleanTitleTags(note.title || 'Untitled task'), sub: getTaskPreviewLabel(note), schedule: getTaskPreviewSchedule(note, selectedCalendarDate), completed: isTaskCompleted(note) }));

    // Gather individual unchecked checklist lines from all notes
    const uncheckedItems = getAllUncheckedItems(notes)
      .filter(({ note }) => !todoNotes.find(n => n.id === note.id)) // don't double-show
      .map(({ text, note }) => ({ type: 'item', note, text, sub: cleanTitleTags(note.title || ''), schedule: '', completed: false }));

    // Merge: day tasks first, then unchecked items, cap at 8
    const widgetItems = [...dayTaskItems, ...uncheckedItems].slice(0, 8);
    const widgetLabel = todoNotes.length > 0 ? 'Selected day tasks + unchecked items' : 'All unchecked items';

    todoWidget.innerHTML = `
      <div class="productivity-todo-widget-head">
        <div>
          <div class="productivity-panel-kicker">To Do</div>
          <h4>Task widget</h4>
        </div>
        <span class="agenda-count">${widgetItems.length}</span>
      </div>
      <div class="productivity-todo-widget-meta">${widgetLabel}.</div>
      <div class="productivity-todo-list">
        ${widgetItems.length > 0
          ? widgetItems.map(item => `
            <button class="productivity-todo-item ${item.completed ? 'is-complete' : ''}" type="button" data-note-id="${item.note.id}">
              <span class="productivity-todo-bullet"></span>
              <span class="productivity-todo-copy">
                <span class="productivity-todo-copy-top">
                  <strong>${escapeHtml(item.text)}</strong>
                  ${item.schedule ? `<span class="productivity-todo-schedule">${item.schedule}</span>` : ''}
                </span>
                ${item.type === 'item' && item.sub ? `<span class="productivity-todo-note-source">${escapeHtml(item.sub)}</span>` : (item.sub ? `<span>${item.sub}</span>` : '')}
              </span>
            </button>
          `).join('')
          : '<div class="productivity-empty productivity-todo-empty">No open tasks or unchecked items.</div>'}
      </div>
    `;
    todoWidget.querySelectorAll('.productivity-todo-item').forEach(button => {
      button.addEventListener('click', () => {
        const note = notes.find(entry => entry.id === button.getAttribute('data-note-id'));
        if (note) openEditModal(note);
      });
    });
  }
}

export function getAgendaPreviewLines(note, dateKey = '') {
  const inlineEntries = getTaskInlineReminderEntries(note)
    .filter(entry => !dateKey || entry.dateKey === dateKey)
    .map(entry => ({
      label: entry.label,
      reminder: entry.reminder,
      completed: entry.completed
    }));

  if (inlineEntries.length) return inlineEntries;

  const lines = `${note?.text || ''}`
    .split('\n')
    .map(line => stripChecklistInlineReminder(line.replace(/^- \[(?: |x)\]\s*/, '')).trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(label => ({ label: cleanTextTags(label), reminder: '' }));

  if (lines.length) return lines;
  return [{ label: cleanTextTags(note?.text || '').trim() || 'No preview yet.', reminder: '' }];
}

export function createReminderPreviewCard(note, options = {}) {
  const { dateKey = selectedCalendarDate } = options;
  const noteKind = getVisualNoteType(note);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'productivity-reminder-card';
  card.setAttribute('data-note-kind', noteKind);

  const agendaLines = getAgendaPreviewLines(note, dateKey);
  const reminderLabel = note.reminder ? formatReminderDate(note.reminder) : (agendaLines[0]?.reminder ? formatReminderDate(agendaLines[0].reminder) : formatCardTimestamp(note.updatedAt));

  card.innerHTML = `
    <div class="productivity-reminder-top">
      <span class="productivity-note-folder">Agenda</span>
      <span class="note-kind-pill type-${noteKind}">${getVisualTypeLabel(noteKind)}</span>
    </div>
    <h4>${cleanTitleTags(note.title || 'Untitled note')}</h4>
    <div class="productivity-agenda-lines">
      ${agendaLines.map(line => `
        <div class="productivity-agenda-line ${line.completed ? 'is-complete' : ''}">
          <span>${escapeHtml(line.label)}</span>
          ${line.reminder ? `<small>${formatReminderDate(line.reminder)}</small>` : ''}
        </div>
      `).join('')}
    </div>
    <div class="productivity-reminder-meta">${reminderLabel}</div>
  `;

  card.addEventListener('click', () => {
    openEditModal(note);
  });

  return card;
}

export function createProductivityNoteCard(note, options = {}) {
  const { mode = 'agenda', eyebrow = '' } = options;
  const noteKind = getVisualNoteType(note);
  const stats = getChecklistStats(note);
  const isTask = isTaskNote(note);
  const completed = isTaskCompleted(note);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `productivity-note-card ${mode === 'task' ? 'task-card' : 'agenda-card'}`;
  card.setAttribute('data-note-kind', noteKind);

  const previewText = cleanTextTags((note.text || '').replace(/^- \[(?: |x)\]\s*/gim, '')).replace(/\s+/g, ' ').trim();
  const folderLabel = getFolderSummaryLabel(note, getVisualTypeLabel(noteKind));
  const reminderLabel = note.reminder ? formatReminderDate(note.reminder) : '';
  const progressLabel = stats.total > 0
    ? `${stats.completed}/${stats.total} complete`
    : (completed ? 'Completed task' : 'Open task');
  const progressPercent = stats.total > 0 ? stats.progressPercent : (completed ? 100 : 0);
  const metaStamp = mode === 'created'
    ? `Made ${formatCardTimestamp(note.createdAt || note.updatedAt)}`
    : (reminderLabel || formatCardTimestamp(note.updatedAt));

  card.innerHTML = `
    <div class="productivity-note-top">
      <span class="productivity-note-folder">${eyebrow || folderLabel}</span>
      <span class="note-kind-pill type-${noteKind}">${getVisualTypeLabel(noteKind)}</span>
    </div>
    <h4>${cleanTitleTags(note.title || 'Untitled note')}</h4>
    ${previewText ? `<p>${previewText.slice(0, mode === 'task' ? 180 : 120)}</p>` : '<p class="muted">No preview yet.</p>'}
    <div class="productivity-note-meta">
      <span class="productivity-inline-stamp">${metaStamp}</span>
      ${isTask ? `<span class="productivity-progress-chip ${completed ? 'is-complete' : ''}">${progressLabel}</span>` : ''}
    </div>
    ${mode === 'task' || (mode === 'agenda' && isTask) ? `
      <div class="productivity-progress">
        <div class="productivity-progress-bar"><span style="width: ${progressPercent}%"></span></div>
        <div class="productivity-progress-caption">${progressLabel}</div>
      </div>
    ` : ''}
  `;

  card.addEventListener('click', () => {
    openEditModal(note);
  });
  return card;
}

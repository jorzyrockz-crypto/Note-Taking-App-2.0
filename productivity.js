import {
  notes,
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
      <div class="productivity-hero">
        <div class="productivity-hero-copy">
          <div class="productivity-eyebrow">PRODUCTIVITY</div>
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

    document.getElementById('productivity-day-pills')?.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        setSelectedProductivityDayView(btn.getAttribute('data-day-view') || 'all');
        renderAppView();
      });
    });
  } else {
    productivityPage = document.getElementById('productivity-page');
  }
}

export function renderProductivityPage() {
  ensureProductivityPage();
  const settingsPage = document.getElementById('settings-page');
  const creatorWrapper = document.getElementById('creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');

  if (settingsPage) settingsPage.style.display = 'none';
  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (productivityPage) productivityPage.style.display = 'flex';

  setActiveSidebarPage('productivity');

  const reminderNotes = getReminderNotes();
  const taskNotes = getTaskNotes();
  const summary = document.getElementById('productivity-summary');
  if (summary) {
    const selectedDay = getDayCollections(selectedCalendarDate);
    summary.innerHTML = `
      <div class="productivity-stat">
        <span class="productivity-stat-icon" aria-hidden="true">⏰</span>
        <strong>${reminderNotes.length}</strong>
        <span>Reminders</span>
      </div>
      <div class="productivity-stat">
        <span class="productivity-stat-icon" aria-hidden="true">☑</span>
        <strong>${taskNotes.length}</strong>
        <span>Tasks</span>
      </div>
      <div class="productivity-stat accent">
        <span class="productivity-stat-icon" aria-hidden="true">✦</span>
        <strong>${selectedDay.created.length}</strong>
        <span>Made today</span>
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
    const widgetTasks = todoNotes.length > 0
      ? todoNotes
      : getFilteredProductivityTasks().filter(note => !isTaskCompleted(note)).slice(0, 4);
    const widgetLabel = todoNotes.length > 0 ? 'Selected day' : 'Next up';
    todoWidget.innerHTML = `
      <div class="productivity-todo-widget-head">
        <div>
          <div class="productivity-panel-kicker">To Do</div>
          <h4>Task widget</h4>
        </div>
        <span class="agenda-count">${widgetTasks.length}</span>
      </div>
      <div class="productivity-todo-widget-meta">${widgetLabel} tasks at a glance.</div>
      <div class="productivity-todo-list">
        ${widgetTasks.length > 0
          ? widgetTasks.map(note => `
            <button class="productivity-todo-item ${isTaskCompleted(note) ? 'is-complete' : ''}" type="button" data-note-id="${note.id}">
              <span class="productivity-todo-bullet"></span>
              <span class="productivity-todo-copy">
                <span class="productivity-todo-copy-top">
                  <strong>${cleanTitleTags(note.title || 'Untitled task')}</strong>
                  ${getTaskPreviewSchedule(note, selectedCalendarDate)
                    ? `<span class="productivity-todo-schedule">${getTaskPreviewSchedule(note, selectedCalendarDate)}</span>`
                    : ''}
                </span>
                <span>${getTaskPreviewLabel(note)}</span>
              </span>
            </button>
          `).join('')
          : '<div class="productivity-empty productivity-todo-empty">No open tasks to show.</div>'}
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

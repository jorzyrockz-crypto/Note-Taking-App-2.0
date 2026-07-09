import { renderTextWithLinks } from './shared.js';

let checklistFocusIndex = null;
let checklistFocusIsNew = false;

export function renderChecklistNoteContent(note, options) {
  const {
    currentEditingNoteId,
    modalText,
    renderNotes,
    renderTextWithLinksFromApp,
    saveToLocalStorage,
    syncModalInputs
  } = options;

  const container = document.createElement('div');
  container.className = 'checklist-container';

  const lines = (note.text || '').split('\n');
  const uncheckedRows = [];
  const checkedRows = [];

  lines.forEach((line, index) => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const checked = line.startsWith('- [x] ');
      const cleanText = line.substring(6);

      const row = document.createElement('div');
      row.className = 'checklist-row';

      const checkbox = document.createElement('div');
      checkbox.className = `checklist-checkbox ${checked ? 'checked' : ''}`;
      checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const newPrefix = checked ? '- [ ] ' : '- [x] ';
        lines[index] = newPrefix + cleanText;
        note.text = lines.join('\n');

        saveToLocalStorage();
        renderNotes();

        if (currentEditingNoteId() === note.id) {
          modalText().value = note.text;
          syncModalInputs(note);
        }
      });

      const label = document.createElement('span');
      label.className = `checklist-text ${checked ? 'checked' : ''}`;
      label.appendChild(renderTextWithLinksFromApp(cleanText));

      row.appendChild(checkbox);
      row.appendChild(label);

      if (checked) {
        checkedRows.push(row);
      } else {
        uncheckedRows.push(row);
      }
    } else if (line.trim() !== '') {
      const row = document.createElement('div');
      row.className = 'checklist-row';
      row.style.paddingLeft = '28px';
      row.textContent = line;
      uncheckedRows.push(row);
    }
  });

  uncheckedRows.forEach(row => container.appendChild(row));

  if (checkedRows.length > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRows.length} completed item${checkedRows.length > 1 ? 's' : ''}</span>
    `;

    const body = document.createElement('div');
    body.className = 'completed-items-body';
    checkedRows.forEach(row => body.appendChild(row));

    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = body.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });

    container.appendChild(header);
    container.appendChild(body);
  }

  return container;
}

export function syncChecklistEditor(container, rawText, onChange) {
  container.innerHTML = '';

  let lines = rawText.split('\n').map(line => line.trim());

  let formatted = false;
  lines = lines.map(line => {
    if (!line.startsWith('- [ ] ') && !line.startsWith('- [x] ')) {
      formatted = true;
      return '- [ ] ' + line;
    }
    return line;
  });

  if (formatted) {
    onChange(lines.join('\n'));
  }

  const uncheckedContainer = document.createElement('div');
  uncheckedContainer.style.display = 'flex';
  uncheckedContainer.style.flexDirection = 'column';
  uncheckedContainer.style.gap = '6px';
  container.appendChild(uncheckedContainer);

  const checkedContainer = document.createElement('div');
  checkedContainer.className = 'completed-items-body';

  const checkedRowsCount = lines.filter(line => line.startsWith('- [x] ')).length;

  lines.forEach((line, index) => {
    const isChecked = line.startsWith('- [x] ');
    const cleanText = line.substring(6);

    const row = document.createElement('div');
    row.className = 'checklist-editor-row';

    const checkbox = document.createElement('div');
    checkbox.className = `checklist-editor-checkbox ${isChecked ? 'checked' : ''}`;
    checkbox.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    checkbox.addEventListener('click', () => {
      const newPrefix = isChecked ? '- [ ] ' : '- [x] ';
      lines[index] = newPrefix + cleanText;
      checklistFocusIndex = index;
      onChange(lines.join('\n'));
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `checklist-editor-input ${isChecked ? 'checked' : ''}`;
    input.value = cleanText;
    input.placeholder = 'List item';

    if (checklistFocusIndex === index) {
      setTimeout(() => {
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
        checklistFocusIndex = null;
      }, 0);
    }

    input.addEventListener('input', () => {
      const prefix = isChecked ? '- [x] ' : '- [ ] ';
      lines[index] = prefix + input.value;
      onChange(lines.join('\n'), true);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lines.splice(index + 1, 0, '- [ ] ');
        checklistFocusIndex = index + 1;
        onChange(lines.join('\n'));
      } else if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        lines.splice(index, 1);
        if (lines.length === 0) lines = ['- [ ] '];
        checklistFocusIndex = Math.max(0, index - 1);
        onChange(lines.join('\n'));
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'checklist-editor-delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      lines.splice(index, 1);
      if (lines.length === 0) lines = ['- [ ] '];
      checklistFocusIndex = Math.max(0, index - 1);
      onChange(lines.join('\n'));
    });

    row.appendChild(checkbox);
    row.appendChild(input);
    row.appendChild(deleteBtn);

    if (isChecked) {
      checkedContainer.appendChild(row);
    } else {
      uncheckedContainer.appendChild(row);
    }
  });

  const addRow = document.createElement('div');
  addRow.className = 'checklist-editor-row';
  addRow.style.opacity = '0.65';

  const addPlus = document.createElement('div');
  addPlus.className = 'checklist-editor-checkbox';
  addPlus.style.borderStyle = 'dashed';
  addPlus.innerHTML = `<span style="font-size: 14px; font-weight: bold; color: var(--text-secondary);">+</span>`;

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'checklist-editor-input';
  addInput.placeholder = 'List item';

  if (checklistFocusIsNew) {
    setTimeout(() => {
      addInput.focus();
      checklistFocusIsNew = false;
    }, 0);
  }

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addInput.value.trim() !== '') {
      e.preventDefault();
      lines.push('- [ ] ' + addInput.value.trim());
      checklistFocusIsNew = true;
      onChange(lines.join('\n'));
    }
  });

  addInput.addEventListener('blur', () => {
    if (addInput.value.trim() !== '') {
      lines.push('- [ ] ' + addInput.value.trim());
      onChange(lines.join('\n'));
    }
  });

  addRow.appendChild(addPlus);
  addRow.appendChild(addInput);
  uncheckedContainer.appendChild(addRow);

  if (checkedRowsCount > 0) {
    const header = document.createElement('div');
    header.className = 'completed-items-header';
    header.innerHTML = `
      <span class="completed-items-toggle-icon">▼</span>
      <span>${checkedRowsCount} completed item${checkedRowsCount > 1 ? 's' : ''}</span>
    `;

    header.addEventListener('click', () => {
      const icon = header.querySelector('.completed-items-toggle-icon');
      const isCollapsed = checkedContainer.classList.toggle('collapsed');
      icon.classList.toggle('collapsed', isCollapsed);
    });

    container.appendChild(header);
    container.appendChild(checkedContainer);
  }
}

export { renderTextWithLinks };

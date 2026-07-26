import { sanitizeRichTextHtml } from './note-types/text-note.js';

const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

let showToastFn = () => {};
let saveModalNoteDraftFn = () => {};

let savedGlassRange = null;
let savedGlassElement = null;

const glassEditorAdapters = {
  open: null,
  save: null,
  close: null,
  flush: null
};
let activeGlassEditorSession = null;

// The modal is the single Glass editing surface.
const GLASS_SURFACE_IDS = Object.freeze({
  modal: { title: 'modal-glass-title', editor: 'modal-glass-editor', workspace: 'modal-glass-workspace', toolbar: 'modal-glass-floating-toolbar' }
});

export function getGlassSurface(mode) {
  const ids = GLASS_SURFACE_IDS[mode];
  if (!ids || typeof document === 'undefined') return null;
  return {
    mode,
    title: document.getElementById(ids.title),
    editor: document.getElementById(ids.editor),
    workspace: document.getElementById(ids.workspace),
    toolbar: document.getElementById(ids.toolbar)
  };
}

export function configureGlassEditorController(adapters = {}) {
  for (const name of Object.keys(glassEditorAdapters)) {
    glassEditorAdapters[name] = typeof adapters[name] === 'function' ? adapters[name] : null;
  }
}

export function setActiveGlassEditorSession(note, kind = note?.isNewDraft ? 'new' : 'edit') {
  activeGlassEditorSession = note
    ? { noteId: note.id ?? null, kind, surface: 'modal' }
    : null;
}

export function clearGlassEditorSession() {
  activeGlassEditorSession = null;
}

export const glassEditorController = Object.freeze({
  openNewNote(note, autoFocus = true) {
    setActiveGlassEditorSession(note, 'new');
    return glassEditorAdapters.open?.(note, autoFocus);
  },
  openExistingNote(note, autoFocus = true) {
    setActiveGlassEditorSession(note, 'edit');
    return glassEditorAdapters.open?.(note, autoFocus);
  },
  saveActiveNote() {
    return glassEditorAdapters.save?.();
  },
  closeEditor() {
    const result = glassEditorAdapters.close?.();
    clearGlassEditorSession();
    return result;
  },
  flushPendingSave() {
    return glassEditorAdapters.flush?.();
  },
  getActiveSurface() {
    return getGlassSurface('modal');
  },
  getSession() {
    return activeGlassEditorSession ? { ...activeGlassEditorSession } : null;
  }
});

export function saveGlassSelection() {
  if (typeof window === 'undefined') return;
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const node = sel.anchorNode;
    const modalSurface = getGlassSurface('modal');
    const modalEditor = modalSurface?.editor;
    const modalTitle = modalSurface?.title;
    
    let activeEl = null;
    if (modalEditor?.contains(node)) activeEl = modalEditor;
    else if (modalTitle?.contains(node)) activeEl = modalTitle;

    if (activeEl) {
      savedGlassRange = sel.getRangeAt(0).cloneRange();
      savedGlassElement = activeEl;
    }
  }
}

export function restoreGlassSelection(mode = null) {
  if (!savedGlassRange || !savedGlassElement || !document.body.contains(savedGlassElement)) {
    const target = getGlassSurface('modal')?.editor;

    if (target) {
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      savedGlassRange = range;
      savedGlassElement = target;
    }
    return;
  }

  savedGlassElement.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedGlassRange);
}

function saveGlassEditorChanges(mode = null) {
  saveModalNoteDraftFn();
}

/** Serialize saved Glass HTML through the same safety boundary as rich previews. */
export function serializeGlassEditor(editor) {
  if (!editor || typeof document === 'undefined') return '';
  const container = document.createElement('div');
  container.innerHTML = editor.innerHTML || '';
  container.querySelectorAll('[data-grid-bound]').forEach(grid => grid.removeAttribute('data-grid-bound'));
  container.querySelectorAll('p.glass-editor-new-line').forEach(line => {
    if (!line.textContent.trim() && !line.querySelector(':not(br)')) line.remove();
  });
  sanitizeRichTextHtml(container, { preserveEditorControls: true });
  return container.innerHTML.trim();
}

/** Load persisted rich content without allowing unsafe markup into the editor. */
export function loadGlassEditorContent(editor, html, { plainText = false } = {}) {
  if (!editor) return;
  if (plainText) {
    editor.textContent = html || '';
  } else {
    const container = document.createElement('div');
    container.innerHTML = html || '';
    sanitizeRichTextHtml(container, { preserveEditorControls: true });
    editor.innerHTML = container.innerHTML;
  }
  win.wireGlassChecklistEvents?.(editor);
  wireGlassImageGrids(editor, editor.id.startsWith('modal-') ? 'modal' : 'creator');
  wireGlassAttachmentBlocks(editor, editor.id.startsWith('modal-') ? 'modal' : 'creator');
  win.updateGlassEmptyState?.(editor);
}

/** Route every programmatic mutation to the active editor's persistence path. */
export function commitGlassEditorChange(mode, { saveSelection = true } = {}) {
  const editor = getGlassSurface(mode)?.editor;
  if (editor) win.updateGlassEmptyState?.(editor);
  if (saveSelection) saveGlassSelection();
  saveGlassEditorChanges(mode);
}
win.commitGlassEditorChange = commitGlassEditorChange;

function stripFontSizesInSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const root = range.commonAncestorContainer;
  const rootElement = root.nodeType === Node.ELEMENT_NODE ? root : root.parentNode;
  
  if (rootElement) {
    const fonts = rootElement.querySelectorAll('font');
    fonts.forEach(font => {
      if (range.intersectsNode(font)) {
        const isAncestor = font.contains(range.startContainer) || font.contains(range.endContainer);
        if (!isAncestor) {
          font.removeAttribute('size');
        }
      }
    });
  }
}

function stripUnderlineStylesInSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const root = range.commonAncestorContainer;
  const rootElement = root.nodeType === Node.ELEMENT_NODE ? root : root.parentNode;
  
  if (rootElement) {
    const styledElements = rootElement.querySelectorAll('[style*="text-decoration"], [style*="underline"]');
    styledElements.forEach(el => {
      if (range.intersectsNode(el)) {
        const isAncestor = el.contains(range.startContainer) || el.contains(range.endContainer);
        if (!isAncestor) {
          el.style.textDecoration = '';
          el.style.textDecorationLine = '';
          if (el.getAttribute('style') === '') {
            el.removeAttribute('style');
          }
        }
      }
    });
  }
}

// Exported to window so it can be called directly from onmousedown inside HTML
win.execGlassCmd = function(cmd, val = null, mode = null) {
  restoreGlassSelection(mode);
  if (cmd === 'underline') {
    stripUnderlineStylesInSelection();
  }
  
  if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
    const mode = savedGlassElement && (savedGlassElement.closest('#modal-glass-editor') !== null || savedGlassElement.id === 'modal-glass-editor') ? 'modal' : 'creator';
    const editor = document.getElementById(`${mode}-glass-editor`);
    if (editor) {
      const items = getConvertibleItems(editor);
      const hasChecklist = items.some(item => item.element && item.element.nodeType === Node.ELEMENT_NODE && item.element.classList.contains('checklist-item'));
      if (hasChecklist) {
        const listTag = cmd === 'insertUnorderedList' ? 'ul' : 'ol';
        const list = document.createElement(listTag);
        
        const firstEl = items[0].element;
        const insertParent = firstEl.parentNode === editor ? editor : firstEl.parentNode;
        insertParent.insertBefore(list, firstEl);
        
        items.forEach(item => {
          const li = document.createElement('li');
          li.innerText = item.text;
          list.appendChild(li);
          
          if (item.parentList) {
            item.element.remove();
            if (item.parentList.children.length === 0) {
              item.parentList.remove();
            }
          } else {
            item.element.remove();
          }
        });
        
        const firstLi = list.querySelector('li');
        if (firstLi) {
          firstLi.focus();
          const range = document.createRange();
          range.selectNodeContents(firstLi);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        
        saveGlassSelection();
        saveGlassEditorChanges(mode);
        return;
      }
    }
  }

  document.execCommand(cmd, false, val);
  saveGlassSelection();
  saveGlassEditorChanges(mode);
};

win.updateGlassEmptyState = function(el) {
  if (el) {
    el.classList.toggle('is-empty', el.textContent.trim() === '');
  }
};

win.toggleGlassColorPopup = function(mode, anchorBtn = null) {
  saveGlassSelection();
  const p = document.getElementById(`${mode}-glass-color-popup`);
  if (!p) return;
  
  const isOpening = p.style.display !== 'flex';
  p.style.display = isOpening ? 'flex' : 'none';
  
  if (anchorBtn) {
    anchorBtn.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
    anchorBtn.setAttribute('aria-controls', `${mode}-glass-color-popup`);
  }

  if (isOpening && anchorBtn) {
    const btnRect = anchorBtn.getBoundingClientRect();
    const popupH = p.offsetHeight || 130;
    const margin = 8;
    
    let top = btnRect.top - popupH - margin;
    if (top < margin) {
      top = btnRect.bottom + margin; // Flip below if too close to top
    }
    
    let left = btnRect.left + (btnRect.width / 2);
    
    p.style.position = 'fixed';
    p.style.top = `${top}px`;
    p.style.left = `${left}px`;
    p.style.bottom = 'auto'; // override CSS
    p.style.transform = 'translateX(-50%)'; // center horizontally over the point
  }

  // Dismiss link popover if open
  const linkPopover = document.getElementById(`${mode}-glass-link-popover`);
  if (linkPopover) linkPopover.style.display = 'none';
};

win.applyGlassHighlight = function(color) {
  restoreGlassSelection();
  const value = color || 'transparent';
  // Chromium uses hiliteColor while older WebViews expose backColor.
  // Trying both keeps installed tablet PWAs and desktop browsers consistent.
  const applied = document.execCommand('hiliteColor', false, value);
  if (!applied) document.execCommand('backColor', false, value);
  saveGlassSelection();
  saveGlassEditorChanges();
  
  const modalPopup = document.getElementById('modal-glass-color-popup');
  if (modalPopup) modalPopup.style.display = 'none';
};

win.applyGlassTextColor = function(color) {
  restoreGlassSelection();
  if (color) {
    document.execCommand('foreColor', false, color);
  } else {
    document.execCommand('foreColor', false, 'inherit');
  }
  saveGlassSelection();
  saveGlassEditorChanges();
  
  const modalPopup = document.getElementById('modal-glass-color-popup');
  if (modalPopup) modalPopup.style.display = 'none';
};

win.wireGlassChecklistEvents = function(container) {
  if (!container) return;
  container.querySelectorAll('.checklist-item').forEach(item => {
    item.setAttribute('contenteditable', 'false');
    
    const dragHandle = item.querySelector('.checklist-drag-handle');
    if (dragHandle) {
      dragHandle.setAttribute('contenteditable', 'false');
    }
    
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.setAttribute('contenteditable', 'false');
      const isChecked = checkbox.checked || checkbox.hasAttribute('checked');
      checkbox.checked = isChecked;
      item.classList.toggle('checked', isChecked);
      
      if (!checkbox._listenerBound) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          if (checkbox.checked) {
            checkbox.setAttribute('checked', 'checked');
          } else {
            checkbox.removeAttribute('checked');
          }
          item.classList.toggle('checked', checkbox.checked);
          
          const isModal = item.closest('#modal-glass-editor') !== null;
          if (isModal) {
            saveModalNoteDraftFn();
          } else {
            saveModalNoteDraftFn();
          }
        });
        checkbox._listenerBound = true;
      }
    }
    
    const delBtn = item.querySelector('.checklist-delete-btn');
    if (delBtn) {
      delBtn.setAttribute('contenteditable', 'false');
      if (!delBtn._listenerBound) {
        delBtn.addEventListener('click', () => {
          item.remove();
          const isModal = item.closest('#modal-glass-editor') !== null;
          if (isModal) {
            saveModalNoteDraftFn();
          } else {
            saveModalNoteDraftFn();
          }
        });
        delBtn._listenerBound = true;
      }
    }

    const span = item.querySelector('span[contenteditable]');
    if (span) {
      span.setAttribute('contenteditable', 'true');
    }
    
    initGlassDrag(item);
  });
};

function getSelectedBlocks(editor) {
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  const blocks = [];
  
  if (sel.isCollapsed) {
    let node = sel.anchorNode;
    while (node && node !== editor) {
      if (node.parentNode === editor) {
        return [node];
      }
      node = node.parentNode;
    }
    return [];
  }
  
  for (let child of editor.childNodes) {
    if (range.intersectsNode(child)) {
      blocks.push(child);
    }
  }
  
  return blocks;
}

function getConvertibleItems(editor) {
  const blocks = getSelectedBlocks(editor);
  const items = [];
  
  blocks.forEach(block => {
    if (block.nodeType === Node.TEXT_NODE) {
      if (block.textContent.trim() !== '') {
        items.push({
          text: block.textContent.trim(),
          element: block
        });
      }
    } else if (block.nodeType === Node.ELEMENT_NODE) {
      const tagName = block.tagName.toLowerCase();
      if (tagName === 'ul' || tagName === 'ol') {
        const sel = window.getSelection();
        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        const lis = block.querySelectorAll('li');
        lis.forEach(li => {
          if (!range || range.intersectsNode(li)) {
            items.push({
              text: li.innerText || li.textContent || '',
              element: li,
              parentList: block
            });
          }
        });
      } else if (block.classList.contains('checklist-item')) {
        const span = block.querySelector('span[contenteditable]');
        items.push({
          text: span ? span.innerText : (block.innerText || ''),
          element: block
        });
      } else {
        items.push({
          text: block.innerText || block.textContent || '',
          element: block
        });
      }
    }
  });
  
  return items;
}

win.addGlassChecklist = function(mode) {
  restoreGlassSelection(mode);
  const sel = window.getSelection();
  const editor = document.getElementById(`${mode}-glass-editor`);
  if (!editor) return;

  const items = getConvertibleItems(editor);
  
  if (items.length === 0) {
    // If nothing selected, insert an empty checklist item at cursor
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.innerHTML = `
        <div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)">
                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
        </div>
        <input type="checkbox">
        <span contenteditable="true"></span>
        <button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;
    
    let block = null;
    if (sel.rangeCount > 0) {
      let node = sel.anchorNode;
      while (node && node !== editor) {
        if (node.parentNode === editor) {
          block = node;
          break;
        }
        node = node.parentNode;
      }
    }
    
    if (block && editor.contains(block)) {
      editor.replaceChild(div, block);
    } else {
      editor.appendChild(div);
    }
    
    window.wireGlassChecklistEvents(editor);
    saveGlassEditorChanges(mode);
    
    const span = div.querySelector('span[contenteditable]');
    if (span) {
      span.focus();
    }
    return;
  }

  // Convert selected blocks to checklist items
  const createdItems = [];
  items.forEach(item => {
    if (item.element.classList.contains('checklist-item')) {
      createdItems.push(item.element);
      return;
    }
    
    const newItem = document.createElement('div');
    newItem.className = 'checklist-item';
    newItem.innerHTML = `
        <div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)">
                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
        </div>
        <input type="checkbox">
        <span contenteditable="true">${item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
        <button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;
    
    const parent = item.element.parentNode;
    if (parent === editor) {
      editor.replaceChild(newItem, item.element);
    } else if (item.parentList) {
      item.parentList.parentNode.insertBefore(newItem, item.parentList.nextSibling);
      item.element.remove();
      if (item.parentList.children.length === 0) {
        item.parentList.remove();
      }
    } else {
      parent.replaceChild(newItem, item.element);
    }
    createdItems.push(newItem);
  });

  window.wireGlassChecklistEvents(editor);
  saveGlassEditorChanges(mode);

  // Focus the last created item's span
  if (createdItems.length > 0) {
    const lastItem = createdItems[createdItems.length - 1];
    const span = lastItem.querySelector('span[contenteditable]');
    if (span) {
      span.focus();
      const range = document.createRange();
      range.selectNodeContents(span);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
};

function initGlassDrag(el) {
  const handle = el.querySelector('.checklist-drag-handle') || el;
  if (!handle._dragBound) {
    handle.addEventListener('dragstart', (e) => {
      el.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.setDragImage(el, 10, 10);
      }
    });
    handle.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      const isModal = el.closest('#modal-glass-editor') !== null;
      if (isModal) {
        saveModalNoteDraftFn();
      } else {
        saveModalNoteDraftFn();
      }
    });
    handle._dragBound = true;
  }
}

win.toggleGlassLinkPopover = function(mode, anchorBtn = null) {
  saveGlassSelection();
  const popover = document.getElementById(`${mode}-glass-link-popover`);
  if (!popover) return;
  const input = document.getElementById(`${mode}-glass-link-input`);
  const isOpening = !popover.classList.contains('visible');
  
  if (anchorBtn) {
    anchorBtn.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
    anchorBtn.setAttribute('aria-controls', `${mode}-glass-link-popover`);
  }

  if (!isOpening) {
    popover.classList.remove('visible');
    popover.setAttribute('aria-hidden', 'true');
  } else {
    // Dismiss color popup if open
    const colorPopup = document.getElementById(`${mode}-glass-color-popup`);
    if (colorPopup) colorPopup.style.display = 'none';
    
    popover.classList.add('visible');
    popover.setAttribute('aria-hidden', 'false');
    
    restoreGlassSelection(mode);
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      let node = sel.anchorNode;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const anchor = node.closest('a');
      if (anchor && input) {
        input.value = anchor.getAttribute('href') || '';
      } else if (input) {
        input.value = '';
      }
    }
    if (input) {
      input.focus();
      input.select();
    }
  }
};

win.submitGlassLink = function(mode) {
  const popover = document.getElementById(`${mode}-glass-link-popover`);
  const input = document.getElementById(`${mode}-glass-link-input`);
  if (!popover || !input) return;
  
  const rawUrl = input.value.trim();
  popover.classList.remove('visible');
  popover.setAttribute('aria-hidden', 'true');
  
  restoreGlassSelection(mode);
  if (!rawUrl) {
    document.execCommand('unlink', false, null);
  } else {
    const url = normalizeGlassUrl(rawUrl);
    if (url) {
      document.execCommand('createLink', false, url);
    } else {
      showToastFn({ title: 'Invalid URL', text: "That doesn't look like a valid URL." });
    }
  }
  saveGlassSelection();
  saveGlassEditorChanges(mode);
};

win.closeGlassLinkModal = function(mode = 'modal') {
  const modal = document.getElementById(`${mode}-glass-link-popover`);
  modal?.classList.remove('visible');
  modal?.setAttribute('aria-hidden', 'true');
};

const GLASS_URL_PATTERN = /((https?:\/\/|www\.)[^\s<]+| [a-zA-Z0-9-]+\.(com|net|org|io|dev|app|co)(\/[^\s<]*)?)/gi;

function normalizeGlassUrl(raw) {
  let url = (raw || '').trim();
  if (!url) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
    return url;
  } catch (e) {
    return null;
  }
}

function linkifyGlassTextNode(node) {
  const text = node.textContent;
  const matches = [...text.matchAll(GLASS_URL_PATTERN)];
  if (!matches.length) return;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    const url = normalizeGlassUrl(match[0]);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = match[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      frag.appendChild(a);
    } else {
      frag.appendChild(document.createTextNode(match[0]));
    }
    lastIndex = end;
  });
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.replaceWith(frag);
}

function linkifyGlassElement(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      return n.parentElement?.closest('a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(linkifyGlassTextNode);
}

// Canvas Compression
const MAX_GLASS_IMAGE_WIDTH = 800;
const GLASS_JPEG_QUALITY = 0.82;
const TARGET_GLASS_MAX_BYTES = 150 * 1024;

function estimateGlassBase64Bytes(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  return Math.round((dataUrl.length - commaIdx - 1) * 0.75);
}

function hasGlassTransparency(ctx, w, h) {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4 * 97) {
      if (data[i] < 255) return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

function compressGlassImage(img, file) {
  let width = Math.round(Math.min(img.width, MAX_GLASS_IMAGE_WIDTH));
  let height = Math.round(img.height * (width / img.width));
  let quality = GLASS_JPEG_QUALITY;
  let qualityReduced = false;
  let dataUrl = '';
  let keepPng = false;

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    keepPng = file.type === 'image/png' && hasGlassTransparency(ctx, width, height);
    const outputType = keepPng ? 'image/png' : 'image/jpeg';
    dataUrl = canvas.toDataURL(outputType, quality);

    if (estimateGlassBase64Bytes(dataUrl) <= TARGET_GLASS_MAX_BYTES) break;
    if (width <= 320 && quality <= 0.4) break;

    if (keepPng || quality <= 0.4) {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    } else {
      quality = Math.max(0.4, quality - 0.12);
      qualityReduced = true;
    }
  }

  return { dataUrl, width, qualityReduced };
}

function focusAfterImageGrid(grid) {
  let next = grid.nextElementSibling;
  if (!next || !next.classList.contains('glass-image-grid-following-line')) {
    next = document.createElement('p');
    next.className = 'glass-image-grid-following-line';
    next.appendChild(document.createElement('br'));
    grid.insertAdjacentElement('afterend', next);
  }
  next.focus();
  const range = document.createRange();
  range.selectNodeContents(next);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function wireGlassImageGrid(grid, mode) {
  if (!grid || grid._glassGridBound) return;
  // Listener state is runtime-only. A data-* marker would be serialized into
  // the note and incorrectly suppress rebinding after a reload.
  grid.removeAttribute('data-grid-bound');
  grid._glassGridBound = true;
  grid.addEventListener('click', (event) => {
    const tile = event.target.closest('.glass-image-grid-tile');
    if (!tile) return;
    event.preventDefault();
    event.stopPropagation();
    const tiles = [...grid.querySelectorAll('.glass-image-grid-tile')];
    const index = tiles.indexOf(tile);
    const photos = tiles.map((item, itemIndex) => {
      const image = item.querySelector('img');
      return {
        src: image?.src || '',
        name: image?.alt || `Photo ${itemIndex + 1}`,
        onDelete: () => {
          item.remove();
          if (!grid.querySelector('.glass-image-grid-tile')) grid.remove();
          commitGlassEditorChange(mode, { saveSelection: false });
        },
        onReorder: (fromIndex, toIndex) => {
          const currentTiles = [...grid.querySelectorAll('.glass-image-grid-tile')];
          const source = currentTiles[fromIndex];
          const target = currentTiles[toIndex];
          if (!source || !target || source === target) return;
          grid.insertBefore(source, fromIndex < toIndex ? target.nextSibling : target);
          commitGlassEditorChange(mode, { saveSelection: false });
        }
      };
    });
    window.openPhotoLightbox?.(index, photos, tile);
  });
}

function wireGlassImageGrids(container, mode) {
  container?.querySelectorAll('.glass-image-grid').forEach(grid => wireGlassImageGrid(grid, mode));
}

function insertImageIntoGlassGrid(editor, src, mode) {
  const selection = window.getSelection();
  const selectionElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement;
  const selectedGrid = selectionElement?.closest?.('.glass-image-grid');
  const precedingGrid = selectionElement?.closest?.('.glass-image-grid-following-line')?.previousElementSibling;
  const grid = selectedGrid || (precedingGrid?.matches('.glass-image-grid') ? precedingGrid : null) || document.createElement('div');
  if (!selectedGrid && !precedingGrid?.matches('.glass-image-grid')) {
    grid.className = 'glass-image-grid';
    grid.contentEditable = 'false';
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(grid);
    } else {
      editor.appendChild(grid);
    }
  }
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'glass-image-grid-tile';
  tile.contentEditable = 'false';
  const image = document.createElement('img');
  image.src = src;
  image.alt = 'Inserted photo';
  image.decoding = 'async';
  tile.appendChild(image);
  grid.appendChild(tile);
  wireGlassImageGrid(grid, mode);
  focusAfterImageGrid(grid);
}

function focusAfterGlassAttachment(block) {
  const paragraph = document.createElement('p');
  paragraph.className = 'glass-attachment-following-line';
  paragraph.appendChild(document.createElement('br'));
  block.insertAdjacentElement('afterend', paragraph);
  paragraph.focus();
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function createGlassAttachmentBlock(attachment, kind) {
  const block = document.createElement('div');
  block.className = `glass-attachment-block glass-attachment-block--${kind}`;
  block.contentEditable = 'false';
  block.dataset.attachmentKind = kind;
  block.dataset.attachmentId = String(attachment.id);

  const icon = document.createElement('span');
  icon.className = 'glass-attachment-icon';
  icon.textContent = kind === 'audio' ? 'AUDIO' : (String(attachment.name || 'FILE').split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
  const copy = document.createElement('span');
  copy.className = 'glass-attachment-copy';
  const name = document.createElement('strong');
  name.textContent = attachment.name || (kind === 'audio' ? 'Voice note' : 'Attachment');
  const meta = document.createElement('small');
  meta.textContent = kind === 'audio' ? (attachment.duration || 'Voice recording') : (attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : 'File attachment');
  copy.append(name, meta);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'glass-attachment-action';
  action.dataset.glassAttachmentAction = kind === 'audio' ? 'play' : 'download';
  action.setAttribute('aria-label', kind === 'audio' ? 'Play voice note' : 'Download attachment');
  action.textContent = kind === 'audio' ? 'Play' : 'Download';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'glass-attachment-remove';
  remove.dataset.glassAttachmentAction = 'remove';
  remove.setAttribute('aria-label', 'Remove attachment');
  remove.textContent = '×';
  block.append(icon, copy, action, remove);
  return block;
}

export function insertGlassAttachmentBlock(editor, attachment, kind = 'file', mode = 'modal') {
  if (!editor || !attachment?.id) return;
  const block = createGlassAttachmentBlock(attachment, kind);
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (range && editor.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    range.insertNode(block);
  } else {
    editor.appendChild(block);
  }
  wireGlassAttachmentBlocks(editor, mode);
  focusAfterGlassAttachment(block);
}

function wireGlassAttachmentBlocks(container, mode) {
  container?.querySelectorAll('.glass-attachment-block').forEach(block => {
    if (block._glassAttachmentBound) return;
    block._glassAttachmentBound = true;
    block.addEventListener('click', async event => {
      const button = event.target.closest('[data-glass-attachment-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const kind = block.dataset.attachmentKind;
      const id = block.dataset.attachmentId;
      const action = button.dataset.glassAttachmentAction;
      if (action === 'remove') {
        await win.removeGlassAttachment?.(kind, id);
        const paragraph = document.createElement('p');
        paragraph.className = 'glass-attachment-following-line';
        paragraph.appendChild(document.createElement('br'));
        block.insertAdjacentElement('afterend', paragraph);
        block.remove();
        paragraph.focus();
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        commitGlassEditorChange(mode, { saveSelection: false });
        return;
      }
      const src = await win.resolveGlassAttachmentSrc?.(kind, id);
      if (!src) return;
      if (action === 'play') {
        const audio = block._glassAudio || new Audio(src);
        block._glassAudio = audio;
        if (audio.paused) {
          await audio.play();
          button.textContent = 'Pause';
          block.classList.add('is-playing');
        } else {
          audio.pause();
          button.textContent = 'Play';
          block.classList.remove('is-playing');
        }
        audio.onended = () => { button.textContent = 'Play'; block.classList.remove('is-playing'); };
      } else {
        const link = document.createElement('a');
        link.href = src;
        link.download = block.querySelector('strong')?.textContent || 'attachment';
        link.click();
      }
    });
  });
}

win.handleGlassImage = function(input, mode) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const result = compressGlassImage(img, file);
      restoreGlassSelection();
      const replaceTarget = win[`_glassReplaceImg_${mode}`];
      if (replaceTarget?.isConnected) {
        replaceTarget.src = result.dataUrl;
        delete win[`_glassReplaceImg_${mode}`];
      } else {
        const editor = document.getElementById(`${mode}-glass-editor`);
        if (editor) insertImageIntoGlassGrid(editor, result.dataUrl, mode);
      }
      const editor = document.getElementById(`${mode}-glass-editor`);
      if (editor) {
        editor.querySelectorAll('img').forEach(imageEl => {
          imageEl.decoding = 'async';
        });
      }
      commitGlassEditorChange(mode);
      const finalKb = Math.round(estimateGlassBase64Bytes(result.dataUrl) / 1024);
      showToastFn({
        title: 'Image Added',
        text: `Image optimized to ~${finalKb}KB (${result.width}px wide)`
      });
    };
    img.onerror = () => showToastFn({ title: 'Upload Failed', text: 'Could not read that image file.' });
    img.src = e.target.result;
  };
  reader.onerror = () => showToastFn({ title: 'Upload Failed', text: 'Could not read that image file.' });
  reader.readAsDataURL(file);
  input.value = '';
};

win.execGlassHeading = function(mode) {
  restoreGlassSelection(mode);
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return;
  
  let node = sel.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  
  const editor = document.getElementById(`${mode}-glass-editor`);
  if (!editor || !editor.contains(node)) return;
  
  let currentBlock = node;
  while (currentBlock && currentBlock !== editor && !['DIV', 'P', 'H1', 'H2', 'H3'].includes(currentBlock.tagName)) {
    currentBlock = currentBlock.parentNode;
  }
  
  let targetTag = 'h1';
  if (currentBlock && currentBlock !== editor) {
    const tag = currentBlock.tagName.toLowerCase();
    if (tag === 'h1') targetTag = 'h2';
    else if (tag === 'h2') targetTag = 'h3';
    else if (tag === 'h3') targetTag = 'p';
    else targetTag = 'h1';
  }
  
  document.execCommand('formatBlock', false, `<${targetTag}>`);
  
  const label = document.getElementById(`${mode}-glass-heading-label`);
  if (label) {
    label.textContent = targetTag === 'p' ? 'H' : targetTag.toUpperCase();
  }
  
  saveGlassSelection();
  saveGlassEditorChanges(mode);
};

win.execGlassFontSize = function(mode) {
  restoreGlassSelection(mode);
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return;
  
  const editor = document.getElementById(`${mode}-glass-editor`);
  if (!editor || !editor.contains(sel.anchorNode)) return;
  
  let node = sel.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  
  let size = 'normal';
  const fontTag = node.closest('font[size]');
  if (fontTag) {
    const currentSize = fontTag.getAttribute('size');
    if (currentSize === '2') size = 'large';
    else if (currentSize === '4') size = 'normal';
    else size = 'small';
  } else {
    size = 'small';
  }
  
  stripFontSizesInSelection();
  
  const browserSize = size === 'small' ? '2' : (size === 'large' ? '4' : '3');
  document.execCommand('fontSize', false, browserSize);
  
  const label = document.getElementById(`${mode}-glass-size-label`);
  if (label) {
    label.textContent = size === 'small' ? 'A↓' : (size === 'large' ? 'A↑' : 'A');
  }
  
  saveGlassSelection();
  saveGlassEditorChanges(mode);
};

let autoHideTimers = {};
let _glassListenersInitialized = false;

function isAttachmentDeletionAttempt(editor, range, key) {
  const blocks = [...editor.querySelectorAll('.glass-attachment-block')];
  if (!blocks.length) return false;
  if (!range.collapsed) return blocks.some(block => range.intersectsNode(block));

  const adjacentBlock = (from, direction) => {
    let node = from.nodeType === Node.ELEMENT_NODE ? from : from.parentElement;
    while (node && node !== editor) {
      const sibling = direction < 0 ? node.previousElementSibling : node.nextElementSibling;
      if (sibling) return sibling;
      node = node.parentElement;
    }
    return null;
  };

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const sibling = key === 'Backspace'
      ? range.startContainer.childNodes[range.startOffset - 1]
      : range.startContainer.childNodes[range.startOffset];
    return sibling?.nodeType === Node.ELEMENT_NODE && sibling.classList.contains('glass-attachment-block');
  }

  if (key === 'Backspace' && range.startOffset === 0) {
    return adjacentBlock(range.startContainer, -1)?.classList.contains('glass-attachment-block');
  }
  if (key === 'Delete' && range.startOffset === range.startContainer.textContent.length) {
    return adjacentBlock(range.startContainer, 1)?.classList.contains('glass-attachment-block');
  }
  return false;
}

export function initModernGlassEditorListeners(callbacks = {}) {
  if (callbacks.showToast) showToastFn = callbacks.showToast;
  if (callbacks.saveModalNoteDraft) saveModalNoteDraftFn = callbacks.saveModalNoteDraft;

  if (_glassListenersInitialized) return;
  _glassListenersInitialized = true;

  const ids = ['modal'];
  ids.forEach(mode => {
    const surface = getGlassSurface(mode);
    const title = surface?.title;
    const editor = surface?.editor;
    
    if (title && editor) {
      // Empty state checks and autosave triggers
      title.addEventListener('input', () => {
        window.updateGlassEmptyState(title);
        if (mode === 'creator') {
          saveModalNoteDraftFn();
        } else {
          saveModalNoteDraftFn();
        }
      });
      editor.addEventListener('input', () => {
        window.updateGlassEmptyState(editor);
        if (mode === 'creator') {
          saveModalNoteDraftFn();
        } else {
          saveModalNoteDraftFn();
        }
      });
      
      // Enter in title moves to editor
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          editor.focus();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });

      // Save selection
      [title, editor].forEach(field => {
        field.addEventListener('keyup', saveGlassSelection);
        field.addEventListener('mouseup', saveGlassSelection);
      });

      // Paste clean plain text & linkify
      editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const clipboardText = e.clipboardData.getData('text/plain') || '';
        document.execCommand('insertText', false, clipboardText);
        setTimeout(() => {
          linkifyGlassElement(editor);
          saveGlassEditorChanges(mode);
        }, 0);
      });

      // Drag checklist items sorting
      editor.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = editor.querySelector('.dragging');
        if (!dragging) return;
        const after = [...editor.querySelectorAll('.checklist-item:not(.dragging)')].find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight/2);
        if (!after) editor.appendChild(dragging);
        else editor.insertBefore(dragging, after);
      });
      
      // Toolbar auto-hide while typing
      editor.addEventListener('keydown', (e) => {
        const currentSelection = window.getSelection();
        const currentRange = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null;
        if ((e.key === 'Backspace' || e.key === 'Delete') && currentRange && isAttachmentDeletionAttempt(editor, currentRange, e.key)) {
          e.preventDefault();
          showToastFn({ title: 'Attachment protected', text: 'Use the attachment’s remove button to delete it.' });
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertHTML', false, '&#160;&#160;&#160;&#160;');
          saveGlassEditorChanges(mode);
          return;
        }

        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') {
          const toolbar = document.getElementById(`${mode}-glass-floating-toolbar`);
          if (toolbar && !toolbar.classList.contains('toolbar-hidden')) {
            toolbar.classList.add('toolbar-hidden');
          }
          const linkPopover = document.getElementById(`${mode}-glass-link-popover`);
          if (linkPopover) linkPopover.style.display = 'none';
          const colorPopup = document.getElementById(`${mode}-glass-color-popup`);
          if (colorPopup) colorPopup.style.display = 'none';
        }

        // Checklist delegated keydown handling
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        
        let item = null;
        let node = range.startContainer;
        while (node && node !== editor) {
          if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('checklist-item')) {
            item = node;
            break;
          }
          node = node.parentNode;
        }

        if (!item) return;

        const span = item.querySelector('span[contenteditable]');
        if (!span) return;

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = span.innerText;
          let offset = 0;
          try {
            if (span.contains(range.startContainer)) {
              const preRange = range.cloneRange();
              preRange.selectNodeContents(span);
              preRange.setEnd(range.startContainer, range.startOffset);
              offset = preRange.toString().length;
            } else {
              offset = text.length;
            }
          } catch (err) {}

          const textBefore = text.substring(0, offset);
          const textAfter = text.substring(offset);

          span.innerText = textBefore;

          const newItem = document.createElement(item.tagName.toLowerCase());
          newItem.className = 'checklist-item';
          newItem.innerHTML = `
              <div class="checklist-drag-handle" draggable="true" style="flex:0 0 auto; margin-top:6px; display:flex; align-items:center; justify-content:center;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.3)">
                      <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                      <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                  </svg>
              </div>
              <input type="checkbox">
              <span contenteditable="true">${textAfter.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
              <button type="button" class="checklist-delete-btn" title="Delete task" onmousedown="event.preventDefault()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
          `;

          item.parentNode.insertBefore(newItem, item.nextSibling);
          window.wireGlassChecklistEvents(editor);

          const newSpan = newItem.querySelector('span[contenteditable]');
          if (newSpan) {
            newSpan.focus();
            const newRange = document.createRange();
            newRange.selectNodeContents(newSpan);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }

          saveGlassEditorChanges(mode);
        } else if (e.key === 'Backspace') {
          let isAtStart = false;
          try {
            if (span.contains(range.startContainer)) {
              const preRange = range.cloneRange();
              preRange.selectNodeContents(span);
              preRange.setEnd(range.startContainer, range.startOffset);
              isAtStart = preRange.toString().length === 0;
            } else {
              isAtStart = range.startOffset === 0;
            }
          } catch (err) {}

          if (isAtStart && range.collapsed) {
            e.preventDefault();
            const prevItem = item.previousElementSibling;
            if (prevItem && prevItem.classList.contains('checklist-item')) {
              // Merge into previous checklist item
              const prevSpan = prevItem.querySelector('span[contenteditable]');
              if (prevSpan) {
                const prevText = prevSpan.innerText;
                const currentText = span.innerText;
                prevSpan.innerText = prevText + currentText;

                item.remove();
                prevSpan.focus();

                const newRange = document.createRange();
                if (prevSpan.childNodes.length > 0) {
                  let textNode = prevSpan.childNodes[0];
                  newRange.setStart(textNode, prevText.length);
                  newRange.setEnd(textNode, prevText.length);
                } else {
                  newRange.selectNodeContents(prevSpan);
                  newRange.collapse(false);
                }
                selection.removeAllRanges();
                selection.addRange(newRange);

                saveGlassEditorChanges(mode);
              }
            } else {
              // Convert checklist item back to normal tag
              const text = span.innerText;
              const p = document.createElement(item.tagName.toLowerCase() === 'li' ? 'li' : 'div');
              if (p.tagName.toLowerCase() === 'li') {
                p.className = 'plain-list-item';
              }
              p.innerText = text || '\n';
              item.parentNode.replaceChild(p, item);
              p.focus();

              const newRange = document.createRange();
              newRange.selectNodeContents(p);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);

              saveGlassEditorChanges(mode);
            }
          }
        }
      });
      
      editor.addEventListener('keyup', () => {
        const toolbar = document.getElementById(`${mode}-glass-floating-toolbar`);
        if (toolbar) {
          clearTimeout(autoHideTimers[mode]);
          autoHideTimers[mode] = setTimeout(() => {
            toolbar.classList.remove('toolbar-hidden');
          }, 800);
        }
      });
      
      window.wireGlassChecklistEvents(editor);
    }
  });

  // Track selection and toolbar states throttled with requestAnimationFrame
  let selectionScheduled = false;
  document.addEventListener('selectionchange', () => {
    if (selectionScheduled) return;
    selectionScheduled = true;
    requestAnimationFrame(() => {
      selectionScheduled = false;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const node = sel.anchorNode;
      if (!node) return;
      
      const modalEditor = document.getElementById('modal-glass-editor');
      const modalTitle = document.getElementById('modal-glass-title');
      
      const isModalActive = modalEditor?.contains(node) || modalTitle?.contains(node);
      if (!isModalActive) return;

      saveGlassSelection();

      const activeMode = 'modal';

      const toolbarId = `${activeMode}-glass-floating-toolbar`;
      const toolbar = document.getElementById(toolbarId);
      if (toolbar) {
        if (!sel.isCollapsed && sel.toString().trim().length > 0) {
          clearTimeout(autoHideTimers[activeMode]);
          toolbar.classList.remove('toolbar-hidden');
          toolbar.classList.add('selection-active');
        } else {
          toolbar.classList.remove('selection-active');
        }

        toolbar.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
          const cmd = btn.dataset.cmd;
          let active = false;
          try { active = document.queryCommandState(cmd); } catch (e) {}
          if (btn.classList.contains('active') !== active) {
            btn.classList.toggle('active', active);
          }
        });
        
        let headingLabel = 'H';
        let parentNode = node;
        if (parentNode.nodeType === Node.TEXT_NODE) parentNode = parentNode.parentNode;
        const hTag = parentNode.closest('h1, h2, h3');
        if (hTag) {
          headingLabel = hTag.tagName;
        }
        const headingLabelEl = document.getElementById(`${activeMode}-glass-heading-label`);
        if (headingLabelEl && headingLabelEl.textContent !== headingLabel) {
          headingLabelEl.textContent = headingLabel;
        }
        
        let sizeLabel = 'A';
        const fontTag = parentNode.closest('font[size]');
        if (fontTag) {
          const currentSize = fontTag.getAttribute('size');
          if (currentSize === '2') sizeLabel = 'A↓';
          else if (currentSize === '4') sizeLabel = 'A↑';
        }
        const sizeLabelEl = document.getElementById(`${activeMode}-glass-size-label`);
        if (sizeLabelEl && sizeLabelEl.textContent !== sizeLabel) {
          sizeLabelEl.textContent = sizeLabel;
        }
      }
    });
  });

  // Global dismissals for popups on click outside & Escape key
  document.addEventListener('mousedown', (e) => {
    const ids = ['creator', 'modal'];
    ids.forEach(mode => {
      const linkPopover = document.getElementById(`${mode}-glass-link-popover`);
      const linkBtn = document.querySelector(`#${mode}-glass-floating-toolbar button[title="Insert link"]`);
      if (linkPopover && linkPopover.classList.contains('visible') && !linkPopover.contains(e.target) && !linkBtn?.contains(e.target)) {
        linkPopover.classList.remove('visible');
        linkPopover.setAttribute('aria-hidden', 'true');
        if (linkBtn) linkBtn.setAttribute('aria-expanded', 'false');
      }
      
      const colorPopup = document.getElementById(`${mode}-glass-color-popup`);
      const colorBtn = document.querySelector(`#${mode}-glass-floating-toolbar button[title="Highlight & Text color"]`);
      if (colorPopup && colorPopup.style.display === 'flex' && !colorPopup.contains(e.target) && !colorBtn?.contains(e.target)) {
        colorPopup.style.display = 'none';
        if (colorBtn) colorBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const ids = ['creator', 'modal'];
      ids.forEach(mode => {
        const linkPopover = document.getElementById(`${mode}-glass-link-popover`);
        const linkBtn = document.querySelector(`#${mode}-glass-floating-toolbar button[title="Insert link"]`);
        if (linkPopover && linkPopover.classList.contains('visible')) {
          linkPopover.classList.remove('visible');
          linkPopover.setAttribute('aria-hidden', 'true');
          if (linkBtn) {
            linkBtn.setAttribute('aria-expanded', 'false');
            linkBtn.focus();
          }
        }
        const colorPopup = document.getElementById(`${mode}-glass-color-popup`);
        const colorBtn = document.querySelector(`#${mode}-glass-floating-toolbar button[title="Highlight & Text color"]`);
        if (colorPopup && colorPopup.style.display === 'flex') {
          colorPopup.style.display = 'none';
          if (colorBtn) {
            colorBtn.setAttribute('aria-expanded', 'false');
            colorBtn.focus();
          }
        }
      });
    }
  });
}

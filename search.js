import { getPageNotes, renderGrid, setActiveSidebarPage, openEditModal, scanUniqueTags, showToast, getVisualNoteType } from './app.js';
import { syncNoteToCloudWithQueue, saveSingleNoteToLocalStorage } from './sync.js';

let dedSearchInput, dedSearchClear, searchBrowseSection, searchResultsSection, dedSearchResultsGrid, searchFilterPills, browseCards;
let isTagsExpanded = false;

export function renderSearchPage() {
  const settingsPageEl = document.getElementById('settings-page');
  const prodPageEl = document.getElementById('productivity-page');
  const searchPageEl = document.getElementById('search-page');
  const creatorWrapper = document.querySelector('.creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');

  if (settingsPageEl) settingsPageEl.style.display = 'none';
  if (prodPageEl) prodPageEl.style.display = 'none';
  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (searchPageEl) searchPageEl.style.display = 'flex';

  renderSearchMediaConsolidation();
  renderSearchTags();
  renderDedicatedSearchResults();
  setActiveSidebarPage('search');
}

export function renderSearchTags() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('search-tags-list');
  if (!container) return;

  const tags = typeof scanUniqueTags === 'function' ? scanUniqueTags() : [];
  container.innerHTML = '';

  if (!tags || tags.length === 0) {
    const emptyMsg = document.createElement('span');
    emptyMsg.className = 'empty-tags-text';
    emptyMsg.textContent = 'No tags created yet';
    container.appendChild(emptyMsg);
    return;
  }

  const currentQuery = dedSearchInput ? dedSearchInput.value.toLowerCase().trim() : '';
  let activeTag = '';
  if (currentQuery.startsWith('tag:')) {
    activeTag = currentQuery.substring(4).replace(/^#/, '').trim();
  } else if (currentQuery.startsWith('#')) {
    activeTag = currentQuery.substring(1).trim();
  }

  const INITIAL_TAG_LIMIT = 15;
  const showLimit = isTagsExpanded ? tags.length : Math.min(tags.length, INITIAL_TAG_LIMIT);
  const visibleTags = tags.slice(0, showLimit);

  visibleTags.forEach(tag => {
    const cleanTag = String(tag).replace(/^#/, '').trim();
    const isSelected = activeTag === cleanTag.toLowerCase();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `search-tag-pill${isSelected ? ' active' : ''}`;
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    btn.innerHTML = `<span aria-hidden="true">#</span><span>${escapeHtml(cleanTag)}</span>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dedSearchInput) return;

      if (isSelected) {
        dedSearchInput.value = '';
      } else {
        dedSearchInput.value = `tag:${cleanTag}`;
      }

      const inputWrapper = dedSearchInput.closest('.search-page-input-wrapper');
      const hasVal = dedSearchInput.value.trim() !== '';
      if (dedSearchClear) dedSearchClear.style.display = hasVal ? 'flex' : 'none';
      if (inputWrapper) inputWrapper.classList.toggle('has-value', hasVal);

      renderDedicatedSearchResults();
      renderSearchTags();
    });

    container.appendChild(btn);
  });

  if (tags.length > INITIAL_TAG_LIMIT) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'search-tag-show-more';
    toggleBtn.textContent = isTagsExpanded ? 'Show less' : `Show all (${tags.length})`;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isTagsExpanded = !isTagsExpanded;
      renderSearchTags();
    });
    container.appendChild(toggleBtn);
  }
}

export const searchState = {
  query: '',
  selectedTag: null,
  contentType: 'all',
  sort: 'relevance'
};

export function isImageFile(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || file.fileName || '').toLowerCase();
  const data = (file.data || file.url || file.src || '').toLowerCase();
  return type.startsWith('image/') ||
         data.startsWith('data:image/') ||
         /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(name) ||
         /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(data);
}

export function isAudioFile(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || file.fileName || '').toLowerCase();
  const data = (file.data || file.url || file.src || '').toLowerCase();
  return type.startsWith('audio/') ||
         data.startsWith('data:audio/') ||
         /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(name) ||
         /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(data);
}

export function getPhotoItems(notes) {
  if (!Array.isArray(notes)) return [];
  const items = [];

  notes.forEach(note => {
    if (!note) return;
    const noteTitle = note.title || 'Untitled';
    const noteId = note.id;

    const directProps = [
      { key: 'image', name: 'Note Image' },
      { key: 'sketch', name: 'Sketch' },
      { key: 'coverImage', name: 'Cover Image' },
      { key: 'bannerImage', name: 'Banner Image' }
    ];

    directProps.forEach(prop => {
      if (note[prop.key] && typeof note[prop.key] === 'string') {
        items.push({
          id: `${noteId}_photo_${prop.key}`,
          type: 'photo',
          src: note[prop.key],
          name: prop.name,
          noteId,
          noteTitle,
          note,
          sourceType: prop.key,
          date: note.updatedAt || note.createdAt || ''
        });
      }
    });

    if (Array.isArray(note.files)) {
      note.files.forEach((file, index) => {
        if (isImageFile(file)) {
          const src = file.data || file.url || file.src;
          if (src) {
            items.push({
              id: `${noteId}_photo_file_${index}`,
              type: 'photo',
              src,
              name: file.name || file.fileName || `Photo ${index + 1}`,
              size: file.size || null,
              noteId,
              noteTitle,
              note,
              fileIndex: index,
              sourceType: 'note.files',
              date: file.createdAt || note.updatedAt || ''
            });
          }
        }
      });
    }

    if (note.text) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      let match;
      let imgCount = 0;
      while ((match = imgRegex.exec(note.text)) !== null) {
        items.push({
          id: `${noteId}_photo_html_${imgCount++}`,
          type: 'photo',
          src: match[1],
          name: `Embedded Image ${imgCount}`,
          noteId,
          noteTitle,
          note,
          sourceType: 'embedded_html',
          date: note.updatedAt || note.createdAt || ''
        });
      }

      const mdRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+|\/.*?\.(?:png|jpg|jpeg|gif|webp))\)/gi;
      let mdMatch;
      let mdCount = 0;
      while ((mdMatch = mdRegex.exec(note.text)) !== null) {
        items.push({
          id: `${noteId}_photo_md_${mdCount++}`,
          type: 'photo',
          src: mdMatch[2],
          name: mdMatch[1] || `Embedded Image ${mdCount}`,
          noteId,
          noteTitle,
          note,
          sourceType: 'embedded_md',
          date: note.updatedAt || note.createdAt || ''
        });
      }
    }
  });

  return items;
}

export function getFileItems(notes) {
  if (!Array.isArray(notes)) return [];
  const items = [];

  notes.forEach(note => {
    if (!note || !Array.isArray(note.files)) return;
    const noteTitle = note.title || 'Untitled';
    const noteId = note.id;

    note.files.forEach((file, index) => {
      if (!isImageFile(file) && !isAudioFile(file)) {
        const src = file.data || file.url || file.src;
        items.push({
          id: `${noteId}_file_${index}`,
          type: 'file',
          name: file.name || file.fileName || `Attachment ${index + 1}`,
          fileType: file.type || file.extension || 'file',
          size: file.size || null,
          src: src || '',
          noteId,
          noteTitle,
          note,
          fileIndex: index,
          date: file.createdAt || note.updatedAt || ''
        });
      }
    });
  });

  return items;
}

export function getVoiceItems(notes) {
  if (!Array.isArray(notes)) return [];
  const items = [];

  notes.forEach(note => {
    if (!note) return;
    const noteTitle = note.title || 'Untitled';
    const noteId = note.id;

    if (note.audio && typeof note.audio === 'string') {
      items.push({
        id: `${noteId}_voice_main`,
        type: 'voice',
        name: note.audioName || 'Voice Recording',
        src: note.audio,
        duration: note.audioDuration || null,
        noteId,
        noteTitle,
        note,
        sourceType: 'note.audio',
        date: note.updatedAt || note.createdAt || ''
      });
    }

    if (Array.isArray(note.audioClips)) {
      note.audioClips.forEach((clip, index) => {
        const src = typeof clip === 'string' ? clip : (clip.data || clip.url || clip.src);
        if (typeof src === 'string') {
          items.push({
            id: `${noteId}_voice_clip_${index}`,
            type: 'voice',
            name: (typeof clip === 'object' && clip.name) || `Voice Memo ${index + 1}`,
            src,
            duration: (typeof clip === 'object' && clip.duration) || null,
            noteId,
            noteTitle,
            note,
            clipIndex: index,
            sourceType: 'note.audioClips',
            date: (typeof clip === 'object' && clip.createdAt) || note.updatedAt || ''
          });
        }
      });
    }

    if (Array.isArray(note.files)) {
      note.files.forEach((file, index) => {
        if (isAudioFile(file)) {
          const src = file.data || file.url || file.src;
          if (src) {
            items.push({
              id: `${noteId}_voice_file_${index}`,
              type: 'voice',
              name: file.name || file.fileName || `Audio ${index + 1}`,
              src,
              duration: file.duration || null,
              size: file.size || null,
              noteId,
              noteTitle,
              note,
              fileIndex: index,
              sourceType: 'note.files',
              date: file.createdAt || note.updatedAt || ''
            });
          }
        }
      });
    }
  });

  return items;
}

export function getLinkItems(notes) {
  if (!Array.isArray(notes)) return [];
  const items = [];
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;

  notes.forEach(note => {
    if (!note) return;
    const noteTitle = note.title || 'Untitled';
    const noteId = note.id;
    const seenUrls = new Set();

    if (Array.isArray(note.links)) {
      note.links.forEach((linkObj, index) => {
        const url = typeof linkObj === 'string' ? linkObj : linkObj?.url;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          let domain = 'link';
          try {
            domain = new URL(url).hostname.replace(/^www\./, '');
          } catch (e) {}

          items.push({
            id: `${noteId}_link_obj_${index}`,
            type: 'link',
            url,
            domain,
            title: (typeof linkObj === 'object' && linkObj?.title) || domain,
            description: (typeof linkObj === 'object' && linkObj?.description) || '',
            previewImage: (typeof linkObj === 'object' && linkObj?.image) || null,
            noteId,
            noteTitle,
            note,
            linkIndex: index,
            isStoredAttachment: true,
            date: note.updatedAt || note.createdAt || ''
          });
        }
      });
    }

    if (note.text) {
      let match;
      let urlCount = 0;
      while ((match = urlRegex.exec(note.text)) !== null) {
        const url = match[0].replace(/[.,)!?]+$/, '');
        if (!seenUrls.has(url) && !isImageFile({ url }) && !isAudioFile({ url })) {
          seenUrls.add(url);
          let domain = 'link';
          try {
            domain = new URL(url).hostname.replace(/^www\./, '');
          } catch (e) {}

          items.push({
            id: `${noteId}_link_text_${urlCount++}`,
            type: 'link',
            url,
            domain,
            title: domain,
            description: '',
            previewImage: null,
            noteId,
            noteTitle,
            note,
            isStoredAttachment: false,
            date: note.updatedAt || note.createdAt || ''
          });
        }
      }
    }
  });

  return items;
}

export function getChecklistItems(notes = []) {
  const items = [];
  (notes || []).forEach(note => {
    if (!note) return;
    const isChecklistType = note.type === 'checklist' || (typeof getVisualNoteType === 'function' && getVisualNoteType(note) === 'checklist');
    const text = note.text || '';
    const hasCheckbox = /-\s*\[[ xX]\]/i.test(text) ||
                        /input[^>]*type=["']checkbox["']/i.test(text) ||
                        /checklist-item/i.test(text) ||
                        /checklist-container/i.test(text) ||
                        (Array.isArray(note.checklist) && note.checklist.length > 0);

    if (isChecklistType || hasCheckbox) {
      items.push({
        id: `checklist_${note.id}`,
        type: 'checklist',
        name: note.title || 'Checklist Note',
        noteTitle: note.title || 'Untitled Note',
        note,
        updatedAt: note.updatedAt || note.createdAt || ''
      });
    }
  });
  return items;
}

export function getFilteredContentItems(notes, options = {}) {
  const query = (options.query || searchState.query || '').toLowerCase().trim();
  const selectedTag = options.selectedTag !== undefined ? options.selectedTag : searchState.selectedTag;
  const contentType = options.contentType || searchState.contentType || 'all';

  const filteredNotes = (notes || []).filter(note => {
    if (!note) return false;
    const title = (note.title || '').toLowerCase();
    const text = (note.text || '').toLowerCase();

    if (selectedTag) {
      const cleanTargetTag = String(selectedTag).replace(/^#/, '').toLowerCase().trim();
      const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === cleanTargetTag);
      const hasInText = `${title} ${text}`.includes(`#${cleanTargetTag}`);
      if (!hasInArray && !hasInText) return false;
    }

    if (query) {
      if (query.startsWith('tag:')) {
        const targetTag = query.substring(4).replace(/^#/, '').toLowerCase().trim();
        const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === targetTag);
        const hasInText = `${title} ${text}`.includes(`#${targetTag}`);
        if (!hasInArray && !hasInText) return false;
      } else if (query.startsWith('#')) {
        const targetTag = query.substring(1).toLowerCase().trim();
        const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === targetTag);
        const hasInText = `${title} ${text}`.includes(`#${targetTag}`);
        if (!hasInArray && !hasInText) return false;
      } else {
        const matchesNote = title.includes(query) || text.includes(query) || (note.folder && note.folder.toLowerCase().includes(query));
        const matchesTags = Array.isArray(note.tags) && note.tags.some(t => String(t).toLowerCase().includes(query));
        const matchesFiles = Array.isArray(note.files) && note.files.some(f => (f.name || f.fileName || '').toLowerCase().includes(query));
        if (!matchesNote && !matchesTags && !matchesFiles) return false;
      }
    }

    return true;
  });

  if (contentType === 'checklist' || contentType === 'checklists') {
    return getChecklistItems(filteredNotes);
  } else if (contentType === 'notes') {
    return filteredNotes.map(n => ({ id: n.id, type: 'note', note: n, noteTitle: n.title || 'Untitled', date: n.updatedAt || n.createdAt || '' }));
  } else if (contentType === 'photos') {
    return getPhotoItems(filteredNotes);
  } else if (contentType === 'files') {
    return getFileItems(filteredNotes);
  } else if (contentType === 'voice') {
    return getVoiceItems(filteredNotes);
  } else if (contentType === 'links') {
    return getLinkItems(filteredNotes);
  } else {
    const checklists = getChecklistItems(filteredNotes);
    const photos = getPhotoItems(filteredNotes);
    const files = getFileItems(filteredNotes);
    const voice = getVoiceItems(filteredNotes);
    const links = getLinkItems(filteredNotes);
    return [...checklists, ...photos, ...files, ...voice, ...links];
  }
}

function getNoteImageSrc(note) {
  if (!note) return null;
  if (note.image) return note.image;
  if (note.sketch) return note.sketch;
  if (note.coverImage) return note.coverImage;
  if (note.bannerImage) return note.bannerImage;

  if (Array.isArray(note.files) && note.files.length > 0) {
    const imgFile = note.files.find(f => isImageFile(f));
    if (imgFile) return imgFile.data || imgFile.url || imgFile.src || null;
  }

  if (note.text) {
    const imgMatch = note.text.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) return imgMatch[1];
    const mdMatch = note.text.match(/!\[.*?\]\((https?:\/\/[^\s\)]+|\/.*?\.(?:png|jpg|jpeg|gif|webp))\)/i);
    if (mdMatch) return mdMatch[1];
  }

  return null;
}

function getNoteAudioSrc(note) {
  if (!note) return null;
  if (note.audio) return note.audio;
  if (Array.isArray(note.files) && note.files.length > 0) {
    const audioFile = note.files.find(f => isAudioFile(f));
    if (audioFile) return audioFile.data || audioFile.url || audioFile.src || null;
  }
  return null;
}

function renderSearchMediaConsolidation() {
  const allNotes = getPageNotes('notes');
  const photoNotes = allNotes.filter(n => getNoteImageSrc(n));
  const fileNotes = allNotes.filter(n => getNoteAudioSrc(n) || (Array.isArray(n.files) && n.files.length > 0));
  const linkNotes = allNotes.filter(n => (n.text || '').includes('http'));

  const photosSection = document.getElementById('search-photos-section');
  const filesSection = document.getElementById('search-files-section');
  const linksSection = document.getElementById('search-links-section');

  if (photosSection) {
    photosSection.style.display = photoNotes.length > 0 ? 'flex' : 'none';
    if (photoNotes.length > 0) renderPhotosMediaGrid(document.getElementById('search-photos-grid'), photoNotes);
  }
  if (filesSection) {
    filesSection.style.display = fileNotes.length > 0 ? 'flex' : 'none';
    if (fileNotes.length > 0) renderFilesMediaGrid(document.getElementById('search-files-grid'), fileNotes);
  }
  if (linksSection) {
    linksSection.style.display = linkNotes.length > 0 ? 'flex' : 'none';
    if (linkNotes.length > 0) renderLinksMediaGrid(document.getElementById('search-links-grid'), linkNotes);
  }
}

function renderPhotosMediaGrid(container, photoNotes) {
  if (!container) return;
  container.className = 'photo-media-grid';
  container.innerHTML = '';
  photoNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'photo-media-card';
    const imgSrc = getNoteImageSrc(note) || '';
    const title = note.title || 'Untitled Photo';
    card.innerHTML = `
      <img src="${imgSrc}" class="photo-media-img" alt="${escapeHtml(title)}" loading="lazy">
      <div class="photo-media-overlay">
        <span class="photo-media-title">${escapeHtml(title)}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function renderFilesMediaGrid(container, fileNotes) {
  if (!container) return;
  container.className = 'voice-media-grid';
  container.innerHTML = '';
  fileNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'voice-media-card';
    const title = note.title || 'Voice Memo / File';
    card.innerHTML = `
      <div class="voice-play-btn">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div class="voice-info">
        <span class="voice-title">${escapeHtml(title)}</span>
        <div class="voice-wave-visualizer">
          <div class="voice-wave-bar" style="height: 60%;"></div>
          <div class="voice-wave-bar" style="height: 100%;"></div>
          <div class="voice-wave-bar" style="height: 40%;"></div>
          <div class="voice-wave-bar" style="height: 80%;"></div>
          <div class="voice-wave-bar" style="height: 50%;"></div>
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function renderLinksMediaGrid(container, linkNotes) {
  if (!container) return;
  container.className = 'link-media-grid';
  container.innerHTML = '';
  linkNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'link-media-card';
    const title = note.title || note.text || 'Web Link';
    const match = (note.text || '').match(/https?:\/\/([^\s\/]+)/i);
    const domain = match ? match[1] : 'link';
    const fullUrlMatch = (note.text || '').match(/https?:\/\/[^\s]+/i);
    const fullUrl = fullUrlMatch ? fullUrlMatch[0] : '';
    
    card.innerHTML = `
      <div class="link-header">
        <span class="link-domain-badge">
          <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          ${escapeHtml(domain)}
        </span>
      </div>
      <div class="link-title">${escapeHtml(title)}</div>
      ${fullUrl ? `<div class="link-url-text">${escapeHtml(fullUrl)}</div>` : ''}
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function initSearch() {
  if (typeof document === 'undefined') return;
  dedSearchInput = document.getElementById('dedicated-search-input');
  dedSearchClear = document.getElementById('dedicated-search-clear');
  searchBrowseSection = document.getElementById('search-browse-section');
  searchResultsSection = document.getElementById('search-results-section');
  dedSearchResultsGrid = document.getElementById('dedicated-search-results-grid');

  const genreCards = document.querySelectorAll('.fluid-genre-card[data-type]');

  genreCards.forEach(card => {
    const handleSelect = (e) => {
      e.preventDefault();
      genreCards.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-selected', 'true');

      const targetType = card.dataset.type || 'all';
      searchState.contentType = targetType;

      renderDedicatedSearchResults();
    };

    card.addEventListener('click', handleSelect);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleSelect(e);
      }
    });
  });

  if (dedSearchInput) {
    const inputWrapper = dedSearchInput.closest('.search-page-input-wrapper');
    const updateInputState = () => {
      const hasVal = dedSearchInput.value.trim() !== '';
      if (dedSearchClear) dedSearchClear.style.display = hasVal ? 'flex' : 'none';
      if (inputWrapper) inputWrapper.classList.toggle('has-value', hasVal);
    };

    dedSearchInput.addEventListener('input', () => {
      searchState.query = dedSearchInput.value.trim();
      updateInputState();
      renderDedicatedSearchResults();
      renderSearchTags();
    });

    if (dedSearchClear) {
      dedSearchClear.addEventListener('click', () => {
        dedSearchInput.value = '';
        searchState.query = '';
        updateInputState();
        renderDedicatedSearchResults();
        renderSearchTags();
        dedSearchInput.focus();
      });
    }
  }

  // App-wide Ctrl + K / Cmd + K Shortcut to trigger Search Page & Focus Input
  if (typeof window !== 'undefined' && !window._searchKeydownBound) {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        renderSearchPage();
        const input = document.getElementById('dedicated-search-input');
        if (input) {
          input.focus();
          if (input.value) input.select();
        }
      }
    });
    window._searchKeydownBound = true;
  }

  renderSearchTags();
  renderDedicatedSearchResults();
  initPhotoLightbox();
}

// 🖼️ Phase 4: Photo Lightbox State & Controller
let currentLightboxIndex = 0;
let currentLightboxPhotos = [];
let lightboxOriginElement = null;
let currentZoomScale = 1;
let currentPanX = 0;
let currentPanY = 0;

export function openPhotoLightbox(photoIndex = 0, photosList = [], triggerElement = null) {
  if (typeof document === 'undefined') return;
  lightboxOriginElement = triggerElement || document.activeElement;
  currentLightboxPhotos = Array.isArray(photosList) && photosList.length > 0 ? photosList : [];
  currentLightboxIndex = Math.max(0, Math.min(photoIndex, currentLightboxPhotos.length - 1));

  const modal = document.getElementById('photo-lightbox-modal');
  if (!modal) return;

  resetLightboxTransform();
  updateLightboxContent();

  modal.style.display = 'flex';

  if (typeof window !== 'undefined' && !window._lightboxKeydownBound) {
    window.addEventListener('keydown', handleLightboxKeydown);
    window._lightboxKeydownBound = true;
  }
}

export function closePhotoLightbox() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('photo-lightbox-modal');
  if (modal) modal.style.display = 'none';

  if (typeof window !== 'undefined' && window._lightboxKeydownBound) {
    window.removeEventListener('keydown', handleLightboxKeydown);
    window._lightboxKeydownBound = false;
  }

  if (lightboxOriginElement && typeof lightboxOriginElement.focus === 'function') {
    lightboxOriginElement.focus();
  }
}

function handleLightboxKeydown(e) {
  const modal = document.getElementById('photo-lightbox-modal');
  if (!modal || modal.style.display === 'none') return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closePhotoLightbox();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateLightbox(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateLightbox(1);
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    adjustLightboxZoom(0.25);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    adjustLightboxZoom(-0.25);
  } else if (e.key === '0') {
    e.preventDefault();
    resetLightboxTransform();
  }
}

function navigateLightbox(direction) {
  if (!currentLightboxPhotos.length) return;
  currentLightboxIndex = (currentLightboxIndex + direction + currentLightboxPhotos.length) % currentLightboxPhotos.length;
  resetLightboxTransform();
  updateLightboxContent();
}

function adjustLightboxZoom(delta) {
  currentZoomScale = Math.max(0.5, Math.min(5, currentZoomScale + delta));
  if (currentZoomScale === 1) {
    currentPanX = 0;
    currentPanY = 0;
  }
  applyLightboxTransform();
}

function resetLightboxTransform() {
  currentZoomScale = 1;
  currentPanX = 0;
  currentPanY = 0;
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const img = document.getElementById('lightbox-img');
  const levelSpan = document.getElementById('lightbox-zoom-level');
  if (img) {
    img.style.transform = `translate(${currentPanX}px, ${currentPanY}px) scale(${currentZoomScale})`;
  }
  if (levelSpan) {
    levelSpan.textContent = `${Math.round(currentZoomScale * 100)}%`;
  }
}

function updateLightboxContent() {
  const item = currentLightboxPhotos[currentLightboxIndex];
  if (!item) return;

  const img = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  const photoTitleSpan = document.getElementById('lightbox-photo-title');
  const noteTitleSpan = document.getElementById('lightbox-note-title');

  if (img) {
    img.src = item.src || '';
    img.alt = item.name || 'Photo';
  }
  if (counter) {
    counter.textContent = `Photo ${currentLightboxIndex + 1} of ${currentLightboxPhotos.length}`;
  }
  if (photoTitleSpan) {
    photoTitleSpan.textContent = item.name || item.noteTitle || 'Photo';
  }
  if (noteTitleSpan) {
    noteTitleSpan.textContent = item.noteTitle || 'Open Source Note';
  }
}

export function initPhotoLightbox() {
  if (typeof window !== 'undefined') {
    window.openPhotoLightbox = openPhotoLightbox;
    window.closePhotoLightbox = closePhotoLightbox;
  }

  const closeBtn = document.getElementById('lightbox-close-btn');
  const prevBtn = document.getElementById('lightbox-prev-btn');
  const nextBtn = document.getElementById('lightbox-next-btn');
  const zoomInBtn = document.getElementById('lightbox-zoom-in');
  const zoomOutBtn = document.getElementById('lightbox-zoom-out');
  const zoomResetBtn = document.getElementById('lightbox-zoom-reset');
  const downloadBtn = document.getElementById('lightbox-download-btn');
  const sourceNoteBtn = document.getElementById('lightbox-source-note-btn');

  if (closeBtn) closeBtn.addEventListener('click', closePhotoLightbox);
  if (prevBtn) prevBtn.addEventListener('click', () => navigateLightbox(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateLightbox(1));
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => adjustLightboxZoom(0.25));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => adjustLightboxZoom(-0.25));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetLightboxTransform);

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const item = currentLightboxPhotos[currentLightboxIndex];
      if (item && item.src) {
        const a = document.createElement('a');
        a.href = item.src;
        a.download = item.name || 'photo.png';
        a.click();
      }
    });
  }

  if (sourceNoteBtn) {
    sourceNoteBtn.addEventListener('click', () => {
      const item = currentLightboxPhotos[currentLightboxIndex];
      if (item && item.note && typeof openEditModal === 'function') {
        closePhotoLightbox();
        openEditModal(item.note);
      }
    });
  }

  const deleteBtn = document.getElementById('lightbox-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const item = currentLightboxPhotos[currentLightboxIndex];
      if (item) {
        closePhotoLightbox();
        deleteMediaItem(item);
      }
    });
  }

  const modal = document.getElementById('photo-lightbox-modal');
  const viewport = document.getElementById('lightbox-viewport');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === viewport) {
        closePhotoLightbox();
      }
    });
  }

  const imgWrapper = document.getElementById('lightbox-img-wrapper');
  if (imgWrapper) {
    imgWrapper.addEventListener('dblclick', () => {
      if (currentZoomScale > 1) {
        resetLightboxTransform();
      } else {
        currentZoomScale = 2;
        applyLightboxTransform();
      }
    });
  }
}

// 🗑️ Phase 6: Canonical Media Attachment Deletion
export function deleteMediaItem(item) {
  if (!item || !item.note) return;
  const targetNote = item.note;

  if (item.type === 'photo') {
    if (item.sourceType === 'image') {
      delete targetNote.image;
    } else if (item.sourceType === 'sketch') {
      delete targetNote.sketch;
    } else if (item.sourceType === 'coverImage') {
      delete targetNote.coverImage;
    } else if (item.sourceType === 'bannerImage') {
      delete targetNote.bannerImage;
    } else if (item.sourceType === 'note.files' && Array.isArray(targetNote.files)) {
      if (typeof item.fileIndex === 'number' && item.fileIndex >= 0) {
        targetNote.files.splice(item.fileIndex, 1);
      }
    } else if (item.sourceType === 'embedded_html' && targetNote.text) {
      if (item.src) {
        targetNote.text = targetNote.text.replace(new RegExp(`<img[^>]+src=["']${escapeRegExp(item.src)}["'][^>]*>`, 'gi'), '');
      }
    } else if (item.sourceType === 'embedded_md' && targetNote.text) {
      if (item.src) {
        targetNote.text = targetNote.text.replace(new RegExp(`!\\[.*?\\]\\(${escapeRegExp(item.src)}\\)`, 'gi'), '');
      }
    }
  } else if (item.type === 'file') {
    if (Array.isArray(targetNote.files) && typeof item.fileIndex === 'number' && item.fileIndex >= 0) {
      targetNote.files.splice(item.fileIndex, 1);
    }
  } else if (item.type === 'voice') {
    if (item.sourceType === 'note.audio') {
      delete targetNote.audio;
      delete targetNote.audioName;
      delete targetNote.audioDuration;
    } else if (item.sourceType === 'note.audioClips' && Array.isArray(targetNote.audioClips)) {
      if (typeof item.clipIndex === 'number' && item.clipIndex >= 0) {
        targetNote.audioClips.splice(item.clipIndex, 1);
      }
    } else if (item.sourceType === 'note.files' && Array.isArray(targetNote.files)) {
      if (typeof item.fileIndex === 'number' && item.fileIndex >= 0) {
        targetNote.files.splice(item.fileIndex, 1);
      }
    }
  } else if (item.type === 'link') {
    if (item.isStoredAttachment && Array.isArray(targetNote.links)) {
      if (typeof item.linkIndex === 'number' && item.linkIndex >= 0) {
        targetNote.links.splice(item.linkIndex, 1);
      }
    } else if (item.url && targetNote.text) {
      targetNote.text = targetNote.text.replace(item.url, '');
    }
  }

  targetNote.updatedAt = new Date().toISOString();

  if (typeof saveSingleNoteToLocalStorage === 'function') {
    try { saveSingleNoteToLocalStorage(targetNote); } catch (e) {}
  }
  if (typeof syncNoteToCloudWithQueue === 'function') {
    try { syncNoteToCloudWithQueue(targetNote); } catch (e) {}
  }

  if (typeof showToast === 'function') {
    try {
      showToast({
        title: 'Item Deleted',
        text: `Attachment removed from "${targetNote.title || 'Untitled'}".`
      });
    } catch (e) {}
  }

  if (item.type === 'voice') {
    stopCurrentAudio();
  }

  renderDedicatedSearchResults();
}

function escapeRegExp(string) {
  return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Phase 3: Audio Coordinator State
let currentAudioInstance = null;
let currentPlayingItemId = null;

export function stopCurrentAudio() {
  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause();
      currentAudioInstance.currentTime = 0;
    } catch (e) {}
    currentAudioInstance = null;
    currentPlayingItemId = null;
  }
}

export function playAudioTrack(itemId, audioSrc, onUpdate, onEnded) {
  if (currentPlayingItemId === itemId && currentAudioInstance) {
    if (currentAudioInstance.paused) {
      currentAudioInstance.play().catch(e => console.warn('Audio play error:', e));
      if (onUpdate) onUpdate(true, currentAudioInstance.currentTime, currentAudioInstance.duration || 0);
    } else {
      currentAudioInstance.pause();
      if (onUpdate) onUpdate(false, currentAudioInstance.currentTime, currentAudioInstance.duration || 0);
    }
    return;
  }

  stopCurrentAudio();

  const audio = new Audio(audioSrc);
  currentAudioInstance = audio;
  currentPlayingItemId = itemId;

  audio.addEventListener('timeupdate', () => {
    if (onUpdate && currentPlayingItemId === itemId) {
      onUpdate(!audio.paused, audio.currentTime, audio.duration || 0);
    }
  });

  audio.addEventListener('ended', () => {
    currentPlayingItemId = null;
    currentAudioInstance = null;
    if (onEnded) onEnded();
  });

  audio.addEventListener('error', (e) => {
    console.warn('Audio playback error:', e);
    stopCurrentAudio();
    if (onEnded) onEnded();
  });

  audio.play().catch(err => {
    console.warn('Playback failed:', err);
    stopCurrentAudio();
    if (onEnded) onEnded();
  });
}

function formatFileSize(bytes) {
  if (!bytes || typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getFileExtensionBadge(name = '') {
  const ext = name.split('.').pop().toUpperCase();
  return ext.length > 0 && ext.length <= 4 ? ext : 'FILE';
}

export function renderDedicatedSearchResults() {
  if (typeof document === 'undefined') return;
  const query = dedSearchInput ? dedSearchInput.value.toLowerCase().trim() : (searchState.query || '');
  
  let activeTag = searchState.selectedTag || null;
  if (query.startsWith('tag:')) {
    activeTag = query.substring(4).replace(/^#/, '').trim();
  } else if (query.startsWith('#')) {
    activeTag = query.substring(1).trim();
  }

  const allNotes = getPageNotes('notes');
  const items = getFilteredContentItems(allNotes, {
    query: query.startsWith('tag:') ? '' : query,
    selectedTag: activeTag,
    contentType: searchState.contentType || 'all'
  });

  const resultsTitleEl = document.getElementById('search-results-title');
  const resultsCountEl = document.getElementById('search-results-count');
  const resultsGridEl = document.getElementById('dedicated-search-results-grid') || document.getElementById('search-results-content');

  const titleLabels = {
    all: 'All Content',
    notes: 'Notes',
    photos: 'Photos',
    files: 'Files',
    voice: 'Voice Memos',
    links: 'Links'
  };

  if (resultsTitleEl) {
    const typeLabel = titleLabels[searchState.contentType || 'all'] || 'Content';
    resultsTitleEl.textContent = activeTag ? `${typeLabel} tagged #${activeTag}` : typeLabel;
  }

  if (resultsCountEl) {
    resultsCountEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  }

  if (resultsGridEl) {
    renderSearchResultsFeed(resultsGridEl, items, searchState.contentType || 'all');
  }
}

function renderSearchResultsFeed(container, items, contentType) {
  if (!container) return;
  container.innerHTML = '';

  if (!items || items.length === 0) {
    const emptyMessages = {
      all: 'No content found matching your search.',
      checklist: 'No checklists found matching your search.',
      notes: 'No notes found matching your search.',
      photos: 'No photos found matching your search.',
      files: 'No file attachments found matching your search.',
      voice: 'No voice memos found matching your search.',
      links: 'No links found matching your search.'
    };
    container.innerHTML = `<div class="empty-state-message">${emptyMessages[contentType] || emptyMessages.all}</div>`;
    return;
  }

  if (contentType === 'checklist' || contentType === 'checklists') {
    renderChecklistFeed(container, items);
  } else if (contentType === 'notes') {
    const notesOnly = items.map(i => i.note);
    renderGrid(container, notesOnly);
  } else if (contentType === 'photos') {
    renderPhotoFeed(container, items);
  } else if (contentType === 'files') {
    renderFileFeed(container, items);
  } else if (contentType === 'voice') {
    renderVoiceFeed(container, items);
  } else if (contentType === 'links') {
    renderLinkFeed(container, items);
  } else {
    renderUnifiedFeed(container, items);
  }
}

export function parseChecklistDetails(note) {
  if (!note) return { total: 0, completed: 0, percent: 0, items: [] };
  const text = note.text || '';
  const items = [];
  let total = 0;
  let completed = 0;

  if (Array.isArray(note.checklist) && note.checklist.length > 0) {
    note.checklist.forEach(item => {
      total++;
      if (item.completed || item.checked) completed++;
      items.push({ text: item.text || item.content || 'Task', checked: !!(item.completed || item.checked) });
    });
  } else {
    const lines = text.split(/\n|<br\s*\/?>/i);
    lines.forEach(line => {
      const clean = line.replace(/<[^>]*>/g, '').trim();
      if (/^-\s*\[[ xX]\]/i.test(clean)) {
        total++;
        const isChecked = /^-\s*\[[xX]\]/i.test(clean);
        if (isChecked) completed++;
        const taskText = clean.replace(/^-\s*\[[ xX]\]\s*/i, '');
        if (taskText) items.push({ text: taskText, checked: isChecked });
      } else if (line.includes('checklist-item') || line.includes('type="checkbox"')) {
        total++;
        const isChecked = line.includes('checked');
        if (isChecked) completed++;
        const taskText = clean;
        if (taskText) items.push({ text: taskText, checked: isChecked });
      }
    });
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent, items };
}

function renderChecklistFeed(container, checklists) {
  container.className = 'search-checklists-grid-feed';
  checklists.forEach(item => {
    const card = document.createElement('div');
    card.className = 'search-checklist-card';
    card.dataset.checklistId = item.id;

    const details = parseChecklistDetails(item.note);
    const title = item.name || item.noteTitle || 'Checklist';
    const topTasks = details.items.slice(0, 2);

    let tasksHtml = '';
    topTasks.forEach(task => {
      tasksHtml += `
        <div class="search-checklist-task-row${task.checked ? ' is-completed' : ''}">
          <span class="search-checklist-task-icon">${task.checked ? '☑' : '☐'}</span>
          <span class="search-checklist-task-text">${escapeHtml(task.text)}</span>
        </div>
      `;
    });

    const extraCount = details.items.length - topTasks.length;
    if (extraCount > 0) {
      tasksHtml += `<div class="search-checklist-extra-tag">+${extraCount} more item${extraCount === 1 ? '' : 's'}</div>`;
    }

    card.innerHTML = `
      <div class="search-checklist-card-header">
        <div class="search-checklist-card-title-row">
          <span class="search-checklist-icon-badge">☑</span>
          <span class="search-checklist-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        </div>
        <div class="search-checklist-stats-badge">${details.percent}% (${details.completed}/${details.total})</div>
      </div>
      <div class="search-checklist-progress-bar-track">
        <div class="search-checklist-progress-bar-fill" style="width: ${details.percent}%"></div>
      </div>
      <div class="search-checklist-tasks-body">
        ${tasksHtml || '<div class="search-checklist-no-tasks">Checklist note</div>'}
      </div>
      <div class="search-checklist-card-footer">
        <button type="button" class="search-source-note-btn" title="Open checklist">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          <span>${escapeHtml(item.noteTitle)}</span>
        </button>
        <button type="button" class="search-more-btn" aria-label="More actions">⋮</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.search-more-btn') && typeof openEditModal === 'function' && item.note) {
        openEditModal(item.note);
      }
    });

    const moreBtn = card.querySelector('.search-more-btn');
    if (moreBtn) {
      const actions = [
        { label: 'Open Checklist Note', icon: '📝', action: () => openEditModal(item.note) },
        { label: 'Delete', icon: '🗑️', danger: true, action: () => deleteMediaItem(item) }
      ];
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openActionMenu(moreBtn, actions, item);
      });
      attachTouchLongPress(card, () => {
        openActionMenu(moreBtn, actions, item);
      });
    }

    container.appendChild(card);
  });
}

function renderPhotoFeed(container, photos) {
  container.className = 'search-photos-grid-feed';
  photos.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'search-photo-card';
    card.dataset.photoId = item.id;
    const displayName = item.name || item.noteTitle || 'Photo';
    card.innerHTML = `
      <img src="${escapeHtml(item.src)}" class="search-photo-img" alt="${escapeHtml(displayName)}" loading="lazy">
      <div class="search-photo-overlay-title" title="${escapeHtml(displayName)}">
        ${escapeHtml(displayName)}
      </div>
      <div class="search-photo-overlay">
        <button type="button" class="search-source-note-btn" title="Open source note">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          <span>${escapeHtml(item.noteTitle)}</span>
        </button>
        <button type="button" class="search-more-btn" aria-label="More actions">⋮</button>
      </div>
    `;

    const img = card.querySelector('.search-photo-img');
    img.addEventListener('click', () => {
      if (typeof window.openPhotoLightbox === 'function') {
        window.openPhotoLightbox(index, photos);
      }
    });

    const noteBtn = card.querySelector('.search-source-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openEditModal === 'function') openEditModal(item.note);
    });

    const moreBtn = card.querySelector('.search-more-btn');
    const photoActions = [
      {
        label: 'Open in Lightbox',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
        onClick: () => {
          if (typeof window.openPhotoLightbox === 'function') window.openPhotoLightbox(index, photos);
        }
      },
      {
        label: 'Open Source Note',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
        onClick: () => {
          if (typeof openEditModal === 'function') openEditModal(item.note);
        }
      },
      {
        label: 'Download Photo',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
        onClick: () => {
          const a = document.createElement('a');
          a.href = item.src;
          a.download = item.name || 'photo.png';
          a.click();
        }
      },
      {
        label: 'Delete Photo',
        danger: true,
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        onClick: () => {
          if (typeof deleteMediaItem === 'function') deleteMediaItem(item);
        }
      }
    ];

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openActionMenu(moreBtn, photoActions, item);
    });

    attachTouchLongPress(card, () => {
      openActionMenu(moreBtn, photoActions, item);
    });

    container.appendChild(card);
  });
}

function renderFileFeed(container, files) {
  container.className = 'search-files-list-feed';
  files.forEach(item => {
    const row = document.createElement('div');
    row.className = 'search-file-row';
    row.dataset.fileId = item.id;
    row.innerHTML = `
      <div class="search-file-icon-badge">${escapeHtml(getFileExtensionBadge(item.name))}</div>
      <div class="search-file-details">
        <span class="search-file-name">${escapeHtml(item.name)}</span>
        <div class="search-file-meta">
          <button type="button" class="search-source-note-btn">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            <span>${escapeHtml(item.noteTitle)}</span>
          </button>
          ${item.size ? `<span class="search-file-size">${formatFileSize(item.size)}</span>` : ''}
        </div>
      </div>
      <div class="search-file-actions">
        <button type="button" class="search-action-btn open-file-btn" title="Open / Download file">Open</button>
        <button type="button" class="search-more-btn" aria-label="More actions">⋮</button>
      </div>
    `;

    const handleOpenFile = () => {
      if (item.src) {
        const link = document.createElement('a');
        link.href = item.src;
        link.download = item.name;
        link.target = '_blank';
        link.click();
      }
    };

    const openBtn = row.querySelector('.open-file-btn');
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleOpenFile();
    });

    const noteBtn = row.querySelector('.search-source-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openEditModal === 'function') openEditModal(item.note);
    });

    const moreBtn = row.querySelector('.search-more-btn');
    const fileActions = [
      {
        label: 'Open / Download File',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
        onClick: () => handleOpenFile()
      },
      {
        label: 'Open Source Note',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
        onClick: () => {
          if (typeof openEditModal === 'function') openEditModal(item.note);
        }
      },
      {
        label: 'Delete File Attachment',
        danger: true,
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        onClick: () => {
          if (typeof deleteMediaItem === 'function') deleteMediaItem(item);
        }
      }
    ];

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openActionMenu(moreBtn, fileActions, item);
    });

    attachTouchLongPress(row, () => {
      openActionMenu(moreBtn, fileActions, item);
    });

    container.appendChild(row);
  });
}

function renderVoiceFeed(container, voiceItems) {
  container.className = 'search-voice-list-feed';
  voiceItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'search-voice-row';
    row.dataset.voiceId = item.id;
    row.innerHTML = `
      <button type="button" class="search-voice-play-btn" aria-label="Play recording">
        <svg class="play-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
        <svg class="pause-icon" viewBox="0 0 24 24" style="display:none;"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>
      <div class="search-voice-details">
        <div class="search-voice-header">
          <span class="search-voice-title">${escapeHtml(item.name)}</span>
          <span class="search-voice-time">${item.duration ? formatAudioTime(item.duration) : '0:00'}</span>
        </div>
        <input type="range" class="search-voice-seeker" value="0" min="0" max="100" aria-label="Audio Seeker">
        <div class="search-voice-meta">
          <button type="button" class="search-source-note-btn">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            <span>${escapeHtml(item.noteTitle)}</span>
          </button>
        </div>
      </div>
      <button type="button" class="search-more-btn" aria-label="More actions">⋮</button>
    `;

    const playBtn = row.querySelector('.search-voice-play-btn');
    const playIcon = playBtn.querySelector('.play-icon');
    const pauseIcon = playBtn.querySelector('.pause-icon');
    const timeDisplay = row.querySelector('.search-voice-time');
    const seeker = row.querySelector('.search-voice-seeker');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playAudioTrack(
        item.id,
        item.src,
        (isPlaying, currentTime, duration) => {
          playIcon.style.display = isPlaying ? 'none' : 'block';
          pauseIcon.style.display = isPlaying ? 'block' : 'none';
          timeDisplay.textContent = formatAudioTime(currentTime);
          if (duration > 0) seeker.value = Math.floor((currentTime / duration) * 100);
        },
        () => {
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
          timeDisplay.textContent = item.duration ? formatAudioTime(item.duration) : '0:00';
          seeker.value = 0;
        }
      );
    });

    const noteBtn = row.querySelector('.search-source-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openEditModal === 'function') openEditModal(item.note);
    });

    const moreBtn = row.querySelector('.search-more-btn');
    const voiceActions = [
      {
        label: 'Play / Pause Audio',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
        onClick: () => playBtn.click()
      },
      {
        label: 'Open Source Note',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
        onClick: () => {
          if (typeof openEditModal === 'function') openEditModal(item.note);
        }
      },
      {
        label: 'Delete Voice Memo',
        danger: true,
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        onClick: () => {
          if (typeof deleteMediaItem === 'function') deleteMediaItem(item);
        }
      }
    ];

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openActionMenu(moreBtn, voiceActions, item);
    });

    attachTouchLongPress(row, () => {
      openActionMenu(moreBtn, voiceActions, item);
    });

    container.appendChild(row);
  });
}

function renderLinkFeed(container, links) {
  container.className = 'search-links-grid-feed';
  links.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'search-link-tile';
    tile.dataset.linkId = item.id;
    tile.innerHTML = `
      <div class="search-link-header">
        <span class="search-link-domain">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          ${escapeHtml(item.domain)}
        </span>
        <button type="button" class="search-more-btn" aria-label="More actions">⋮</button>
      </div>
      <div class="search-link-title">${escapeHtml(item.title)}</div>
      <div class="search-link-url">${escapeHtml(item.url)}</div>
      <div class="search-link-footer">
        <button type="button" class="search-source-note-btn">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          <span>${escapeHtml(item.noteTitle)}</span>
        </button>
      </div>
    `;

    tile.addEventListener('click', (e) => {
      if (e.target.closest('.search-source-note-btn') || e.target.closest('.search-more-btn')) return;
      if (item.url && /^https?:\/\//i.test(item.url)) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    });

    const noteBtn = tile.querySelector('.search-source-note-btn');
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openEditModal === 'function') openEditModal(item.note);
    });

    const moreBtn = tile.querySelector('.search-more-btn');
    const linkActions = [
      {
        label: 'Open Link in New Tab',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
        onClick: () => {
          if (item.url && /^https?:\/\//i.test(item.url)) window.open(item.url, '_blank', 'noopener,noreferrer');
        }
      },
      {
        label: 'Open Source Note',
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
        onClick: () => {
          if (typeof openEditModal === 'function') openEditModal(item.note);
        }
      },
      {
        label: 'Delete Link',
        danger: true,
        icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        onClick: () => {
          if (typeof deleteMediaItem === 'function') deleteMediaItem(item);
        }
      }
    ];

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openActionMenu(moreBtn, linkActions, item);
    });

    attachTouchLongPress(tile, () => {
      openActionMenu(moreBtn, linkActions, item);
    });

    container.appendChild(tile);
  });
}

function renderUnifiedFeed(container, items) {
  container.className = 'search-overview-feed';
  container.innerHTML = '';

  const allNotes = getPageNotes('notes');
  const query = dedSearchInput ? dedSearchInput.value.toLowerCase().trim() : (searchState.query || '');
  let activeTag = searchState.selectedTag || null;
  if (query.startsWith('tag:')) {
    activeTag = query.substring(4).replace(/^#/, '').trim();
  } else if (query.startsWith('#')) {
    activeTag = query.substring(1).trim();
  }

  const matchingNotes = (allNotes || []).filter(note => {
    if (!note) return false;
    const title = (note.title || '').toLowerCase();
    const text = (note.text || '').toLowerCase();

    if (activeTag) {
      const cleanTargetTag = String(activeTag).replace(/^#/, '').toLowerCase().trim();
      const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === cleanTargetTag);
      const hasInText = `${title} ${text}`.includes(`#${cleanTargetTag}`);
      if (!hasInArray && !hasInText) return false;
    }

    if (query) {
      if (query.startsWith('tag:')) {
        const targetTag = query.substring(4).replace(/^#/, '').toLowerCase().trim();
        const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === targetTag);
        const hasInText = `${title} ${text}`.includes(`#${targetTag}`);
        if (!hasInArray && !hasInText) return false;
      } else if (query.startsWith('#')) {
        const targetTag = query.substring(1).toLowerCase().trim();
        const hasInArray = Array.isArray(note.tags) && note.tags.some(t => String(t).replace(/^#/, '').toLowerCase().trim() === targetTag);
        const hasInText = `${title} ${text}`.includes(`#${targetTag}`);
        if (!hasInArray && !hasInText) return false;
      } else {
        const matchesNote = title.includes(query) || text.includes(query) || (note.folder && note.folder.toLowerCase().includes(query));
        const matchesTags = Array.isArray(note.tags) && note.tags.some(t => String(t).toLowerCase().includes(query));
        const matchesFiles = Array.isArray(note.files) && note.files.some(f => (f.name || f.fileName || '').toLowerCase().includes(query));
        if (!matchesNote && !matchesTags && !matchesFiles) return false;
      }
    }

    return true;
  });

  const checklists = getChecklistItems(matchingNotes);
  const photos = getPhotoItems(matchingNotes);
  const files = getFileItems(matchingNotes);
  const voice = getVoiceItems(matchingNotes);
  const links = getLinkItems(matchingNotes);

  const sectionsConfig = [
    { key: 'checklist', title: '☑️ RECENT CHECKLISTS', items: checklists, renderer: (c, list) => renderChecklistFeed(c, list) },
    { key: 'photos', title: '📷 RECENT PHOTOS', items: photos, renderer: (c, list) => renderPhotoFeed(c, list) },
    { key: 'files', title: '📄 RECENT FILES', items: files, renderer: (c, list) => { c.className = 'search-files-2col-feed'; renderFileFeed(c, list); } },
    { key: 'voice', title: '🎙️ RECENT VOICE MEMOS', items: voice, renderer: (c, list) => { c.className = 'search-voice-2col-feed'; renderVoiceFeed(c, list); } },
    { key: 'links', title: '🔗 RECENT LINKS', items: links, renderer: (c, list) => renderLinkFeed(c, list) }
  ];

  sectionsConfig.forEach(sec => {
    const secEl = document.createElement('div');
    secEl.className = 'search-overview-section';

    const headerEl = document.createElement('div');
    headerEl.className = 'search-section-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'search-section-title';
    titleEl.innerHTML = `${sec.title} <span class="search-section-count">(${sec.items.length})</span>`;

    headerEl.appendChild(titleEl);

    if (sec.items.length > 0) {
      const seeAllBtn = document.createElement('button');
      seeAllBtn.type = 'button';
      seeAllBtn.className = 'search-section-see-all';
      seeAllBtn.textContent = `See All (${sec.items.length}) →`;
      seeAllBtn.addEventListener('click', () => {
        searchState.contentType = sec.key;
        renderDedicatedSearchResults();
        const card = document.querySelector(`.fluid-genre-card[data-type="${sec.key}"]`);
        if (card) {
          document.querySelectorAll('.fluid-genre-card').forEach(c => {
            c.classList.remove('active');
            c.setAttribute('aria-selected', 'false');
          });
          card.classList.add('active');
          card.setAttribute('aria-selected', 'true');
        }
      });
      headerEl.appendChild(seeAllBtn);
    }

    secEl.appendChild(headerEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'search-section-body';

    if (sec.items.length === 0) {
      const labelName = sec.title.replace(/^[^\w\s]+/, '').trim().toLowerCase();
      bodyEl.innerHTML = `
        <div class="search-section-empty-state">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          <span>No ${escapeHtml(labelName)} found</span>
        </div>
      `;
    } else {
      const displayItems = sec.items.slice(0, 10);
      sec.renderer(bodyEl, displayItems);
    }

    secEl.appendChild(bodyEl);
    container.appendChild(secEl);
  });
}

// ⚙️ Phase 5: Action Menu Popover & Touch Long-Press Controller
let actionMenuOriginElement = null;

export function openActionMenu(anchorElement, actionsList = [], item = null) {
  if (typeof document === 'undefined') return;
  actionMenuOriginElement = anchorElement || document.activeElement;

  const popover = document.getElementById('search-action-menu-popover');
  const content = document.getElementById('action-menu-content');
  if (!popover || !content) return;

  content.innerHTML = '';
  actionsList.forEach(act => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `action-menu-item${act.danger ? ' danger' : ''}`;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `
      ${act.icon || ''}
      <span>${escapeHtml(act.label)}</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActionMenu();
      if (typeof act.onClick === 'function') act.onClick(item);
    });

    content.appendChild(btn);
  });

  popover.style.display = 'block';

  if (anchorElement && typeof anchorElement.getBoundingClientRect === 'function') {
    const rect = anchorElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    let top = rect.bottom + 6;
    let left = rect.right - popoverRect.width;

    if (left < 10) left = 10;
    if (typeof window !== 'undefined' && left + popoverRect.width > window.innerWidth - 10) {
      left = window.innerWidth - popoverRect.width - 10;
    }
    if (typeof window !== 'undefined' && top + popoverRect.height > window.innerHeight - 10) {
      top = rect.top - popoverRect.height - 6;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  if (typeof window !== 'undefined' && !window._actionMenuClickBound) {
    setTimeout(() => {
      window.addEventListener('click', handleOutsideActionMenuClick);
      window.addEventListener('keydown', handleActionMenuKeydown);
      window._actionMenuClickBound = true;
    }, 10);
  }
}

export function closeActionMenu() {
  if (typeof document === 'undefined') return;
  const popover = document.getElementById('search-action-menu-popover');
  if (popover) popover.style.display = 'none';

  if (typeof window !== 'undefined' && window._actionMenuClickBound) {
    window.removeEventListener('click', handleOutsideActionMenuClick);
    window.removeEventListener('keydown', handleActionMenuKeydown);
    window._actionMenuClickBound = false;
  }

  if (actionMenuOriginElement && typeof actionMenuOriginElement.focus === 'function') {
    actionMenuOriginElement.focus();
  }
}

function handleOutsideActionMenuClick(e) {
  const popover = document.getElementById('search-action-menu-popover');
  if (popover && !popover.contains(e.target)) {
    closeActionMenu();
  }
}

function handleActionMenuKeydown(e) {
  if (e.key === 'Escape') {
    closeActionMenu();
  }
}

export function attachTouchLongPress(element, onLongPress) {
  if (!element || typeof onLongPress !== 'function') return;

  let longPressTimer = null;
  let startX = 0;
  let startY = 0;

  element.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;

    longPressTimer = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(40); } catch (err) {}
      }
      onLongPress(element, e);
    }, 500);
  }, { passive: true });

  element.addEventListener('touchmove', (e) => {
    if (!longPressTimer) return;
    const moveX = e.touches[0].clientX;
    const moveY = e.touches[0].clientY;
    if (Math.abs(moveX - startX) > 10 || Math.abs(moveY - startY) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });

  element.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  element.addEventListener('touchcancel', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });
}

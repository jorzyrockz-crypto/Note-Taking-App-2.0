import {
  notes,
  saveToLocalStorage,
  renderNotes,
  closeAllNoteCardMenus,
  openEditModal,
  showToast,
  getNoteType,
  setNoteFolders,
  registerNoteFolders
} from './app.js';

let recipeImportDraft = null;
let recipeEditingNoteId = null;
let recipeImportWarnings = [];
let recipeImportMethod = null;
let recipeImportPending = false;

const MOCK_RECIPE_DATABASE = {
  'salmon': {
    title: '🍽️ Recipe: Creamy Garlic Tuscan Salmon #cooking',
    ingredients: [
      '4 salmon fillets',
      '1 tbsp olive oil',
      '1 cup heavy cream',
      '1/2 cup chicken broth',
      '1/2 tsp garlic powder',
      '1 cup spinach',
      '1/2 cup sun-dried tomatoes'
    ],
    instructions: '# Prep Steps\n1. Season salmon fillets on both sides with salt and pepper.\n2. Heat olive oil in a large skillet over medium-high heat.\n3. Sear salmon for 5 minutes on each side until golden.\n\n# Sauce Steps\n4. Add garlic and cook until fragrant.\n5. Pour in heavy cream, broth, and simmer. Stir in spinach and tomatoes.',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500'
  },
  'taco': {
    title: '🍽️ Recipe: Street Style Beef Tacos #cooking',
    ingredients: [
      '1 lb flank steak',
      '1/2 cup chopped cilantro',
      '1/2 cup white onion diced',
      '8 corn tortillas',
      '2 limes cut into wedges',
      '1 tbsp chili powder'
    ],
    instructions: '# Prep Steps\n1. Rub steak with chili powder, salt, and pepper.\n2. Grill steak on high heat for 4 mins each side.\n3. Slice steak thinly against the grain.\n\n# Assembly\n4. Warm corn tortillas on skillet.\n5. Load steak, garnish with cilantro and onions. Serve with lime.',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500'
  }
};

export function initRecipe() {
  const recipeCancel = document.getElementById('recipe-modal-cancel');
  recipeCancel?.addEventListener('click', closeRecipeModal);
  const recipeRetry = document.getElementById('recipe-modal-retry');
  recipeRetry?.addEventListener('click', handleRecipeImportAction);
  const recipeImport = document.getElementById('recipe-modal-import');
  recipeImport?.addEventListener('click', handleRecipeImportAction);
  const recipeSave = document.getElementById('recipe-modal-save');
  recipeSave?.addEventListener('click', saveRecipeDraftToNotes);
  document.getElementById('recipe-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'recipe-modal') {
      closeRecipeModal();
    }
  });
}

export function getRecipeFormElements() {
  return {
    modal: document.getElementById('recipe-modal'),
    status: document.getElementById('recipe-import-status'),
    error: document.getElementById('recipe-import-error'),
    builder: document.getElementById('recipe-builder-form'),
    url: document.getElementById('recipe-url-input'),
    title: document.getElementById('recipe-title-input'),
    description: document.getElementById('recipe-description-input'),
    imageUrl: document.getElementById('recipe-image-url-input'),
    servings: document.getElementById('recipe-servings-input'),
    prep: document.getElementById('recipe-prep-time-input'),
    cook: document.getElementById('recipe-cook-time-input'),
    ingredients: document.getElementById('recipe-ingredients-input'),
    instructions: document.getElementById('recipe-instructions-input'),
    importBtn: document.getElementById('recipe-modal-import'),
    retryBtn: document.getElementById('recipe-modal-retry'),
    saveBtn: document.getElementById('recipe-modal-save')
  };
}

export function openRecipeModal(note = null) {
  recipeEditingNoteId = note?.id || null;
  recipeImportDraft = note?.recipeData ? normalizeRecipeDraft(note.recipeData) : null;
  recipeImportWarnings = Array.isArray(note?.recipeImportWarnings) ? [...note.recipeImportWarnings] : [];
  recipeImportMethod = note?.recipeImportMethod || null;
  recipeImportPending = false;

  const els = getRecipeFormElements();
  if (els.modal) els.modal.classList.add('visible');
  if (els.error) els.error.style.display = 'none';
  if (els.status) els.status.textContent = '';
  
  if (note) {
    populateRecipeBuilderForm(note.recipeData, { editing: true });
  } else {
    resetRecipeBuilderForm();
  }
}

export function closeRecipeModal() {
  recipeEditingNoteId = null;
  recipeImportDraft = null;
  recipeImportWarnings = [];
  recipeImportMethod = null;
  recipeImportPending = false;

  const els = getRecipeFormElements();
  if (els.modal) els.modal.classList.remove('visible');
  resetRecipeBuilderForm();
}

export function resetRecipeBuilderForm() {
  const els = getRecipeFormElements();
  if (els.url) els.url.value = '';
  if (els.title) els.title.value = '';
  if (els.description) els.description.value = '';
  if (els.imageUrl) els.imageUrl.value = '';
  if (els.servings) els.servings.value = '';
  if (els.prep) els.prep.value = '';
  if (els.cook) els.cook.value = '';
  if (els.ingredients) els.ingredients.value = '';
  if (els.instructions) els.instructions.value = '';
  if (els.retryBtn) els.retryBtn.style.display = 'none';
  if (els.saveBtn) els.saveBtn.style.display = 'none';
  if (els.builder) els.builder.style.display = 'none';
  if (els.status) els.status.textContent = '';
  if (els.error) {
    els.error.style.display = 'none';
    els.error.textContent = '';
  }
}

export function parseIntegerInput(value) {
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
}

export function normalizeRecipeDraft(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  return {
    title: recipe.title || 'Culinary Dish',
    description: recipe.description || '',
    image_url: recipe.image_url || '',
    servings: parseIntegerInput(recipe.servings),
    prep_time_minutes: parseIntegerInput(recipe.prep_time_minutes),
    cook_time_minutes: parseIntegerInput(recipe.cook_time_minutes),
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(i => String(i).trim()) : [],
    instructions: recipe.instructions || ''
  };
}

export function buildRecipeStatusMessage(editing = false) {
  const base = editing ? 'Recipe configuration loaded.' : 'Recipe scraped successfully!';
  if (!recipeImportWarnings.length) return base;
  return [base, ...recipeImportWarnings].filter(Boolean).join(' ');
}

export function populateRecipeBuilderForm(recipe, options = {}) {
  const normalized = normalizeRecipeDraft(recipe);
  if (!normalized) return;

  recipeImportDraft = normalized;

  const els = getRecipeFormElements();
  if (els.title) els.title.value = normalized.title;
  if (els.description) els.description.value = normalized.description;
  if (els.imageUrl) els.imageUrl.value = normalized.image_url;
  if (els.servings) els.servings.value = normalized.servings || '';
  if (els.prep) els.prep.value = normalized.prep_time_minutes || '';
  if (els.cook) els.cook.value = normalized.cook_time_minutes || '';
  if (els.ingredients) els.ingredients.value = normalized.ingredients.join('\n');
  if (els.instructions) els.instructions.value = normalized.instructions;

  if (els.status) els.status.textContent = buildRecipeStatusMessage(options.editing);
  if (els.retryBtn) els.retryBtn.style.display = options.editing ? 'inline-flex' : (recipeImportWarnings.length > 0 ? 'inline-flex' : 'none');
  if (els.saveBtn) els.saveBtn.style.display = 'inline-flex';
  if (els.builder) els.builder.style.display = 'flex';
}

export function renderRecipeImportError(message) {
  const els = getRecipeFormElements();
  if (els.status) els.status.textContent = '';
  if (els.error) {
    els.error.textContent = message || 'An unexpected import error occurred.';
    els.error.style.display = 'block';
  }
  if (els.builder) els.builder.style.display = 'none';
  if (els.saveBtn) els.saveBtn.style.display = 'none';
}

export function getRecipeImporterUnavailableMessage() {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000';
  const hostname = typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost';
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'Recipe import needs the AtlasNest server running on this device. If you are on a phone or tablet, open the computer LAN address shown by npm start instead of localhost.';
  }
  return `Recipe import could not reach the AtlasNest backend at ${origin}. Make sure npm start is running on the host computer, both devices are on the same Wi-Fi, and the firewall allows port 3000.`;
}

export async function verifyRecipeImporterAvailable() {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch (error) {
    return false;
  }
}

export function legacyHandleRecipeImportAction() {
  const els = getRecipeFormElements();
  let title = els.title?.value.trim() || '';
  let ingredientsRaw = els.ingredients?.value.trim() || '';
  let instructions = els.instructions?.value.trim() || '';
  let image = null;
  
  const urlVal = els.url?.value.toLowerCase() || '';
  let usedQuickFill = false;
  
  if (urlVal.includes('salmon')) {
    const data = MOCK_RECIPE_DATABASE.salmon;
    title = data.title;
    ingredientsRaw = data.ingredients.join('\n');
    instructions = data.instructions;
    image = data.image;
    usedQuickFill = true;
  } else if (urlVal.includes('taco') || urlVal.includes('beef')) {
    const data = MOCK_RECIPE_DATABASE.taco;
    title = data.title;
    ingredientsRaw = data.ingredients.join('\n');
    instructions = data.instructions;
    image = data.image;
    usedQuickFill = true;
  } else if (urlVal && !title && !ingredientsRaw && !instructions) {
    showToast({
      title: 'Recipe link not imported',
      text: 'This local build supports demo quick-fill keywords like salmon or taco. Paste ingredients and steps manually for other recipe links.'
    });
    return;
  }
  
  if (!title) title = '🍽️ Recipe: New Culinary Dish';
  
  let text = 'Ingredients:\n';
  if (ingredientsRaw) {
    ingredientsRaw.split('\n').forEach(line => {
      if (line.trim() !== '') {
        text += `- [ ] ${line.trim()}\n`;
      }
    });
  } else {
    text += '- [ ] No ingredients specified\n';
  }
  
  if (instructions) {
    text += `\nInstructions:\n${instructions}`;
  }
  
  if (!image) {
    image = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500';
  }
  
  const newNote = {
    id: 'note-' + Date.now(),
    type: getNoteType(text),
    title: title,
    text: text,
    folder: 'Kitchen Board',
    color: 'default',
    theme: 'plants',
    pinned: false,
    archived: false,
    archivedAt: null,
    deleted: false,
    deletedAt: null,
    image: image,
    updatedAt: Date.now()
  };
  
  notes.unshift(newNote);
  saveToLocalStorage();
  renderNotes();
  
  if (els.modal) els.modal.classList.remove('visible');
  showToast({
    title: usedQuickFill ? 'Recipe quick-filled' : 'Recipe note saved',
    text: usedQuickFill ? 'Demo recipe content was added to Kitchen Board.' : 'Your recipe note was added to Kitchen Board.'
  });
}

export async function handleRecipeImportAction() {
  const els = getRecipeFormElements();
  const url = els.url.value.trim();
  if (!url) {
    renderRecipeImportError('Paste a cooking website URL first.');
    return;
  }
  if (!(await verifyRecipeImporterAvailable())) {
    // Fallback to legacy handle action for mock quick-fill imports
    if (url.includes('salmon') || url.includes('taco') || url.includes('beef')) {
      legacyHandleRecipeImportAction();
      return;
    }
    renderRecipeImportError(getRecipeImporterUnavailableMessage());
    return;
  }

  recipeImportPending = true;
  els.importBtn.disabled = true;
  els.retryBtn.style.display = 'none';
  els.saveBtn.style.display = 'none';
  els.builder.style.display = 'none';
  els.error.style.display = 'none';
  els.error.textContent = '';
  els.status.textContent = 'Scraping and parsing recipe...';

  try {
    const response = await fetch('/api/recipes/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Recipe import failed.');
    }

    recipeImportMethod = payload.meta?.import_method || null;
    recipeImportWarnings = Array.isArray(payload.meta?.warnings) ? payload.meta.warnings : [];
    populateRecipeBuilderForm(payload.recipe);
  } catch (error) {
    renderRecipeImportError(error.message || getRecipeImporterUnavailableMessage());
    els.retryBtn.style.display = 'inline-flex';
  } finally {
    recipeImportPending = false;
    els.importBtn.disabled = false;
  }
}

export function readRecipeBuilderForm() {
  const els = getRecipeFormElements();
  const title = els.title.value.trim() || 'Culinary Dish';
  const description = els.description.value.trim();
  const image_url = els.imageUrl.value.trim();
  const servings = parseIntegerInput(els.servings.value);
  const prep_time_minutes = parseIntegerInput(els.prep.value);
  const cook_time_minutes = parseIntegerInput(els.cook.value);

  const ingredients = els.ingredients.value
    .split('\n')
    .map(i => i.trim())
    .filter(Boolean);

  const instructions = els.instructions.value.trim();

  return {
    title,
    description,
    image_url,
    servings,
    prep_time_minutes,
    cook_time_minutes,
    ingredients,
    instructions
  };
}

export function buildRecipeNoteText(recipe) {
  let parts = [];
  if (recipe.description) {
    parts.push(recipe.description);
  }

  // Meta row: servings, times
  let meta = [];
  if (recipe.servings) meta.push(`Serves ${recipe.servings}`);
  if (recipe.prep_time_minutes) meta.push(`Prep: ${recipe.prep_time_minutes}m`);
  if (recipe.cook_time_minutes) meta.push(`Cook: ${recipe.cook_time_minutes}m`);

  if (meta.length) {
    parts.push(`*${meta.join(' | ')}*`);
  }

  // Ingredients checklist
  if (recipe.ingredients && recipe.ingredients.length) {
    const list = recipe.ingredients.map(i => `- [ ] ${i}`).join('\n');
    parts.push(`Ingredients:\n${list}`);
  }

  // Instructions
  if (recipe.instructions) {
    parts.push(`Instructions:\n${recipe.instructions}`);
  }

  return parts.filter(Boolean).join('\n\n') || 'Recipe note';
}

export function validateRecipeDraft(recipe) {
  if (!recipe.title) return 'Recipe title is required.';
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    return 'At least one ingredient is required.';
  }
  return null;
}

export function saveRecipeDraftToNotes() {
  const recipe = readRecipeBuilderForm();
  const validationError = validateRecipeDraft(recipe);
  if (validationError) {
    renderRecipeImportError(validationError);
    return;
  }

  const text = buildRecipeNoteText(recipe);
  const image = recipe.image_url || null;
  const recipeSourceUrl = getRecipeFormElements().url.value.trim();
  const existingNote = recipeEditingNoteId ? notes.find(note => note.id === recipeEditingNoteId) : null;
  let savedRecipeNote = existingNote;

  if (existingNote) {
    existingNote.type = 'recipe';
    existingNote.title = recipe.title;
    existingNote.text = text;
    setNoteFolders(existingNote, ['Kitchen Board']);
    existingNote.image = image;
    existingNote.recipeData = recipe;
    existingNote.recipeImportWarnings = [...recipeImportWarnings];
    existingNote.recipeImportMethod = recipeImportMethod;
    existingNote.recipeSourceUrl = recipeSourceUrl;
    existingNote.updatedAt = Date.now();
    registerNoteFolders(existingNote);
  } else {
    const newNote = setNoteFolders({
      id: `note-${Date.now()}`,
      type: 'recipe',
      title: recipe.title,
      text,
      color: 'default',
      theme: 'plants',
      pinned: false,
      archived: false,
      archivedAt: null,
      deleted: false,
      deletedAt: null,
      image,
      recipeData: recipe,
      recipeImportWarnings: [...recipeImportWarnings],
      recipeImportMethod,
      recipeSourceUrl,
      updatedAt: Date.now()
    }, ['Kitchen Board']);
    registerNoteFolders(newNote);
    notes.unshift(newNote);
    savedRecipeNote = newNote;
  }

  saveToLocalStorage();
  renderNotes();
  closeRecipeModal();
  if (savedRecipeNote) {
    openEditModal(savedRecipeNote);
  }
  showToast({
    title: existingNote ? 'Recipe updated' : 'Recipe saved',
    text: existingNote ? 'Recipe changes were saved to Kitchen Board.' : 'Imported recipe was added to Kitchen Board.'
  });
}

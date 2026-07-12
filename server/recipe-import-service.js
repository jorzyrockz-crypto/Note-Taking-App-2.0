import { lookup } from 'node:dns/promises';
import net from 'node:net';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 AtlasNestRecipeImporter/1.0';
const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_CHARS_FOR_LLM = 24000;

export class RecipeImportError extends Error {
  constructor(status, message, code = 'recipe_import_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function importRecipeFromUrl(inputUrl) {
  const warnings = [];
  const { html, finalUrl } = await fetchRecipeHtml(inputUrl);

  let recipe = extractRecipeFromJsonLd(html, finalUrl);
  let importMethod = 'jsonld';

  if (!isRecipeComplete(recipe)) {
    const htmlRecipe = extractRecipeFromHtml(html, finalUrl);
    if (isRecipeComplete(htmlRecipe)) {
      if (recipe) warnings.push('Structured data was incomplete, so the importer used recipe page HTML parsing.');
      recipe = htmlRecipe;
      importMethod = 'html';
    }
  }

  if (!isRecipeComplete(recipe)) {
    if (recipe) warnings.push('Structured data was missing fields, so the importer used AI fallback.');
    recipe = await extractRecipeWithLlm(html, finalUrl);
    importMethod = 'llm';
  }

  if (!isRecipeComplete(recipe)) {
    throw new RecipeImportError(422, 'Could not extract a usable recipe from this page.', 'recipe_not_found');
  }

  return {
    recipe,
    meta: {
      source_url: finalUrl,
      import_method: importMethod,
      warnings
    }
  };
}

export async function fetchRecipeHtml(inputUrl) {
  const safeUrl = await validateRemoteUrl(inputUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new RecipeImportError(502, `Upstream site returned ${response.status}.`, 'upstream_fetch_failed');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new RecipeImportError(422, 'The provided URL did not return an HTML recipe page.', 'non_html_response');
    }

    const html = await response.text();
    return {
      html,
      finalUrl: response.url || safeUrl.toString()
    };
  } catch (error) {
    if (error instanceof RecipeImportError) throw error;
    if (error?.name === 'AbortError') {
      throw new RecipeImportError(502, 'Timed out while fetching the recipe page.', 'upstream_timeout');
    }
    throw new RecipeImportError(502, 'Could not fetch the recipe page.', 'upstream_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

export function extractRecipeFromJsonLd(html, sourceUrl) {
  const $ = cheerio.load(html);
  const nodes = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    const parsed = safeParseJsonLd(raw);
    if (parsed !== null) nodes.push(parsed);
  });

  const candidates = [];
  nodes.forEach(node => collectRecipeCandidates(node, candidates));

  for (const candidate of candidates) {
    const normalized = normalizeRecipe(candidate, sourceUrl);
    if (isRecipeComplete(normalized)) {
      return normalized;
    }
  }

  return candidates.length > 0 ? normalizeRecipe(candidates[0], sourceUrl) : null;
}

export function extractRecipeFromHtml(html, sourceUrl) {
  const $ = cheerio.load(html);

  const wprmRecipe = extractWprmRecipe($, sourceUrl);
  if (isRecipeComplete(wprmRecipe)) return wprmRecipe;

  return null;
}

export async function extractRecipeWithLlm(html, sourceUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new RecipeImportError(422, 'Recipe structured data was incomplete and no OPENAI_API_KEY is configured for fallback extraction.', 'llm_unavailable');
  }

  const pageContext = extractMainContent(html);
  if (!pageContext.content) {
    throw new RecipeImportError(422, 'The page did not contain enough readable recipe content to extract.', 'recipe_not_found');
  }

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You extract cooking recipes from webpage text. Do not invent ingredients or steps if they are not supported by the source. Use null for optional scalar fields when unknown.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          source_url: sourceUrl,
          page_title: pageContext.title,
          page_content: pageContext.content
        })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'recipe_import',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            image_url: { type: ['string', 'null'] },
            prep_time_minutes: { type: ['integer', 'null'] },
            cook_time_minutes: { type: ['integer', 'null'] },
            servings: { type: ['integer', 'null'] },
            ingredients: {
              type: 'array',
              items: { type: 'string' }
            },
            instructions: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: [
            'title',
            'description',
            'image_url',
            'prep_time_minutes',
            'cook_time_minutes',
            'servings',
            'ingredients',
            'instructions'
          ],
          additionalProperties: false
        }
      }
    }
  });

  const textOutput = response.choices[0]?.message?.content?.trim();
  if (!textOutput) {
    throw new RecipeImportError(422, 'AI fallback did not return recipe data.', 'llm_parse_failed');
  }

  let parsed;
  try {
    parsed = JSON.parse(textOutput);
  } catch {
    throw new RecipeImportError(422, 'AI fallback returned invalid recipe JSON.', 'llm_invalid_json');
  }

  return normalizeRecipe(parsed, sourceUrl);
}

export function normalizeRecipe(recipeCandidate, sourceUrl = '') {
  if (!recipeCandidate || typeof recipeCandidate !== 'object') return null;

  const title = cleanInlineText(
    recipeCandidate.title ??
    recipeCandidate.name ??
    recipeCandidate.headline ??
    ''
  );

  const description = cleanInlineText(recipeCandidate.description ?? '');
  const imageUrl = pickFirstImageUrl(recipeCandidate.image ?? recipeCandidate.image_url, sourceUrl);
  const ingredients = normalizeIngredients(recipeCandidate.ingredients ?? recipeCandidate.recipeIngredient);
  const instructions = normalizeInstructions(recipeCandidate.instructions ?? recipeCandidate.recipeInstructions);

  const normalized = {
    title,
    ingredients,
    instructions
  };

  const prepTime = parseDurationToMinutes(recipeCandidate.prep_time_minutes ?? recipeCandidate.prepTime);
  const cookTime = parseDurationToMinutes(recipeCandidate.cook_time_minutes ?? recipeCandidate.cookTime);
  const servings = parseServings(recipeCandidate.servings ?? recipeCandidate.recipeYield);

  if (description) normalized.description = description;
  if (imageUrl) normalized.image_url = imageUrl;
  if (prepTime !== null) normalized.prep_time_minutes = prepTime;
  if (cookTime !== null) normalized.cook_time_minutes = cookTime;
  if (servings !== null) normalized.servings = servings;

  return normalized;
}

export function isRecipeComplete(recipe) {
  return Boolean(
    recipe &&
    typeof recipe.title === 'string' &&
    recipe.title.trim() &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.length > 0 &&
    Array.isArray(recipe.instructions) &&
    recipe.instructions.length > 0
  );
}

function safeParseJsonLd(raw) {
  const variants = [raw, raw.replace(/^\uFEFF/, '')];
  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch {
      // continue
    }
  }
  return null;
}

function collectRecipeCandidates(node, candidates) {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach(entry => collectRecipeCandidates(entry, candidates));
    return;
  }

  if (typeof node !== 'object') return;

  if (Array.isArray(node['@graph'])) {
    node['@graph'].forEach(entry => collectRecipeCandidates(entry, candidates));
  }

  if (isRecipeType(node['@type'])) {
    candidates.push(node);
  }
}

function isRecipeType(typeValue) {
  if (!typeValue) return false;
  if (Array.isArray(typeValue)) return typeValue.some(isRecipeType);
  return String(typeValue).toLowerCase() === 'recipe';
}

function extractWprmRecipe($, sourceUrl) {
  const root = $('.wprm-recipe').first();
  if (!root.length) return null;

  const title = cleanInlineText(root.find('.wprm-recipe-name').first().text() || $('title').first().text());
  const description = cleanInlineText(root.find('.wprm-recipe-summary').first().text());
  const imageUrl = resolveUrl(
    root.find('.wprm-recipe-image img').first().attr('src')
      || root.find('.wprm-recipe-image img').first().attr('data-src')
      || '',
    sourceUrl
  );

  const ingredients = root.find('.wprm-recipe-ingredient').toArray()
    .map((item) => {
      const amount = cleanInlineText($(item).find('.wprm-recipe-ingredient-amount').text());
      const unit = cleanInlineText($(item).find('.wprm-recipe-ingredient-unit').text());
      const name = cleanInlineText($(item).find('.wprm-recipe-ingredient-name').text());
      const notes = cleanInlineText($(item).find('.wprm-recipe-ingredient-notes').text());
      return [amount, unit, name, notes].filter(Boolean).join(' ');
    })
    .filter(Boolean);

  const instructions = root.find('.wprm-recipe-instruction').toArray()
    .map((item) => {
      const text = cleanInlineText($(item).find('.wprm-recipe-instruction-text').text());
      const notes = cleanInlineText($(item).find('.wprm-recipe-instruction-notes').text());
      return [text, notes].filter(Boolean).join(' ');
    })
    .filter(Boolean);

  const prepTime = parseDurationToMinutes(extractWprmTime($, 'prep_time'));
  const cookTime = parseDurationToMinutes(extractWprmTime($, 'cook_time'));
  const servings = parseServings(
    root.find('.wprm-recipe-servings').first().text()
    || $('.wprm-recipe-adjustable-servings-container [data-servings]').attr('data-servings')
    || $('.wprm-recipe-ingredients-container').first().attr('data-servings')
  );

  const recipe = {
    title,
    ingredients,
    instructions
  };

  if (description) recipe.description = description;
  if (imageUrl) recipe.image_url = imageUrl;
  if (prepTime !== null) recipe.prep_time_minutes = prepTime;
  if (cookTime !== null) recipe.cook_time_minutes = cookTime;
  if (servings !== null) recipe.servings = servings;

  return recipe;
}

function extractWprmTime($, key) {
  const selector = `.wprm-recipe-${key}, .wprm-recipe-${key}-minutes, .wprm-recipe-${key.replace('_', '-')}-container .wprm-recipe-time`;
  const value = cleanInlineText($(selector).first().text());
  return value || null;
}

async function validateRemoteUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new RecipeImportError(400, 'Please provide a valid URL.', 'invalid_url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new RecipeImportError(400, 'Only http and https recipe URLs are supported.', 'invalid_protocol');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isLocalHostname(hostname)) {
    throw new RecipeImportError(400, 'Private or local addresses are not allowed.', 'blocked_host');
  }

  const addresses = await lookup(hostname, { all: true });
  if (addresses.some(address => isPrivateIp(address.address))) {
    throw new RecipeImportError(400, 'Private or local addresses are not allowed.', 'blocked_host');
  }

  return parsed;
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal');
}

function isPrivateIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }

  return true;
}

function cleanInlineText(value) {
  if (value == null) return '';
  const text = String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function pickFirstImageUrl(imageValue, sourceUrl) {
  if (!imageValue) return null;

  const candidates = [];
  collectImageCandidates(imageValue, candidates);
  for (const candidate of candidates) {
    const resolved = resolveUrl(candidate, sourceUrl);
    if (resolved) return resolved;
  }
  return null;
}

function collectImageCandidates(value, target) {
  if (!value) return;
  if (typeof value === 'string') {
    target.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => collectImageCandidates(entry, target));
    return;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') target.push(value.url);
    if (typeof value.contentUrl === 'string') target.push(value.contentUrl);
  }
}

function normalizeIngredients(value) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  return items
    .map(item => cleanInlineText(item))
    .filter(Boolean);
}

function normalizeInstructions(value) {
  const steps = [];
  collectInstructionSteps(value, steps);
  return steps
    .map(step => cleanInlineText(step))
    .filter(Boolean);
}

function collectInstructionSteps(value, steps) {
  if (!value) return;

  if (typeof value === 'string') {
    const split = value
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);
    if (split.length > 1) {
      split.forEach(line => steps.push(line.replace(/^\d+\.\s*/, '')));
    } else if (value.trim()) {
      steps.push(value.trim());
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(entry => collectInstructionSteps(entry, steps));
    return;
  }

  if (typeof value === 'object') {
    if (typeof value.text === 'string') {
      steps.push(value.text);
    }
    if (Array.isArray(value.itemListElement)) {
      value.itemListElement.forEach(entry => collectInstructionSteps(entry, steps));
    }
    if (Array.isArray(value.recipeInstructions)) {
      value.recipeInstructions.forEach(entry => collectInstructionSteps(entry, steps));
    }
  }
}

function parseDurationToMinutes(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));

  const stringValue = String(value).trim();
  const isoMatch = stringValue.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (isoMatch) {
    const days = Number(isoMatch[1] || 0);
    const hours = Number(isoMatch[2] || 0);
    const minutes = Number(isoMatch[3] || 0);
    return days * 1440 + hours * 60 + minutes;
  }

  const numericMatch = stringValue.match(/(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : null;
}

function parseServings(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.round(value));
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractMainContent(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, header, footer, nav, aside, form').remove();

  const title = cleanInlineText($('title').first().text());
  const preferred = $('main, article, [itemprop="recipeInstructions"], .post-content, .entry-content').first();
  const contentRoot = preferred.length ? preferred : $('body');
  const content = cleanInlineText(contentRoot.text()).slice(0, MAX_HTML_CHARS_FOR_LLM);

  return { title, content };
}

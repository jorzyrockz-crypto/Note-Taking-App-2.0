import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 AtlasNestLinkPreview/1.0';
const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 800000;

export class LinkPreviewError extends Error {
  constructor(status, message, code = 'link_preview_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getLinkPreview(inputUrl) {
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
      throw new LinkPreviewError(502, `Upstream site returned ${response.status}.`, 'upstream_fetch_failed');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new LinkPreviewError(422, 'The shared URL did not return an HTML page.', 'non_html_response');
    }

    const html = await readLimitedText(response, MAX_HTML_BYTES);
    return extractLinkPreview(html, response.url || safeUrl.toString());
  } catch (error) {
    if (error instanceof LinkPreviewError) throw error;
    if (error?.name === 'AbortError') {
      throw new LinkPreviewError(502, 'Timed out while fetching link metadata.', 'upstream_timeout');
    }
    throw new LinkPreviewError(502, 'Could not fetch link metadata.', 'upstream_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinkPreview(html, finalUrl) {
  const $ = cheerio.load(html);
  const meta = selector => $(selector).attr('content')?.trim() || '';
  const text = selector => $(selector).first().text().replace(/\s+/g, ' ').trim();
  const title = firstPresent([
    meta('meta[property="og:title"]'),
    meta('meta[name="twitter:title"]'),
    text('title'),
    text('h1')
  ]);
  const description = firstPresent([
    meta('meta[property="og:description"]'),
    meta('meta[name="twitter:description"]'),
    meta('meta[name="description"]'),
    text('article p'),
    text('main p')
  ]);
  const image = absoluteUrl(firstPresent([
    meta('meta[property="og:image:secure_url"]'),
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image"]'),
    $('link[rel="image_src"]').attr('href') || ''
  ]), finalUrl);
  const siteName = firstPresent([
    meta('meta[property="og:site_name"]'),
    new URL(finalUrl).hostname.replace(/^www\./, '')
  ]);
  const type = firstPresent([
    meta('meta[property="og:type"]'),
    meta('meta[name="twitter:card"]')
  ]);

  return {
    url: finalUrl,
    title: title || siteName || 'Shared link',
    description,
    image,
    siteName,
    type,
    intent: inferLinkIntent(finalUrl, { title, description, siteName, type })
  };
}

function inferLinkIntent(url, meta = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const haystack = `${host} ${path} ${meta.title || ''} ${meta.description || ''} ${meta.siteName || ''} ${meta.type || ''}`.toLowerCase();

  if (/(recipe|recipes|cookbook|ingredients|cooking|allrecipes|foodnetwork|panlasangpinoy|seriouseats|yummly|tasty|delish)/.test(haystack)) {
    return { kind: 'recipe', folder: 'Kitchen Board', noteType: 'recipe', theme: 'food', label: 'Recipe' };
  }
  if (/(pinterest\.|pin\/|moodboard|inspiration|design|behance|dribbble)/.test(haystack)) {
    return { kind: 'visual', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'spring', label: 'Visual bookmark' };
  }
  if (/(facebook\.|instagram\.|threads\.|x\.com|twitter\.|linkedin\.|tiktok\.|post|status|reel)/.test(haystack)) {
    return { kind: 'social', folder: 'Social Saves', noteType: 'bookmark', theme: 'office', label: 'Social post' };
  }
  if (/(youtube\.|youtu\.be|vimeo\.|video|watch)/.test(haystack)) {
    return { kind: 'video', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'celebration', label: 'Video' };
  }
  return { kind: 'bookmark', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'office', label: 'Bookmark' };
}

async function readLimitedText(response, maxBytes) {
  const text = await response.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

function firstPresent(values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch (error) {
    return '';
  }
}

async function validateRemoteUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch (error) {
    throw new LinkPreviewError(400, 'Enter a valid URL.', 'invalid_url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new LinkPreviewError(400, 'Only http and https URLs can be previewed.', 'unsupported_protocol');
  }

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(address => isPrivateAddress(address.address))) {
    throw new LinkPreviewError(400, 'This URL is not available for preview.', 'blocked_host');
  }

  return parsed;
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 6) {
    return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
  }

  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

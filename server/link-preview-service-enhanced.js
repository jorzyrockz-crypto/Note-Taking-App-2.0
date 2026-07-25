import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import {
  SOCIAL_PROVIDER_NAMES,
  getOEmbedEndpoint,
  isRecognizedShortener,
  parseAndNormalizeLink,
  parseHttpUrl,
  unwrapKnownRedirect
} from './social-link-parser.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PaperussLinkPreview/2.0';
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 800000;
const MAX_JSON_BYTES = 512000;
const MAX_REDIRECTS = 5;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class LinkPreviewError extends Error {
  constructor(status, message, code = 'link_preview_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE LAYER - Store previews in memory (Vercel serverless)
// For production, use Redis or Firestore if available
// ═══════════════════════════════════════════════════════════════════════════

const previewCache = new Map(); // In-memory cache for this process

function getCacheKey(url) {
  try {
    const parsed = new URL(url);
    return `preview:${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    return `preview:${url}`;
  }
}

async function getCachedPreview(url) {
  const key = getCacheKey(url);
  
  // Check in-memory cache first (fast, within same request context)
  if (previewCache.has(key)) {
    const cached = previewCache.get(key);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data; // Cache hit!
    } else {
      previewCache.delete(key); // Expired
    }
  }
  
  return null;
}

async function setCachedPreview(url, preview) {
  const key = getCacheKey(url);
  previewCache.set(key, {
    data: preview,
    timestamp: Date.now()
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LINK PREVIEW FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function getLinkPreview(inputUrl, internalOptions = {}) {
  let initialUrl;
  try {
    initialUrl = parseHttpUrl(inputUrl);
  } catch (error) {
    throw new LinkPreviewError(400, error.message || 'Enter a valid URL.', 'invalid_url');
  }

  // ✅ CHECK CACHE FIRST (Pinterest strategy)
  const cached = await getCachedPreview(initialUrl.toString());
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), internalOptions.timeoutMs || FETCH_TIMEOUT_MS);
  const context = {
    fetchImpl: internalOptions.fetchImpl || globalThis.fetch,
    validateDns: internalOptions.validateDns !== false,
    signal: controller.signal,
    mastodonHosts: internalOptions.mastodonHosts || getConfiguredMastodonHosts()
  };
  const warnings = [];

  try {
    let resolvedUrl = unwrapKnownRedirect(initialUrl);
    let redirectChain = resolvedUrl.toString() === initialUrl.toString()
      ? [initialUrl.toString()]
      : [initialUrl.toString(), resolvedUrl.toString()];

    if (isRecognizedShortener(resolvedUrl)) {
      try {
        const resolved = await resolveKnownShortLink(resolvedUrl, context);
        resolvedUrl = resolved.url;
        redirectChain = [...redirectChain.slice(0, -1), ...resolved.chain];
      } catch (error) {
        warnings.push(toWarning('short_link_unavailable', error));
      }
    }

    let link = parseAndNormalizeLink(resolvedUrl.toString(), {
      mastodonHosts: context.mastodonHosts
    });
    const endpoint = getOEmbedEndpoint(link, { mastodonHosts: context.mastodonHosts });

    let preview;

    if (endpoint) {
      try {
        const oembed = await fetchJson(endpoint, context);
        preview = buildOEmbedPreview(oembed, link, {
          originalUrl: initialUrl.toString(),
          resolvedUrl: resolvedUrl.toString(),
          redirectChain,
          warnings
        });
        await setCachedPreview(initialUrl.toString(), preview);
        return preview;
      } catch (error) {
        warnings.push(toWarning('oembed_unavailable', error));
      }
    }

    try {
      const fetched = await fetchWithRedirects(new URL(link.canonicalUrl), context, {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
      if (!fetched.response.ok) {
        throw new LinkPreviewError(502, `Upstream site returned ${fetched.response.status}.`, 'upstream_fetch_failed');
      }

      const contentType = fetched.response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new LinkPreviewError(422, 'The shared URL did not return an HTML page.', 'non_html_response');
      }

      const html = await readLimitedHtml(fetched.response, MAX_HTML_BYTES);
      link = parseAndNormalizeLink(fetched.finalUrl.toString(), {
        mastodonHosts: context.mastodonHosts
      });
      preview = extractLinkPreview(html, link, {
        originalUrl: initialUrl.toString(),
        resolvedUrl: fetched.finalUrl.toString(),
        redirectChain: [...redirectChain, ...fetched.redirectChain.slice(1)],
        warnings
      });
      
      // ✅ CACHE THE RESULT
      await setCachedPreview(initialUrl.toString(), preview);
      return preview;
    } catch (error) {
      if (link.platform !== 'unknown') {
        warnings.push(toWarning('page_preview_unavailable', error));
        preview = buildSocialFallback(link, {
          originalUrl: initialUrl.toString(),
          resolvedUrl: resolvedUrl.toString(),
          redirectChain,
          warnings
        });
        await setCachedPreview(initialUrl.toString(), preview);
        return preview;
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof LinkPreviewError) throw error;
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw new LinkPreviewError(502, 'Timed out while fetching link metadata.', 'upstream_timeout');
    }
    throw new LinkPreviewError(502, 'Could not fetch link metadata.', 'upstream_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED LINK PREVIEW EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

export function extractLinkPreview(html, link, requestMeta = {}) {
  const $ = cheerio.load(html);
  const meta = selector => $(selector).attr('content')?.trim() || '';
  const text = selector => $(selector).first().text().replace(/\s+/g, ' ').trim();
  
  // ✅ FALLBACK CHAIN FOR TITLE
  const title = firstPresent([
    meta('meta[property="og:title"]'),
    meta('meta[name="twitter:title"]'),
    text('title'),
    text('h1')
  ]);

  // ✅ FALLBACK CHAIN FOR DESCRIPTION
  const description = firstPresent([
    meta('meta[property="og:description"]'),
    meta('meta[name="twitter:description"]'),
    meta('meta[name="description"]'),
    text('article p'),
    text('main p')
  ]);

  // ✅ SMART IMAGE SELECTION (Not just first image!)
  const image = absoluteUrl(
    selectBestImage($, link.canonicalUrl) ||
    firstPresent([
      meta('meta[property="og:image:secure_url"]'),
      meta('meta[property="og:image"]'),
      meta('meta[name="twitter:image"]'),
      $('link[rel="image_src"]').attr('href') || ''
    ]),
    link.canonicalUrl
  );

  // ✅ METADATA ENRICHMENT
  const siteName = firstPresent([
    meta('meta[property="og:site_name"]'),
    providerName(link),
    new URL(link.canonicalUrl).hostname.replace(/^www\./, '')
  ]);

  const type = firstPresent([
    meta('meta[property="og:type"]'),
    meta('meta[name="twitter:card"]')
  ]);

  // ✅ EXTRACT AUTHOR (from Schema.org or meta tags)
  const author = firstPresent([
    meta('meta[name="author"]'),
    meta('meta[property="article:author"]'),
    extractSchemaField('author', $)
  ]);

  // ✅ EXTRACT PUBLISH DATE (from Schema.org or meta tags)
  const publishedDate = firstPresent([
    meta('meta[property="article:published_time"]'),
    extractSchemaField('datePublished', $)
  ]);

  // ✅ EXTRACT FAVICON
  const favicon = extractFavicon(link.canonicalUrl, $);

  // ✅ CHECK FOR VIDEO (video embeds, YouTube, Vimeo)
  const video = extractVideoUrl($, link.canonicalUrl);

  const provider = providerName(link);
  const hasSpecificTitle = Boolean(title && title.toLowerCase() !== provider.toLowerCase());
  
  if (link.platform !== 'unknown' && !hasSpecificTitle && !description && !image) {
    return buildSocialFallback(link, {
      ...requestMeta,
      warnings: [
        ...(requestMeta.warnings || []),
        { code: 'metadata_unavailable', message: `${provider} did not expose public preview metadata.` }
      ]
    });
  }

  return buildPreviewEnvelope({
    link,
    requestMeta,
    title: title || siteName || 'Shared link',
    description,
    image,
    siteName,
    type,
    author,
    publishedDate,
    favicon,
    video,
    previewProvider: 'html'
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE SELECTION (Pinterest strategy)
// ═══════════════════════════════════════════════════════════════════════════

function selectBestImage($, baseUrl) {
  try {
    // Collect all images from the page
    const images = [];
    
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      const width = parseInt($(el).attr('width')) || 0;
      const height = parseInt($(el).attr('height')) || 0;
      const alt = $(el).attr('alt') || '';
      
      if (src) {
        try {
          const absoluteSrc = new URL(src, baseUrl).toString();
          images.push({
            src: absoluteSrc,
            width,
            height,
            alt,
            score: 0 // Calculate below
          });
        } catch {}
      }
    });

    if (images.length === 0) return null;

    // ✅ SCORE IMAGES (Pinterest approach)
    images.forEach(img => {
      let score = 0;

      // 1. Size check (filter out tiny icons/decorations)
      if (img.width >= 200 && img.height >= 150) {
        score += 10;
      } else if (img.width >= 100 && img.height >= 100) {
        score += 3; // Smaller, but acceptable
      } else {
        score -= 100; // Too small, penalize heavily
      }

      // 2. Aspect ratio check (prefer thumbnail-like 16:9 or 4:3)
      const ratio = img.width / img.height;
      const ratio16_9 = 16 / 9; // ~1.78
      const ratio4_3 = 4 / 3;   // ~1.33
      const targetRatios = [ratio16_9, ratio4_3];
      
      const closestRatio = targetRatios.reduce((closest, target) => {
        const currentDist = Math.abs(ratio - target);
        const closestDist = Math.abs(ratio - closest);
        return currentDist < closestDist ? target : closest;
      });

      if (Math.abs(ratio - closestRatio) < 0.3) {
        score += 8; // Good aspect ratio
      }

      // 3. Alt text quality (meaningful descriptions)
      if (img.alt && img.alt.length > 5 && !img.alt.toLowerCase().includes('logo')) {
        score += 5;
      }

      // 4. Penalize images that look like decorations/icons
      if (img.alt?.toLowerCase().includes('icon') ||
          img.alt?.toLowerCase().includes('logo') ||
          img.alt?.toLowerCase().includes('badge')) {
        score -= 20;
      }

      // 5. Avoid square images (usually avatars or small thumbnails)
      if (img.width > 0 && img.height > 0) {
        const aspectDiff = Math.abs(img.width - img.height);
        if (aspectDiff < img.width * 0.1) { // Nearly square
          score -= 10;
        }
      }

      img.score = score;
    });

    // Sort by score (highest first)
    images.sort((a, b) => b.score - a.score);

    // Return best image if score is reasonable
    return images[0]?.score > -50 ? images[0].src : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// METADATA ENRICHMENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractFavicon(baseUrl, $) {
  try {
    // Try to find favicon in HTML
    const faviconLink = $('link[rel~="icon"]').attr('href') || 
                       $('link[rel="shortcut icon"]').attr('href');
    
    if (faviconLink) {
      return absoluteUrl(faviconLink, baseUrl);
    }

    // Fallback to Google favicon service (works for any domain)
    const domain = new URL(baseUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  } catch {
    return null;
  }
}

function extractSchemaField(field, $) {
  try {
    // Look for JSON-LD structured data
    const scripts = $('script[type="application/ld+json"]');
    
    for (let i = 0; i < scripts.length; i++) {
      try {
        const json = JSON.parse($(scripts[i]).html());
        
        // Handle array of schemas
        const items = Array.isArray(json) ? json : [json];
        
        for (const item of items) {
          if (field === 'author' && item.author?.name) {
            return item.author.name;
          }
          if (field === 'author' && typeof item.author === 'string') {
            return item.author;
          }
          if (field === 'datePublished' && item.datePublished) {
            return item.datePublished;
          }
        }
      } catch {}
    }
    
    return '';
  } catch {
    return '';
  }
}

function extractVideoUrl($, baseUrl) {
  try {
    // Check for og:video
    const ogVideo = $('meta[property="og:video"]').attr('content');
    if (ogVideo) return absoluteUrl(ogVideo, baseUrl);

    // Check for twitter:player
    const twitterVideo = $('meta[name="twitter:player"]').attr('content');
    if (twitterVideo) return absoluteUrl(twitterVideo, baseUrl);

    // Check for YouTube video in page
    const youtubeMatch = $('iframe[src*="youtube"]').attr('src');
    if (youtubeMatch) return youtubeMatch;

    // Check for Vimeo
    const vimeoMatch = $('iframe[src*="vimeo"]').attr('src');
    if (vimeoMatch) return vimeoMatch;

    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW BUILDERS (Updated to include new fields)
// ═══════════════════════════════════════════════════════════════════════════

function buildOEmbedPreview(oembed, link, requestMeta) {
  if (!oembed || typeof oembed !== 'object' || Array.isArray(oembed)) {
    throw new LinkPreviewError(502, 'The preview provider returned invalid data.', 'invalid_oembed');
  }

  const provider = cleanInlineText(firstPresent([oembed.provider_name, providerName(link)]));
  const author = cleanInlineText(oembed.author_name || '');
  const rawTitle = cleanInlineText(oembed.title || '');
  const embedText = extractTextFromEmbedHtml(oembed.html || '');
  const isCaptionFirst = ['x', 'tiktok', 'bluesky'].includes(link.platform);
  const title = isCaptionFirst
    ? firstPresent([author ? `${author} on ${provider}` : '', `${provider} ${friendlyKind(link.kind)}`])
    : firstPresent([rawTitle, author ? `${author} on ${provider}` : '', `${provider} ${friendlyKind(link.kind)}`]);
  const description = isCaptionFirst
    ? firstPresent([rawTitle, embedText])
    : firstPresent([embedText !== title ? embedText : '']);
  const image = absoluteUrl(oembed.thumbnail_url || '', link.canonicalUrl);

  // ✅ ADD FAVICON & AUTHOR
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${new URL(link.canonicalUrl).hostname}`;

  return buildPreviewEnvelope({
    link,
    requestMeta,
    title,
    description,
    image,
    siteName: provider,
    type: cleanInlineText(oembed.type || 'rich'),
    author: author || null,
    publishedDate: null,
    favicon,
    video: oembed.html ? 'oembed' : null,
    previewProvider: 'oembed'
  });
}

function buildSocialFallback(link, requestMeta) {
  const provider = providerName(link);
  const domain = new URL(link.canonicalUrl).hostname;
  
  return buildPreviewEnvelope({
    link,
    requestMeta,
    title: `${provider} ${friendlyKind(link.kind)}`,
    description: `Saved from ${provider}. Open the original link to view the public content.`,
    image: '',
    siteName: provider,
    type: 'link',
    author: null,
    publishedDate: null,
    favicon: `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
    video: null,
    previewProvider: 'fallback'
  });
}

function buildPreviewEnvelope({
  link,
  requestMeta,
  title,
  description,
  image,
  siteName,
  type,
  author,
  publishedDate,
  favicon,
  video,
  previewProvider
}) {
  const cleanTitle = limitText(title, 500);
  const cleanDescription = limitText(description, 2000);
  const cleanSiteName = limitText(siteName, 200);
  const cleanType = limitText(type, 100);
  const cleanAuthor = author ? limitText(author, 200) : null;
  const social = link.platform === 'unknown'
    ? null
    : {
        platform: link.platform,
        kind: link.kind,
        providerName: providerName(link),
        url: link.canonicalUrl
      };

  return {
    title: cleanTitle,
    description: cleanDescription,
    image,
    author: cleanAuthor,          // ✅ NEW: Author info
    publishedDate,                 // ✅ NEW: Published date
    favicon,                        // ✅ NEW: Favicon URL
    video,                         // ✅ NEW: Video URL if exists
    link: {
      canonical: link.canonicalUrl,
      original: requestMeta.originalUrl
    },
    site: {
      name: cleanSiteName,
      type: cleanType
    },
    social,
    preview: {
      provider: previewProvider
    },
    redirectChain: requestMeta.redirectChain || [],
    warnings: requestMeta.warnings || []
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (from original)
// ═══════════════════════════════════════════════════════════════════════════

async function resolveKnownShortLink(url, context) {
  const response = await fetchResponse(url, context, { redirect: 'manual' });
  const status = response.status;
  const redirectUrl = response.headers.get('location');
  if (isRedirect(status) && redirectUrl) {
    try {
      return {
        url: new URL(redirectUrl, url.toString()),
        chain: [url.toString(), redirectUrl]
      };
    } catch {
      throw new Error('Invalid redirect URL');
    }
  }
  if (response.ok) {
    return { url, chain: [url.toString()] };
  }
  throw new Error(`Unexpected status ${status}`);
}

async function fetchWithRedirects(url, context, headers) {
  const visited = new Set([url.toString()]);
  let response = await fetchResponse(url, context, headers);
  const chain = [url];
  let attempts = 0;
  while (isRedirect(response.status) && attempts < MAX_REDIRECTS) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect without location');
    let nextUrl;
    try {
      nextUrl = new URL(location, url);
    } catch {
      throw new Error(`Invalid redirect URL: ${location}`);
    }
    if (visited.has(nextUrl.toString())) throw new Error('Circular redirect');
    visited.add(nextUrl.toString());
    chain.push(nextUrl);
    url = nextUrl;
    response = await fetchResponse(url, context, headers);
    attempts++;
  }
  if (attempts >= MAX_REDIRECTS) throw new Error('Too many redirects');
  return { response, finalUrl: url, redirectChain: chain };
}

async function fetchResponse(url, context, overrides) {
  await validateRemoteUrl(url, context.validateDns);
  const response = await context.fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      ...overrides
    },
    signal: context.signal,
    ...overrides
  });
  return response;
}

async function fetchJson(url, context) {
  const response = await fetchResponse(url, context, {
    accept: 'application/json'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await readLimitedBytes(response, MAX_JSON_BYTES);
  const json = JSON.parse(Buffer.from(bytes).toString('utf-8'));
  return json;
}

async function readLimitedHtml(response, maxBytes) {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new LinkPreviewError(413, 'The preview response was too large.', 'response_too_large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const accepted = value.byteLength > remaining ? value.slice(0, remaining) : value;
      total += accepted.byteLength;
      html += decoder.decode(accepted, { stream: true });
      const headEnd = html.search(/<\/head\s*>/i);
      if (headEnd >= 0) {
        html = html.slice(0, headEnd + html.slice(headEnd).match(/^<\/head\s*>/i)[0].length);
        break;
      }
      if (value.byteLength > remaining || total >= maxBytes) {
        throw new LinkPreviewError(413, 'The preview response was too large.', 'response_too_large');
      }
    }
    html += decoder.decode();
    return html;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function readLimitedBytes(response, maxBytes) {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new LinkPreviewError(413, 'The preview response was too large.', 'response_too_large');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new LinkPreviewError(413, 'The preview response was too large.', 'response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output;
}

export async function validateRemoteUrl(input, validateDns = true) {
  let parsed;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : parseHttpUrl(input);
  } catch (error) {
    throw new LinkPreviewError(400, error.message || 'Enter a valid URL.', 'invalid_url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new LinkPreviewError(400, 'Only http and https URLs can be previewed.', 'unsupported_protocol');
  }
  if (parsed.username || parsed.password) {
    throw new LinkPreviewError(400, 'Links containing usernames or passwords are not supported.', 'blocked_host');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new LinkPreviewError(400, 'This URL is not available for preview.', 'blocked_host');
  }
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new LinkPreviewError(400, 'This URL is not available for preview.', 'blocked_host');
    }
    return parsed;
  }
  if (!validateDns) return parsed;
  let timer;
  const dnsTimeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('DNS lookup timeout')), 2000);
  });
  let addresses = [];
  try {
    addresses = await Promise.race([
      lookup(parsed.hostname, { all: true, verbatim: true }),
      dnsTimeout
    ]);
  } catch {
    throw new LinkPreviewError(400, 'This URL is not available for preview.', 'blocked_host');
  } finally {
    clearTimeout(timer);
  }
  if (!addresses.length || addresses.some(address => isPrivateAddress(address.address))) {
    throw new LinkPreviewError(400, 'This URL is not available for preview.', 'blocked_host');
  }
  return parsed;
}

export function isPrivateAddress(address) {
  const normalized = `${address}`.toLowerCase().split('%')[0];
  const ipVersion = net.isIP(normalized);
  if (!ipVersion) return true;
  if (ipVersion === 6 && normalized.includes('.')) {
    const ipv4Tail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (ipv4Tail && isPrivateIpv4(ipv4Tail)) return true;
  }
  if (ipVersion === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('64:ff9b:1:') ||
      normalized.startsWith('100:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      /^2001:0?[0-1][0-9a-f]:/.test(normalized) ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('2002:') ||
      normalized.startsWith('ff')
    );
  }
  return isPrivateIpv4(normalized);
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function extractTextFromEmbedHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  const $ = cheerio.load(html);
  $('script, style, iframe, object, embed').remove();
  return limitText($.root().text().replace(/\s+/g, ' ').trim(), 2000);
}

function firstPresent(values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function cleanInlineText(value) {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function limitText(value, maxLength) {
  const cleaned = cleanInlineText(value);
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

function absoluteUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return '';
  try {
    const parsed = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
      hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || (net.isIP(hostname) && isPrivateAddress(hostname))
    ) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function providerName(link) {
  return SOCIAL_PROVIDER_NAMES[link.platform] || new URL(link.canonicalUrl).hostname.replace(/^www\./, '');
}

function friendlyKind(kind) {
  const labels = {
    short: 'Short',
    video: 'video',
    post: 'post',
    reel: 'reel',
    story: 'story',
    profile: 'profile',
    comment: 'comment',
    pin: 'pin',
    article: 'article',
    track: 'track',
    album: 'album',
    playlist: 'playlist',
    artist: 'artist',
    show: 'show',
    episode: 'episode',
    audiobook: 'audiobook',
    page: 'link'
  };
  return labels[kind] || 'link';
}

function toWarning(code, error) {
  return {
    code,
    message: error instanceof Error ? error.message : 'Preview information was unavailable.'
  };
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}

function getConfiguredMastodonHosts() {
  return `${process.env.MASTODON_PREVIEW_HOSTS || ''}`
    .split(',')
    .map(host => host.trim())
    .filter(Boolean);
}

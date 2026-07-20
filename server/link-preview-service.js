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

export class LinkPreviewError extends Error {
  constructor(status, message, code = 'link_preview_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getLinkPreview(inputUrl, internalOptions = {}) {
  let initialUrl;
  try {
    initialUrl = parseHttpUrl(inputUrl);
  } catch (error) {
    throw new LinkPreviewError(400, error.message || 'Enter a valid URL.', 'invalid_url');
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

    if (endpoint) {
      try {
        const oembed = await fetchJson(endpoint, context);
        return buildOEmbedPreview(oembed, link, {
          originalUrl: initialUrl.toString(),
          resolvedUrl: resolvedUrl.toString(),
          redirectChain,
          warnings
        });
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

      const html = await readLimitedText(fetched.response, MAX_HTML_BYTES);
      link = parseAndNormalizeLink(fetched.finalUrl.toString(), {
        mastodonHosts: context.mastodonHosts
      });
      return extractLinkPreview(html, link, {
        originalUrl: initialUrl.toString(),
        resolvedUrl: fetched.finalUrl.toString(),
        redirectChain: [...redirectChain, ...fetched.redirectChain.slice(1)],
        warnings
      });
    } catch (error) {
      if (link.platform !== 'unknown') {
        warnings.push(toWarning('page_preview_unavailable', error));
        return buildSocialFallback(link, {
          originalUrl: initialUrl.toString(),
          resolvedUrl: resolvedUrl.toString(),
          redirectChain,
          warnings
        });
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

export function extractLinkPreview(html, link, requestMeta = {}) {
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
  ]), link.canonicalUrl);
  const siteName = firstPresent([
    meta('meta[property="og:site_name"]'),
    providerName(link),
    new URL(link.canonicalUrl).hostname.replace(/^www\./, '')
  ]);
  const type = firstPresent([
    meta('meta[property="og:type"]'),
    meta('meta[name="twitter:card"]')
  ]);

  return buildPreviewEnvelope({
    link,
    requestMeta,
    title: title || siteName || 'Shared link',
    description,
    image,
    siteName,
    type,
    previewProvider: 'html'
  });
}

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

  return buildPreviewEnvelope({
    link,
    requestMeta,
    title,
    description,
    image,
    siteName: provider,
    type: cleanInlineText(oembed.type || 'rich'),
    previewProvider: 'oembed'
  });
}

function buildSocialFallback(link, requestMeta) {
  const provider = providerName(link);
  return buildPreviewEnvelope({
    link,
    requestMeta,
    title: `${provider} ${friendlyKind(link.kind)}`,
    description: `Saved from ${provider}. Open the original link to view the public content.`,
    image: '',
    siteName: provider,
    type: 'link',
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
  previewProvider
}) {
  const cleanTitle = limitText(title, 500);
  const cleanDescription = limitText(description, 2000);
  const cleanSiteName = limitText(siteName, 200);
  const cleanType = limitText(type, 100);
  const social = link.platform === 'unknown'
    ? null
    : {
        platform: link.platform,
        kind: link.kind,
        providerName: providerName(link),
        ...link.identity
      };

  return {
    url: link.canonicalUrl,
    canonicalUrl: link.canonicalUrl,
    originalUrl: requestMeta.originalUrl || link.originalUrl,
    resolvedUrl: requestMeta.resolvedUrl || link.canonicalUrl,
    title: cleanTitle || cleanSiteName || 'Shared link',
    description: cleanDescription,
    image,
    siteName: cleanSiteName,
    type: cleanType,
    previewProvider,
    social,
    removedParameters: link.removedParameters,
    redirectChain: uniqueStrings(requestMeta.redirectChain || []),
    warnings: requestMeta.warnings || [],
    intent: inferLinkIntent(link.canonicalUrl, {
      title: cleanTitle,
      description: cleanDescription,
      siteName: cleanSiteName,
      type: cleanType,
      platform: link.platform
    })
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
  if (meta.platform === 'pinterest' || /(pinterest\.|pin\/|moodboard|inspiration|design|behance|dribbble)/.test(haystack)) {
    return { kind: 'visual', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'spring', label: 'Visual bookmark' };
  }
  if (meta.platform === 'youtube' || /(youtube\.|youtu\.be|vimeo\.|video|watch)/.test(haystack)) {
    return { kind: 'video', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'celebration', label: 'Video' };
  }
  if (meta.platform && meta.platform !== 'unknown') {
    return { kind: 'social', folder: 'Social Saves', noteType: 'bookmark', theme: 'office', label: 'Social post' };
  }
  return { kind: 'bookmark', folder: 'Inspiration Wall', noteType: 'bookmark', theme: 'office', label: 'Bookmark' };
}

async function resolveKnownShortLink(input, context) {
  let current = new URL(input.toString());
  const chain = [current.toString()];

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (!isRecognizedShortener(current)) return { url: current, chain };
    const fetched = await fetchSingle(current, context, {
      accept: '*/*',
      headers: { Range: 'bytes=0-0' }
    });
    await fetched.body?.cancel();
    if (!isRedirect(fetched.status)) return { url: current, chain };

    const location = fetched.headers.get('location');
    if (!location) return { url: current, chain };
    current = unwrapKnownRedirect(new URL(location, current));
    await validateRemoteUrl(current, context.validateDns);
    chain.push(current.toString());
  }

  throw new LinkPreviewError(502, 'The shared link redirected too many times.', 'too_many_redirects');
}

async function fetchJson(url, context) {
  const fetched = await fetchWithRedirects(url, context, { accept: 'application/json' });
  if (!fetched.response.ok) {
    await fetched.response.body?.cancel();
    throw new LinkPreviewError(502, `Preview provider returned ${fetched.response.status}.`, 'oembed_failed');
  }
  const contentType = fetched.response.headers.get('content-type') || '';
  if (contentType && !contentType.includes('json') && !contentType.includes('javascript')) {
    await fetched.response.body?.cancel();
    throw new LinkPreviewError(502, 'Preview provider did not return JSON.', 'invalid_oembed');
  }
  const bytes = await readLimitedBytes(fetched.response, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LinkPreviewError(502, 'Preview provider returned malformed JSON.', 'invalid_oembed');
  }
}

async function fetchWithRedirects(input, context, options = {}) {
  let current = new URL(input.toString());
  const redirectChain = [current.toString()];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchSingle(current, context, options);
    if (!isRedirect(response.status)) {
      return { response, finalUrl: current, redirectChain };
    }

    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) return { response, finalUrl: current, redirectChain };
    if (hop === MAX_REDIRECTS) {
      throw new LinkPreviewError(502, 'The shared link redirected too many times.', 'too_many_redirects');
    }
    current = new URL(location, current);
    await validateRemoteUrl(current, context.validateDns);
    redirectChain.push(current.toString());
  }

  throw new LinkPreviewError(502, 'The shared link redirected too many times.', 'too_many_redirects');
}

async function fetchSingle(url, context, options = {}) {
  await validateRemoteUrl(url, context.validateDns);
  try {
    return await context.fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: context.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept': options.accept || '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (context.signal.aborted || error?.name === 'AbortError') {
      throw new LinkPreviewError(502, 'Timed out while fetching link metadata.', 'upstream_timeout');
    }
    throw new LinkPreviewError(502, 'Could not reach the preview provider.', 'upstream_unreachable');
  }
}

async function readLimitedText(response, maxBytes) {
  const bytes = await readLimitedBytes(response, maxBytes);
  return new TextDecoder().decode(bytes);
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
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.toString()
      : '';
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

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value))];
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

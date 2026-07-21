const TRACKING_PARAMETERS = new Set([
  'fbclid', 'mibextid', '__cft__', '__tn__', 'gclid', 'dclid', 'msclkid', 'twclid', 'igshid',
  'ref_src', 'ref_url', 'si', 'share_id', 'share_link_id',
  'sender_device', 'sender_web_id', 'is_from_webapp'
]);

const PLATFORM_DETAILS = {
  facebook: { name: 'Facebook', folder: 'Social Saves', theme: 'office' },
  x: { name: 'X', folder: 'Social Saves', theme: 'office' },
  pinterest: { name: 'Pinterest', folder: 'Inspiration Wall', theme: 'spring' }
};

export function normalizeSocialCaptureUrl(input) {
  let url;
  try {
    url = new URL(`${input || ''}`.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;

  url.protocol = 'https:';
  url.hash = '';
  const platform = detectSocialPlatform(url);
  if (platform === 'facebook' && !['fb.me', 'fb.watch'].includes(url.hostname)) {
    url.hostname = 'www.facebook.com';
  } else if (platform === 'x') {
    url.hostname = 'x.com';
  } else if (platform === 'pinterest' && url.hostname !== 'pin.it') {
    url.hostname = 'www.pinterest.com';
  }

  const preservedFacebookParameters = url.pathname === '/story.php'
    ? new Set(['story_fbid', 'id'])
    : new Set();
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMETERS.has(lower)) {
      url.searchParams.delete(key);
      continue;
    }
    if (platform && platform !== 'facebook') url.searchParams.delete(key);
    if (platform === 'facebook' && url.pathname === '/story.php' && !preservedFacebookParameters.has(lower)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  return {
    originalUrl: `${input}`.trim(),
    canonicalUrl: url.toString(),
    platform,
    kind: detectSocialKind(url, platform)
  };
}

export function parseSharedLaunchData(input) {
  const params = input instanceof URLSearchParams
    ? input
    : new URLSearchParams(`${input || ''}`.replace(/^\?/, ''));
  const title = cleanSharedText(params.get('title'));
  const text = cleanSharedText(params.get('text'));
  const suppliedUrl = cleanSharedText(params.get('url'));
  const detectedUrl = firstHttpUrl(suppliedUrl) || firstHttpUrl(text) || firstHttpUrl(title) || '';
  const normalized = normalizeSocialCaptureUrl(detectedUrl);
  const image = sanitizeSharedImage(params.get('image'));

  return {
    title,
    text,
    suppliedUrl,
    image,
    hasSharedFile: params.get('sharedFile') === '1' || params.has('sharedFilesCount'),
    url: normalized?.canonicalUrl || detectedUrl,
    social: normalized
  };
}

export function createFallbackSocialPreview(inputUrl, options = {}) {
  const normalized = normalizeSocialCaptureUrl(inputUrl);
  if (!normalized?.platform) return null;
  const details = PLATFORM_DETAILS[normalized.platform];
  const kind = normalized.kind || 'post';
  return {
    url: normalized.canonicalUrl,
    canonicalUrl: normalized.canonicalUrl,
    originalUrl: normalized.originalUrl,
    title: cleanSharedText(options.title) || `${details.name} ${friendlyKind(kind)}`,
    description: cleanSharedText(options.caption),
    image: sanitizeSharedImage(options.image),
    siteName: details.name,
    type: kind,
    previewProvider: 'fallback',
    social: {
      platform: normalized.platform,
      kind,
      providerName: details.name
    },
    warnings: [{ code: 'local_fallback', message: 'Public preview metadata was unavailable.' }],
    intent: {
      kind: normalized.platform === 'pinterest' ? 'visual' : 'social',
      folder: details.folder,
      noteType: 'bookmark',
      theme: details.theme,
      label: `${details.name} ${friendlyKind(kind)}`
    }
  };
}

export function isSupportedSocialPlatform(platform) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_DETAILS, platform);
}

function detectSocialPlatform(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'fb.me' || host === 'fb.watch' || host === 'facebook.com' || host.endsWith('.facebook.com')) return 'facebook';
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
  if (host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com')) return 'pinterest';
  return null;
}

function detectSocialKind(url, platform) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (platform === 'x') return parts.includes('status') ? 'post' : 'profile';
  if (platform === 'pinterest') return parts.includes('pin') ? 'pin' : 'page';
  if (platform === 'facebook') {
    if (parts[0] === 'reel') return 'reel';
    if (parts.includes('videos') || parts[0] === 'watch') return 'video';
    if (parts.includes('posts') || parts[0] === 'share' || url.pathname === '/story.php') return 'post';
    return 'profile';
  }
  return 'page';
}

function firstHttpUrl(value) {
  return `${value || ''}`.match(/https?:\/\/[^\s\n\r]+/i)?.[0]?.replace(/[.,!?;:]+$/u, '') || '';
}

function cleanSharedText(value) {
  return `${value || ''}`.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 10000);
}

function sanitizeSharedImage(value) {
  if (!value) return '';
  const candidate = `${value}`.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function friendlyKind(kind) {
  return ({ post: 'post', pin: 'pin', reel: 'reel', video: 'video', profile: 'profile' })[kind] || 'link';
}

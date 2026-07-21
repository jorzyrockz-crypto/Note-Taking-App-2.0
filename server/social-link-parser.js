const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'mibextid',
  '__cft__',
  '__tn__',
  'gclid',
  'dclid',
  'msclkid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'ref_url',
  'feature',
  'app',
  'si',
  'spm_id_from',
  'share_id',
  'share_app_id',
  'share_link_id',
  'sender_device',
  'sender_web_id',
  'is_from_webapp',
  'refer'
]);

const SHORTENER_HOSTS = new Set([
  't.co',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'fb.me',
  'fb.watch',
  'lnkd.in',
  'pin.it',
  'spotify.link',
  'redd.it'
]);

export const SOCIAL_PROVIDER_NAMES = {
  youtube: 'YouTube',
  x: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  spotify: 'Spotify',
  bluesky: 'Bluesky',
  tumblr: 'Tumblr',
  mastodon: 'Mastodon'
};

export function parseAndNormalizeLink(inputUrl, options = {}) {
  const original = parseHttpUrl(inputUrl);
  const url = new URL(original.toString());
  const mastodonHosts = normalizeHostList(options.mastodonHosts || []);

  if (isHost(url, 'youtube.com', 'youtu.be', 'youtube-nocookie.com')) {
    return youtube(url, original);
  }
  if (isHost(url, 'x.com', 'twitter.com')) return x(url, original);
  if (isHost(url, 'tiktok.com')) return tiktok(url, original);
  if (isHost(url, 'instagram.com')) return instagram(url, original);
  if (isHost(url, 'facebook.com', 'fb.com', 'fb.watch')) return facebook(url, original);
  if (isHost(url, 'threads.com', 'threads.net')) return threads(url, original);
  if (isHost(url, 'reddit.com', 'redd.it')) return reddit(url, original);
  if (isHost(url, 'linkedin.com', 'lnkd.in')) return linkedin(url, original);
  if (isHost(url, 'pinterest.com', 'pin.it')) return pinterest(url, original);
  if (isHost(url, 'open.spotify.com', 'spotify.com', 'spotify.link')) return spotify(url, original);
  if (isHost(url, 'bsky.app')) return bluesky(url, original);
  if (isHost(url, 'tumblr.com')) return tumblr(url, original);
  if (mastodonHosts.has(url.hostname)) return mastodon(url, original);

  const removedParameters = removeTrackingParameters(url);
  return buildResult(original, url, 'unknown', 'page', {}, removedParameters, { preserveHash: true });
}

export function getOEmbedEndpoint(link, options = {}) {
  let endpoint = null;
  switch (link.platform) {
    case 'youtube':
      if (['video', 'short'].includes(link.kind)) endpoint = new URL('https://www.youtube.com/oembed');
      break;
    case 'x':
      if (link.kind === 'post') endpoint = new URL('https://publish.twitter.com/oembed');
      break;
    case 'spotify':
      if (['track', 'album', 'playlist', 'artist', 'show', 'episode', 'audiobook'].includes(link.kind)) {
        endpoint = new URL('https://open.spotify.com/oembed');
      }
      break;
    case 'tiktok':
      if (['video', 'post', 'profile'].includes(link.kind)) endpoint = new URL('https://www.tiktok.com/oembed');
      break;
    case 'reddit':
      if (['post', 'comment'].includes(link.kind)) endpoint = new URL('https://www.reddit.com/oembed');
      break;
    case 'bluesky':
      if (link.kind === 'post') endpoint = new URL('https://embed.bsky.app/oembed');
      break;
    case 'tumblr':
      if (link.kind === 'post') endpoint = new URL('https://www.tumblr.com/oembed');
      break;
    case 'mastodon': {
      const host = new URL(link.canonicalUrl).hostname;
      if (link.kind === 'post' && normalizeHostList(options.mastodonHosts || []).has(host)) {
        endpoint = new URL(`https://${host}/api/oembed`);
      }
      break;
    }
    default:
      break;
  }

  if (!endpoint) return null;
  endpoint.searchParams.set('url', link.canonicalUrl);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('maxwidth', '640');
  return endpoint;
}

export function unwrapKnownRedirect(input) {
  const url = input instanceof URL ? new URL(input.toString()) : parseHttpUrl(input);
  let nested = null;

  if (url.hostname === 'l.instagram.com') nested = url.searchParams.get('u');
  if (['l.facebook.com', 'lm.facebook.com'].includes(url.hostname) && url.pathname === '/l.php') {
    nested = url.searchParams.get('u');
  }
  if (isHost(url, 'youtube.com') && url.pathname === '/redirect') {
    nested = url.searchParams.get('q');
  }

  if (!nested) return url;
  try {
    const parsed = new URL(nested);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : url;
  } catch {
    return url;
  }
}

export function isRecognizedShortener(input) {
  const url = input instanceof URL ? input : parseHttpUrl(input);
  if (SHORTENER_HOSTS.has(url.hostname)) return true;
  return url.hostname === 'www.tiktok.com' && /^\/t\//i.test(url.pathname);
}

export function parseHttpUrl(inputUrl) {
  if (typeof inputUrl !== 'string' || !inputUrl.trim()) {
    throw new TypeError('Enter a valid URL.');
  }
  if (inputUrl.length > 8192) throw new TypeError('The URL is too long.');

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(inputUrl.trim()) ? inputUrl.trim() : `https://${inputUrl.trim()}`);
  } catch {
    throw new TypeError('Enter a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Only http and https URLs can be previewed.');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('Links containing usernames or passwords are not supported.');
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed;
}

function youtube(url, original) {
  forceHttps(url);
  const originalHost = url.hostname;
  let id;
  let kind = 'page';

  if (originalHost === 'youtu.be' || originalHost.endsWith('.youtu.be')) {
    id = cleanId(url.pathname.split('/').filter(Boolean)[0]);
    url.hostname = 'www.youtube.com';
    url.pathname = '/watch';
    if (id) url.searchParams.set('v', id);
    kind = 'video';
  } else {
    url.hostname = 'www.youtube.com';
    const parts = url.pathname.split('/').filter(Boolean);
    const first = parts[0]?.toLowerCase();
    if (first === 'watch') {
      id = cleanId(url.searchParams.get('v'));
      kind = id ? 'video' : 'page';
    } else if (first === 'shorts' && parts[1]) {
      id = cleanId(parts[1]);
      if (id) url.pathname = `/shorts/${id}`;
      kind = 'short';
    } else if ((first === 'embed' || first === 'live') && parts[1]) {
      id = cleanId(parts[1]);
      url.pathname = '/watch';
      if (id) url.searchParams.set('v', id);
      kind = 'video';
    } else if (first === 'playlist') {
      kind = 'playlist';
    } else if (first === 'channel' || first === 'c' || first === 'user' || first?.startsWith('@')) {
      kind = 'channel';
    }
  }

  const hashTime = url.hash.startsWith('#t=') ? url.hash.slice(3) : null;
  const startSeconds = parseTime(url.searchParams.get('t') || url.searchParams.get('start') || hashTime);
  url.hash = '';
  if (startSeconds !== undefined) url.searchParams.set('t', String(startSeconds));
  const removed = removeTrackingParameters(url, new Set(['v', 'list', 'index', 't']));
  return buildResult(original, url, 'youtube', kind, compactIdentity({ id, startSeconds }), removed);
}

function x(url, original) {
  forceHttps(url);
  url.hostname = 'x.com';
  const parts = url.pathname.split('/').filter(Boolean);
  const statusIndex = parts.findIndex(part => part.toLowerCase() === 'status');
  const id = statusIndex >= 0 ? cleanNumericId(parts[statusIndex + 1]) : undefined;
  const handle = statusIndex > 0 && parts[statusIndex - 1] !== 'web'
    ? cleanHandle(parts[statusIndex - 1])
    : undefined;
  let kind = 'page';
  if (id) {
    url.pathname = handle ? `/${handle}/status/${id}` : `/i/status/${id}`;
    kind = 'post';
  } else if (parts[0] && !['home', 'explore', 'search', 'i'].includes(parts[0].toLowerCase())) {
    kind = 'profile';
  }
  const removed = removeTrackingParameters(url, new Set());
  return buildResult(original, url, 'x', kind, compactIdentity({ id, handle }), removed);
}

function tiktok(url, original) {
  forceHttps(url);
  if (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)) {
    return buildResult(original, url, 'tiktok', 'page', {}, removeTrackingParameters(url));
  }
  url.hostname = 'www.tiktok.com';
  const match = url.pathname.match(/^\/@([^/]+)\/(video|photo)\/(\d+)/i);
  const profile = url.pathname.match(/^\/@([^/]+)\/?$/i);
  let kind = 'page';
  let identity = {};
  if (match?.[1] && match[2] && match[3]) {
    const handle = cleanHandle(match[1]);
    if (handle) {
      const contentType = match[2].toLowerCase();
      const id = match[3];
      url.pathname = `/@${handle}/${contentType}/${id}`;
      identity = { id, handle };
      kind = contentType === 'video' ? 'video' : 'post';
    }
  } else if (profile?.[1]) {
    const handle = cleanHandle(profile[1]);
    if (handle) {
      url.pathname = `/@${handle}`;
      identity = { handle };
      kind = 'profile';
    }
  }
  return buildResult(original, url, 'tiktok', kind, identity, removeTrackingParameters(url, new Set()));
}

function instagram(url, original) {
  forceHttps(url);
  url.hostname = 'www.instagram.com';
  const content = url.pathname.match(/^\/(p|reel|reels|tv)\/([^/]+)/i);
  const story = url.pathname.match(/^\/stories\/([^/]+)\/(\d+)/i);
  let kind = 'page';
  let identity = {};
  if (story?.[1] && story[2]) {
    const handle = cleanHandle(story[1]);
    if (handle) {
      url.pathname = `/stories/${handle}/${story[2]}/`;
      identity = { id: story[2], handle };
      kind = 'story';
    }
  } else if (content?.[1] && content[2]) {
    const segment = content[1].toLowerCase() === 'reels' ? 'reel' : content[1].toLowerCase();
    url.pathname = `/${segment}/${content[2]}/`;
    identity = { id: content[2] };
    kind = segment === 'reel' ? 'reel' : segment === 'tv' ? 'video' : 'post';
  } else {
    const handle = cleanHandle(url.pathname.split('/').filter(Boolean)[0]);
    if (handle && !['explore', 'accounts', 'direct', 'stories'].includes(handle.toLowerCase())) {
      url.pathname = `/${handle}/`;
      identity = { handle };
      kind = 'profile';
    }
  }
  return buildResult(original, url, 'instagram', kind, identity, removeTrackingParameters(url, new Set()));
}

function facebook(url, original) {
  forceHttps(url);
  if (['fb.me', 'fb.watch'].includes(url.hostname)) {
    return buildResult(original, url, 'facebook', 'page', {}, removeTrackingParameters(url));
  }
  url.hostname = 'www.facebook.com';
  const parts = url.pathname.split('/').filter(Boolean);
  let kind = 'page';
  let id;
  let handle;
  let keep = new Set();
  const postsIndex = parts.findIndex(part => ['posts', 'videos'].includes(part.toLowerCase()));

  if (url.pathname === '/story.php') {
    id = url.searchParams.get('story_fbid') || undefined;
    handle = url.searchParams.get('id') || undefined;
    keep = new Set(['story_fbid', 'id']);
    kind = 'post';
  } else if (parts[0]?.toLowerCase() === 'reel' && parts[1]) {
    id = cleanNumericId(parts[1]);
    if (id) url.pathname = `/reel/${id}/`;
    kind = 'reel';
  } else if (parts[0]?.toLowerCase() === 'watch') {
    id = url.searchParams.get('v') || undefined;
    keep = new Set(['v']);
    kind = 'video';
  } else if (parts[0]?.toLowerCase() === 'share' && parts[1] && parts[2]) {
    id = parts[2];
    kind = parts[1].toLowerCase() === 'v' ? 'video' : 'post';
  } else if (postsIndex >= 0 && parts[postsIndex + 1]) {
    handle = postsIndex > 0 ? cleanHandle(parts[postsIndex - 1]) : undefined;
    const postPath = parts.slice(postsIndex + 1);
    id = [...postPath].reverse().find(part => /^\d+$/.test(part)) || postPath.at(-1);
    kind = parts[postsIndex]?.toLowerCase() === 'videos' ? 'video' : 'post';
  } else if (parts[0]) {
    handle = cleanHandle(parts[0]);
    kind = 'profile';
  }
  return buildResult(original, url, 'facebook', kind, compactIdentity({ id, handle }), removeTrackingParameters(url, keep));
}

function threads(url, original) {
  forceHttps(url);
  url.hostname = 'www.threads.com';
  const content = url.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/i);
  const profile = url.pathname.match(/^\/@([^/]+)\/?$/i);
  let kind = 'page';
  let identity = {};
  if (content?.[1] && content[2]) {
    const handle = cleanHandle(content[1]);
    if (handle) {
      url.pathname = `/@${handle}/post/${content[2]}`;
      identity = { id: content[2], handle };
      kind = 'post';
    }
  } else if (profile?.[1]) {
    const handle = cleanHandle(profile[1]);
    if (handle) {
      url.pathname = `/@${handle}`;
      identity = { handle };
      kind = 'profile';
    }
  }
  return buildResult(original, url, 'threads', kind, identity, removeTrackingParameters(url, new Set()));
}

function reddit(url, original) {
  forceHttps(url);
  if (url.hostname === 'redd.it' || url.hostname.endsWith('.redd.it')) {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return buildResult(original, url, 'reddit', 'post', id ? { id } : {}, removeTrackingParameters(url, new Set()));
  }
  url.hostname = 'www.reddit.com';
  const parts = url.pathname.split('/').filter(Boolean);
  const commentsIndex = parts.findIndex(part => part.toLowerCase() === 'comments');
  const subreddit = parts[0]?.toLowerCase() === 'r' ? parts[1] : undefined;
  const postId = commentsIndex >= 0 ? parts[commentsIndex + 1] : undefined;
  const commentId = commentsIndex >= 0 && parts.length > commentsIndex + 3 ? parts[commentsIndex + 3] : undefined;
  const id = commentId || postId;
  const kind = commentId ? 'comment' : postId ? 'post' : 'page';
  return buildResult(original, url, 'reddit', compactIdentity({ id, subreddit }), removeTrackingParameters(url, new Set()));
}

function linkedin(url, original) {
  forceHttps(url);
  if (url.hostname === 'lnkd.in') {
    return buildResult(original, url, 'linkedin', 'page', {}, removeTrackingParameters(url));
  }
  url.hostname = 'www.linkedin.com';
  const parts = url.pathname.split('/').filter(Boolean);
  let kind = 'page';
  let id;
  let handle;
  if (parts[0] === 'posts' && parts[1]) {
    kind = 'post';
    id = parts[1];
  } else if (parts[0] === 'feed' && parts[1] === 'update' && parts[2]) {
    kind = 'post';
    id = parts[2];
  } else if (parts[0] === 'pulse' && parts[1]) {
    kind = 'article';
    id = parts[1];
  } else if (['in', 'company', 'school'].includes(parts[0]) && parts[1]) {
    kind = 'profile';
    handle = parts[1];
  }
  return buildResult(original, url, 'linkedin', kind, compactIdentity({ id, handle }), removeTrackingParameters(url, new Set()));
}

function pinterest(url, original) {
  forceHttps(url);
  if (url.hostname === 'pin.it') {
    return buildResult(original, url, 'pinterest', 'page', {}, removeTrackingParameters(url));
  }
  url.hostname = 'www.pinterest.com';
  const parts = url.pathname.split('/').filter(Boolean);
  const pinIndex = parts.findIndex(part => part.toLowerCase() === 'pin');
  const id = pinIndex >= 0 ? cleanNumericId(parts[pinIndex + 1]) : undefined;
  if (id) url.pathname = `/pin/${id}/`;
  return buildResult(original, url, 'pinterest', id ? 'pin' : 'page', id ? { id } : {}, removeTrackingParameters(url, new Set()));
}

function spotify(url, original) {
  forceHttps(url);
  if (url.hostname === 'spotify.link') {
    return buildResult(original, url, 'spotify', 'page', {}, removeTrackingParameters(url));
  }

  url.hostname = 'open.spotify.com';
  const parts = url.pathname.split('/').filter(Boolean);
  if (/^intl-[a-z-]+$/i.test(parts[0] || '')) parts.shift();
  if (parts[0]?.toLowerCase() === 'embed') parts.shift();

  const supportedKinds = new Set(['track', 'album', 'playlist', 'artist', 'show', 'episode', 'audiobook']);
  const kind = supportedKinds.has(parts[0]?.toLowerCase()) ? parts[0].toLowerCase() : 'page';
  const id = kind !== 'page' ? cleanId(parts[1]) : undefined;
  if (id) url.pathname = `/${kind}/${id}`;

  return buildResult(
    original,
    url,
    'spotify',
    id ? kind : 'page',
    id ? { id } : {},
    removeTrackingParameters(url, new Set())
  );
}

function bluesky(url, original) {
  forceHttps(url);
  url.hostname = 'bsky.app';
  const content = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/i);
  const profile = url.pathname.match(/^\/profile\/([^/]+)\/?$/i);
  let kind = 'page';
  let identity = {};
  if (content?.[1] && content[2]) {
    const handle = cleanHandle(content[1]);
    if (handle) {
      url.pathname = `/profile/${handle}/post/${content[2]}`;
      identity = { id: content[2], handle };
      kind = 'post';
    }
  } else if (profile?.[1]) {
    const handle = cleanHandle(profile[1]);
    if (handle) {
      url.pathname = `/profile/${handle}`;
      identity = { handle };
      kind = 'profile';
    }
  }
  return buildResult(original, url, 'bluesky', kind, identity, removeTrackingParameters(url, new Set()));
}

function tumblr(url, original) {
  forceHttps(url);
  const parts = url.pathname.split('/').filter(Boolean);
  const postIndex = parts.findIndex(part => part.toLowerCase() === 'post');
  let id = postIndex >= 0 ? cleanNumericId(parts[postIndex + 1]) : undefined;
  let handle = url.hostname.endsWith('.tumblr.com')
    ? url.hostname.slice(0, -'.tumblr.com'.length)
    : undefined;
  if (!id && url.hostname === 'www.tumblr.com' && parts[0] && parts[1]) {
    if (parts[0] === 'blog' && parts[1] === 'view') {
      handle = parts[2];
      id = cleanNumericId(parts[3]);
    } else {
      handle = parts[0];
      id = cleanNumericId(parts[1]);
    }
  }
  return buildResult(original, url, 'tumblr', id ? 'post' : handle ? 'profile' : 'page', compactIdentity({ id, handle }), removeTrackingParameters(url, new Set()));
}

function mastodon(url, original) {
  forceHttps(url);
  const modern = url.pathname.match(/^\/@([^/]+)\/(\d+)/);
  const legacy = url.pathname.match(/^\/users\/([^/]+)\/statuses\/(\d+)/);
  const match = modern || legacy;
  const handle = match?.[1] ? cleanHandle(match[1]) : undefined;
  const id = match?.[2];
  return buildResult(original, url, 'mastodon', id ? 'post' : handle ? 'profile' : 'page', compactIdentity({ id, handle }), removeTrackingParameters(url, new Set()));
}

function buildResult(original, url, platform, kind, identity, removedParameters, options = {}) {
  if (!options.preserveHash) url.hash = '';
  return {
    originalUrl: original.toString(),
    canonicalUrl: url.toString(),
    platform,
    kind,
    identity,
    removedParameters
  };
}

function removeTrackingParameters(url, keep = null) {
  const removed = [];
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    const shouldRemove = keep
      ? !keep.has(lower)
      : lower.startsWith('utm_') || TRACKING_PARAMETERS.has(lower);
    if (shouldRemove) {
      url.searchParams.delete(key);
      removed.push(key);
    }
  }
  url.searchParams.sort();
  return [...new Set(removed)];
}

function isHost(url, ...domains) {
  return domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function forceHttps(url) {
  url.protocol = 'https:';
  if (url.port === '80' || url.port === '443') url.port = '';
}

function parseTime(value) {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return undefined;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function compactIdentity(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function cleanId(value) {
  return typeof value === 'string' ? value.match(/^[\w-]+$/)?.[0] : undefined;
}

function cleanNumericId(value) {
  return typeof value === 'string' ? value.match(/^\d+$/)?.[0] : undefined;
}

function cleanHandle(value) {
  if (!value) return undefined;
  return value.replace(/^@/, '').match(/^[\w.:-]+$/u)?.[0];
}

function normalizeHostList(hosts) {
  return new Set(hosts.map(host => `${host}`.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')));
}

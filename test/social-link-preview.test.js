import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLinkPreview,
  isPrivateAddress,
  LinkPreviewError
} from '../server/link-preview-service.js';
import { parseAndNormalizeLink } from '../server/social-link-parser.js';

test('normalizes YouTube share links and preserves start time', () => {
  const parsed = parseAndNormalizeLink(
    'https://youtu.be/M7lc1UVf-VE?t=1m30s&utm_source=share&si=tracking'
  );
  assert.equal(parsed.platform, 'youtube');
  assert.equal(parsed.kind, 'video');
  assert.equal(parsed.canonicalUrl, 'https://www.youtube.com/watch?t=90&v=M7lc1UVf-VE');
  assert.deepEqual(parsed.identity, { id: 'M7lc1UVf-VE', startSeconds: 90 });
});

test('normalizes current and legacy social URL variants', () => {
  const fixtures = [
    ['https://mobile.twitter.com/OpenAI/status/123456789/photo/1?ref_src=share', 'x', 'post', 'https://x.com/OpenAI/status/123456789'],
    ['https://www.facebook.com/facebook/posts/a-readable-post-slug/1257995956372422/?fbclid=tracking', 'facebook', 'post', 'https://www.facebook.com/facebook/posts/a-readable-post-slug/1257995956372422/'],
    ['https://www.pinterest.com/pin/99360735500167749/?utm_source=share', 'pinterest', 'pin', 'https://www.pinterest.com/pin/99360735500167749/'],
    ['https://open.spotify.com/intl-en/track/7AYHYR7LRNralDLN5HpdUj?si=tracking', 'spotify', 'track', 'https://open.spotify.com/track/7AYHYR7LRNralDLN5HpdUj'],
    ['https://instagram.com/reels/ABC_123/?igsh=share', 'instagram', 'reel', 'https://www.instagram.com/reel/ABC_123/'],
    ['https://threads.net/@openai/post/ExampleId?utm_campaign=share', 'threads', 'post', 'https://www.threads.com/@openai/post/ExampleId'],
    ['https://bsky.app/profile/example.com/post/3kabc', 'bluesky', 'post', 'https://bsky.app/profile/example.com/post/3kabc']
  ];

  fixtures.forEach(([url, platform, kind, canonicalUrl]) => {
    const parsed = parseAndNormalizeLink(url);
    assert.equal(parsed.platform, platform);
    assert.equal(parsed.kind, kind);
    assert.equal(parsed.canonicalUrl, canonicalUrl);
  });
});

test('normalizes Facebook web/share URLs and removes share tracking', () => {
  const parsed = parseAndNormalizeLink(
    'https://web.facebook.com/share/p/AbCdEf123/?mibextid=wwXIfr&fbclid=tracking'
  );

  assert.equal(parsed.platform, 'facebook');
  assert.equal(parsed.kind, 'post');
  assert.equal(parsed.identity.id, 'AbCdEf123');
  assert.equal(parsed.canonicalUrl, 'https://www.facebook.com/share/p/AbCdEf123/');
  assert.deepEqual(parsed.removedParameters.sort(), ['fbclid', 'mibextid']);
});

test('extracts the numeric id from slugged Facebook post URLs', () => {
  const parsed = parseAndNormalizeLink(
    'https://www.facebook.com/facebook/posts/a-readable-post-slug/1257995956372422/'
  );

  assert.deepEqual(parsed.identity, {
    id: '1257995956372422',
    handle: 'facebook'
  });
});

test('uses Spotify oEmbed metadata and classifies the result as audio', async () => {
  const fakeFetch = async input => {
    assert.match(String(input), /^https:\/\/open\.spotify\.com\/oembed\?/);
    return jsonResponse({
      type: 'rich',
      title: 'The Edge',
      provider_name: 'Spotify',
      thumbnail_url: 'https://i.scdn.co/image/example',
      html: '<iframe src="https://open.spotify.com/embed/track/7AYHYR7LRNralDLN5HpdUj"></iframe>'
    });
  };

  const preview = await getLinkPreview(
    'https://open.spotify.com/track/7AYHYR7LRNralDLN5HpdUj?si=tracking',
    { fetchImpl: fakeFetch, validateDns: false }
  );

  assert.equal(preview.previewProvider, 'oembed');
  assert.equal(preview.title, 'The Edge');
  assert.equal(preview.image, 'https://i.scdn.co/image/example');
  assert.equal(preview.social.platform, 'spotify');
  assert.equal(preview.social.kind, 'track');
  assert.equal(preview.intent.kind, 'audio');
  assert.equal(preview.intent.label, 'Spotify audio');
  assert.equal('html' in preview, false);
});

test('recognizes Spotify short links for safe redirect resolution', () => {
  const parsed = parseAndNormalizeLink('https://spotify.link/example?si=tracking');
  assert.equal(parsed.platform, 'spotify');
  assert.equal(parsed.kind, 'page');
});

test('returns platform-aware fallbacks when Facebook and Pinterest block previews', async () => {
  const fakeFetch = async () => new Response('forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/html' }
  });
  const fixtures = [
    {
      url: 'https://www.facebook.com/facebook/posts/example/1257995956372422/',
      platform: 'facebook',
      title: 'Facebook post',
      intent: 'social'
    },
    {
      url: 'https://www.pinterest.com/pin/99360735500167749/',
      platform: 'pinterest',
      title: 'Pinterest pin',
      intent: 'visual'
    }
  ];

  for (const fixture of fixtures) {
    const preview = await getLinkPreview(fixture.url, {
      fetchImpl: fakeFetch,
      validateDns: false
    });
    assert.equal(preview.previewProvider, 'fallback');
    assert.equal(preview.social.platform, fixture.platform);
    assert.equal(preview.title, fixture.title);
    assert.equal(preview.intent.kind, fixture.intent);
  }
});

test('resolves pin.it and captures public Pinterest head metadata', async () => {
  const calls = [];
  const fakeFetch = async input => {
    calls.push(String(input));
    if (String(input).startsWith('https://pin.it/')) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://www.pinterest.com/pin/99360735500167749/?utm_source=share' }
      });
    }
    return new Response(`<!doctype html><html><head>
      <meta property="og:title" content="A public inspiration pin">
      <meta property="og:description" content="A useful public pin description">
      <meta property="og:image" content="https://i.pinimg.com/example.jpg">
      <meta property="og:site_name" content="Pinterest">
    </head><body>${'x'.repeat(900000)}</body></html>`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Length': '901000'
      }
    });
  };

  const preview = await getLinkPreview('https://pin.it/example', {
    fetchImpl: fakeFetch,
    validateDns: false
  });

  assert.equal(calls.length, 2);
  assert.equal(preview.previewProvider, 'html');
  assert.equal(preview.title, 'A public inspiration pin');
  assert.equal(preview.description, 'A useful public pin description');
  assert.equal(preview.image, 'https://i.pinimg.com/example.jpg');
  assert.equal(preview.canonicalUrl, 'https://www.pinterest.com/pin/99360735500167749/');
});

test('sanitizes malicious public HTML metadata and rejects private preview images', async () => {
  const fakeFetch = async () => new Response(`<!doctype html><html><head>
    <meta property="og:title" content="&lt;img src=x onerror=alert(1)&gt;Safe title">
    <meta property="og:description" content="&lt;script&gt;alert(1)&lt;/script&gt;Safe description">
    <meta property="og:image" content="http://127.0.0.1/private.png">
  </head></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });

  const preview = await getLinkPreview('https://www.pinterest.com/pin/99360735500167749/', {
    fetchImpl: fakeFetch,
    validateDns: false
  });

  assert.equal(preview.title, 'Safe title');
  assert.equal(preview.description, 'alert(1) Safe description');
  assert.equal(preview.image, '');
  assert.equal(preview.title.includes('<'), false);
});

test('treats provider-only social HTML as a blocked-preview fallback', async () => {
  const fakeFetch = async () => new Response(
    '<!doctype html><html><head><title>Pinterest</title></head></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );

  const preview = await getLinkPreview('https://www.pinterest.com/pin/99360735500167749/', {
    fetchImpl: fakeFetch,
    validateDns: false
  });

  assert.equal(preview.previewProvider, 'fallback');
  assert.equal(preview.title, 'Pinterest pin');
  assert.equal(preview.warnings.at(-1).code, 'metadata_unavailable');
});

test('removes generic tracking parameters without breaking functional fragments', () => {
  const parsed = parseAndNormalizeLink(
    'https://example.com/docs?id=42&utm_source=social#installation'
  );
  assert.equal(parsed.platform, 'unknown');
  assert.equal(parsed.canonicalUrl, 'https://example.com/docs?id=42#installation');
});

test('uses oEmbed metadata for YouTube without returning raw embed HTML', async () => {
  const fakeFetch = async input => {
    assert.match(String(input), /^https:\/\/www\.youtube\.com\/oembed\?/);
    return jsonResponse({
      type: 'video',
      title: 'A useful video',
      author_name: 'Creator',
      provider_name: 'YouTube',
      thumbnail_url: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg',
      html: '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>'
    });
  };

  const preview = await getLinkPreview(
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&utm_source=share',
    { fetchImpl: fakeFetch, validateDns: false }
  );

  assert.equal(preview.previewProvider, 'oembed');
  assert.equal(preview.title, 'A useful video');
  assert.equal(preview.canonicalUrl, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  assert.equal(preview.social.platform, 'youtube');
  assert.equal('html' in preview, false);
});

test('resolves a recognized social short link before requesting metadata', async () => {
  const calls = [];
  const fakeFetch = async input => {
    calls.push(String(input));
    if (String(input).startsWith('https://vm.tiktok.com/')) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://www.tiktok.com/@creator/video/7341234567890?is_from_webapp=1' }
      });
    }
    return jsonResponse({
      type: 'video',
      title: 'A short caption',
      author_name: 'Creator',
      provider_name: 'TikTok'
    });
  };

  const preview = await getLinkPreview('https://vm.tiktok.com/ZMexample/', {
    fetchImpl: fakeFetch,
    validateDns: false
  });

  assert.equal(calls.length, 2);
  assert.equal(preview.social.platform, 'tiktok');
  assert.equal(preview.social.kind, 'video');
  assert.equal(preview.canonicalUrl, 'https://www.tiktok.com/@creator/video/7341234567890');
});

test('strips markup from provider-controlled preview text', async () => {
  const fakeFetch = async () => jsonResponse({
    type: 'video',
    title: '<img src=x onerror=alert(1)>A safe caption',
    author_name: '<b>Creator</b>',
    provider_name: 'TikTok'
  });

  const preview = await getLinkPreview(
    'https://www.tiktok.com/@creator/video/7341234567890',
    { fetchImpl: fakeFetch, validateDns: false }
  );

  assert.equal(preview.title, 'Creator on TikTok');
  assert.equal(preview.description, 'A safe caption');
  assert.equal(preview.title.includes('<'), false);
  assert.equal(preview.description.includes('<'), false);
});

test('returns a useful social fallback when providers refuse previews', async () => {
  const fakeFetch = async input => {
    if (String(input).startsWith('https://publish.twitter.com/oembed')) {
      return new Response('unavailable', { status: 503 });
    }
    return new Response('forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/html' }
    });
  };

  const preview = await getLinkPreview('https://x.com/openai/status/123456789', {
    fetchImpl: fakeFetch,
    validateDns: false
  });

  assert.equal(preview.previewProvider, 'fallback');
  assert.equal(preview.social.platform, 'x');
  assert.equal(preview.intent.folder, 'Social Saves');
  assert.equal(preview.warnings.length, 2);
});

test('checks every redirect and blocks a redirect to a loopback address', async () => {
  const fakeFetch = async () => new Response(null, {
    status: 302,
    headers: { Location: 'http://127.0.0.1/admin' }
  });

  await assert.rejects(
    getLinkPreview('https://example.com/share', {
      fetchImpl: fakeFetch,
      validateDns: false
    }),
    error => error instanceof LinkPreviewError && error.code === 'blocked_host'
  );
});

test('blocks private, loopback, link-local, and documentation IP ranges', () => {
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('10.0.0.1'), true);
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('169.254.169.254'), true);
  assert.equal(isPrivateAddress('192.168.1.1'), true);
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('fc00::1'), true);
  assert.equal(isPrivateAddress('2001:db8::1'), true);
  assert.equal(isPrivateAddress('::ffff:192.168.1.1'), true);
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

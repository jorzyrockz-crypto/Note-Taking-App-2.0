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

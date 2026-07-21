import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallbackSocialPreview,
  normalizeSocialCaptureUrl,
  parseSharedLaunchData
} from '../social-capture.js';

test('captures Share Target title, caption, canonical URL, and shared image', () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  const params = new URLSearchParams({
    title: 'A pin worth keeping',
    text: 'My own caption https://www.pinterest.com/pin/99360735500167749/?utm_source=share',
    url: 'https://www.pinterest.com/pin/99360735500167749/?utm_source=share',
    image,
    sharedFile: '1',
    sharedFilesCount: '1'
  });

  const capture = parseSharedLaunchData(params);
  assert.equal(capture.title, 'A pin worth keeping');
  assert.match(capture.text, /^My own caption/);
  assert.equal(capture.url, 'https://www.pinterest.com/pin/99360735500167749/');
  assert.equal(capture.image, image);
  assert.equal(capture.hasSharedFile, true);
  assert.equal(capture.social.platform, 'pinterest');
});

test('normalizes supported client fallback URLs without tracking', () => {
  const fixtures = [
    ['https://web.facebook.com/share/p/AbCdEf123/?mibextid=share', 'facebook', 'https://www.facebook.com/share/p/AbCdEf123/'],
    ['https://mobile.twitter.com/OpenAI/status/123456789?s=20', 'x', 'https://x.com/OpenAI/status/123456789'],
    ['https://pin.it/example?utm_source=share', 'pinterest', 'https://pin.it/example']
  ];

  fixtures.forEach(([input, platform, canonicalUrl]) => {
    const parsed = normalizeSocialCaptureUrl(input);
    assert.equal(parsed.platform, platform);
    assert.equal(parsed.canonicalUrl, canonicalUrl);
  });
});

test('creates a clean platform fallback while preserving user content', () => {
  const fallback = createFallbackSocialPreview(
    'https://x.com/OpenAI/status/123456789?ref_src=share',
    {
      title: 'Research thread',
      caption: 'Read this later',
      image: 'data:image/jpeg;base64,aGVsbG8='
    }
  );

  assert.equal(fallback.previewProvider, 'fallback');
  assert.equal(fallback.canonicalUrl, 'https://x.com/OpenAI/status/123456789');
  assert.equal(fallback.title, 'Research thread');
  assert.equal(fallback.description, 'Read this later');
  assert.equal(fallback.social.platform, 'x');
  assert.equal(fallback.intent.folder, 'Social Saves');
});

test('rejects unsafe Share Target image URLs', () => {
  const capture = parseSharedLaunchData('?url=https://x.com/a/status/1&image=javascript:alert(1)');
  assert.equal(capture.image, '');
});

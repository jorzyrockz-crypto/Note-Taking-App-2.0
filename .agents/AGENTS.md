# Paperuss Project Rules

Whenever you update and commit changes to the codebase, you MUST perform the following steps:

1. **Update the Service Worker**: Increment the cache name constant (`CACHE_NAME`) in `public/sw.js` (e.g. from `paperuss-v48` to `paperuss-v49`) to force-trigger updates on client browsers.
2. **Update the version**: Increment the version identifier (e.g., to `2.3.2`) in the following files:
   - `app.js` (`const CURRENT_VERSION = 'x.y.z'`)
   - `firebase.js` (`version: 'x.y.z'`)
   - `index.html` (`<span class="version-label">Version x.y.z</span>`)
3. **Reflect what's new**: Document recent modifications and changes in:
   - `app.js` (`DEFAULT_CHANGELOG` array)
   - `firebase.js` (`changelog` array)
   - `index.html` (`changelog-list` HTML element)

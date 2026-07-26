// Remote Fluent icon catalog. Keep this deliberately curated so the picker is
// useful without making the PWA download the complete upstream icon package.
export const FLUENT_ICON_VERSION = '1.1.334';
export const FLUENT_ICON_CACHE = 'paperuss-fluent-icons-v1';
const CDN_ROOT = `https://cdn.jsdelivr.net/npm/@fluentui/svg-icons@${FLUENT_ICON_VERSION}/icons`;

const category = (id, label, icon, icons) => ({ id, label, icon, icons });
const icon = (id, label, terms = []) => ({ id, label, terms: [id, label, ...terms] });

export const FLUENT_ICON_CATEGORIES = [
  category('home', 'Home', icon('home', 'Home', ['house']), [
    icon('home', 'Home', ['house']), icon('bed', 'Bed'), icon('couch', 'Couch'), icon('building', 'Building'), icon('weather_sunny', 'Sun')
  ]),
  category('work', 'Work', icon('briefcase', 'Briefcase', ['job']), [
    icon('briefcase', 'Briefcase', ['job']), icon('calendar', 'Calendar'), icon('laptop', 'Laptop'), icon('document', 'Document', ['file']), icon('people', 'People', ['team'])
  ]),
  category('personal', 'Personal', icon('person', 'Person', ['profile']), [
    icon('person', 'Person', ['profile']), icon('heart', 'Heart'), icon('camera', 'Camera'), icon('color', 'Palette', ['paint']), icon('star', 'Star')
  ]),
  category('projects', 'Projects', icon('folder', 'Folder'), [
    icon('folder', 'Folder'), icon('rocket', 'Rocket'), icon('target', 'Target', ['goal']), icon('settings', 'Tools', ['wrench']), icon('clipboard_task', 'Tasks', ['kanban'])
  ]),
  category('finances', 'Finances', icon('wallet', 'Wallet', ['money']), [
    icon('wallet', 'Wallet', ['money']), icon('money', 'Money', ['cash']), icon('receipt', 'Receipt'), icon('credit_card', 'Credit card'), icon('calculator', 'Calculator')
  ])
];

const ICONS_BY_ID = new Map(
  FLUENT_ICON_CATEGORIES.flatMap(group => group.icons).map(entry => [entry.id, entry])
);

export function getFluentIcon(id) {
  return ICONS_BY_ID.get(id) || null;
}

export function getFluentIconUrl(id, variant = 'regular') {
  if (!getFluentIcon(id) || !['regular', 'filled'].includes(variant)) return '';
  return `${CDN_ROOT}/${id}_24_${variant}.svg`;
}

export function isFluentIcon(iconValue) {
  return Boolean(iconValue && typeof iconValue === 'object' && iconValue.type === 'fluent' && getFluentIcon(iconValue.value));
}

export function createFluentIconElement(iconValue, className = '') {
  const iconId = typeof iconValue === 'string' ? iconValue : iconValue?.value || iconValue?.id;
  const variant = typeof iconValue === 'object' ? iconValue.variant || 'regular' : 'regular';
  const definition = getFluentIcon(iconId);
  const url = getFluentIconUrl(iconId, variant);
  if (!definition || !url || typeof document === 'undefined') return null;

  const element = document.createElement('span');
  element.className = `fluent-icon ${className}`.trim();
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', definition.label);
  element.style.setProperty('--fluent-icon-url', `url("${url}")`);
  return element;
}

export async function cacheFluentIcon(iconValue) {
  const url = getFluentIconUrl(iconValue?.value, iconValue?.variant || 'regular');
  if (!url || typeof caches === 'undefined' || typeof fetch !== 'function') return false;

  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('image/svg+xml')) return false;
    await (await caches.open(FLUENT_ICON_CACHE)).put(url, response.clone());
    return true;
  } catch (error) {
    console.warn('Unable to cache Fluent icon:', error);
    return false;
  }
}

export async function getCachedFluentIconIds() {
  if (typeof caches === 'undefined') return new Set();
  try {
    const cache = await caches.open(FLUENT_ICON_CACHE);
    const keys = await cache.keys();
    return new Set(keys.map(request => {
      const match = request.url.match(/\/icons\/([^/]+)_24_(?:regular|filled)\.svg$/);
      return match?.[1];
    }).filter(Boolean));
  } catch (error) {
    console.warn('Unable to read Fluent icon cache:', error);
    return new Set();
  }
}

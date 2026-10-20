// Data layer: archive.org advancedsearch (collections) + Wayback availability API.
// Both endpoints send `access-control-allow-origin: *`, so we call them directly.

export type MediaType = 'movies' | 'audio' | 'etree' | 'texts' | 'image';

export const MEDIA_TYPES: { type: MediaType; label: string; icon: string }[] = [
  { type: 'movies', label: 'Film & TV', icon: '🎬' },
  { type: 'audio', label: 'Audio', icon: '🎵' },
  { type: 'etree', label: 'Live music', icon: '🎸' },
  { type: 'texts', label: 'Texts', icon: '📄' },
  { type: 'image', label: 'Images', icon: '🖼️' },
];

export interface Item {
  identifier: string;
  title: string;
  date: string; // YYYY-MM-DD
  year: number;
  mediatype: MediaType;
  /** Raw advancedsearch doc, for building collection-browser TileModels. */
  raw: Record<string, unknown>;
}

const FIELDS = ['identifier', 'title', 'date', 'mediatype', 'creator', 'collection', 'downloads'];

export interface WebCapture {
  site: string;
  year: number;
  timestamp: string; // YYYYMMDDhhmmss
  captureDate: string; // YYYY-MM-DD
  daysOff: number;
}

// Collection dates after ~2005 are often upload dates, which drown out the
// interesting historical items, so we cap the range.
const FIRST_YEAR = 1900;
const LAST_YEAR = 2005;
const ROWS_PER_TYPE = 200;

// --- tiny concurrency limiter so we stay polite to production search ---
const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const queue: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>(resolve => queue.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    queue.shift()?.();
  }
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = limited(fn);
    // Don't cache failures, so a retry can succeed.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

const first = (v: unknown): string =>
  String(Array.isArray(v) ? v[0] ?? '' : v ?? '');

/** Top items (by downloads) for this month-day across FIRST_YEAR..LAST_YEAR. */
export function searchMedia(monthDay: string, mediatype: MediaType): Promise<Item[]> {
  return cached(`search:${monthDay}:${mediatype}`, async () => {
    const dates: string[] = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) dates.push(`${y}-${monthDay}`);

    const params = new URLSearchParams();
    params.set('q', `date:(${dates.join(' OR ')}) AND mediatype:${mediatype}`);
    for (const f of FIELDS) params.append('fl[]', f);
    params.append('sort[]', 'downloads desc');
    params.set('rows', String(ROWS_PER_TYPE));
    params.set('output', 'json');

    const res = await fetch(`https://archive.org/advancedsearch.php?${params}`);
    if (!res.ok) throw new Error(`search ${mediatype}: HTTP ${res.status}`);
    const json = await res.json();

    return (json.response?.docs ?? [])
      .map((d: Record<string, unknown>): Item => {
        const date = first(d.date).slice(0, 10);
        return {
          identifier: first(d.identifier),
          title: first(d.title),
          date,
          year: Number(date.slice(0, 4)),
          mediatype,
          raw: d,
        };
      })
      // Multi-valued dates can fall outside the requested day; keep exact matches.
      .filter((i: Item) => i.title && i.date.endsWith(monthDay));
  });
}

const toIsoDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

/** Closest Wayback capture of `site` to the given date, or null if none. */
export function waybackClosest(site: string, isoDate: string): Promise<WebCapture | null> {
  return cached(`wayback:${site}:${isoDate}`, async () => {
    const ts = isoDate.replaceAll('-', '');
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(site)}&timestamp=${ts}`,
    );
    if (!res.ok) throw new Error(`wayback ${site}: HTTP ${res.status}`);
    const closest = (await res.json()).archived_snapshots?.closest;
    if (!closest?.available) return null;

    const captureDate = toIsoDate(closest.timestamp);
    const daysOff = Math.round(
      Math.abs(Date.parse(captureDate) - Date.parse(isoDate)) / 86_400_000,
    );
    return {
      site,
      year: Number(isoDate.slice(0, 4)),
      timestamp: closest.timestamp,
      captureDate,
      daysOff,
    };
  });
}

// --- hover previews: built from the item's file list (metadata API, CORS *) ---

export type Preview =
  | { kind: 'video'; src: string }
  | { kind: 'audio'; src: string; waveform?: string }
  | { kind: 'pages'; urls: string[] }
  | { kind: 'zoom' };

const MAX_PAGES = 12;
// Skip film leaders / quiet intros: start ~20% in, capped.
const startAt = (length: unknown, cap: number) =>
  Math.min(Math.floor((Number(length) || 0) * 0.2), cap);

const downloadUrl = (id: string, name: string) =>
  `https://archive.org/download/${id}/${name.split('/').map(encodeURIComponent).join('/')}`;

export function previewFor(item: Item): Promise<Preview | null> {
  if (item.mediatype === 'image') return Promise.resolve({ kind: 'zoom' });

  return cached(`preview:${item.identifier}`, async () => {
    const res = await fetch(`https://archive.org/metadata/${item.identifier}`);
    if (!res.ok) return null;
    const meta = await res.json();
    type File = { name: string; format?: string; length?: string };
    const files: File[] = meta.files ?? [];
    const id = item.identifier;

    if (item.mediatype === 'movies') {
      const mp4 =
        files.find(f => f.name.endsWith('_512kb.mp4')) ??
        files.find(f => f.name.toLowerCase().endsWith('.mp4'));
      if (!mp4) return null;
      return { kind: 'video', src: `${downloadUrl(id, mp4.name)}#t=${startAt(mp4.length, 60)}` };
    }

    if (item.mediatype === 'audio' || item.mediatype === 'etree') {
      const mp3 = files
        .filter(f => f.name.toLowerCase().endsWith('.mp3'))
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      if (!mp3) return null;
      const base = mp3.name.replace(/\.mp3$/i, '');
      const png = files.find(f => f.name === `${base}.png`);
      return {
        kind: 'audio',
        src: `${downloadUrl(id, mp3.name)}#t=${startAt(mp3.length, 30)}`,
        waveform: png && downloadUrl(id, png.name),
      };
    }

    if (item.mediatype === 'texts') {
      const count = Math.min(Number(meta.metadata?.imagecount) || 0, MAX_PAGES);
      if (count < 2) return null;
      const urls = Array.from({ length: count }, (_, n) =>
        `https://archive.org/download/${id}/page/n${n}_w300.jpg`);
      return { kind: 'pages', urls };
    }

    return null;
  });
}

export const thumbUrl =(id: string) => `https://archive.org/services/img/${id}`;
export const detailsUrl = (id: string) => `https://archive.org/details/${id}`;
export const embedUrl = (id: string) => `https://archive.org/embed/${id}`;
// `if_` = iframe mode: rewritten links, no Wayback toolbar.
export const waybackFrameUrl = (c: WebCapture) =>
  `https://web.archive.org/web/${c.timestamp}if_/${c.site}`;
export const waybackUrl = (c: WebCapture) =>
  `https://web.archive.org/web/${c.timestamp}/${c.site}`;

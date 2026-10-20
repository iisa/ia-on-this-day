// Helpers shared by the full timeline page and the homepage widget.
import { ItemHit, type SortParam } from '@internetarchive/search-service';
// Deep imports so we only pull in the tile, not the whole collection-browser app.
import '@internetarchive/collection-browser/dist/src/tiles/grid/item-tile.js';
import { TileModel } from '@internetarchive/collection-browser/dist/src/models.js';
import type { Item } from './api';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "07-20" → "July 20" */
export const monthDayLabel = (monthDay: string) => {
  const [m, d] = monthDay.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

/** "07-20" → "JUL 20", for the split-flap board. */
export const flipText = (monthDay: string) => {
  const [m, d] = monthDay.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3).toUpperCase()} ${String(d).padStart(2, '0')}`;
};

export const today = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Era tint: amber/sepia for 1900, sweeping through teal to magenta by 2005. */
export const eraHue = (year: number) =>
  Math.round(35 + Math.min(Math.max((year - 1900) / 105, 0), 1) * 265);

// Same tile model archive.org search uses. Its flags blur `no-preview` items
// and mark `loggedin` ones, which keeps surprises off the demo screen.
const tileModels = new WeakMap<Item, TileModel>();
export const tileModel = (item: Item) => {
  let model = tileModels.get(item);
  if (!model) {
    model = new TileModel(new ItemHit({ fields: item.raw }));
    tileModels.set(item, model);
  }
  return model;
};

// Makes item-tile show the published date instead of the creator.
export const DATE_SORT: SortParam = { field: 'date', direction: 'desc' };

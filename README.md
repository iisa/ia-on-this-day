# On This Day

A multimedia time machine through the Internet Archive. Pick a day and see it across the years: film, audio, live music, texts, images, and the web as it looked through the Wayback Machine.

Built at an archive.org hackathon.

## Demo

- **Full timeline:** https://iisa.github.io/ia-on-this-day/
- **Homepage widget:** https://iisa.github.io/ia-on-this-day/widget.html
- **Jump to a day:** add `?date=MM-DD`, e.g. [the moon landing](https://iisa.github.io/ia-on-this-day/?date=07-20)

Try these in the full timeline:

- The presets (Moon landing, V-E Day, Pearl Harbor, JFK in Dallas) pin the famous year.
- 🎲 Random day picks any date.
- Hover a tile to preview it: video plays, audio plays, books flip pages, images pan. Click a tile to open the player.
- ◀ ▶, the mouse wheel or the arrow keys move along the timeline.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173/ (full timeline) or http://localhost:5173/widget.html (widget).

## Homepage widget

```html
<ia-on-this-day full-page-url="https://iisa.github.io/ia-on-this-day/"></ia-on-this-day>
```

| Attribute | What it does |
|---|---|
| `full-page-url` | Where "Travel through time" links to. `?date=MM-DD` is added. |
| `month-day` | Show a specific day (`MM-DD`) instead of today. |
| `silent` | Mute audio hover previews; they animate instead. |

Under the header, the widget shows how many items are dated that day, broken down by media type. Click a type (🎬 Film & TV, 🎵 Audio, 🎸 Live music, 📄 Texts, 🖼️ Images) to fill all ten tiles with it; click it again, or **All**, to go back to the mix.

The widget expects the page's root font size to be 10px, as on archive.org, because the collection-browser tiles size their text in `rem`.

## How it works

- **Collections:** one [advancedsearch](https://archive.org/advancedsearch.php) query per media type, for this month and day across 1900–2005. Later dates are often upload dates, which drown out the history.
- **Web:** the [Wayback availability API](https://archive.org/help/wayback_api.php) finds the capture closest to the day.
- **Tiles:** `<item-tile>` from [@internetarchive/collection-browser](https://www.npmjs.com/package/@internetarchive/collection-browser), the same tile archive.org search uses.
- **Previews:** built from each item's file list via the metadata API.

All of these APIs allow cross-origin requests, so there's no backend.

## Before this could go on the real homepage

- Compute the picks once a day into a cached JSON file instead of searching live for every visitor. A human check of each day's picks would be good too.
- The widget already leaves out `no-preview` and `loggedin` items. A list of trusted collections would tighten that further.
- Turn on `silent`, so nobody gets surprise audio on the front page.

Deploys to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

import { LitElement, css, html, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import {
  MEDIA_TYPES,
  searchMedia,
  waybackClosest,
  waybackFrameUrl,
  waybackUrl,
  type Item,
  type MediaType,
  type WebCapture,
} from './api';
import {
  DATE_SORT,
  MONTHS,
  eraHue,
  flipText,
  monthDayLabel,
  tileModel,
  today,
} from './shared';
import './tile-preview';
import './flip-date';
import type { MediaDialog } from './media-dialog';
import './media-dialog';
import './otd-info';

const WEB_SITES = ['nytimes.com', 'yahoo.com', 'cnn.com', 'whitehouse.gov', 'archive.org'];
const WEB_YEARS = [1996, 2000, 2005, 2010, 2015, 2020, 2025];
// Hide web captures too far from the chosen day to honestly call "on this day".
const MAX_DAYS_OFF = 60;
const TOP_YEARS = 12;

// `year` is pinned into the highlights; popularity alone doesn't reliably
// surface it. (Nov 9, 1989 was tried and dropped: no Berlin Wall items dated that day.)
const DEMO_DATES = [
  { label: 'Moon landing', monthDay: '07-20', year: 1969 },
  { label: 'V-E Day', monthDay: '05-08', year: 1945 },
  { label: 'Pearl Harbor', monthDay: '12-07', year: 1941 },
  { label: 'JFK in Dallas', monthDay: '11-22', year: 1963 },
];

/** Any real month-day, Feb 29 included (2000 is a leap year). */
const randomMonthDay = () => {
  const d = new Date(Date.UTC(2000, 0, 1 + Math.floor(Math.random() * 366)));
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const prettyDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};

// `hits` = how many top results fell in this year; a proxy for "something
// notable happened that day" (e.g. dozens of Apollo items on 1969-07-20).
type YearRow = { year: number; hits: number; items: Partial<Record<MediaType, Item>> };

@customElement('on-this-day')
export class OnThisDay extends LitElement {
  @state() private monthDay = today();
  @state() private pinnedYear?: number;
  @state() private site = WEB_SITES[0];
  @state() private rows: YearRow[] = [];
  @state() private web: (WebCapture | null)[] = [];
  @state() private loading = false;
  // Starts true: web captures load after the collections, and until then
  // there's nothing to show (not "no captures").
  @state() private webLoading = true;
  @state() private errors: string[] = [];
  @state() private showAll = false;
  @state() private selected?: Item;
  @state() private previewing?: Item;
  @state() private rolling = false;

  @query('media-dialog') private dialog!: MediaDialog;

  connectedCallback() {
    super.connectedCallback();
    // Deep link from the homepage widget: ?date=MM-DD
    const date = new URLSearchParams(location.search).get('date');
    if (date && /^\d{2}-\d{2}$/.test(date)) this.monthDay = date;
    this.load();
  }

  private get flipText() {
    return flipText(this.monthDay);
  }

  private get monthDayLabel() {
    return monthDayLabel(this.monthDay);
  }

  private async load() {
    this.loading = true;
    this.webLoading = true; // don't leave the previous day's captures up
    this.errors = [];
    this.rows = [];
    const monthDay = this.monthDay;

    const results = await Promise.allSettled(
      MEDIA_TYPES.map(m => searchMedia(monthDay, m.type)),
    );
    if (monthDay !== this.monthDay) return; // user picked a new date meanwhile

    const byYear = new Map<number, YearRow>();
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.errors = [...this.errors, `${MEDIA_TYPES[i].label} couldn't load.`];
        return;
      }
      // Results are sorted by downloads, so the first item per year wins.
      for (const item of r.value.items) {
        const row = byYear.get(item.year) ?? { year: item.year, hits: 0, items: {} };
        row.hits++;
        row.items[item.mediatype] ??= item;
        byYear.set(item.year, row);
      }
    });
    this.rows = [...byYear.values()];
    this.loading = false;
    this.loadWeb();
  }

  private async loadWeb() {
    this.webLoading = true;
    const { monthDay, site } = this;
    const results = await Promise.allSettled(
      WEB_YEARS.map(y => waybackClosest(site, `${y}-${monthDay}`)),
    );
    if (monthDay !== this.monthDay || site !== this.site) return;
    this.web = results.map(r => (r.status === 'fulfilled' ? r.value : null));
    this.webLoading = false;
  }

  /**
   * Most notable year (most top results) per decade, shown chronologically.
   * Per-decade, because recent years have far more items overall and would
   * otherwise crowd out e.g. 1945 on V-E Day.
   */
  private get visibleRows() {
    const sorted = [...this.rows].sort((a, b) => a.year - b.year);
    if (this.showAll) return sorted;
    const types = (r: YearRow) => Object.keys(r.items).length;
    const best = new Map<number, YearRow>();
    for (const row of sorted) {
      const decade = Math.floor(row.year / 10);
      const cur = best.get(decade);
      const pinned = (r?: YearRow) => this.pinnedYear !== undefined && r?.year === this.pinnedYear;
      if (pinned(cur)) continue;
      if (
        !cur || pinned(row) || row.hits > cur.hits ||
        (row.hits === cur.hits && types(row) > types(cur))
      ) {
        best.set(decade, row);
      }
    }
    return [...best.values()].slice(-TOP_YEARS);
  }

  private setMonthDay(monthDay: string, pinnedYear?: number) {
    this.pinnedYear = pinnedYear;
    if (monthDay === this.monthDay) return;
    this.monthDay = monthDay;
    this.showAll = false;
    this.load();
  }

  private pickRandom() {
    this.rolling = true;
    let next = randomMonthDay();
    while (next === this.monthDay) next = randomMonthDay();
    this.setMonthDay(next);
  }

  private onDateInput(e: Event) {
    const value = (e.target as HTMLInputElement).value; // YYYY-MM-DD
    if (value) this.setMonthDay(value.slice(5));
  }

  private onSiteChange(e: Event) {
    this.site = (e.target as HTMLSelectElement).value;
    this.loadWeb();
  }

  @query('.years') private track?: HTMLElement;

  /** Step to the next/previous year column (snap-friendly: lands on a column). */
  private scrollTrack(dir: 1 | -1) {
    const track = this.track;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    const cols = [...track.querySelectorAll<HTMLElement>('.year-row')];
    const centers = cols.map(c => c.offsetLeft + c.offsetWidth / 2);
    const target = dir > 0
      ? centers.find(c => c > mid + 1)
      : centers.reverse().find(c => c < mid - 1);
    if (target === undefined) return;
    this.glide(track, target - track.clientWidth / 2);
  }

  /**
   * Hand-rolled smooth scroll: `scrollTo({behavior: 'smooth'})` didn't move the
   * track when tested (likely scroll-snap fighting it), so tween it ourselves
   * with snapping paused.
   */
  private glide(track: HTMLElement, to: number) {
    const from = track.scrollLeft;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      track.scrollLeft = to;
      return;
    }
    const duration = 450;
    const t0 = performance.now();
    track.style.scrollSnapType = 'none';
    const step = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      track.scrollLeft = from + (to - from) * ease;
      if (t < 1) requestAnimationFrame(step);
      else track.style.scrollSnapType = '';
    };
    requestAnimationFrame(step);
  }


  protected updated() {
    // After a new date loads, bring the pinned year (or the start) into view.
    if (this.track && this.track.dataset.for !== this.monthDay + this.pinnedYear) {
      this.track.dataset.for = this.monthDay + this.pinnedYear;
      const pinned = this.track.querySelector<HTMLElement>('.year-row.pinned');
      if (pinned) {
        this.track.scrollLeft = pinned.offsetLeft - (this.track.clientWidth - pinned.offsetWidth) / 2;
      } else {
        this.track.scrollLeft = 0;
      }
    }
  }

  private endPreview(item: Item) {
    if (this.previewing === item) this.previewing = undefined;
  }

  private open(item: Item) {
    this.selected = item; // pauses hover previews while the player is up
    this.dialog.show(item);
  }

  render() {
    return html`
      <header>
        <p class="eyebrow">Internet Archive · Time Machine</p>
        <h1>
          <span class="lede">On this day</span>
          <flip-date .text=${this.flipText} .label=${this.monthDayLabel}></flip-date>
        </h1>
        <otd-info class="about" web></otd-info>
        <div class="controls">
          <button
            class="dice ${this.rolling ? 'rolling' : ''}"
            @click=${this.pickRandom}
            @animationend=${() => (this.rolling = false)}
          >
            <span aria-hidden="true">🎲</span> Random day
          </button>
          <label>
            Pick a day
            <input
              type="date"
              .value=${`2000-${this.monthDay}`}
              @change=${this.onDateInput}
            />
          </label>
          <div class="presets" role="group" aria-label="Notable days">
            <button
              @click=${() => this.setMonthDay(today())}
              aria-pressed=${this.monthDay === today() && !this.pinnedYear}
            >Today</button>
            ${DEMO_DATES.map(d => html`
              <button
                @click=${() => this.setMonthDay(d.monthDay, d.year)}
                aria-pressed=${this.pinnedYear === d.year}
              >${d.label}</button>
            `)}
          </div>
        </div>
      </header>

      ${this.renderWeb()}

      <section aria-labelledby="collections-heading">
        <h2 id="collections-heading">From the collections</h2>
        ${this.errors.map(e => html`<p class="error" role="alert">${e}</p>`)}
        ${this.loading
          ? html`<p class="status" role="status">Searching the stacks…</p>`
          : this.renderRows()}
      </section>

      <media-dialog @media-dialog-close=${() => (this.selected = undefined)}></media-dialog>
    `;
  }

  private renderWeb() {
    return html`
      <section aria-labelledby="web-heading">
        <div class="section-head">
          <h2 id="web-heading">The web</h2>
          <label>
            Site
            <select @change=${this.onSiteChange}>
              ${WEB_SITES.map(s => html`<option ?selected=${s === this.site}>${s}</option>`)}
            </select>
          </label>
        </div>
        ${this.webLoading
          ? html`<p class="status" role="status">Rewinding the Wayback Machine…</p>`
          : this.renderWebStrip()}
      </section>
    `;
  }

  private renderWebStrip() {
    const captures = this.web.filter(
      (c): c is WebCapture => !!c && c.daysOff <= MAX_DAYS_OFF,
    );
    if (!captures.length) {
      return html`<p class="status">No captures of ${this.site} near this day.</p>`;
    }
    return html`
      <ul class="web-strip">
        ${captures.map((c, i) => this.renderWebCard(c, i))}
      </ul>
    `;
  }

  private renderWebCard(capture: WebCapture, i: number) {
    const year = capture.year;
    return html`
      <li class="web-card" style="--era-h:${eraHue(year)}; --i:${i}">
        <span class="year">${year}</span>
        <div class="frame-wrap">
          <iframe
            src=${waybackFrameUrl(capture)}
            title=${`${capture.site} on ${prettyDate(capture.captureDate)}`}
            loading="lazy"
            tabindex="-1"
            sandbox="allow-same-origin"
          ></iframe>
        </div>
        <a href=${waybackUrl(capture)} target="_blank" rel="noopener">
          ${capture.daysOff === 0
            ? html`Captured that day`
            : html`Captured ${prettyDate(capture.captureDate)}`}
          <span class="visually-hidden">(${capture.site}, opens in new tab)</span>
        </a>
      </li>
    `;
  }

  private renderRows() {
    if (!this.rows.length) {
      return html`<p class="status">Nothing found for ${this.monthDayLabel}.</p>`;
    }
    const hidden = this.rows.length - this.visibleRows.length;
    return html`
      <div class="track-nav">
        <span class="track-tip">Swipe or Shift + scroll to travel</span>
        <button @click=${() => this.scrollTrack(-1)} aria-label="Earlier years">◀</button>
        <span class="track-hint">${this.visibleRows[0]?.year} → ${this.visibleRows.at(-1)?.year}</span>
        <button @click=${() => this.scrollTrack(1)} aria-label="Later years">▶</button>
      </div>
      <!-- The mouse wheel is left to the page (vertical); sideways travel is
           trackpad swipe, Shift + scroll, the ◀ ▶ buttons, or arrow keys. -->
      <ol
        class="years"
        tabindex="0"
        aria-label="Timeline of years, scrolls sideways"
      >
        ${this.visibleRows.map((row, r) => html`
          <li
            class="year-row ${row.year === this.pinnedYear ? 'pinned' : ''}"
            style="--era-h:${eraHue(row.year)}"
          >
            <h3><span>${row.year}</span></h3>
            <ul class="cards">
              ${MEDIA_TYPES.filter(m => row.items[m.type]).map((m, c) =>
                this.renderCard(row.items[m.type]!, m.icon, m.label, Math.min(r, 4) * 3 + c))}
            </ul>
          </li>
        `)}
      </ol>
      ${hidden > 0 || this.showAll
        ? html`
          <button class="show-all" @click=${() => (this.showAll = !this.showAll)}>
            ${this.showAll ? 'Show highlights only' : `Show all ${this.rows.length} years`}
          </button>
        `
        : nothing}
    `;
  }

  /** `stagger` orders the entrance animation (capped so far rows don't lag). */
  private renderCard(item: Item, icon: string, label: string, stagger: number) {
    return html`
      <li class="card" style="--i:${stagger}">
        <span class="kind"><span aria-hidden="true">${icon}</span> ${label}</span>
        <button
          @click=${() => this.open(item)}
          @mouseenter=${() => (this.previewing = item)}
          @mouseleave=${() => this.endPreview(item)}
          @focus=${() => (this.previewing = item)}
          @blur=${() => this.endPreview(item)}
          aria-label=${`Open ${label}: ${item.title}`}
        >
          <item-tile
            .model=${tileModel(item)}
            .baseImageUrl=${'https://archive.org'}
            .sortParam=${DATE_SORT}
          ></item-tile>
          <tile-preview
            .item=${item}
            ?active=${this.previewing === item && !this.selected}
          ></tile-preview>
        </button>
      </li>
    `;
  }

  static styles = css`
    :host {
      display: block;
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px 64px;
      color: var(--fg);
    }
    header { text-align: center; padding: 24px 0 8px; }
    h1 {
      margin: 8px 0 24px; display: flex; flex-direction: column; align-items: center; gap: 12px;
      font-size: clamp(2.6em, 9vw, 5.5em); line-height: 1;
    }
    h1 .lede {
      font-size: .28em; font-weight: 600; letter-spacing: .35em; text-transform: uppercase;
      color: var(--muted);
    }
    h2 {
      font-size: .85em; font-weight: 700; letter-spacing: .25em; text-transform: uppercase;
      color: var(--muted); margin: 48px 0 16px;
      display: flex; align-items: center; gap: 12px;
    }
    h2::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--border), transparent); }
    .eyebrow {
      text-transform: uppercase; letter-spacing: .3em;
      font-size: .75em; color: var(--accent); margin: 0;
    }
    .controls { justify-content: center; }
    /* centred block under the date; its own text reads left-aligned */
    .about {
      /* wide enough that each sentence sits on one line on desktop (~790px needed) */
      max-width: 820px; margin: -8px auto 24px; text-align: left;
      --info-accent: var(--accent);
      --info-fg: var(--fg);
      --info-muted: var(--muted);
      --info-border: rgb(255 207 107 / .35);
    }
    .dice {
      font-size: 1.15em; font-weight: 700; cursor: pointer;
      padding: 12px 24px; border-radius: 999px; border: 0;
      color: var(--on-accent);
      background: linear-gradient(135deg, #ffcf6b, #ff8a3d);
      box-shadow: 0 0 0 1px rgb(255 255 255 / .15), 0 8px 30px rgb(255 140 60 / .35);
      transition: transform 150ms, box-shadow 150ms;
    }
    .dice:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 0 0 1px rgb(255 255 255 / .2), 0 12px 40px rgb(255 140 60 / .5); }
    .dice.rolling { animation: roll 500ms ease-in-out; }
    @keyframes roll {
      20% { transform: rotate(-12deg) scale(1.08); }
      40% { transform: rotate(10deg); }
      60% { transform: rotate(-6deg); }
      80% { transform: rotate(3deg); }
    }
    .controls, .section-head {
      display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center;
    }
    .section-head { justify-content: space-between; }
    .section-head h2 { margin-bottom: 0; }
    label { display: inline-flex; gap: 8px; align-items: center; font-size: .95em; }
    input, select, button { font: inherit; color: inherit; }
    input, select {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 6px; padding: 6px 8px;
    }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .presets button, .show-all {
      background: rgb(255 255 255 / .04); border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 14px; cursor: pointer;
      transition: border-color 150ms, background 150ms;
    }
    .presets button:hover, .show-all:hover { border-color: var(--accent); }
    .presets button[aria-pressed='true'] {
      background: rgb(255 207 107 / .15); border-color: var(--accent); color: var(--accent);
    }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
      outline: 3px solid var(--focus); outline-offset: 2px;
    }
    a { color: var(--link); }
    .status { color: var(--muted); }
    .error { color: var(--error); }

    /* Web strip */
    .web-strip {
      list-style: none; padding: 0; margin: 16px 0 0;
      display: grid; grid-auto-flow: column; grid-auto-columns: 220px;
      gap: 16px; overflow-x: auto; padding-bottom: 8px;
    }
    .web-card {
      display: flex; flex-direction: column; gap: 6px;
      font-size: .85em;
      animation: rise 500ms both; animation-delay: calc(var(--i) * 70ms);
    }
    .web-card .year {
      font-weight: 800; font-size: 1.3em; font-variant-numeric: tabular-nums;
      color: hsl(var(--era-h) 90% 72%);
    }
    .frame-wrap {
      width: 220px; height: 165px; overflow: hidden;
      border-radius: 8px; background: #fff;
      box-shadow: 0 0 0 1px hsl(var(--era-h) 80% 60% / .5), 0 10px 30px rgb(0 0 0 / .5);
      transition: transform 200ms;
    }
    .web-card:hover .frame-wrap { transform: translateY(-4px); }
    .frame-wrap iframe {
      width: 1024px; height: 768px; border: 0;
      transform: scale(0.2148); transform-origin: 0 0;
      pointer-events: none;
    }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } }

    /* Sideways timeline: years are columns on one scrolling track. */
    .track-nav {
      display: flex; align-items: center; justify-content: flex-end; gap: 12px;
      margin: -8px 0 8px; color: var(--muted); font-variant-numeric: tabular-nums;
    }
    .track-tip { font-size: .8em; margin-right: auto; }
    @media (hover: none) { .track-tip { display: none; } }
    .track-nav button {
      width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
      background: rgb(255 255 255 / .05); border: 1px solid var(--border);
      transition: border-color 150ms, background 150ms;
    }
    .track-nav button:hover { border-color: var(--accent); background: rgb(255 207 107 / .12); }
    .years {
      position: relative; /* offsetParent for scroll-to-pinned */
      list-style: none; margin: 0 -16px; padding: 8px 16px 24px;
      display: flex; overflow-x: auto; overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      mask-image: linear-gradient(90deg, transparent, #000 32px, #000 calc(100% - 64px), transparent);
      scrollbar-color: hsl(260 60% 55%) transparent;
    }
    .years:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; border-radius: 12px; }
    .year-row {
      position: relative; flex: 0 0 auto; scroll-snap-align: center;
      padding: 40px 28px 24px 0;
    }
    /* the glowing time line, one segment per column so it spans the whole track */
    .year-row::after {
      content: ''; position: absolute; left: 0; right: 0; top: 13px; height: 2px;
      background: linear-gradient(90deg, hsl(var(--era-h) 90% 62%), hsl(calc(var(--era-h) + 25) 90% 62%));
      box-shadow: 0 0 10px hsl(var(--era-h) 90% 62% / .7);
    }
    /* timeline dot */
    .year-row::before {
      content: ''; position: absolute; left: 0; top: 7px; z-index: 1;
      width: 14px; height: 14px; border-radius: 50%;
      background: hsl(var(--era-h) 90% 65%);
      box-shadow: 0 0 0 4px var(--bg), 0 0 16px hsl(var(--era-h) 90% 65%);
    }
    .year-row h3 { margin: 0 0 14px; }
    .year-row h3 span {
      display: block;
      font-size: 2.6em; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
      color: hsl(var(--era-h) 90% 72%);
      text-shadow: 0 0 24px hsl(var(--era-h) 90% 60% / .55);
    }
    .year-row.pinned .cards {
      padding: 12px; margin: -12px; border-radius: 14px;
      background: hsl(var(--era-h) 80% 55% / .14);
      box-shadow: 0 0 0 1px hsl(var(--era-h) 80% 60% / .6), 0 0 40px hsl(var(--era-h) 80% 55% / .3);
    }
    .year-row.pinned::before { width: 22px; height: 22px; top: 3px; left: -4px; }
    .year-row.pinned h3 span::after {
      content: '★'; font-size: .45em; vertical-align: super; margin-left: 4px;
    }
    .cards {
      list-style: none; padding: 0; margin: 0;
      display: grid; grid-template-columns: repeat(3, 166px); gap: 16px;
    }
    .card {
      display: flex; flex-direction: column; gap: 4px;
      animation: rise 450ms both; animation-delay: calc(var(--i) * 45ms);
    }
    .card button {
      position: relative;
      display: block; width: 100%; flex: 1; padding: 0; text-align: left;
      background: none; border: 0; border-radius: 4px; cursor: pointer;
      transition: transform 180ms ease-out, filter 180ms;
    }
    .card button:hover, .card button:focus-visible {
      transform: translateY(-6px) rotate(-.6deg);
      filter: drop-shadow(0 14px 22px rgb(0 0 0 / .55)) drop-shadow(0 0 14px hsl(var(--era-h) 90% 60% / .45));
    }
    .card item-tile {
      display: block; height: 100%; min-height: 280px;
      /* item-tile is styled light, like archive.org search */
      color: #2c2c2c;
    }
    /* Sits exactly over item-tile's image block (measured: 1px inset, 170px tall). */
    .card tile-preview { inset: 1px 1px auto 1px; height: 170px; }
    .card button:hover item-tile { outline: 2px solid hsl(var(--era-h) 90% 65%); border-radius: 4px; }
    .kind { font-size: .75em; color: var(--muted); }
    .show-all { margin-top: 16px; }


    .visually-hidden {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .card, .web-card, .dice.rolling { animation: none; }
      .card button:hover, .card button:focus-visible { transform: none; }
    }

    @media (max-width: 600px) {
      .cards { grid-template-columns: repeat(2, 150px); }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'on-this-day': OnThisDay;
  }
}

import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { FIRST_YEAR, LAST_YEAR, MEDIA_TYPES, dailyPicks, type Item, type MediaType } from './api';
import { DATE_SORT, eraHue, flipText, monthDayLabel, tileModel, today } from './shared';
import type { MediaDialog } from './media-dialog';
import './tile-preview';
import './flip-date';
import './media-dialog';
import './otd-info';

/** Tiles in the strip: two per media type in the mix. */
const PICKS = 10;

/**
 * Homepage widget: today's date across the years, ten picks (two per media type).
 * Styled to sit on the archive.org homepage (colours taken from the live page:
 * #fbfbfd page, white panels, #2c2c2c text, #4b64ff accent, Helvetica).
 * Tiles behave like the full page: hover previews, click opens the player.
 * The host page needs archive.org's 10px root font size for the tiles.
 */
@customElement('ia-on-this-day')
export class IaOnThisDay extends LitElement {
  /** Where "Travel through time" goes; `?date=MM-DD` is appended. */
  @property({ attribute: 'full-page-url' }) fullPageUrl = './';
  /** Override the day (MM-DD), mostly for demos. Defaults to today. */
  @property({ attribute: 'month-day' }) monthDay = today();
  /** Mute audio hover previews (they animate instead). */
  @property({ type: Boolean }) silent = false;

  @state() private picks: Item[] = [];
  /** All items dated this day across the searched media types and years. */
  @state() private total = 0;
  @state() private counts: Partial<Record<MediaType, number>> = {};
  /** Media type chosen in the breakdown; fills every slot with that type. */
  @state() private only?: MediaType;
  @state() private loading = true;
  @state() private failed = false;
  @state() private shuffle = 0;
  @state() private previewing?: Item;
  @state() private playing?: Item;
  @state() private rolling = false;

  @query('media-dialog') private dialog!: MediaDialog;

  connectedCallback() {
    super.connectedCallback();
    this.load();
  }

  protected updated(changed: PropertyValues<this>) {
    // Initial load happens in connectedCallback; this covers later changes.
    if (changed.has('monthDay') && changed.get('monthDay') !== undefined) this.load();
  }

  private async load() {
    this.loading = true;
    this.failed = false;
    const { monthDay, shuffle, only } = this;
    try {
      const { picks, total, counts } = await dailyPicks(monthDay, shuffle, only, PICKS);
      if (monthDay !== this.monthDay || shuffle !== this.shuffle || only !== this.only) return;
      this.picks = picks;
      this.total = total;
      this.counts = counts;
      this.failed = !picks.length;
    } catch {
      this.failed = true;
    }
    this.loading = false;
  }

  private onShuffle() {
    this.rolling = true;
    this.shuffle++;
    this.load();
  }

  /** Toggle filling the strip with one media type (click again for the mix). */
  private filterTo(type?: MediaType) {
    this.only = this.only === type ? undefined : type;
    this.shuffle = 0;
    this.load();
  }

  private open(item: Item) {
    this.playing = item; // pauses hover previews while the player is up
    this.dialog.show(item);
  }

  private get travelHref() {
    const url = new URL(this.fullPageUrl, location.href);
    url.searchParams.set('date', this.monthDay);
    return url.href;
  }

  render() {
    return html`
      <section aria-labelledby="otd-title">
        <div class="head">
          <h2 id="otd-title">
            <span class="lede">On this day</span>
            <flip-date .text=${flipText(this.monthDay)} .label=${monthDayLabel(this.monthDay)}></flip-date>
          </h2>
          <div class="actions">
            <button
              class="dice ${this.rolling ? 'rolling' : ''}"
              @click=${this.onShuffle}
              @animationend=${() => (this.rolling = false)}
              ?disabled=${this.loading}
            ><span aria-hidden="true">🎲</span> Shuffle</button>
            <a class="travel" href=${this.travelHref}>
              Travel through time <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        <p class="count" aria-live="polite">
          ${this.loading && !this.total
            ? html`Counting the stacks…`
            : html`${this.only ? `${MEDIA_TYPES.find(m => m.type === this.only)?.label}: ` : ''}${this.picks.length}
                picks from
                <strong>${(this.only ? this.counts[this.only] ?? 0 : this.total).toLocaleString()}</strong>
                items dated ${monthDayLabel(this.monthDay)}, ${FIRST_YEAR}–${LAST_YEAR}`}
          <otd-info></otd-info>
        </p>
        <div class="breakdown" role="group" aria-label="Show one media type">
          <button
            class="type"
            aria-pressed=${!this.only}
            @click=${() => this.filterTo(undefined)}
          >All <strong>${this.total.toLocaleString()}</strong></button>
          ${MEDIA_TYPES.filter(m => this.counts[m.type] !== undefined).map(m => html`
            <button
              class="type"
              aria-pressed=${this.only === m.type}
              @click=${() => this.filterTo(m.type)}
            >
              <span aria-hidden="true">${m.icon}</span>
              ${m.label} <strong>${this.counts[m.type]!.toLocaleString()}</strong>
            </button>
          `)}
        </div>
        ${this.failed
          ? html`<p class="status">The archive is napping. Try again in a moment.</p>`
          : html`<ul class="strip" aria-busy=${this.loading}>
              ${this.loading
                ? Array.from({ length: PICKS }, () => html`<li class="skeleton"></li>`)
                : this.picks.map((item, i) => this.renderPick(item, i))}
            </ul>`}
      </section>
      <media-dialog @media-dialog-close=${() => (this.playing = undefined)}></media-dialog>
    `;
  }

  private renderPick(item: Item, i: number) {
    const media = MEDIA_TYPES.find(m => m.type === item.mediatype);
    return html`
      <li style="--era-h:${eraHue(item.year)}; --i:${i}">
        <span class="year">${item.year}</span>
        <button
          class="tile"
          @click=${() => this.open(item)}
          @mouseenter=${() => (this.previewing = item)}
          @mouseleave=${() => this.previewing === item && (this.previewing = undefined)}
          @focus=${() => (this.previewing = item)}
          @blur=${() => this.previewing === item && (this.previewing = undefined)}
          aria-label=${`Open ${item.year} ${media?.label ?? ''}: ${item.title}`}
        >
          <item-tile
            .model=${tileModel(item)}
            .baseImageUrl=${'https://archive.org'}
            .sortParam=${DATE_SORT}
          ></item-tile>
          <tile-preview
            .item=${item}
            ?silent=${this.silent}
            ?active=${this.previewing === item && !this.playing}
          ></tile-preview>
        </button>
        ${media ? html`<span class="kind"><span aria-hidden="true">${media.icon}</span> ${media.label}</span>` : nothing}
      </li>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font: 16px/1.5 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #2c2c2c;
      --ia-accent: #4b64ff;
      --ia-muted: #666;
      --ia-border: #ddd;
      /* split-flap in archive.org's header black */
      --flap-fg: #fff;
      --flap-top: #3a3a3a;
      --flap-bottom: #2c2c2c;
      /* player dialog, light to match the page */
      --dialog-bg: #fff;
      --dialog-fg: #2c2c2c;
      --dialog-muted: #666;
      --dialog-link: #4b64ff;
      --dialog-focus: #4b64ff;
      --dialog-radius: 5px;
    }
    section {
      background: #fff;
      border: 1px solid var(--ia-border);
      border-top: 4px solid #2c2c2c;
      padding: 20px 24px 16px;
      box-shadow: 0 1px 3px rgb(0 0 0 / .08);
    }
    .head {
      display: flex; flex-wrap: wrap; gap: 12px 24px;
      align-items: center; justify-content: space-between;
    }
    .count {
      margin: 10px 0 8px; font-size: .85em; color: var(--ia-muted);
    }
    .count strong { color: #2c2c2c; }
    .breakdown {
      display: flex; flex-wrap: wrap; gap: 6px 8px;
      margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #eee;
    }
    .type {
      font: inherit; font-size: .82em; white-space: nowrap; cursor: pointer;
      color: #2c2c2c; background: #fff; border: 1px solid var(--ia-border);
      border-radius: 5px; padding: 3px 10px;
      transition: border-color 150ms, background 150ms;
    }
    .type:hover { border-color: var(--ia-accent); }
    .type strong { font-weight: 700; }
    .type[aria-pressed='true'] {
      background: #d9edf5; border-color: var(--ia-accent); color: #2c2c2c;
    }
    h2 {
      margin: 0; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      font-size: 1.9em; font-weight: 400; line-height: 1;
    }
    .lede { font-size: .6em; font-weight: 400; color: #2c2c2c; }
    .actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .dice {
      font: inherit; font-size: .9em; font-weight: 700; cursor: pointer; color: #fff;
      padding: 7px 16px; border-radius: 5px; border: 0;
      background: var(--ia-accent);
      transition: filter 150ms;
    }
    .dice:hover:not(:disabled) { filter: brightness(1.1); }
    .dice:disabled { opacity: .6; cursor: progress; }
    .dice.rolling { animation: roll 500ms ease-in-out; }
    @keyframes roll {
      20% { transform: rotate(-8deg) scale(1.06); }
      40% { transform: rotate(6deg); }
      60% { transform: rotate(-4deg); }
      80% { transform: rotate(2deg); }
    }
    .travel { color: var(--ia-accent); font-size: .95em; font-weight: 700; text-decoration: none; }
    .travel:hover { text-decoration: underline; }
    a:focus-visible, button:focus-visible {
      outline: 3px solid var(--ia-accent); outline-offset: 3px; border-radius: 4px;
    }

    /* Wraps into rows (5 across at homepage width). Columns stay 166px because
       tile-preview's overlay is sized to item-tile's image block at that width. */
    .strip {
      list-style: none; margin: 0; padding: 4px 2px 8px;
      display: grid; grid-template-columns: repeat(auto-fill, 166px);
      justify-content: space-between; gap: 24px 20px;
    }
    /* Phones: one swipeable row instead of a 10-tile-tall column. */
    @media (max-width: 600px) {
      .strip {
        grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 166px;
        justify-content: start; overflow-x: auto; scroll-snap-type: x proximity;
      }
    }
    .strip > li {
      display: flex; flex-direction: column; gap: 6px; scroll-snap-align: start;
      animation: rise 400ms both; animation-delay: calc(var(--i) * 60ms);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
    /* year label with a thin era-coloured bar: a hint of the timeline, quiet enough for the homepage */
    .year {
      font-size: 1.35em; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums;
      padding-left: 8px; border-left: 4px solid hsl(var(--era-h) 70% 50%);
    }
    .tile {
      position: relative; display: block; width: 100%; flex: 1; padding: 0; text-align: left;
      font: inherit; color: #2c2c2c; background: none; border: 0; border-radius: 4px;
      cursor: pointer; transition: transform 180ms ease-out, box-shadow 180ms;
    }
    .tile:hover, .tile:focus-visible {
      transform: translateY(-3px);
      box-shadow: 0 8px 18px rgb(0 0 0 / .15);
    }
    /* li's stretch to the tallest in the row; tiles fill them so heights match */
    item-tile { display: block; height: 100%; min-height: 280px; }
    /* Sits exactly over item-tile's image block (measured: 1px inset, 170px tall). */
    tile-preview { inset: 1px 1px auto 1px; height: 170px; }
    .kind { font-size: .8em; color: var(--ia-muted); }
    .skeleton {
      height: 310px; border-radius: 4px;
      background: linear-gradient(100deg, #f1f1f1 30%, #e6e6e6 50%, #f1f1f1 70%) 0 0 / 300% 100%;
      animation: shimmer 1.4s linear infinite;
    }
    @keyframes shimmer { to { background-position: -100% 0; } }
    .status { color: var(--ia-muted); margin: 0; }

    @media (prefers-reduced-motion: reduce) {
      .strip > li, .dice.rolling, .skeleton { animation: none; }
      .tile:hover, .tile:focus-visible { transform: none; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'ia-on-this-day': IaOnThisDay;
  }
}

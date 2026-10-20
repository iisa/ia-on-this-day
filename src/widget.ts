import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { MEDIA_TYPES, dailyPicks, detailsUrl, type Item } from './api';
import { DATE_SORT, eraHue, flipText, monthDayLabel, tileModel, today } from './shared';
import './tile-preview';
import './flip-date';

const PLACEHOLDERS = 5;

/**
 * Homepage widget: today's date across the years, one pick per media type.
 * Self-contained (own colours/background) so it drops into any page.
 * The host page needs archive.org's 10px root font size for the tiles.
 */
@customElement('ia-on-this-day')
export class IaOnThisDay extends LitElement {
  /** Where "Travel through time" goes; `?date=MM-DD` is appended. */
  @property({ attribute: 'full-page-url' }) fullPageUrl = './';
  /** Override the day (MM-DD), mostly for demos. Defaults to today. */
  @property({ attribute: 'month-day' }) monthDay = today();

  @state() private picks: Item[] = [];
  @state() private loading = true;
  @state() private failed = false;
  @state() private shuffle = 0;
  @state() private previewing?: Item;
  @state() private rolling = false;

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
    const { monthDay, shuffle } = this;
    try {
      const picks = await dailyPicks(monthDay, shuffle);
      if (monthDay !== this.monthDay || shuffle !== this.shuffle) return;
      this.picks = picks;
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
        ${this.failed
          ? html`<p class="status">The archive is napping. Try again in a moment.</p>`
          : html`<ul class="strip" aria-busy=${this.loading}>
              ${this.loading
                ? Array.from({ length: PLACEHOLDERS }, () => html`<li class="skeleton"></li>`)
                : this.picks.map((item, i) => this.renderPick(item, i))}
            </ul>`}
      </section>
    `;
  }

  private renderPick(item: Item, i: number) {
    const media = MEDIA_TYPES.find(m => m.type === item.mediatype);
    return html`
      <li style="--era-h:${eraHue(item.year)}; --i:${i}">
        <span class="year">${item.year}</span>
        <a
          class="tile"
          href=${detailsUrl(item.identifier)}
          aria-label=${`${item.year}, ${media?.label ?? ''}: ${item.title}`}
          @mouseenter=${() => (this.previewing = item)}
          @mouseleave=${() => this.previewing === item && (this.previewing = undefined)}
          @focus=${() => (this.previewing = item)}
          @blur=${() => this.previewing === item && (this.previewing = undefined)}
        >
          <item-tile
            .model=${tileModel(item)}
            .baseImageUrl=${'https://archive.org'}
            .sortParam=${DATE_SORT}
          ></item-tile>
          <tile-preview .item=${item} silent ?active=${this.previewing === item}></tile-preview>
        </a>
        ${media ? html`<span class="kind"><span aria-hidden="true">${media.icon}</span> ${media.label}</span>` : nothing}
      </li>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      color: #ecebf2;
      --accent: #ffcf6b;
      --muted: #9a9cb0;
    }
    section {
      border-radius: 18px; padding: 24px 24px 20px; overflow: hidden;
      background:
        radial-gradient(600px 300px at 0% 0%, rgb(124 92 255 / .35), transparent 60%),
        radial-gradient(500px 300px at 100% 100%, rgb(255 140 60 / .18), transparent 60%),
        #0b0e17;
      box-shadow: 0 20px 50px rgb(11 14 23 / .35);
    }
    .head {
      display: flex; flex-wrap: wrap; gap: 16px 24px;
      align-items: center; justify-content: space-between; margin-bottom: 20px;
    }
    h2 {
      margin: 0; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      font-size: 2.2em; line-height: 1;
    }
    .lede {
      font-size: .38em; font-weight: 700; letter-spacing: .3em; text-transform: uppercase;
      color: var(--muted);
    }
    .actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .dice {
      font: inherit; font-weight: 700; cursor: pointer; color: #1a1300;
      padding: 8px 18px; border-radius: 999px; border: 0;
      background: linear-gradient(135deg, #ffcf6b, #ff8a3d);
      box-shadow: 0 6px 20px rgb(255 140 60 / .35);
      transition: transform 150ms;
    }
    .dice:hover:not(:disabled) { transform: translateY(-2px); }
    .dice:disabled { opacity: .6; cursor: progress; }
    .dice.rolling { animation: roll 500ms ease-in-out; }
    @keyframes roll {
      20% { transform: rotate(-12deg) scale(1.08); }
      40% { transform: rotate(10deg); }
      60% { transform: rotate(-6deg); }
      80% { transform: rotate(3deg); }
    }
    .travel { color: #8fd3ff; font-weight: 600; text-decoration: none; }
    .travel:hover { text-decoration: underline; }
    a:focus-visible, button:focus-visible {
      outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 6px;
    }

    .strip {
      list-style: none; margin: 0; padding: 4px 2px 8px;
      display: grid; grid-auto-flow: column; grid-auto-columns: 166px; gap: 20px;
      overflow-x: auto; scroll-snap-type: x proximity;
      scrollbar-color: hsl(260 60% 55%) transparent;
    }
    .strip > li {
      display: flex; flex-direction: column; gap: 6px; scroll-snap-align: start;
      animation: rise 450ms both; animation-delay: calc(var(--i) * 70ms);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
    .year {
      font-size: 1.5em; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
      color: hsl(var(--era-h) 90% 72%);
      text-shadow: 0 0 18px hsl(var(--era-h) 90% 60% / .55);
    }
    .tile {
      position: relative; display: block; border-radius: 4px; color: #2c2c2c;
      text-decoration: none; /* the tile's own hover underlines the title */
      transition: transform 180ms ease-out, filter 180ms;
    }
    .tile:hover, .tile:focus-visible {
      transform: translateY(-5px) rotate(-.6deg);
      filter: drop-shadow(0 12px 20px rgb(0 0 0 / .5)) drop-shadow(0 0 12px hsl(var(--era-h) 90% 60% / .45));
    }
    item-tile { display: block; min-height: 280px; }
    /* Sits exactly over item-tile's image block (measured: 1px inset, 170px tall). */
    tile-preview { inset: 1px 1px auto 1px; height: 170px; }
    .kind { font-size: .75em; color: var(--muted); }
    .skeleton {
      height: 310px; border-radius: 6px;
      background: linear-gradient(100deg, #1a1e2b 30%, #262b3c 50%, #1a1e2b 70%) 0 0 / 300% 100%;
      animation: shimmer 1.4s linear infinite;
    }
    @keyframes shimmer { to { background-position: -100% 0; } }
    .status { color: var(--muted); margin: 0; }

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

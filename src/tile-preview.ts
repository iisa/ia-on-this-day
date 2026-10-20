import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { previewFor, thumbUrl, type Item, type Preview } from './api';

const PAGE_FLIP_MS = 450;
// Wait a beat so sweeping the mouse across the grid doesn't fire every tile.
const HOVER_DELAY_MS = 250;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Overlays a collection-browser tile's image area and brings it to life while
 * `active`: muted video for films, audio + waveform playhead for sound,
 * a page flipbook for texts, a slow pan/zoom for images.
 */
@customElement('tile-preview')
export class TilePreview extends LitElement {
  @property({ attribute: false }) item!: Item;
  @property({ type: Boolean }) active = false;

  @state() private preview?: Preview | null;
  @state() private showing = false;
  @state() private page = 0;
  @state() private progress = 0;
  @state() private blocked = false; // audio autoplay refused

  @query('audio') private audio?: HTMLAudioElement;

  private delay?: number;
  private flip?: number;

  protected async updated(changed: PropertyValues<this>) {
    if (!changed.has('active')) return;
    clearTimeout(this.delay);
    if (!this.active) return this.stop();

    this.delay = window.setTimeout(async () => {
      this.preview = await previewFor(this.item).catch(() => null);
      if (!this.active || !this.preview) return;
      this.showing = true;
      await this.updateComplete;
      this.start();
    }, HOVER_DELAY_MS);
  }

  private start() {
    const p = this.preview;
    if (p?.kind === 'pages' && !reducedMotion()) {
      this.flip = window.setInterval(() => {
        this.page = (this.page + 1) % p.urls.length;
      }, PAGE_FLIP_MS);
    }
    if (p?.kind === 'audio' && this.audio) {
      this.blocked = false;
      this.audio.play().catch(() => (this.blocked = true));
    }
  }

  private stop() {
    clearInterval(this.flip);
    this.audio?.pause();
    this.showing = false;
    this.page = 0;
    this.progress = 0;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.delay);
    this.stop();
  }

  private onTimeUpdate(e: Event) {
    const a = e.target as HTMLAudioElement;
    if (a.duration) this.progress = a.currentTime / a.duration;
  }

  render() {
    if (!this.showing || !this.preview) return nothing;
    const p = this.preview;
    return html`<div class="layer ${p.kind}" aria-hidden="true">${this.renderKind(p)}</div>`;
  }

  private renderKind(p: Preview) {
    switch (p.kind) {
      case 'video':
        return html`<video src=${p.src} muted loop playsinline
          ?autoplay=${!reducedMotion()}></video>`;
      case 'audio':
        return html`
          ${p.waveform
            ? html`<img class="waveform" src=${p.waveform} alt="" />`
            : html`<div class="bars">${Array.from({ length: 12 }, (_, i) =>
                html`<span style="animation-delay:${i * -97}ms"></span>`)}</div>`}
          <div class="playhead" style="left:${this.progress * 100}%"></div>
          <span class="badge">${this.blocked ? '🔇 click anywhere to enable sound' : '🔊 playing'}</span>
          <audio src=${p.src} @timeupdate=${this.onTimeUpdate}></audio>
        `;
      case 'pages':
        return html`
          ${p.urls.map((u, i) => html`<img src=${u} alt="" class=${i === this.page ? 'on' : ''} />`)}
          <span class="badge">page ${this.page + 1} / ${p.urls.length}</span>
        `;
      case 'zoom':
        return html`<img class="zoom" src=${thumbUrl(this.item.identifier)} alt="" />`;
    }
  }

  static styles = css`
    :host {
      position: absolute; inset: 0;
      pointer-events: none; /* clicks go to the card button underneath */
      border-radius: 4px 4px 0 0; overflow: hidden;
    }
    .layer {
      position: absolute; inset: 0; background: #000;
      animation: fade-in 200ms ease-out;
    }
    video, img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

    .pages { background: #fff; }
    .pages img { object-fit: contain; opacity: 0; }
    .pages img.on { opacity: 1; }

    .audio { background: #10161b; }
    .waveform { object-fit: fill; filter: invert(1) hue-rotate(180deg); opacity: .85; }
    .playhead {
      position: absolute; top: 0; bottom: 0; width: 2px;
      background: #f0a500; box-shadow: 0 0 8px #f0a500;
    }
    .bars {
      position: absolute; inset: 20% 10%; display: flex; gap: 4px; align-items: end;
    }
    .bars span {
      flex: 1; background: #5bb8e0; height: 30%;
      animation: bounce 700ms ease-in-out infinite alternate;
    }

    .zoom { animation: ken-burns 6s ease-in-out infinite alternate; }

    .badge {
      position: absolute; left: 6px; bottom: 6px;
      background: rgb(0 0 0 / .7); color: #fff;
      font: 11px/1.4 system-ui, sans-serif; padding: 2px 6px; border-radius: 4px;
    }

    @keyframes fade-in { from { opacity: 0; } }
    @keyframes ken-burns {
      from { transform: scale(1) translate(0, 0); }
      to { transform: scale(1.35) translate(-6%, -4%); }
    }
    @keyframes bounce { to { height: 95%; } }

    @media (prefers-reduced-motion: reduce) {
      .zoom, .bars span, .layer { animation: none; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'tile-preview': TilePreview;
  }
}

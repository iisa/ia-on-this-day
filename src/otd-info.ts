import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { FIRST_YEAR, LAST_YEAR } from './api';

/**
 * Little ⓘ toggle explaining what "on this day" means. Built on <details> so
 * it works without JS; we only add closing on Escape and outside clicks.
 * Themed with --info-bg / --info-fg / --info-accent / --info-border.
 */
@customElement('otd-info')
export class OtdInfo extends LitElement {
  /** Also explain how Wayback snapshots are chosen (full page only). */
  @property({ type: Boolean }) web = false;

  @query('details') private details!: HTMLDetailsElement;

  private onDocClick = (e: MouseEvent) => {
    if (this.details?.open && !e.composedPath().includes(this)) this.details.open = false;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.details?.open) {
      this.details.open = false;
      this.renderRoot.querySelector<HTMLElement>('summary')?.focus();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this.onDocClick);
    document.addEventListener('keydown', this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('keydown', this.onKey);
  }

  /** Keep the tip inside the viewport: it centres on the ⓘ, then nudges in. */
  private onToggle() {
    const tip = this.renderRoot.querySelector<HTMLElement>('.tip');
    if (!tip || !this.details.open) return;
    tip.style.setProperty('--nudge', '0px');
    const margin = 8;
    const r = tip.getBoundingClientRect();
    let nudge = 0;
    if (r.right > innerWidth - margin) nudge = innerWidth - margin - r.right;
    if (r.left + nudge < margin) nudge = margin - r.left;
    tip.style.setProperty('--nudge', `${nudge}px`);
  }

  render() {
    return html`
      <details @toggle=${this.onToggle}>
        <summary aria-label="What does “on this day” mean?">
          <span aria-hidden="true">ⓘ</span>
        </summary>
        <div class="tip">
          <p><strong>What’s “on this day”?</strong></p>
          <p>
            Items whose recorded date (when they were published, broadcast,
            recorded or performed) falls on this day, ${FIRST_YEAR}–${LAST_YEAR}.
          </p>
          ${this.web
            ? html`<p>Web pages are the Wayback Machine capture closest to the day.</p>`
            : nothing}
          <p class="fine">
            Dates come from each item’s metadata, so a few may be off.
          </p>
        </div>
      </details>
    `;
  }

  static styles = css`
    :host { display: inline-block; position: relative; vertical-align: middle; }
    summary {
      list-style: none; cursor: pointer; user-select: none;
      width: 1.6em; height: 1.6em; display: grid; place-items: center;
      border-radius: 50%; font-size: 1em; line-height: 1;
      color: var(--info-accent, #4b64ff);
    }
    summary::-webkit-details-marker { display: none; }
    summary:hover, details[open] summary { background: var(--info-hover, rgb(75 100 255 / .12)); }
    summary:focus-visible { outline: 3px solid var(--info-accent, #4b64ff); outline-offset: 2px; }
    .tip {
      position: absolute; z-index: 10; top: calc(100% + 8px); left: 50%;
      transform: translateX(calc(-50% + var(--nudge, 0px)));
      width: min(300px, 80vw); padding: 12px 14px;
      background: var(--info-bg, #fff); color: var(--info-fg, #2c2c2c);
      border: 1px solid var(--info-border, #ddd); border-radius: 6px;
      box-shadow: 0 8px 24px rgb(0 0 0 / .18);
      /* px, not rem: host pages use archive.org's 10px root */
      font-size: 14px; line-height: 1.45; text-align: left;
    }
    .tip p { margin: 0 0 6px; }
    .tip p:last-child { margin-bottom: 0; }
    .fine { opacity: .75; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'otd-info': OtdInfo;
  }
}

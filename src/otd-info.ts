import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { FIRST_YEAR, LAST_YEAR } from './api';

/**
 * "What's on this day?" explainer: an inline, collapsible section, open by
 * default. Plain <details>, so it toggles with keyboard and without JS.
 * Themed with --info-accent / --info-fg / --info-muted / --info-border.
 */
@customElement('otd-info')
export class OtdInfo extends LitElement {
  /** Also explain how Wayback snapshots are chosen (full page only). */
  @property({ type: Boolean }) web = false;

  render() {
    return html`
      <details open>
        <summary>What’s “on this day”?</summary>
        <div class="body">
          <p>
            Items whose recorded date (when they were published, broadcast,
            recorded or performed) falls on this day, ${FIRST_YEAR}–${LAST_YEAR}.
          </p>
          ${this.web
            ? html`<p>Web pages are the Wayback Machine capture closest to the day.</p>`
            : nothing}
          <p class="fine">Dates come from each item’s metadata, so a few may be off.</p>
        </div>
      </details>
    `;
  }

  static styles = css`
    :host {
      display: block;
      /* px, not rem: host pages use archive.org's 10px root */
      font-size: 14px; line-height: 1.5;
      color: var(--info-fg, #2c2c2c);
    }
    summary {
      display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; user-select: none; list-style: none;
      font-weight: 700; color: var(--info-accent, #4b64ff);
      border-radius: 4px;
    }
    summary::-webkit-details-marker { display: none; }
    /* chevron: ▸ closed, rotates to ▾ open */
    summary::before {
      content: '▸'; display: inline-block; font-size: .9em;
      transition: transform 150ms ease-out;
    }
    details[open] > summary::before { transform: rotate(90deg); }
    summary:hover { text-decoration: underline; }
    summary:focus-visible { outline: 3px solid var(--info-accent, #4b64ff); outline-offset: 2px; }
    .body {
      margin-top: 6px; padding-left: 12px;
      border-left: 3px solid var(--info-border, #ddd);
    }
    p { margin: 0 0 4px; }
    p:last-child { margin-bottom: 0; }
    .fine { color: var(--info-muted, #666); }
    @media (prefers-reduced-motion: reduce) {
      summary::before { transition: none; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'otd-info': OtdInfo;
  }
}

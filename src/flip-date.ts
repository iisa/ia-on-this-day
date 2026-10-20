import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';

/**
 * Split-flap ("airport board") text. Each character re-mounts when it changes,
 * which restarts its flip animation; flips cascade left to right.
 */
@customElement('flip-date')
export class FlipDate extends LitElement {
  @property() text = '';
  /** What screen readers hear instead of the board's abbreviated text. */
  @property() label?: string;

  render() {
    return html`
      <span class="visually-hidden">${this.label ?? this.text}</span>
      <span class="board" aria-hidden="true">
        ${[...this.text].map((ch, i) =>
          ch === ' '
            ? html`<span class="gap"></span>`
            : keyed(`${i}:${ch}`, html`<span class="flap" style="--i:${i}">${ch}</span>`),
        )}
      </span>
    `;
  }

  static styles = css`
    :host { display: inline-block; perspective: 600px; }
    .board { display: inline-flex; gap: .08em; }
    .gap { width: .35em; }
    .flap {
      position: relative; display: inline-grid; place-items: center;
      width: .78em; height: 1.15em;
      font-family: 'SF Mono', ui-monospace, Menlo, monospace; font-weight: 700;
      color: var(--flap-fg, #ffe9b0);
      background: linear-gradient(var(--flap-top, #24272f) 0 49%, var(--flap-bottom, #15171c) 51% 100%);
      border-radius: .08em;
      box-shadow: 0 .06em .12em rgb(0 0 0 / .6), inset 0 0 0 1px rgb(255 255 255 / .06);
      transform-origin: 50% 50%;
      animation: flip 520ms cubic-bezier(.3, 1.4, .5, 1) both;
      animation-delay: calc(var(--i) * 55ms);
    }
    /* the hinge line across the middle */
    .flap::after {
      content: ''; position: absolute; left: 0; right: 0; top: 50%;
      height: 1px; background: rgb(0 0 0 / .7);
    }
    @keyframes flip {
      0% { transform: rotateX(90deg); filter: brightness(1.8); }
      60% { transform: rotateX(-12deg); }
      100% { transform: rotateX(0); filter: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .flap { animation: none; }
    }
    .visually-hidden {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'flip-date': FlipDate;
  }
}

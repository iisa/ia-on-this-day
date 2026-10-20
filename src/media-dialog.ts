import { LitElement, css, html, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { detailsUrl, embedUrl, thumbUrl, type Item } from './api';
import { MONTHS } from './shared';

const prettyDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};

/**
 * Modal player for an item: archive.org's embed player for film, audio and
 * texts, or the image itself. Shared by the full page and the homepage widget.
 * Themed with --dialog-bg / --dialog-fg / --dialog-muted / --dialog-link.
 * Fires `media-dialog-close` (bubbles, composed) when dismissed.
 */
@customElement('media-dialog')
export class MediaDialog extends LitElement {
  @state() private item?: Item;
  @query('dialog') private dialog!: HTMLDialogElement;

  async show(item: Item) {
    this.item = item;
    await this.updateComplete;
    this.dialog.showModal();
  }

  private onClose() {
    this.item = undefined; // unloads the player iframe
    this.dispatchEvent(new Event('media-dialog-close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <dialog @close=${this.onClose} aria-labelledby="dialog-title">
        ${this.item ? this.renderPlayer(this.item) : nothing}
      </dialog>
    `;
  }

  private renderPlayer(item: Item) {
    const playable = item.mediatype !== 'image';
    return html`
      <div class="head">
        <h2 id="dialog-title">${item.title}</h2>
        <button class="close" @click=${() => this.dialog.close()} aria-label="Close">✕</button>
      </div>
      <p class="meta">${prettyDate(item.date)}</p>
      ${playable
        ? html`<iframe
            class="player ${item.mediatype}"
            src=${embedUrl(item.identifier)}
            title=${`Player: ${item.title}`}
            allowfullscreen
          ></iframe>`
        : html`<img class="player" src=${thumbUrl(item.identifier)} alt=${item.title} />`}
      <p><a href=${detailsUrl(item.identifier)} target="_blank" rel="noopener">
        View on archive.org <span class="visually-hidden">(opens in new tab)</span>
      </a></p>
    `;
  }

  static styles = css`
    dialog {
      width: min(900px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
      border: 0; border-radius: var(--dialog-radius, 12px); padding: 20px;
      background: var(--dialog-bg, #0b0e17); color: var(--dialog-fg, #ecebf2);
      font: inherit; box-shadow: 0 20px 60px rgb(0 0 0 / .5);
    }
    dialog::backdrop { background: rgb(0 0 0 / .6); }
    .head { display: flex; gap: 16px; justify-content: space-between; align-items: start; }
    h2 { margin: 0; font-size: 1.2em; }
    .close {
      font: inherit; color: inherit; background: none; border: 0;
      font-size: 1.2em; cursor: pointer; padding: 4px 8px;
    }
    .meta { color: var(--dialog-muted, #9a9cb0); margin: 4px 0 12px; }
    a { color: var(--dialog-link, #8fd3ff); }
    button:focus-visible, a:focus-visible { outline: 3px solid var(--dialog-focus, #ffcf6b); outline-offset: 2px; }
    .player { display: block; width: 100%; border: 0; border-radius: 8px; }
    iframe.player { aspect-ratio: 16 / 9; }
    iframe.player.audio, iframe.player.etree { aspect-ratio: auto; height: 360px; }
    iframe.player.texts { aspect-ratio: 4 / 3; }
    img.player { max-height: 70vh; object-fit: contain; }
    .visually-hidden {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'media-dialog': MediaDialog;
  }
}

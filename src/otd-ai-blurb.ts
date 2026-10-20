import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { MEDIA_TYPES, type Item } from './api';
import { monthDayLabel } from './shared';

// Chrome's built-in Prompt API (Gemini Nano, on-device). Not in TS's DOM lib yet.
// https://developer.chrome.com/docs/ai/prompt-api
interface LanguageModelSession {
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}
interface LanguageModelStatic {
  availability(opts?: object): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts?: object): Promise<LanguageModelSession>;
}
declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;
}

const LANGS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Grounding: the model only gets the items' own metadata and is told not to
// add outside facts, so the note can't wander into invented history.
const SYSTEM = `You write a short "on this day" note for the Internet Archive.
Use ONLY the items listed by the user. Do not add events, people, places or
facts that are not in the list, and do not guess what an item is about beyond
its title. Write 2 or 3 friendly, plain sentences that connect a few of the
items across the years, mentioning their years. No lists, no markdown, no hype.`;

const describe = (item: Item) => {
  const label = MEDIA_TYPES.find(m => m.type === item.mediatype)?.label ?? item.mediatype;
  const creator = item.raw.creator;
  const by = creator ? ` (by ${Array.isArray(creator) ? creator[0] : creator})` : '';
  return `- ${item.year}, ${label}: ${item.title}${by}`;
};

type Phase = 'idle' | 'downloading' | 'writing' | 'done' | 'unavailable' | 'error';

/**
 * "✨ Why this day?" — an on-device AI note about the day's picks, via Chrome's
 * built-in AI. Progressive enhancement: renders nothing where the API is missing.
 * Themed with --ai-accent / --ai-bg / --ai-fg / --ai-muted / --ai-border.
 */
@customElement('otd-ai-blurb')
export class OtdAiBlurb extends LitElement {
  @property({ attribute: false }) items: Item[] = [];
  @property({ attribute: 'month-day' }) monthDay = '';

  @state() private phase: Phase = 'idle';
  @state() private text = '';
  @state() private progress = 0;

  private abort?: AbortController;
  /** What the current text was written for, so a new day/shuffle resets it. */
  private writtenFor = '';

  private get supported() {
    return typeof globalThis.LanguageModel !== 'undefined';
  }

  private get key() {
    return this.monthDay + '|' + this.items.map(i => i.identifier).join(',');
  }

  protected willUpdate() {
    if (this.writtenFor && this.writtenFor !== this.key) {
      this.abort?.abort();
      this.phase = 'idle';
      this.text = '';
      this.writtenFor = '';
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.abort?.abort();
  }

  private async write() {
    const LM = globalThis.LanguageModel;
    if (!LM || !this.items.length) return;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    this.writtenFor = this.key;
    this.text = '';

    let session: LanguageModelSession | undefined;
    try {
      const availability = await LM.availability(LANGS);
      if (availability === 'unavailable') {
        this.phase = 'unavailable';
        return;
      }
      this.phase = availability === 'available' ? 'writing' : 'downloading';
      session = await LM.create({
        ...LANGS,
        signal: abort.signal,
        initialPrompts: [{ role: 'system', content: SYSTEM }],
        monitor: (m: EventTarget) =>
          m.addEventListener('downloadprogress', e => {
            this.progress = (e as ProgressEvent).loaded; // 0–1
          }),
      });
      this.phase = 'writing';

      const prompt = `Date: ${monthDayLabel(this.monthDay)}\nItems:\n${this.items.map(describe).join('\n')}`;
      const stream = session.promptStreaming(prompt, { signal: abort.signal });
      // Chunks have been cumulative in some Chrome versions and deltas in
      // others; handle both.
      for await (const chunk of stream as unknown as AsyncIterable<string>) {
        this.text = chunk.startsWith(this.text) ? chunk : this.text + chunk;
      }
      this.phase = 'done';
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') this.phase = 'error';
    } finally {
      session?.destroy();
    }
  }

  render() {
    if (!this.supported) return nothing;
    const busy = this.phase === 'downloading' || this.phase === 'writing';
    return html`
      <div class="blurb" aria-live="polite">
        ${this.phase === 'idle'
          ? html`<button @click=${this.write} ?disabled=${!this.items.length}>
              <span aria-hidden="true">✨</span> Why this day?
            </button>`
          : nothing}
        ${this.phase === 'downloading'
          ? html`<p class="status">Getting Chrome’s on-device AI ready… ${Math.round(this.progress * 100)}%</p>`
          : nothing}
        ${this.phase === 'writing' && !this.text
          ? html`<p class="status">Reading the stacks…</p>`
          : nothing}
        ${this.text
          ? html`<p class="text">${this.text}${busy ? html`<span class="caret" aria-hidden="true"></span>` : nothing}</p>`
          : nothing}
        ${this.phase === 'done'
          ? html`<p class="fine">
              <span aria-hidden="true">✨</span> Written on your device by Chrome’s built-in AI,
              from these items only. It can still get things wrong.
              <button class="again" @click=${this.write}>Rewrite</button>
            </p>`
          : nothing}
        ${this.phase === 'unavailable'
          ? html`<p class="status">Chrome’s built-in AI isn’t available on this device.</p>`
          : nothing}
        ${this.phase === 'error'
          ? html`<p class="status">Couldn’t write a note this time.
              <button class="again" @click=${this.write}>Try again</button></p>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    :host { display: block; }
    .blurb {
      margin: 0 0 16px; padding: 12px 14px; border-radius: 8px;
      background: var(--ai-bg, #f4f6ff); color: var(--ai-fg, #2c2c2c);
      border: 1px solid var(--ai-border, #dfe4ff);
      /* px, not rem: host pages use archive.org's 10px root */
      font-size: 15px; line-height: 1.5;
    }
    .blurb:has(> button:only-child) {
      background: none; border: 0; padding: 0;
    }
    p { margin: 0; }
    p + p { margin-top: 8px; }
    button {
      font: inherit; font-weight: 700; cursor: pointer;
      color: var(--ai-accent, #4b64ff); background: var(--ai-bg, #f4f6ff);
      border: 1px solid var(--ai-border, #dfe4ff); border-radius: 999px; padding: 6px 14px;
    }
    button:hover:not(:disabled) { border-color: var(--ai-accent, #4b64ff); }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 3px solid var(--ai-accent, #4b64ff); outline-offset: 2px; }
    .again { font-size: 12px; padding: 2px 10px; margin-left: 6px; }
    .status, .fine { color: var(--ai-muted, #666); font-size: 13px; }
    .caret {
      display: inline-block; width: .5em; height: 1em; margin-left: 2px; vertical-align: text-bottom;
      background: var(--ai-accent, #4b64ff); animation: blink 900ms steps(2) infinite;
    }
    @keyframes blink { to { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'otd-ai-blurb': OtdAiBlurb;
  }
}

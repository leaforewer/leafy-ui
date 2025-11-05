import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type Input = string | string[];

@customElement("type-writer")
export class TypeWriterEl extends LitElement {
  @property({ attribute: "text" }) textAttr?: string;
  @property({ attribute: "data-text" }) dataText?: string;

  @property({ type: Number }) speed = 28;
  @property({ type: Number }) variance = 0.35;
  @property({ type: Number }) commaPause = 120;
  @property({ type: Number }) periodPause = 240;

  @property({ type: Boolean, reflect: true }) blink = false;
  @property({ type: Boolean, reflect: true }) loop = false;
  @property({ type: Boolean, reflect: true }) inview = true;
  @property({ type: Boolean, reflect: true }) respectReduced = true;
  @property({ type: String }) caretChar = "";
  @property({ type: Number }) delay = 0;

  @state() private _display = "";
  @state() private _playing = false;

  private _timer: number | null = null;
  private _startTimer: number | null = null;
  private _io?: IntersectionObserver;

  private _full = "";
  private _pos = 0;
  private _dir: 1 | -1 = 1;
  private _inited = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.ensureStyle();
    this.prepareText();
    if (this.inview) this.watchInView();
    else this.schedulePlay();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timer) clearTimeout(this._timer);
    if (this._startTimer) clearTimeout(this._startTimer);
    this._io?.disconnect();
  }

  play() {
    if (this._playing || !this._full) return;
    this._playing = true;
    this.tick();
  }
  pause() {
    this._playing = false;
    if (this._timer) clearTimeout(this._timer);
  }
  reset() {
    this.pause();
    this._pos = 0;
    this._dir = 1;
    this._display = "";
  }
  restart() {
    this.reset();
    this.play();
  }

  private prepareText() {
    if (this._inited) return;
    this._inited = true;

    let txt: Input | undefined;
    if (this.textAttr?.length) txt = this.textAttr;
    else if (this.dataText) {
      try {
        const parsed = JSON.parse(this.dataText);
        txt = Array.isArray(parsed) ? parsed.join("\n") : String(parsed ?? "");
      } catch {}
    }
    if (!txt) {
      const raw = (this.textContent ?? "").replace(/\r\n/g, "\n");
      this.textContent = "";
      txt = raw;
    }
    if (Array.isArray(txt)) txt = txt.join("\n");
    this._full = (txt ?? "").toString();
  }

  private watchInView() {
    if (typeof IntersectionObserver === "undefined") {
      this.schedulePlay();
      return;
    }
    this._io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this._io?.disconnect();
          this.schedulePlay();
        }
      },
      { threshold: 0.1 },
    );
    this._io.observe(this);
  }

  private schedulePlay() {
    if (this._startTimer) clearTimeout(this._startTimer);
    const d = Math.max(0, Number(this.delay) || 0);
    if (d === 0) {
      this.play();
      return;
    }
    this._startTimer = window.setTimeout(() => this.play(), d);
  }

  private nextDelay(ch: string, deleting: boolean) {
    if (
      this.respectReduced &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return 0;
    const jitter = 1 + (Math.random() * 2 - 1) * this.variance;
    let base = Math.max(1, this.speed * jitter);
    if (!deleting) {
      if (ch === ",") base += this.commaPause;
      if (/[.:;!?]/.test(ch)) base += this.periodPause;
      if (ch === "\n") base += this.periodPause * 0.75;
    } else {
      base *= 0.85;
    }
    return base;
  }

  private tick() {
    if (!this._playing) return;

    const len = this._full.length;
    if (this._dir === 1) {
      const ch = this._full.charAt(this._pos);
      this._pos = Math.min(len, this._pos + 1);
      this._display = this._full.slice(0, this._pos);

      if (this._pos >= len) {
        if (this.loop) {
          this._dir = -1;
          this._timer = window.setTimeout(() => this.tick(), 600);
          return;
        } else {
          this._playing = false;
          return;
        }
      }
      this._timer = window.setTimeout(
        () => this.tick(),
        this.nextDelay(ch, false),
      );
    } else {
      const prevCh = this._full.charAt(Math.max(0, this._pos - 1));
      this._pos = Math.max(0, this._pos - 1);
      this._display = this._full.slice(0, this._pos);

      if (this._pos <= 0) {
        this._dir = 1;
        this._timer = window.setTimeout(() => this.tick(), 500);
        return;
      }
      this._timer = window.setTimeout(
        () => this.tick(),
        this.nextDelay(prevCh, true),
      );
    }
  }

  private ensureStyle() {
    const id = "tw-core-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
.tw{white-space:pre-wrap;word-break:break-word}
.tw-caret{display:inline-block;vertical-align:baseline;border-right:.12em solid currentColor;margin-left:.06em;height:1em;transform:translateY(.1em);animation:tw-blink 1s step-end infinite}
.tw-caret-char{display:inline-block;margin-left:.06em;animation:tw-blink 1s step-end infinite}
@keyframes tw-blink{50%{opacity:0}}
@media (prefers-reduced-motion: reduce){.tw-caret,.tw-caret-char{animation:none}}
`.trim();
    document.head.appendChild(style);
  }

  private renderDisplay() {
    if (!this._display) return nothing;
    const lines = this._display.split("\n");
    const parts: unknown[] = [];
    lines.forEach((ln, i) => {
      parts.push(ln);
      if (i < lines.length - 1) parts.push(html`<br />`);
    });
    return parts;
  }

  render() {
    return html`
      <span class="tw">${this.renderDisplay()}</span>
      ${
        this.blink
          ? this.caretChar
            ? html`<span aria-hidden="true" class="tw-caret-char">${this.caretChar}</span>`
            : html`<span aria-hidden="true" class="tw-caret"></span>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "type-writer": TypeWriterEl;
  }
  namespace JSX {
    interface IntrinsicElements {
      "type-writer": /* biome-ignore lint:suspicious/noExplicitAny */ any;
    }
  }
}

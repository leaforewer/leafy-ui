import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type Input = string | string[];
let TW_SEQ = 0;

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

  @property({ type: Boolean }) reserve = true;
  @property({ type: Boolean }) fade = true;

  @state() private _display = "";
  @state() private _playing = false;

  private _timer: number | null = null;
  private _startTimer: number | null = null;
  private _io?: IntersectionObserver;

  private _full = "";
  private _pos = 0;
  private _dir: 1 | -1 = 1;
  private _inited = false;

  private _flip = 0;

  private _uid = `tw${++TW_SEQ}`;
  private _reserveStyleId = `tw-r-${this._uid}`;
  private _onResize = () => this.reserveHeight();

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.ensureStyle();
    this.prepareText();
    if (this.reserve) {
      this.reserveHeight();
      window.addEventListener("resize", this._onResize, { passive: true });
    }
    if (this.inview) this.watchInView();
    else this.schedulePlay();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timer) clearTimeout(this._timer);
    if (this._startTimer) clearTimeout(this._startTimer);
    this._io?.disconnect();
    window.removeEventListener("resize", this._onResize);
    document.getElementById(this._reserveStyleId)?.remove();
  }

  play() {
    if (!this._playing && this._full) {
      this._playing = true;
      this.tick();
    }
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

  private reserveHeight() {
    if (!this.reserve || !this._full) return;

    const meas = document.createElement("div");
    const cs = getComputedStyle(this);
    const r = this.getBoundingClientRect();

    meas.textContent = this._full;
    meas.style.position = "fixed";
    meas.style.left = "-9999px";
    meas.style.top = "0";
    meas.style.visibility = "hidden";
    meas.style.pointerEvents = "none";
    meas.style.whiteSpace = "pre-wrap";
    meas.style.wordBreak = "break-word";
    if (r.width) meas.style.width = `${r.width}px`;
    meas.style.font = cs.font;
    meas.style.lineHeight = cs.lineHeight as string;
    meas.style.letterSpacing = cs.letterSpacing as string;
    meas.style.fontWeight = cs.fontWeight as string;

    document.body.appendChild(meas);
    const h = Math.ceil(meas.getBoundingClientRect().height);
    document.body.removeChild(meas);

    this.setAttribute("data-tw", this._uid);
    let s = document.getElementById(
      this._reserveStyleId,
    ) as HTMLStyleElement | null;
    if (!s) {
      s = document.createElement("style");
      s.id = this._reserveStyleId;
      document.head.appendChild(s);
    }
    s.textContent = `type-writer[data-tw="${this._uid}"]{min-height:${h}px}`;
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

    this._flip ^= 1;

    if (this._dir === 1) {
      const ch = this._full.charAt(this._pos);
      this._pos = Math.min(len, this._pos + 1);
      this._display = this._full.slice(0, this._pos);

      if (this._pos >= len) {
        if (this.loop) {
          this._dir = -1;
          this._timer = window.setTimeout(() => this.tick(), 600);
          return;
        }
        this._playing = false;
        return;
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

.tw-last{opacity:0}
.tw-last.flip0{animation:tw-fade-a 220ms ease-out forwards}
.tw-last.flip1{animation:tw-fade-b 220ms ease-out forwards}

@keyframes tw-blink{50%{opacity:0}}
@keyframes tw-fade-a{from{opacity:0;transform:translateY(.02em)}to{opacity:1;transform:none}}
@keyframes tw-fade-b{from{opacity:0;transform:translateY(.02em)}to{opacity:1;transform:none}}

@media (prefers-reduced-motion: reduce){
  .tw-caret,.tw-caret-char{animation:none}
  .tw-last{animation:none;opacity:1}
}
`.trim();
    document.head.appendChild(style);
  }

  private renderDisplay() {
    if (!this._display) return nothing;
    const s = this._display;
    const last = s.slice(-1);
    const rest = s.slice(0, -1);

    const restNodes: unknown[] = [];
    rest.split("\n").forEach((ln, i, arr) => {
      restNodes.push(ln);
      if (i < arr.length - 1) restNodes.push(html`<br />`);
    });

    const lastNode =
      last === ""
        ? nothing
        : this.fade
          ? html`<span class="tw-last ${this._flip ? "flip1" : "flip0"}">${last}</span>`
          : last;

    return html`${restNodes}${lastNode}`;
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

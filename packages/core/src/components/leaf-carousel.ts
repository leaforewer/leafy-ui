import { css, html, LitElement } from "lit";
import { customElement, property, queryAssignedElements, state } from "lit/decorators.js";

function damp(a: number, b: number, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt);
  return a + (b - a) * t;
}

const boolish = {
  fromAttribute(value: string | null) {
    if (value === null) return false;
    if (value === '' || value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  },
  toAttribute(value: boolean) {
    return value ? '' : null;
  },
};

type ControlsMode = "auto" | "always" | "never";

@customElement("leaf-carousel")
export class LeafCarousel extends LitElement {
  @queryAssignedElements() slides!: HTMLElement[];
  @queryAssignedElements({ slot: "prev" }) prevControls!: HTMLElement[];
  @queryAssignedElements({ slot: "next" }) nextControls!: HTMLElement[];

  @property({ converter: boolish, reflect: true }) infinite = true;
  @property({ converter: boolish, reflect: true }) snap = true;
  @property({ converter: boolish, reflect: true }) controls = false;

  @property({ type: Number }) lerpFactor = 0.22;
  @property({ type: Number }) snapStrength = 0.16;
  @property({ type: Number }) dragGain = 1.85;

  @property({ type: Number }) gap = 0;
  @property({ type: Number }) preloadItems = 1;

  @property({ type: Boolean }) autoHeight = true;

  @property({ type: Number }) columns = 0;
  @property({ type: Number }) slideWidth = 0;

  @property({ type: String }) controlsMode: ControlsMode = "auto";
  @property({ type: String }) buttonClass = "";

  @state() private current = 0;
  private target = 0;
  private itemWidth = 1;
  private maxScroll = 0;
  private dragging = false;
  private startX = 0;
  private startTarget = 0;
  private lastTime = performance.now();
  private raf = 0;
  private rafRunning = false;
  private resizeObs?: ResizeObserver;

  private visibleItems = 1;
  private canOverflow = true;
  private lastAppliedX: number | null = null;
  private idleIndex = 0;

  private readonly settleEpsilon = 0.0015;

  static styles = css`
    :host{display:block;overflow:hidden;position:relative;touch-action:pan-y;user-select:none;cursor:grab}
    .track{position:relative;width:100%;height:100%}
    ::slotted(:not([slot])){position:absolute;inset:0 auto auto 0;width:var(--slide-width,100%);will-change:transform;transition:transform 0s;margin:0}
    .controls{position:absolute;inset:0;pointer-events:none;transition:opacity .3s ease}
    :host(:hover) .controls{opacity:1}
    .control-prev,.control-next{position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;pointer-events:none}
    .control-prev{left:8px}
    .control-next{right:8px}
    .controls ::slotted([slot="prev"]),.controls ::slotted([slot="next"]),.controls button{pointer-events:all;display:flex;align-items:center;justify-content:center}
    button{all:unset;width:40px;height:40px;background:rgba(255,255,255,.7);border-radius:9999px;font-size:1.25rem;cursor:pointer;transition:background .2s ease}
    button:hover{background:rgba(255,255,255,.95)}
    .control-prev.off  { opacity:0; pointer-events:none }
    .control-next.off  { opacity:0; pointer-events:none }
    .control-prev.off  ::slotted(*) { pointer-events:none }
    .control-next.off  ::slotted(*) { pointer-events:none }
    .controls button[disabled] { opacity:0; pointer-events:none }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.measure();
    this.ensureLoopRunning(true);
    this.resizeObs = new ResizeObserver(() => {
      this.measure();
      this.ensureLoopRunning(true);
    });
    this.resizeObs.observe(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopLoop();
    this.removeWindowListeners();
    this.resizeObs?.disconnect();
  }

  private shouldShowControls() {
    if (!this.controls) return false;

    if (this.controlsMode === "always") return true;
    if (this.controlsMode === "never") return false;

    return this.canOverflow;
  }

  private onControlsSlotChange = () => this.attachControlHandlers();
  private attachControlHandlers() {
    const wire = (els: HTMLElement[], handler: () => void) => {
      els?.forEach((el) => {
        el.onclick = (e) => { e.preventDefault(); handler(); };
        const tag = el.tagName.toLowerCase();
        const isInteractive = tag === "button" || el.getAttribute("role") === "button";
        if (!isInteractive) {
          el.setAttribute("role", "button");
          if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
          el.onkeydown = (ke: KeyboardEvent) => {
            if (ke.key === "Enter" || ke.key === " ") { ke.preventDefault(); handler(); }
          };
        }
      });
    };
    this.prevControls && wire(this.prevControls, this.goToPrev);
    this.nextControls && wire(this.nextControls, this.goToNext);
  }

  render() {
    const showControls = this.shouldShowControls();
    const atStart = !this.shouldWrap() && Math.round(this.target) >= 0;
    const atEnd = !this.shouldWrap() && Math.round(this.target) <= this.maxScroll;

    this.toggleAttribute('data-at-start', atStart);
    this.toggleAttribute('data-at-end', atEnd);

    return html`
    <div class="track" @pointerdown=${this.onPointerDown}>
      <slot @slotchange=${this.measure}></slot>
    </div>
    ${showControls ? html`
      <div class="controls">
        <div class="control-prev ${atStart ? 'off' : ''}">
          <slot name="prev" @slotchange=${this.onControlsSlotChange}>
            <button
              class=${this.buttonClass || "default-btn"}
              @click=${this.goToPrev}
              aria-label="Previous"
              aria-disabled=${atStart}
              ?disabled=${atStart}
            >‹</button>
          </slot>
        </div>
        <div class="control-next ${atEnd ? 'off' : ''}">
          <slot name="next" @slotchange=${this.onControlsSlotChange}>
            <button
              class=${this.buttonClass || "default-btn"}
              @click=${this.goToNext}
              aria-label="Next"
              aria-disabled=${atEnd}
              ?disabled=${atEnd}
            >›</button>
          </slot>
        </div>
      </div>
    ` : null}
  `;
  }

  private measure = () => {
    const slides = this.slides ?? [];
    const hostW = this.clientWidth || 1;
    if (!slides.length) {
      this.itemWidth = hostW;
      this.visibleItems = 1;
      this.canOverflow = false;
      this.maxScroll = 0;
      return;
    }

    if (this.columns > 0) {
      const w = hostW / this.columns;
      this.style.setProperty("--slide-width", `${(100 / this.columns).toFixed(6)}%`);
      this.itemWidth = w + this.gap;
      this.visibleItems = this.columns;
    } else if (this.slideWidth > 0) {
      const w = this.slideWidth;
      this.style.setProperty("--slide-width", `${w}px`);
      this.itemWidth = w + this.gap;
      this.visibleItems = Math.max(1, Math.floor(hostW / Math.max(1, w)));
    } else {
      const rect = slides[0].getBoundingClientRect();
      this.style.removeProperty("--slide-width");
      this.itemWidth = rect.width + this.gap;
      this.visibleItems = Math.max(1, Math.floor(hostW / Math.max(1, rect.width)));
    }

    const actualItemW = this.itemWidth - this.gap;
    const totalW = slides.length * actualItemW + Math.max(0, slides.length - 1) * this.gap;
    this.canOverflow = totalW > hostW + 0.5;

    this.maxScroll = -Math.max(0, slides.length - 1);

    if (!this.shouldWrap()) {
      this.target = Math.min(0, Math.max(this.maxScroll, this.target));
      this.current = Math.min(0, Math.max(this.maxScroll, this.current));
      this.idleIndex = Math.round(this.current);
    }

    if (this.autoHeight) {
      let maxH = 0;
      for (const el of slides) {
        const h = el.getBoundingClientRect().height;
        if (h > maxH) maxH = h;
      }
      if (maxH > 0) (this.style as any).height = `${Math.ceil(maxH)}px`;
    } else {
      this.style.removeProperty("height");
    }
  };

  private shouldWrap() {
    return this.infinite && this.canOverflow;
  }

  private addWindowListeners() {
    window.addEventListener("pointermove", this.boundMove, { passive: false });
    window.addEventListener("pointerup", this.boundUp, { passive: true });
  }
  private removeWindowListeners() {
    window.removeEventListener("pointermove", this.boundMove);
    window.removeEventListener("pointerup", this.boundUp);
  }

  private boundMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundUp = () => this.onPointerUp();

  private onPointerDown = (e: PointerEvent) => {
    if (!this.canOverflow) return;
    this.dragging = true;
    this.startX = e.clientX;
    this.startTarget = this.target;
    this.style.cursor = "grabbing";
    this.addWindowListeners();
    this.ensureLoopRunning(true);
  };

  private onPointerMove(e: PointerEvent) {
    if (!this.dragging) return;
    const dx = e.clientX - this.startX;
    const items = (dx / Math.max(1, this.itemWidth)) * this.dragGain;

    const sign = this.shouldWrap() ? -1 : 1;
    this.target = this.startTarget + sign * items;

    if (!this.shouldWrap()) {
      if (this.target > 0) this.target = 0;
      else if (this.target < this.maxScroll) this.target = this.maxScroll;
    }
    e.preventDefault();
  }

  private onPointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this.style.cursor = "grab";
    this.removeWindowListeners();
    if (this.snap) {
      this.target = Math.round(this.target);
      if (!this.shouldWrap()) {
        if (this.target > 0) this.target = 0;
        else if (this.target < this.maxScroll) this.target = this.maxScroll;
      }
    }
    this.ensureLoopRunning();
  }

  private stepTo(delta: number) {
    if (!this.canOverflow) return;

    const base = Math.round(this.target);
    const modeDir = this.shouldWrap() ? 1 : -1;
    let next = base + modeDir * delta;

    if (!this.shouldWrap()) {
      if (next > 0) next = 0;
      else if (next < this.maxScroll) next = this.maxScroll;
    }

    this.target = next;
    this.ensureLoopRunning(true);
  }

  private goToNext = () => this.stepTo(1);
  private goToPrev = () => this.stepTo(-1);

  private ensureLoopRunning(resetLastTime = false) {
    if (resetLastTime) this.lastTime = performance.now();
    if (!this.rafRunning) {
      this.rafRunning = true;
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  private stopLoop() {
    if (this.rafRunning) {
      cancelAnimationFrame(this.raf);
      this.rafRunning = false;
    }
  }

  private loop = () => {
    if (!this.rafRunning) return;
    this.raf = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.snap && !this.dragging) {
      const snapT = Math.round(this.target);
      this.target += (snapT - this.target) * this.snapStrength;
    }

    this.current = damp(this.current, this.target, 1 / this.lerpFactor, dt);

    const settled = !this.dragging && Math.abs(this.current - this.target) < this.settleEpsilon;
    if (settled) {
      if (this.snap) {
        const s = Math.round(this.target);
        this.current = s;
        this.target = s;
        this.idleIndex = s;
      } else {
        this.idleIndex = Math.round(this.current);
      }
      this.layout();
      this.stopLoop();
      return;
    }

    this.layout();
  };

  private layout() {
    const n = this.slides?.length ?? 0;
    if (n === 0) return;

    const wrap = this.shouldWrap();
    const w = this.itemWidth;

    if (wrap) {
      const desiredPre = this.preloadItems;
      const need = this.visibleItems + 2 * desiredPre;
      const effectivePre = n >= need ? desiredPre : Math.max(0, Math.floor((n - this.visibleItems) / 2));
      const L = -effectivePre;
      const R = this.visibleItems + effectivePre;

      for (let i = 0; i < n; i++) {
        const el = this.slides[i];
        const raw = i - this.current;
        const k = Math.floor((raw - L) / n);
        let rel = raw - k * n;
        if (rel >= R) rel -= n;
        else if (rel < L) rel += n;
        const x = rel * w;
        const tx = `translateX(${x}px)`;
        if ((el as any)._lx !== tx) {
          el.style.transform = tx;
          (el as any)._lx = tx;
        }
      }
    } else {
      const clamped = Math.min(0, Math.max(this.maxScroll, this.current));
      const offsetPx = -clamped * w;
      if (this.lastAppliedX === offsetPx) return;
      this.lastAppliedX = offsetPx;
      for (let i = 0; i < n; i++) {
        const el = this.slides[i];
        const x = i * w - offsetPx;
        const tx = `translateX(${x}px)`;
        if ((el as any)._lx !== tx) {
          el.style.transform = tx;
          (el as any)._lx = tx;
        }
      }
    }

    if (this.autoHeight) {
      let maxH = 0;
      for (const el of this.slides) {
        const h = el.getBoundingClientRect().height;
        if (h > maxH) maxH = h;
      }
      if (maxH > 0) (this.style as any).height = `${Math.ceil(maxH)}px`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap { "leaf-carousel": LeafCarousel; }
  namespace JSX { interface IntrinsicElements { "leaf-carousel": any; } }
}

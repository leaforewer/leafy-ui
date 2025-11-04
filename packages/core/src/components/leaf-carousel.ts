import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

function damp(a: number, b: number, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt);
  return a + (b - a) * t;
}

@customElement("leaf-carousel")
export class LeafCarousel extends LitElement {
  @queryAssignedElements() slides!: HTMLElement[];
  @queryAssignedElements({ slot: "prev" }) prevControls!: HTMLElement[];
  @queryAssignedElements({ slot: "next" }) nextControls!: HTMLElement[];

  @property({ type: Boolean }) infinite = true;
  @property({ type: Boolean }) snap = true;
  @property({ type: Number }) dragSensitivity = 0.005;
  @property({ type: Number }) lerpFactor = 0.3;
  @property({ type: Number }) snapStrength = 0.18;
  @property({ type: Number }) speedDecay = 0.88;
  @property({ type: Number }) preloadItems = 1;

  @property({ type: Boolean }) controls = false;
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
  private resizeObs?: ResizeObserver;
  private visibleItems = 1;

  static styles = css`
    :host {
      display: block;
      overflow: hidden;
      position: relative;
      touch-action: none;
      user-select: none;
      cursor: grab;
      height: var(--leaf-carousel-height, auto);
      --slide-gap: 0px;
    }

    .track { position: relative; width: 100%; height: 100%; }

    ::slotted(:not([slot])) {
      position: absolute;
      inset: 0 auto auto 0;
      width: var(--slide-width, 100%);
      will-change: transform;
      transition: transform 0s;
      margin: 0;
    }

    .controls {
      position: absolute;
      inset: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    :host(:hover) .controls { opacity: 1; }

    .control-prev,
    .control-next {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .control-prev { left: 8px; }
    .control-next { right: 8px; }

    .controls ::slotted([slot="prev"]),
    .controls ::slotted([slot="next"]),
    .controls button {
      pointer-events: all;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    button {
      all: unset;
      width: 40px;
      height: 40px;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 9999px;
      font-size: 1.25rem;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    button:hover { background: rgba(255, 255, 255, 0.95); }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.measure();
    this.startLoop();
    this.resizeObs = new ResizeObserver(() => this.measure());
    this.resizeObs.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.raf);
    this.removeWindowListeners();
    this.resizeObs?.disconnect();
  }

  private onControlsSlotChange = () => this.attachControlHandlers();

  private attachControlHandlers() {
    const wire = (els: HTMLElement[], handler: () => void) => {
      els?.forEach((el) => {
        el.onclick = (e) => {
          e.preventDefault();
          handler();
        };
        const tag = el.tagName.toLowerCase();
        const isInteractive =
          tag === "button" || el.getAttribute("role") === "button";
        if (!isInteractive) {
          el.setAttribute("role", "button");
          if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
          el.onkeydown = (ke: KeyboardEvent) => {
            if (ke.key === "Enter" || ke.key === " ") {
              ke.preventDefault();
              handler();
            }
          };
        }
      });
    };
    wire(this.prevControls, this.goToPrev);
    wire(this.nextControls, this.goToNext);
  }

  render() {
    return html`
      <div class="track" @pointerdown=${this.onPointerDown}>
        <slot @slotchange=${this.measure}></slot>
      </div>

      ${
        this.controls
          ? html`
        <div class="controls">
          <div class="control-prev">
            <slot name="prev" @slotchange=${this.onControlsSlotChange}>
              <button class=${this.buttonClass || "default-btn"} @click=${this.goToPrev} aria-label="Previous">‹</button>
            </slot>
          </div>
          <div class="control-next">
            <slot name="next" @slotchange=${this.onControlsSlotChange}>
              <button class=${this.buttonClass || "default-btn"} @click=${this.goToNext} aria-label="Next">›</button>
            </slot>
          </div>
        </div>
      `
          : null
      }
    `;
  }

  private measure = () => {
    const slides = this.slides ?? [];
    const hostW = this.clientWidth || 1;

    if (!slides.length) {
      this.itemWidth = hostW;
      this.maxScroll = 0;
      this.visibleItems = 1;
      return;
    }

    const gapVar = getComputedStyle(this)
      .getPropertyValue("--slide-gap")
      .trim();
    const gap = parseFloat(gapVar) || 0;

    const first = slides[0];
    const firstRect = first.getBoundingClientRect();
    this.itemWidth = firstRect.width + gap;

    this.visibleItems = Math.max(1, Math.ceil(hostW / this.itemWidth));

    let maxH = 0;
    for (const el of slides)
      maxH = Math.max(maxH, el.getBoundingClientRect().height);
    if (maxH > 0)
      this.style.setProperty("--leaf-carousel-height", `${Math.ceil(maxH)}px`);

    this.maxScroll = -((slides.length || 1) - 1);

    if (!this.infinite) {
      this.target = Math.min(0, Math.max(this.maxScroll, this.target));
      this.current = Math.min(0, Math.max(this.maxScroll, this.current));
    }
  };

  private addWindowListeners() {
    window.addEventListener("pointermove", this.boundMove);
    window.addEventListener("pointerup", this.boundUp);
  }
  private removeWindowListeners() {
    window.removeEventListener("pointermove", this.boundMove);
    window.removeEventListener("pointerup", this.boundUp);
  }

  private boundMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundUp = (e: PointerEvent) => this.onPointerUp(e);

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.dragging = true;
    this.startX = e.clientX;
    this.startTarget = this.target;
    this.style.cursor = "grabbing";
    this.addWindowListeners();
  };

  private onPointerMove(e: PointerEvent) {
    if (!this.dragging) return;
    const dx = e.clientX - this.startX;
    this.target = this.startTarget - dx * this.dragSensitivity;
  }

  private onPointerUp(_e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    this.style.cursor = "grab";
    this.removeWindowListeners();
    if (this.snap) this.target = Math.round(this.target);
    if (!this.infinite) {
      if (this.target > 0) this.target = 0;
      else if (this.target < this.maxScroll) this.target = this.maxScroll;
    }
  }

  private startLoop() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;

      if (this.snap && !this.dragging) {
        const snapT = Math.round(this.target);
        this.target += (snapT - this.target) * this.snapStrength;
      }

      this.current = damp(this.current, this.target, 1 / this.lerpFactor, dt);
      this.layout();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private layout() {
    const n = this.slides?.length ?? 0;
    const w = this.itemWidth;
    if (n === 0) return;

    const desiredPre = this.preloadItems;
    const need = this.visibleItems + 2 * desiredPre;
    const effectivePre =
      n >= need
        ? desiredPre
        : Math.max(0, Math.floor((n - this.visibleItems) / 2));
    const L = -effectivePre;
    const R = this.visibleItems + effectivePre;

    for (let i = 0; i < n; i++) {
      const el = this.slides[i];
      if (!el) continue;

      const raw = i - this.current;
      const k = Math.floor((raw - L) / n);
      let rel = raw - k * n;

      if (rel >= R) rel -= n;
      else if (rel < L) rel += n;

      const x = rel * w;
      el.style.transform = `translateX(${x}px)`;
    }
  }

  private stepTo(delta: number) {
    const base = Math.round(this.current);
    this.target = base + delta;
    if (!this.infinite) {
      if (this.target > 0) this.target = 0;
      else if (this.target < this.maxScroll) this.target = this.maxScroll;
    }
  }

  private goToNext = () => this.stepTo(1);
  private goToPrev = () => this.stepTo(-1);
}

declare global {
  interface HTMLElementTagNameMap {
    "leaf-carousel": LeafCarousel;
  }
  namespace JSX {
    interface IntrinsicElements {
      "leaf-carousel": /* biome-ignore lint:suspicious/noExplicitAny */ any;
    }
  }
}

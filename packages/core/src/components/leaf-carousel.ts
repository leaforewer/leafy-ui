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

function symmetricMod(value: number, base: number) {
  let m = value % base;
  if (Math.abs(m) > base / 2) m = m > 0 ? m - base : m + base;
  return m;
}

@customElement("leaf-carousel")
export class LeafCarousel extends LitElement {
  @queryAssignedElements() slides!: HTMLElement[];

  @property({ type: Boolean }) infinite = true;
  @property({ type: Boolean }) snap = true;
  @property({ type: Number }) dragSensitivity = 0.005;
  @property({ type: Number }) lerpFactor = 0.3;
  @property({ type: Number }) snapStrength = 0.1;
  @property({ type: Number }) speedDecay = 0.88;

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

  static styles = css`
    :host {
      display: block;
      overflow: hidden;
      position: relative;
      touch-action: none;
      user-select: none;
      cursor: grab;
    }
    .track {
      display: flex;
      width: 100%;
      height: 100%;
    }
    ::slotted(*) {
      flex: 0 0 100%;
      will-change: transform;
      transition: transform 0s;
    }

    /* --- Controls --- */
    .controls {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    :host(:hover) .controls {
      opacity: 1;
    }
    button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;        
      pointer-events: all;
      background: rgba(255, 255, 255, 0.7);
      border: none;
      border-radius: 9999px;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.95);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.measure();
    this.startLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.raf);
    this.removeWindowListeners();
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
            <button
              class=${this.buttonClass}
              @click=${this.goToPrev}
              aria-label="Previous"
            >
              <slot name="prev-icon">‹</slot>
            </button>
            <button
              class=${this.buttonClass}
              @click=${this.goToNext}
              aria-label="Next"
            >
              <slot name="next-icon">›</slot>
            </button>
          </div>
        `
        : null
    }
  `;
  }

  private measure = () => {
    const first = this.slides?.[0];
    this.itemWidth =
      first?.getBoundingClientRect().width || this.clientWidth || 1;
    this.maxScroll = -((this.slides?.length || 1) - 1);
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
    this.target = this.startTarget + dx * this.dragSensitivity;
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
    for (let i = 0; i < n; i++) {
      const el = this.slides[i];
      if (!el) continue;

      let rel = i + this.current;
      if (this.infinite) rel = symmetricMod(this.current + i, n) - i;

      const x = rel * w;
      el.style.transform = `translateX(${x}px)`;
    }
  }

  private goToNext = () => {
    this.target = Math.round(this.target - 1);
    if (!this.infinite && this.target < this.maxScroll)
      this.target = this.maxScroll;
  };

  private goToPrev = () => {
    this.target = Math.round(this.target + 1);
    if (!this.infinite && this.target > 0) this.target = 0;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "leaf-carousel": LeafCarousel;
  }
}
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "leaf-carousel": /* biome-ignore lint:suspicious/noExplicitAny */ any;
    }
  }
}

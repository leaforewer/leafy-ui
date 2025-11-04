import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type TrackStyle = "pill" | "line" | "skewed" | "dot";
type Img = { url: string; alt?: string };

@customElement("product-image-slider")
export class ProductImageSlider extends LitElement {
  static styles = css`:host{display:block}`;

  @property({ attribute: false }) images: Img[] = [];
  @property({ type: Boolean, reflect: true }) tracks = true;
  @property({ type: Boolean, reflect: true }) strip = false;
  @property({ type: String, reflect: true }) trackstyle: TrackStyle = "dot";

  @property({ type: Boolean, reflect: true }) zoom = false;
  @property({ type: Boolean, reflect: true }) zoomBtn = false;

  @state() private index = 0;
  @state() private startX: number | null = null;
  @state() private dragX = 0;

  private tapCandidate = false;
  private readonly tapMovePx = 6;

  createRenderRoot() {
    return this;
  }

  private get zoomEnabled() {
    return this.zoom || this.zoomBtn;
  }
  private slideCount(): number {
    return this.images?.length || 0;
  }

  private uiTarget(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest(".carousel-zoom, .carousel-track, .carousel-thumb");
  }

  private onStart = (e: PointerEvent | MouseEvent | TouchEvent) => {
    if (this.uiTarget(e)) return;
    const x =
      e instanceof TouchEvent
        ? (e.touches[0]?.clientX ?? 0)
        : (e as PointerEvent | MouseEvent).clientX;
    this.startX = x;
    this.dragX = 0;
    this.tapCandidate = true;
    if ("pointerId" in e && (e as PointerEvent).pointerId != null) {
      (e.currentTarget as HTMLElement)?.setPointerCapture?.(
        (e as PointerEvent).pointerId,
      );
    }
  };

  private onMove = (e: PointerEvent | MouseEvent | TouchEvent) => {
    if (this.startX === null) return;
    const x =
      e instanceof TouchEvent
        ? (e.touches[0]?.clientX ?? 0)
        : (e as PointerEvent | MouseEvent).clientX;
    this.dragX = x - this.startX;
    if (Math.abs(this.dragX) > this.tapMovePx) this.tapCandidate = false;
    this.requestUpdate();
  };

  private onEnd = (e: PointerEvent | MouseEvent | TouchEvent) => {
    if (this.startX === null) return;

    const host = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    const width = host?.offsetWidth || 1;
    const threshold = width * 0.2;
    const total = this.slideCount();

    if (this.dragX > threshold && this.index > 0) this.index -= 1;
    else if (this.dragX < -threshold && this.index < total - 1) this.index += 1;

    if ("pointerId" in e && (e as PointerEvent).pointerId != null) {
      (e.currentTarget as HTMLElement)?.releasePointerCapture?.(
        (e as PointerEvent).pointerId,
      );
    }

    if (
      this.zoomEnabled &&
      this.zoom &&
      this.tapCandidate &&
      !this.uiTarget(e)
    ) {
      this.toggleFullscreen();
    }

    this.startX = null;
    this.dragX = 0;
    this.tapCandidate = false;

    this.dispatchEvent(
      new CustomEvent("index-change", { detail: { index: this.index } }),
    );
  };

  private onKey = (e: KeyboardEvent) => {
    const total = this.slideCount();
    if (e.key === "ArrowRight") this.goTo(this.index + 1, total);
    if (e.key === "ArrowLeft") this.goTo(this.index - 1, total);
    if (this.zoomEnabled && (e.key === "Enter" || e.key === " "))
      this.toggleFullscreen();
  };

  private goTo(i: number, total = this.slideCount()) {
    const clamped = Math.max(0, Math.min(i, total - 1));
    if (clamped !== this.index) {
      this.index = clamped;
      this.dispatchEvent(
        new CustomEvent("index-change", { detail: { index: clamped } }),
      );
    }
  }

  private translatePercent(): string {
    const host = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    const w = host?.offsetWidth || 1;
    const dragPercent = this.startX !== null ? (this.dragX / w) * 100 : 0;
    return `${-this.index * 100 + dragPercent}%`;
  }

  private async toggleFullscreen() {
    if (!this.zoomEnabled) return;
    const el = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    await el.requestFullscreen?.().catch(() => {});
  }

  private onZoomButton = (e: MouseEvent) => {
    e.stopPropagation();
    this.toggleFullscreen();
  };

  render() {
    const total = this.slideCount();
    const dragging = this.startX !== null;
    const translate = this.translatePercent();

    return html`
      <div
        class="product-image-carousel"
        data-carousel="true"
        role="slider"
        tabindex="0"
        aria-valuemin="0"
        aria-valuemax=${Math.max(0, total - 1)}
        aria-valuenow=${this.index}
        aria-orientation="horizontal"
        @keydown=${this.onKey}
        @pointerdown=${this.onStart}
        @pointermove=${this.onMove}
        @pointerup=${this.onEnd}
        @pointercancel=${this.onEnd}
        @pointerleave=${this.onEnd}
        @mousedown=${this.onStart}
        @mousemove=${this.onMove}
        @mouseup=${this.onEnd}
        @touchstart=${this.onStart}
        @touchmove=${this.onMove}
        @touchend=${this.onEnd}
      >
        <div class="carousel-wrapper">
          <div
            class="carousel"
            data-images=${total}
            style=${`transform: translateX(${translate}); transition: ${dragging ? "none" : "transform 300ms ease-out"};`}
          >
            ${this.images.map((image, i) => {
              const eager = i === 0;
              return html`
                <div class="carousel-item" data-slide=${i}>
                  <img
                    src=${image.url}
                    alt=${image.alt ?? `Slide ${i + 1}`}
                    draggable="false"
                    loading=${eager ? "eager" : "lazy"}
                    decoding="async"
                    fetchpriority=${eager ? "high" : "auto"}
                  />
                </div>
              `;
            })}
          </div>
        </div>

        ${
          this.tracks && total > 1
            ? html`
          <div class="carousel-tracks">
            ${this.images.map(
              (_img, i) => html`
              <button
                type="button"
                class="carousel-track ${this.trackstyle} ${i === this.index ? "active" : ""}"
                data-slide-to=${i}
                aria-label=${`Go to image ${i + 1}`}
                @click=${() => this.goTo(i)}
              ></button>
            `,
            )}
          </div>
        `
            : null
        }

        ${
          this.zoomBtn
            ? html`
          <button class="carousel-zoom" type="button" aria-label="Fullscreen" @click=${this.onZoomButton}>⤢</button>
        `
            : null
        }
      </div>

      ${
        this.strip && total > 1
          ? html`
        <div class="carousel-strip">
          ${this.images.map(
            (t, i) => html`
            <button
              type="button"
              class="carousel-thumb ${i === this.index ? "active" : ""}"
              data-index=${i}
              aria-label=${`Thumbnail ${i + 1}`}
              @click=${() => this.goTo(i)}
            >
              <img src=${t.url} alt=${t.alt ?? `Thumb ${i + 1}`} draggable="false" loading="lazy" decoding="async" />
            </button>
          `,
          )}
        </div>
      `
          : null
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "product-image-slider": ProductImageSlider;
  }
  namespace JSX {
    interface IntrinsicElements {
      "product-image-slider": /* biome-ignore lint:suspicious/noExplicitAny */ any;
    }
  }
}

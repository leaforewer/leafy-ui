import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type TrackStyle = "pill" | "line" | "skewed" | "dot";
type Img = { url: string; alt?: string };

const jsonConv = {
  fromAttribute(value?: string | null): Img[] {
    if (!value) return [];
    try {
      const arr = JSON.parse(value) as Array<Partial<Img> & { src?: string }>;
      if (!Array.isArray(arr)) return [];
      return arr
        .map((i) => ({
          url: (i.url ?? i.src ?? "") as string,
          alt: i.alt ?? "",
        }))
        .filter((i) => !!i.url);
    } catch {
      return [];
    }
  },
  toAttribute(value?: Img[] | null): string | null {
    if (!value || !value.length) return null;
    return JSON.stringify(value.map((i) => ({ url: i.url, alt: i.alt })));
  },
};

type Ctx = "base" | "overlay";

@customElement("product-image-slider")
export class ProductImageSlider extends LitElement {
  static styles = css`:host{display:block}`;

  @property({ attribute: "data-images", converter: jsonConv }) images: Img[] =
    [];
  @property({ type: Boolean, reflect: true }) tracks = true;
  @property({ type: Boolean, reflect: true }) strip = false;
  @property({ type: String, reflect: true }) trackstyle: TrackStyle = "dot";
  @property({ type: Boolean, reflect: true }) zoom = false;
  @property({ type: Boolean, reflect: true }) zoomBtn = false;

  @state() private index = 0;
  @state() private showOverlay = false;

  private startX: number | null = null;
  private dragX = 0;
  private startTransformPct = 0;
  private isDragging = false;
  private tapCandidate = false;
  private readonly tapMovePx = 5;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.images?.length) this.loadFromChildImgs();
    this.addEventListener("keydown", this.handleKeyDown);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.handleKeyDown);
  }

  private loadFromChildImgs() {
    const nodes = Array.from(
      this.querySelectorAll(":scope > img"),
    ) as HTMLImageElement[];
    if (!nodes.length) return;
    const imgs = nodes
      .map((img) => ({
        url: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
      }))
      .filter((i) => !!i.url);
    if (!imgs.length) return;
    this.images = imgs;
    for (const el of nodes) el.style.display = "none";
  }

  private get total() {
    return this.images?.length || 0;
  }
  private get zoomEnabled() {
    return this.zoom || this.zoomBtn;
  }

  private uiTarget(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest(
      ".carousel-zoom, .carousel-track, .carousel-thumb, .pis-close",
    );
  }

  private surface(ctx: Ctx) {
    return (
      ctx === "base"
        ? this.querySelector(".product-image-carousel")
        : this.querySelector(".pis-overlay-surface")
    ) as HTMLElement | null;
  }
  private trackEl(ctx: Ctx) {
    return (
      ctx === "base"
        ? this.querySelector(".carousel")
        : this.querySelector(".pis-overlay-track")
    ) as HTMLElement | null;
  }
  private width(ctx: Ctx) {
    return this.surface(ctx)?.offsetWidth || 1;
  }
  private setTransform(ctx: Ctx, pct: number) {
    const t = this.trackEl(ctx);
    if (t) t.style.transform = `translateX(${pct}%)`;
  }
  private setTransition(ctx: Ctx, on: boolean) {
    const t = this.trackEl(ctx);
    if (t) t.style.transition = on ? "transform 300ms ease-out" : "none";
  }
  private wrapIndex(i: number) {
    const n = this.total;
    if (n === 0) return 0;
    return ((i % n) + n) % n;
  }
  private goTo(i: number) {
    if (this.total <= 0) return;
    const clamped = this.wrapIndex(i);
    if (clamped !== this.index) {
      this.index = clamped;
      this.setTransition("base", true);
      this.setTransform("base", -this.index * 100);
      if (this.showOverlay) {
        this.setTransition("overlay", true);
        this.setTransform("overlay", -this.index * 100);
      }
      this.dispatchEvent(
        new CustomEvent("index-change", { detail: { index: clamped } }),
      );
    }
  }

  private onStart = (e: PointerEvent, ctx: Ctx = "base") => {
    if (this.uiTarget(e) || this.total <= 1) return;
    e.preventDefault();
    this.surface(ctx)?.setPointerCapture?.(e.pointerId);
    this.isDragging = true;
    this.tapCandidate = true;
    this.startX = e.clientX;
    this.dragX = 0;
    this.startTransformPct = -this.index * 100;
    this.setTransition(ctx, false);
  };
  private onMove = (e: PointerEvent, ctx: Ctx = "base") => {
    if (!this.isDragging || this.startX === null) return;
    e.preventDefault();
    this.dragX = e.clientX - this.startX;
    if (Math.abs(this.dragX) > this.tapMovePx) this.tapCandidate = false;
    const movePct = (this.dragX / this.width(ctx)) * 100;
    this.setTransform(ctx, this.startTransformPct + movePct);
  };
  private onEnd = (e: PointerEvent, ctx: Ctx = "base") => {
    if (!this.isDragging || this.startX === null) return;
    this.surface(ctx)?.releasePointerCapture?.(e.pointerId);

    const dx = this.dragX;
    const threshold = this.width(ctx) * 0.2;

    let next = this.index;
    if (Math.abs(dx) > threshold) {
      next =
        dx > 0
          ? this.wrapIndex(this.index - 1)
          : this.wrapIndex(this.index + 1);
    }

    this.index = next;
    this.setTransition(ctx, true);
    this.setTransform(ctx, -this.index * 100);

    if (
      ctx === "base" &&
      this.zoomEnabled &&
      this.zoom &&
      this.tapCandidate &&
      !this.uiTarget(e)
    ) {
      this.openOverlay();
    }

    this.isDragging = false;
    this.startX = null;
    this.dragX = 0;
    this.tapCandidate = false;

    this.dispatchEvent(
      new CustomEvent("index-change", { detail: { index: this.index } }),
    );
  };

  private readonly handleKeyDown: EventListener = (ev: Event) =>
    this.onKey(ev as KeyboardEvent);

  private onKey = (e: KeyboardEvent) => {
    if (this.total <= 1) return;
    if (e.key === "ArrowRight") this.goTo(this.wrapIndex(this.index + 1));
    if (e.key === "ArrowLeft") this.goTo(this.wrapIndex(this.index - 1));
    if (this.zoomEnabled && (e.key === "Enter" || e.key === " "))
      this.openOverlay();
    if (this.showOverlay && e.key === "Escape") this.closeOverlay();
  };

  private openOverlay() {
    if (!this.zoomEnabled) return;
    this.showOverlay = true;
    requestAnimationFrame(() => {
      this.setTransition("overlay", false);
      this.setTransform("overlay", -this.index * 100);
    });
    document.documentElement.classList.add("pis-no-scroll");
  }
  private closeOverlay = () => {
    this.showOverlay = false;
    document.documentElement.classList.remove("pis-no-scroll");
  };
  private onZoomButton = (e: MouseEvent) => {
    e.stopPropagation();
    this.openOverlay();
  };

  private renderTrack(className: string, fit: "cover" | "contain") {
    const total = this.total;
    return html`
      <div class=${className}
           style="transform: translateX(${-this.index * 100}%); transition: transform 300ms ease-out;"
           data-images=${total}>
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
                style=${`object-fit:${fit}`}
              />
            </div>`;
        })}
      </div>
    `;
  }

  render() {
    const total = this.total;

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
        @pointerdown=${(e: PointerEvent) => this.onStart(e, "base")}
        @pointermove=${(e: PointerEvent) => this.onMove(e, "base")}
        @pointerup=${(e: PointerEvent) => this.onEnd(e, "base")}
      >
        <div class="carousel-wrapper">
          ${this.renderTrack("carousel", "contain")}
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
          <button class="carousel-zoom" type="button" aria-label="Zoom" @click=${this.onZoomButton}>⤢</button>
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

      ${
        this.zoomEnabled && this.showOverlay
          ? html`
        <div class="pis-overlay" @click=${this.closeOverlay}>
          <div
            class="pis-overlay-inner pis-overlay-surface"
            @click=${(e: Event) => e.stopPropagation()}
            @pointerdown=${(e: PointerEvent) => this.onStart(e, "overlay")}
            @pointermove=${(e: PointerEvent) => this.onMove(e, "overlay")}
            @pointerup=${(e: PointerEvent) => this.onEnd(e, "overlay")}
          >
            <button class="pis-close" type="button" aria-label="Close" @click=${this.closeOverlay}>✕</button>

            <div class="pis-track-wrapper">
              ${this.renderTrack("carousel pis-overlay-track", "contain")}
              ${
                this.tracks && total > 1
                  ? html`
                <div class="pis-overlay-tracks">
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
            </div>

            ${
              this.strip && total > 1
                ? html`
              <div class="pis-overlay-strip">
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
          </div>
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

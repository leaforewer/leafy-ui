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

@customElement("product-image-slider")
export class ProductImageSlider extends LitElement {
  static styles = css`:host{display:block}`;

  @property({ attribute: "images", converter: jsonConv }) images: Img[] = [];
  @property({ type: Boolean, reflect: true }) tracks = true;
  @property({ type: Boolean, reflect: true }) strip = false;
  @property({ type: String, reflect: true }) trackstyle: TrackStyle = "dot";
  @property({ type: Boolean, reflect: true }) zoom = false;
  @property({ type: Boolean, reflect: true }) zoomBtn = false;

  @state() private index = 0;

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
    return !!t?.closest(".carousel-zoom-btn, .carousel-track, .carousel-thumb");
  }

  private onContainerClick = (e: Event) => {
    const carousel = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    const isZoomed = carousel?.classList.contains("zoomed") || false;

    if (isZoomed && !this.uiTarget(e)) {
      const target = e.target as HTMLElement | null;
      const clickedInsideContainer = target?.closest(".carousel-container");
      if (!clickedInsideContainer) {
        this.closeZoom();
      }
    }
  };
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
      const track = this.querySelector(".carousel") as HTMLElement | null;
      if (track) {
        track.style.transition = "transform 300ms ease-out";
        track.style.transform = `translateX(${-this.index * 100}%)`;
      }
      this.dispatchEvent(
        new CustomEvent("index-change", { detail: { index: clamped } }),
      );
    }
  }

  private onStart = (e: PointerEvent) => {
    if (this.uiTarget(e) || this.total <= 1) return;
    e.preventDefault();
    const carousel = this.querySelector(".carousel") as HTMLElement | null;
    carousel?.setPointerCapture?.(e.pointerId);
    this.isDragging = true;
    this.tapCandidate = true;
    this.startX = e.clientX;
    this.dragX = 0;
    this.startTransformPct = -this.index * 100;
    const track = this.querySelector(".carousel") as HTMLElement | null;
    if (track) {
      track.style.transition = "none";
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.isDragging || this.startX === null) return;
    e.preventDefault();
    this.dragX = e.clientX - this.startX;
    if (Math.abs(this.dragX) > this.tapMovePx) this.tapCandidate = false;
    const carousel = this.querySelector(".carousel") as HTMLElement | null;
    const width = carousel?.offsetWidth || 1;
    const movePct = (this.dragX / width) * 100;
    const track = this.querySelector(".carousel") as HTMLElement | null;
    if (track) {
      track.style.transform = `translateX(${this.startTransformPct + movePct}%)`;
    }
  };

  private onEnd = (e: PointerEvent) => {
    if (!this.isDragging || this.startX === null) return;
    const carousel = this.querySelector(".carousel") as HTMLElement | null;
    carousel?.releasePointerCapture?.(e.pointerId);

    const dx = this.dragX;
    const width = carousel?.offsetWidth || 1;
    const threshold = width * 0.2;

    let next = this.index;
    if (Math.abs(dx) > threshold) {
      next =
        dx > 0
          ? this.wrapIndex(this.index - 1)
          : this.wrapIndex(this.index + 1);
    }

    this.index = next;
    const track = this.querySelector(".carousel") as HTMLElement | null;
    if (track) {
      track.style.transition = "transform 300ms ease-out";
      track.style.transform = `translateX(${-this.index * 100}%)`;
    }

    if (
      this.zoomEnabled &&
      this.zoom &&
      this.tapCandidate &&
      !this.uiTarget(e)
    ) {
      this.toggleZoom();
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
      this.toggleZoom();
    if (e.key === "Escape") this.closeZoom();
  };

  private toggleZoom() {
    if (!this.zoomEnabled) return;
    const carousel = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    if (carousel) {
      const isCurrentlyZoomed = carousel.classList.contains("zoomed");
      if (isCurrentlyZoomed) {
        carousel.classList.remove("zoomed");
        carousel.classList.remove("btn-close");
      } else {
        carousel.classList.add("zoomed");
        carousel.classList.add("btn-close");
      }
    }
  }

  private closeZoom = () => {
    const carousel = this.querySelector(
      ".product-image-carousel",
    ) as HTMLElement | null;
    if (carousel) {
      carousel.classList.remove("zoomed");
      carousel.classList.remove("btn-close");
    }
  };

  private onZoomButton = (e: MouseEvent) => {
    e.stopPropagation();
    this.toggleZoom();
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
        class="product-image-carousel ${this.zoomEnabled ? "has-zoom-btn" : ""}"
        data-carousel="true"
        role="slider"
        tabindex="0"
        aria-valuemin="0"
        aria-valuemax=${Math.max(0, total - 1)}
        aria-valuenow=${this.index}
        aria-orientation="horizontal"
        @click=${this.onContainerClick}
      >
        <div class="carousel-container"> 
        <div class="carousel-wrapper"
             @pointerdown=${this.onStart}
             @pointermove=${this.onMove}
             @pointerup=${this.onEnd}
        >
          ${this.renderTrack("carousel", "contain")}
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
        </div>

        ${
          this.zoomEnabled
            ? html`
          <button 
            class="carousel-zoom-btn ${this.zoomBtn ? "" : "click-only"}" 
            type="button" 
            @click=${this.onZoomButton}
          >
            <span class="zoom-icon">⤢</span>
            <span class="close-icon">✕</span>
          </button>
        `
            : null
        }

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
      </div>
    </div>
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

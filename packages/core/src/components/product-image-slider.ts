import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type TrackStyle = "pill" | "line" | "skewed" | "dot";
type TransitionType = "slide" | "fade";
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
  @property({ type: Number, reflect: true }) trackslimit = 0;
  @property({ type: String, reflect: true }) transition: TransitionType = "slide";
  @property({ type: Boolean, reflect: true }) zoom = false;
  @property({ type: Boolean, reflect: true }) zoomBtn = false;

  @state() private index = 0;
  @state() private isZoomed = false;

  private startX: number | null = null;
  private dragX = 0;
  private startTransformPct = 0;
  private isDragging = false;
  private tapCandidate = false;
  private readonly tapMovePx = 5;
  private zoomHistoryPushed = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.images?.length) this.loadFromChildImgs();
    this.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("popstate", this.handlePopState);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("popstate", this.handlePopState);
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

  private scrollStripToIndex() {
    if (!this.strip) return;
    const stripContainer = this.querySelector('.carousel-strip') as HTMLElement | null;
    const activeThumb = this.querySelector('.carousel-thumb.active') as HTMLElement | null;

    if (!stripContainer || !activeThumb) return;

    const containerRect = stripContainer.getBoundingClientRect();
    const thumbRect = activeThumb.getBoundingClientRect();

    const thumbInView = thumbRect.left >= containerRect.left && thumbRect.right <= containerRect.right;

    if (!thumbInView) {
      const scrollLeft = activeThumb.offsetLeft - stripContainer.offsetWidth / 2 + activeThumb.offsetWidth / 2;
      stripContainer.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: 'smooth'
      });
    }
  }

  private getVisibleTrackRange(): { start: number; end: number } {
    const total = this.total;
    const limit = this.trackslimit;

    if (limit <= 0 || limit >= total) {
      return { start: 0, end: total - 1 };
    }

    const currentIndex = this.index;
    const halfLimit = Math.floor(limit / 2);

    let start = currentIndex - halfLimit;
    let end = currentIndex + halfLimit;

    if (limit % 2 === 0) {
      end = currentIndex + halfLimit - 1;
    }

    if (start < 0) {
      const offset = Math.abs(start);
      start = 0;
      end = Math.min(total - 1, end + offset);
    }

    if (end >= total) {
      const offset = end - (total - 1);
      end = total - 1;
      start = Math.max(0, start - offset);
    }

    return { start, end };
  }

  private goTo(i: number) {
    if (this.total <= 0) return;
    const clamped = this.wrapIndex(i);
    if (clamped !== this.index) {
      this.index = clamped;
      requestAnimationFrame(() => this.scrollStripToIndex());
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
    if (track && this.transition !== "fade") {
      track.style.transition = "none";
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.isDragging || this.startX === null) return;
    e.preventDefault();
    this.dragX = e.clientX - this.startX;
    if (Math.abs(this.dragX) > this.tapMovePx) this.tapCandidate = false;

    if (this.transition === "fade") return;

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
      if (this.transition === "slide") {
        track.style.transform = `translateX(${-this.index * 100}%)`;
      }
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

    requestAnimationFrame(() => this.scrollStripToIndex());

    this.dispatchEvent(
      new CustomEvent("index-change", { detail: { index: this.index } }),
    );
  };

  private readonly handleKeyDown: EventListener = (ev: Event) =>
    this.onKey(ev as KeyboardEvent);

  private handlePopState = (e: PopStateEvent) => {
    if (this.isZoomed && this.zoomHistoryPushed) {
      e.preventDefault();
      this.closeZoom();
    }
  };

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
        this.closeZoom();
      } else {
        this.openZoom();
      }
    }
  }

private openZoom() {
  const carousel = this.querySelector(
    ".product-image-carousel",
  ) as HTMLElement | null;
  const placeholder = this.querySelector(
    ".carousel-placeholder",
  ) as HTMLElement | null;

  if (carousel) {
    if (placeholder) {
      const rect = carousel.getBoundingClientRect();
      placeholder.style.height = `${rect.height}px`;
    }

    carousel.classList.add("zoomed");
    carousel.classList.add("btn-close");
    this.isZoomed = true;

    if (typeof window !== "undefined" && window.history) {
      window.history.pushState({ zoomOpen: true }, "");
      this.zoomHistoryPushed = true;
    }
  }
}

private closeZoom = () => {
  const carousel = this.querySelector(
    ".product-image-carousel",
  ) as HTMLElement | null;
  const placeholder = this.querySelector(
    ".carousel-placeholder",
  ) as HTMLElement | null;

  if (carousel) {
    carousel.classList.remove("zoomed");
    carousel.classList.remove("btn-close");
    this.isZoomed = false;
  }

  if (placeholder) {
    placeholder.style.height = "";
  }

  if (
    this.zoomHistoryPushed &&
    typeof window !== "undefined" &&
    window.history
  ) {
    this.zoomHistoryPushed = false;
    if (window.history.state?.zoomOpen) {
      window.history.back();
    }
  }
};

  private onZoomButton = (e: MouseEvent) => {
    e.stopPropagation();
    this.toggleZoom();
  };

  private renderTrack(className: string) {
    const total = this.total;
    const isFade = this.transition === "fade";

    return html`
      <div class="carousel ${className}"
           style="${isFade
        ? ''
        : `transform: translateX(${-this.index * 100}%);`
      }"
           data-images=${total}
           data-transition=${this.transition}>
        ${this.images.map((image, i) => {
        const eager = i === 0;
        const isActive = i === this.index;
        return html`
            <div 
              class="carousel-item ${isActive ? 'active' : ''}" 
              data-slide=${i}
            >
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
     <div class="carousel-placeholder" aria-hidden="true"></div>


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
        <div class="carousel-wrapper ${this.transition}"
             @pointerdown=${this.onStart}
             @pointermove=${this.onMove}
             @pointerup=${this.onEnd}
        >
          ${this.renderTrack("carousel")}
        ${this.tracks && total > 1
        ? html`
            <div class="carousel-tracks">
              ${(() => {
            const { start, end } = this.getVisibleTrackRange();
            const visibleTracks = [];

            for (let i = start; i <= end; i++) {
              visibleTracks.push(html`
                    <button
                      type="button"
                      class="carousel-track ${this.trackstyle} ${i === this.index ? "active" : ""}"
                      data-slide-to=${i}
                      aria-label=${`Go to image ${i + 1}`}
                      @click=${() => this.goTo(i)}
                    ></button>
                  `);
            }

            return visibleTracks;
          })()
          }
            </div>
          `
        : null
      }
        </div>

        ${this.zoomEnabled
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

        ${this.strip && total > 1
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

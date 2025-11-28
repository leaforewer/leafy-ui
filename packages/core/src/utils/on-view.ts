interface OnViewOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

const defaultOptions: OnViewOptions = {
  threshold: 0.3,
  rootMargin: "0px",
  once: true,
};

export const OnViewPresets = {
  early: { threshold: 0.1, rootMargin: "50px" },
  normal: { threshold: 0.3, rootMargin: "0px" },
  late: { threshold: 0.6, rootMargin: "0px" },
  fully: { threshold: 1.0, rootMargin: "0px" },
  beforeView: { threshold: 0.1, rootMargin: "100px" },
};

let observer: IntersectionObserver | null = null;

export function initOnView(options: OnViewOptions = {}) {
  const config = { ...defaultOptions, ...options };

  if (observer) {
    observer.disconnect();
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;

          requestAnimationFrame(() => {
            element.classList.add("on-view-animated");
          });

          element.dispatchEvent(
            new CustomEvent("viewenter", {
              bubbles: true,
              detail: { element },
            }),
          );

          if (config.once) {
            observer?.unobserve(element);
          }
        } else {
          if (!config.once) {
            const element = entry.target as HTMLElement;
            element.classList.remove("on-view-animated");

            element.dispatchEvent(
              new CustomEvent("viewexit", {
                bubbles: true,
                detail: { element },
              }),
            );
          }
        }
      });
    },
    {
      threshold: config.threshold,
      rootMargin: config.rootMargin,
    },
  );

  const elements = document.querySelectorAll(".on-view");
  elements.forEach((element) => {
    const computedStyle = getComputedStyle(element);
    const customThreshold = computedStyle
      .getPropertyValue("--on-view-threshold")
      .trim();
    const customMargin = computedStyle
      .getPropertyValue("--on-view-margin")
      .trim();

    if (customThreshold || customMargin) {
      const elementObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const element = entry.target as HTMLElement;

              requestAnimationFrame(() => {
                element.classList.add("on-view-animated");
              });

              element.dispatchEvent(
                new CustomEvent("viewenter", {
                  bubbles: true,
                  detail: { element },
                }),
              );

              if (config.once) {
                elementObserver.unobserve(element);
              }
            } else {
              if (!config.once) {
                const element = entry.target as HTMLElement;
                element.classList.remove("on-view-animated");

                element.dispatchEvent(
                  new CustomEvent("viewexit", {
                    bubbles: true,
                    detail: { element },
                  }),
                );
              }
            }
          });
        },
        {
          threshold: customThreshold
            ? parseFloat(customThreshold)
            : config.threshold,
          rootMargin: customMargin ? `${customMargin}` : config.rootMargin,
        },
      );

      elementObserver.observe(element);
    } else {
      observer!.observe(element);
    }
  });
}

export function addOnViewElement(element: Element) {
  if (observer) {
    observer.observe(element);
  }
}

export function removeOnViewElement(element: Element) {
  if (observer) {
    observer.unobserve(element);
  }
}

export function destroyOnView() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initOnView());
  } else {
    initOnView();
  }

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;

          if (element.classList?.contains("on-view")) {
            addOnViewElement(element);
          }

          const onViewElements = element.querySelectorAll?.(".on-view");
          onViewElements?.forEach((el) => addOnViewElement(el));
        }
      });
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

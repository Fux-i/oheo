import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import type PhotoSwipe from "photoswipe";

type ViewerElement = HTMLElement & {
  dataset: {
    rootSelector?: string;
    contentSelector?: string;
    wheelToZoom?: string;
    loop?: string;
    bgOpacity?: string;
    closeTitle?: string;
    zoomTitle?: string;
    arrowPrevTitle?: string;
    arrowNextTitle?: string;
    errorMsg?: string;
  };
};

const enhancedRows = new WeakSet<HTMLElement>();

function getCurrentCaption(pswp: PhotoSwipe): string {
  const alt = pswp.currSlide?.data.alt;
  return typeof alt === "string" ? alt.trim() : "";
}

function registerCaption(lightbox: PhotoSwipeLightbox): void {
  lightbox.on("uiRegister", () => {
    lightbox.pswp?.ui?.registerElement({
      name: "caption",
      className: "pswp__custom-caption",
      appendTo: "root",
      order: 9,
      onInit: (caption, pswp) => {
        const updateCaption = () => {
          caption.textContent = getCurrentCaption(pswp);
          caption.hidden = !caption.textContent;
        };

        updateCaption();
        pswp.on("change", updateCaption);
      },
    });
  });
}

function isImageOnlyParagraph(paragraph: HTMLParagraphElement): boolean {
  return Array.from(paragraph.childNodes).every((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.trim() === "";
    }

    return node instanceof HTMLImageElement;
  });
}

function wrapImage(image: HTMLImageElement): HTMLAnchorElement | null {
  if (image.closest("a")) return null;

  const width = Number(image.getAttribute("width") ?? image.naturalWidth);
  const height = Number(image.getAttribute("height") ?? image.naturalHeight);
  if (!image.currentSrc && !image.src) return null;
  if (!width || !height) return null;

  const link = document.createElement("a");
  link.href = image.currentSrc || image.src;
  link.dataset.pswpWidth = String(width);
  link.dataset.pswpHeight = String(height);
  link.setAttribute("aria-label", image.alt || "Open image");

  image.classList.add("image-viewer-image");
  image.parentNode?.insertBefore(link, image);
  link.append(image);

  return link;
}

function enhanceImageRows(root: ParentNode, contentSelector: string): void {
  const contents = root.querySelectorAll<HTMLElement>(contentSelector);

  for (const content of contents) {
    const paragraphs = content.querySelectorAll<HTMLParagraphElement>("p");

    for (const paragraph of paragraphs) {
      if (enhancedRows.has(paragraph) || !isImageOnlyParagraph(paragraph)) {
        continue;
      }

      const images = Array.from(paragraph.querySelectorAll("img"));
      const links = images.map(wrapImage).filter(Boolean);
      if (!links.length) continue;

      paragraph.classList.add("image-viewer-row");
      paragraph.dataset.imageViewerGallery = "";
      paragraph.dataset.imageCount = String(links.length);
      enhancedRows.add(paragraph);
    }
  }
}

function initImageViewer(viewer: ViewerElement): void {
  const rootSelector = viewer.dataset.rootSelector ?? "body";
  const contentSelector = viewer.dataset.contentSelector ?? ".article";
  const root = document.querySelector(rootSelector);
  if (!root) return;

  enhanceImageRows(root, contentSelector);

  root
    .querySelectorAll<HTMLElement>("[data-image-viewer-gallery]")
    .forEach((row) => {
      const lightbox = new PhotoSwipeLightbox({
        gallery: row,
        children: "a",
        pswpModule: () => import("photoswipe"),
        bgOpacity: Number(viewer.dataset.bgOpacity ?? 0.92),
        wheelToZoom: viewer.dataset.wheelToZoom !== "false",
        loop: viewer.dataset.loop === "true",
        closeTitle: viewer.dataset.closeTitle,
        zoomTitle: viewer.dataset.zoomTitle,
        arrowPrevTitle: viewer.dataset.arrowPrevTitle,
        arrowNextTitle: viewer.dataset.arrowNextTitle,
        errorMsg: viewer.dataset.errorMsg,
      });

      registerCaption(lightbox);
      lightbox.init();
    });
}

document.querySelectorAll<ViewerElement>("image-viewer").forEach(initImageViewer);

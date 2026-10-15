import { dismissWhenInactive } from "@/components/utils/dismissible";

const peekTimers = new WeakMap<HTMLElement, number>();
const initializedRails = new WeakSet<HTMLElement>();
const PEEK_CLOSE_DELAY = 220;
const REFRESH_DEBOUNCE_DELAY = 120;

type HeadingEntry = {
  top: number;
  item: HTMLElement;
};

type OutlinePlacement = "wide" | "edge" | "inset";

type OutlineEntry = {
  rail: HTMLElement;
  box: HTMLElement;
  article: HTMLElement;
  headings: HTMLElement[];
  entries: HeadingEntry[];
  active: HTMLElement | null;
};

function clearPeekTimer(box: HTMLElement) {
  const timer = peekTimers.get(box);
  if (timer === undefined) return;

  window.clearTimeout(timer);
  peekTimers.delete(box);
}

function openPeek(box: HTMLElement) {
  clearPeekTimer(box);
  box.classList.add("is-peeking");
}

function setOpen(box: HTMLElement, open: boolean) {
  box.classList.toggle("open", open);
  box
    .querySelector<HTMLElement>(".outline-toggle")
    ?.setAttribute("aria-expanded", String(open));
}

function closePeekLater(box: HTMLElement) {
  clearPeekTimer(box);
  peekTimers.set(
    box,
    window.setTimeout(() => {
      if (box.matches(":hover, :focus-within")) return;
      box.classList.remove("is-peeking");
      peekTimers.delete(box);
    }, PEEK_CLOSE_DELAY),
  );
}

function withVisibleNav<T>(box: HTMLElement, callback: (nav: HTMLElement) => T) {
  const nav = box.querySelector<HTMLElement>(".outline-nav");
  if (!nav) return null;

  const display = nav.style.display;
  const transform = nav.style.transform;
  const visibility = nav.style.visibility;
  const isHidden = getComputedStyle(nav).display === "none";

  if (isHidden) nav.style.display = "block";
  nav.style.transform = "none";
  nav.style.visibility = "hidden";

  const result = callback(nav);

  nav.style.display = display;
  nav.style.transform = transform;
  nav.style.visibility = visibility;

  return result;
}

function measurePlacement(entry: OutlineEntry) {
  const previous = entry.rail.dataset.placement;
  const target = entry.box.querySelector<HTMLElement>(".outline-toggle");

  delete entry.rail.dataset.placement;
  const margin = Math.abs(parseFloat(getComputedStyle(entry.rail).right));
  const controlRight = target?.getBoundingClientRect().right ?? 0;
  const panelRight =
    withVisibleNav(entry.box, (nav) => nav.getBoundingClientRect().right) ??
    controlRight;
  if (previous) entry.rail.dataset.placement = previous;

  return { margin, controlRight, panelRight };
}

function setPlacement(entry: OutlineEntry) {
  const { margin, controlRight, panelRight } = measurePlacement(entry);
  const placement: OutlinePlacement =
    controlRight >= window.innerWidth
      ? "inset"
      : panelRight + margin > window.innerWidth
        ? "edge"
        : "wide";
  const previous = entry.rail.dataset.placement;

  entry.rail.dataset.placement = placement;
  if (placement !== "edge") entry.box.classList.remove("is-peeking");

  const navRight =
    withVisibleNav(entry.box, (nav) => nav.getBoundingClientRect().right) ??
    controlRight;
  const overflow = navRight + margin - window.innerWidth;
  entry.rail.style.setProperty(
    "--outline-shift",
    `${-Math.max(0, Math.ceil(overflow))}px`,
  );

  if (placement === "inset" && previous !== "inset") {
    if (entry.box.classList.contains("open")) {
      setOpen(entry.box, false);
      entry.box.dataset.closedByPlacement = "true";
    }
    return;
  }

  if (placement !== "inset" && previous === "inset") {
    if (entry.box.dataset.closedByPlacement === "true") {
      setOpen(entry.box, true);
      delete entry.box.dataset.closedByPlacement;
    }
  }
}

function refresh(entry: OutlineEntry) {
  entry.entries = entry.headings
    .map((heading) => ({
      top: heading.getBoundingClientRect().top + window.scrollY,
      item:
        entry.box.querySelector<HTMLElement>(
          `.outline-item[data-anchor="${CSS.escape(heading.id)}"]`,
        ) ?? null,
    }))
    .filter((item): item is HeadingEntry => item.item !== null);
}

function setActive(entry: OutlineEntry, active: HTMLElement | null) {
  if (entry.active === active) return;
  entry.active?.classList.remove("active");
  active?.classList.add("active");
  entry.active = active;
}

function findCurrent(entries: HeadingEntry[], targetTop: number) {
  let low = 0;
  let high = entries.length - 1;
  let current: HTMLElement | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].top <= targetTop) {
      current = entries[mid].item;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return current;
}

export function initOutline() {
  const outlines: OutlineEntry[] = [];

  document.querySelectorAll<HTMLElement>("outline-rail").forEach((rail) => {
    if (initializedRails.has(rail)) return;
    const box = rail.querySelector<HTMLElement>(".outline-box");
    const article = document.getElementById(rail.dataset.contentId ?? "");
    if (!box || !article) return;
    initializedRails.add(rail);

    box.querySelector(".outline-toggle")?.addEventListener("click", () => {
      setOpen(box, !box.classList.contains("open"));
      delete box.dataset.closedByPlacement;
    });
    setOpen(box, box.classList.contains("open"));
    box.addEventListener("pointerenter", () => openPeek(box));
    box.addEventListener("pointerleave", () => closePeekLater(box));
    box.addEventListener("focusin", () => openPeek(box));
    box.addEventListener("focusout", () => closePeekLater(box));
    dismissWhenInactive({
      root: box,
      isOpen: () => box.classList.contains("open"),
      close: () => setOpen(box, false),
      isEnabled: () => rail.dataset.placement === "inset",
    });

    const headings = Array.from(
      article.querySelectorAll<HTMLElement>(
        "h2[id], h3[id], h4[id], h5[id], h6[id]",
      ),
    );
    const entry: OutlineEntry = {
      rail,
      box,
      article,
      headings,
      entries: [],
      active: null,
    };
    setPlacement(entry);
    refresh(entry);
    outlines.push(entry);
  });

  if (!outlines.length) return;

  function updateAll() {
    const targetTop = window.scrollY + window.innerHeight * 0.25;
    outlines.forEach((entry) => {
      setActive(entry, findCurrent(entry.entries, targetTop));
    });
  }

  let raf = 0;
  function scheduleUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateAll();
    });
  }

  let refreshRaf = 0;
  let refreshTimer = 0;
  function scheduleRefresh() {
    if (refreshRaf) return;
    refreshRaf = requestAnimationFrame(() => {
      refreshRaf = 0;
      outlines.forEach((entry) => {
        setPlacement(entry);
        refresh(entry);
      });
      updateAll();
    });
  }

  function scheduleDebouncedRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(scheduleRefresh, REFRESH_DEBOUNCE_DELAY);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleDebouncedRefresh, { passive: true });
  window.addEventListener("load", scheduleRefresh, { once: true });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleDebouncedRefresh);
    outlines.forEach((entry) => observer.observe(entry.article));
  }

  updateAll();
}

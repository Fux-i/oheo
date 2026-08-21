const initialized = new WeakSet<HTMLElement>();

function createPattern(terms: string[]): RegExp | null {
  const escapedTerms = [...new Set(terms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escapedTerms.length > 0
    ? new RegExp(`(${escapedTerms.join("|")})`, "giu")
    : null;
}

function canHighlight(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent || !node.data.trim()) return false;
  if (parent.closest("[data-search-highlight-title]")) return true;

  return !parent.closest(
    "[data-search-exclude], mark, button, script, style, svg, .katex-mathml, .gutter, .line-number, [data-line-number]",
  );
}

function highlightText(root: HTMLElement, terms: string[]): void {
  const pattern = createPattern(terms);
  if (!pattern) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && canHighlight(node)) nodes.push(node);
  }

  for (const node of nodes) {
    const text = node.data;
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(text.slice(lastIndex, match.index));
      const mark = document.createElement("mark");
      mark.dataset.searchHighlight = "";
      mark.textContent = match[0];
      fragment.append(mark);
      lastIndex = match.index + match[0].length;
    }
    fragment.append(text.slice(lastIndex));
    node.replaceWith(fragment);
  }
}

function getHashTarget(root: HTMLElement): HTMLElement | null {
  if (!window.location.hash) return null;

  let id = window.location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }

  const target = document.getElementById(id);
  return target && root.contains(target) ? target : null;
}

function initializeHighlight(root: HTMLElement): void {
  if (initialized.has(root)) return;
  initialized.add(root);

  const terms = new URLSearchParams(window.location.search).getAll("highlight");
  if (terms.length === 0) return;

  const article = root.querySelector<HTMLElement>("[data-search-body]");
  if (!article) return;
  highlightText(article, terms);

  const scrollToTarget = () => getHashTarget(root)?.scrollIntoView();
  requestAnimationFrame(scrollToTarget);
  window.addEventListener("load", scrollToTarget, { once: true });
}

document
  .querySelectorAll<HTMLElement>(
    '[data-search-document][data-search-kind="post"]',
  )
  .forEach(initializeHighlight);

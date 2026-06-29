type ElementNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  value?: string;
  children?: ElementNode[];
};

type MarkdownFile = {
  path?: string;
};

const DATA_BASE = "/src/data/";
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov", "m4v"]);

function visitElements(node: ElementNode, visit: (node: ElementNode) => void) {
  visit(node);
  for (const child of node.children ?? []) visitElements(child, visit);
}

function isExternalUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function isRelativeUrl(src: string): boolean {
  return src !== "" && !src.startsWith("/") && !isExternalUrl(src);
}

function extension(src: string): string {
  const clean = src.split(/[?#]/, 1)[0] ?? "";
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

function normalizePath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.join("/");
}

function encodeUrlPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function dataRelativeDirectory(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const dataIndex = normalized.lastIndexOf(DATA_BASE);
  if (dataIndex < 0) return null;

  const relPath = normalized.slice(dataIndex + DATA_BASE.length);
  const slash = relPath.lastIndexOf("/");
  return slash >= 0 ? relPath.slice(0, slash) : "";
}

function resolveVideoSrc(src: string, filePath: string): string | null {
  if (!isRelativeUrl(src)) return null;
  if (!VIDEO_EXTENSIONS.has(extension(src))) return null;

  const baseDir = dataRelativeDirectory(filePath);
  if (baseDir === null) return null;

  const [pathname, suffix = ""] = src.split(/(?=[?#])/, 2);
  const relPath = normalizePath(`${baseDir}/${pathname}`);
  return `${DATA_BASE}${encodeUrlPath(relPath)}${suffix}`;
}

function rewriteSrc(node: ElementNode, filePath: string) {
  const src = node.properties?.src;
  if (typeof src !== "string") return;

  const resolved = resolveVideoSrc(src, filePath);
  if (!resolved) return;

  node.properties = {
    ...node.properties,
    src: resolved,
  };
}

function rewriteRawHtml(html: string, filePath: string): string {
  return html.replace(/<(video|source)\b[^>]*>/gi, (tag) =>
    tag.replace(
      /\bsrc=(["'])(.*?)\1/i,
      (attr, quote: string, src: string) => {
        const resolved = resolveVideoSrc(src, filePath);
        return resolved ? `src=${quote}${resolved}${quote}` : attr;
      },
    ),
  );
}

export default function rehypeVideoSrc() {
  return function transformer(tree: ElementNode, file: MarkdownFile) {
    if (!file.path) return;

    visitElements(tree, (node) => {
      if (node.type === "raw" && typeof node.value === "string") {
        node.value = rewriteRawHtml(node.value, file.path!);
      }

      if (node.tagName !== "video" && node.tagName !== "source") return;
      rewriteSrc(node, file.path!);
    });
  };
}

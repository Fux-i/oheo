import { CONTENT_PREFIX, DATA_BASE } from "../content-paths";

type MarkdownFile = {
  path?: string;
  data: {
    astro?: {
      frontmatter?: Record<string, unknown>;
    };
  };
};

function fallbackPostSlug(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const dataPrefix = `${DATA_BASE}/`;
  const dataIndex = normalized.lastIndexOf(dataPrefix);
  const relPath =
    dataIndex >= 0
      ? normalized.slice(dataIndex + dataPrefix.length)
      : normalized.split("/").pop()!;
  const contentPath = relPath.startsWith(CONTENT_PREFIX)
    ? relPath.slice(CONTENT_PREFIX.length)
    : relPath;
  const noSourceDir = contentPath.includes("/")
    ? contentPath.slice(contentPath.indexOf("/") + 1)
    : contentPath;
  const base = noSourceDir.split("/").pop()!;
  const stem = base.split(".")[0];
  const dir = noSourceDir.includes("/")
    ? noSourceDir.slice(0, noSourceDir.lastIndexOf("/"))
    : "";
  return dir ? `${dir}/${stem}` : stem;
}

export function getPostSlug(file: MarkdownFile): string {
  return typeof file.data.astro?.frontmatter?.slug === "string"
    ? file.data.astro.frontmatter.slug
    : fallbackPostSlug(file.path ?? "");
}

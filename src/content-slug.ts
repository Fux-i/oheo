import { CONTENT_PREFIX, DATA_BASE } from "./content-paths";

export function getContentSlug(path: string, slug: unknown): string {
  if (typeof slug === "string") return slug;

  const normalized = path.replace(/\\/g, "/");
  const dataPrefix = `${DATA_BASE}/`;
  const dataIndex = normalized.lastIndexOf(dataPrefix);
  const relativePath =
    dataIndex >= 0 ? normalized.slice(dataIndex + dataPrefix.length) : normalized;
  const contentPath = relativePath.startsWith(CONTENT_PREFIX)
    ? relativePath.slice(CONTENT_PREFIX.length)
    : relativePath;
  const noSourceDir = contentPath.includes("/")
    ? contentPath.slice(contentPath.indexOf("/") + 1)
    : contentPath;
  const segments = noSourceDir.split("/");
  const filename = segments.pop()!;

  return [...segments, filename.split(".")[0]].join("/");
}

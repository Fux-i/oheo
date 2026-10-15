import { getContentSlug } from "../content-slug";

type MarkdownFile = {
  path?: string;
  data: {
    astro?: {
      frontmatter?: Record<string, unknown>;
    };
  };
};

export function getPostSlug(file: MarkdownFile): string {
  return getContentSlug(file.path ?? "", file.data.astro?.frontmatter?.slug);
}

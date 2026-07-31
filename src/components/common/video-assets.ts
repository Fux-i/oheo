const videoAssets = import.meta.glob<string>(
  "/src/data/**/*.{mp4,webm,ogg,mov,m4v}",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

const encodedVideoAssets = new Map(
  Object.entries(videoAssets).map(([path, url]) => [encodePath(path), url]),
);

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function resolveVideoAsset(src: string): string | null {
  const suffixIndex = src.search(/[?#]/);
  const path = suffixIndex < 0 ? src : src.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : src.slice(suffixIndex);
  const assetUrl = encodedVideoAssets.get(path);

  return assetUrl ? `${assetUrl}${suffix}` : null;
}

export function rewriteVideoAssetUrls(html: string): string {
  return html.replace(/<(video|source)\b[^>]*>/gi, (tag) =>
    tag.replace(
      /\bsrc=(["'])(.*?)\1/i,
      (attribute, quote: string, src: string) => {
        const assetUrl = resolveVideoAsset(src);
        return assetUrl ? `src=${quote}${assetUrl}${quote}` : attribute;
      },
    ),
  );
}

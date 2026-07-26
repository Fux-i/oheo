// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import rehypeHeadingAnchors from './src/markdown/rehype-heading-anchors';
import rehypeFootnoteAnchors from './src/markdown/rehype-footnote-anchors';
import rehypeVideoSrc from './src/markdown/rehype-video-src';

// https://astro.build/config
export default defineConfig({
  site: 'https://fuxi.host',
  server: {
    port: 4444,
    open: true
  },

  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: true },
  },

  redirects: {
    '/': '/en/',
  },

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    remarkPlugins: ['remark-math'],
    rehypePlugins: ['rehype-katex', rehypeHeadingAnchors, rehypeFootnoteAnchors, rehypeVideoSrc],
  },

  integrations: [
    expressiveCode({
      themes: ['one-light', 'one-dark-pro'],
      themeCssSelector: (theme) => `[data-theme="${theme.type}"]`,
      useDarkModeMediaQuery: false,
      plugins: [pluginLineNumbers(),]
    }),
  ],
});

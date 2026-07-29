---
title: Deploying with external blog data
created-at: 2026-07-28 08:53
published-at: 2026-07-28 08:53
tags:
  - oheo
---

Oheo keeps framework documentation in the main repository and loads personal content from the `src/data/content` submodule. The site can run without that submodule, while a production build can fetch the latest content from its configured `main` branch.

On every push to `blog-data`, use a GitHub Actions workflow in that repository to call an Oheo Vercel Deploy Hook. Configure the Vercel build to update the submodule before building:

```sh
git submodule update --init --remote --depth 1 src/data/content
pnpm build
```

This keeps blog commits out of Oheo's history. It also means that rebuilding the same Oheo commit can use newer blog content, because the content version is resolved at build time.

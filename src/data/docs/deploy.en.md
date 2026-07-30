---
title: Deploying with external blog data
created-at: 2026-07-28 08:53
published-at: 2026-07-28 08:53
tags:
  - oheo
---

Oheo keeps framework documentation in the main repository and loads personal content from the private `src/data/content` submodule. The site can run without that submodule.

GitHub Pages deployment runs in Oheo. Its workflow checks out the private content with the `BLOG_DATA_TOKEN` Actions secret, builds with Astro's official Pages action, and deploys the generated site.

The workflow runs after pushes to `oheo/main` and can be started manually. To deploy after content changes, `blog-data` sends a repository dispatch using an `OHEO_DISPATCH_TOKEN` Actions secret.

This keeps blog commits out of Oheo's history and keeps the private repository inaccessible to GitHub Pages itself. Only the built public site is deployed.

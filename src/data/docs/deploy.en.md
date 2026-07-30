---
title: Deploying with private blog data
created-at: 2026-07-28 08:53
published-at: 2026-07-28 08:53
tags:
  - oheo
---

Oheo can keep the theme and personal posts in separate repositories:

- **Oheo** contains the framework, documentation, and deployment workflow.
- **blog-data** contains personal posts and can remain private.

When either repository changes, GitHub Actions builds Oheo and publishes the generated site to GitHub Pages. A content update does not create a commit in Oheo or change its recorded submodule commit.

## Before you begin

Fork Oheo and create a repository for your blog data. This guide uses `oheo` and `blog-data` as their names.

Update the repository names in these workflow files if your GitHub owner or repository names differ from the defaults:

- `.github/workflows/deploy.yml` in Oheo checks out `Fux-i/blog-data`.
- `.github/workflows/deploy-oheo.yml` in blog-data sends a deployment request to `Fux-i/oheo`.

GitHub Actions must also be enabled in both repositories.

## 1. Allow Oheo to read blog-data

Oheo needs a token because GitHub Actions cannot check out a private repository with its default token.

1. Open GitHub **Settings**, then **Developer settings** > **Personal access tokens** > **Fine-grained tokens**.
2. Create a token whose repository access includes only `blog-data`.
3. Under **Repository permissions**, set **Contents** to **Read-only**.
4. Copy the token before leaving the page.
5. Open the Oheo repository, then **Settings** > **Secrets and variables** > **Actions**.
6. Create a repository secret named `BLOG_DATA_TOKEN` and paste the token as its value.

Do not add the token to a file or commit it to Git.

## 2. Enable GitHub Pages

In the Oheo repository:

1. Open **Settings** > **Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push the Oheo deployment workflow at `.github/workflows/deploy.yml` to `main`.
4. Open the **Actions** tab and select **Deploy to GitHub Pages** to follow the first deployment.

The workflow runs after every push to `oheo/main`. You can also run it manually with **Run workflow**.

## 3. Deploy after a content update

The blog-data repository uses a second token to notify Oheo when new content is pushed.

1. Create another fine-grained token.
2. Give it access only to the Oheo repository.
3. Under **Repository permissions**, set **Contents** to **Read and write**. GitHub requires this permission for `repository_dispatch`.
4. In blog-data, open **Settings** > **Secrets and variables** > **Actions**.
5. Create a repository secret named `OHEO_DISPATCH_TOKEN`.
6. Add and push `.github/workflows/deploy-oheo.yml` to `blog-data/main`.

From now on, a push to `blog-data/main` starts the Oheo Pages deployment. To test it without changing content, open that workflow in the blog-data **Actions** tab and select **Run workflow**.

## 4. Configure a custom domain

Skip this section if you want to use the default GitHub Pages address.

1. Put your domain in `public/CNAME`. The included value is `fuxi.host`, so replace it when using another domain.
2. In Oheo, open **Settings** > **Pages** and enter the same custom domain.
3. Update the domain's DNS records according to GitHub Pages' instructions. Remove conflicting Vercel records if the domain previously pointed to Vercel.
4. Wait for GitHub's DNS check to pass, then enable **Enforce HTTPS**.

Also set `site` in `astro.config.mjs` to the final public URL. When using a project URL such as `https://name.github.io/oheo/` instead of a custom domain, configure Astro's `base` path as well.

## Troubleshooting

- **The blog-data checkout fails:** confirm that `BLOG_DATA_TOKEN` has not expired and can read the private blog-data repository.
- **The content push does nothing:** confirm that `OHEO_DISPATCH_TOKEN` can write to Oheo and that both workflow files use the correct repository owner and names.
- **The workflow runs but Pages is not updated:** confirm that Oheo's Pages source is **GitHub Actions** and inspect the failed step in the **Actions** tab.
- **The custom domain does not work:** confirm that `public/CNAME`, Astro's `site`, the Pages setting, and the DNS records all use the same domain.

GitHub Pages receives only the generated public site. The private blog-data source remains private, while its published posts are included in the public build.

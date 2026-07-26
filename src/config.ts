export const SITE = {
  author: "Fuxi",
  favicon: "/favicon.png",
  header_width: "5xl",  // 3xl, 4xl(56rem), 5xl(64rem), 6xl(72rem), or 7xl
  header_collapse_width: "48rem",
  page_width: "5xl",
  navs: [
    { key: "nav.posts", href: "posts" },
    { key: "nav.moments", href: "moments" },
    // { key: "nav.archives", href: "archives" },
    { key: "nav.friends", href: "friends" },
    { key: "nav.about", href: "about" },
  ],
  socials: [
    {
      name: "Mail",
      href: "mailto:1538130391@qq.com",
      key: "social.mail",
      icon: "tabler:mail",
    },
    {
      name: "Zhihu",
      href: "https://www.zhihu.com/people/ju-jiu-31-72/posts",
      key: "social.zhihu",
      icon: "tabler:brand-zhihu",
    },
    {
      name: "GitHub",
      href: "https://github.com/fux-i",
      key: "social.github",
      icon: "tabler:brand-github",
    },
  ],
} as const;

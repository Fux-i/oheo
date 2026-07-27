

export const languages = {
  en: 'English',
  zh: '中文',
} as const;

export const defaultLang = 'en' as const;

export type Lang = keyof typeof languages;

export const ui = {
  en: {
    'site.title': "Fuxi's Blog",
    'site.title_suffix': " | Fuxi's Blog",
    'nav.moments': 'Moments',
    'nav.posts': 'Posts',
    'nav.archives': 'Archives',
    'nav.friends': 'Friends',
    'nav.about': 'About',
    'btn.search': 'Search',
    'btn.theme': 'Theme toggle',
    'btn.follow_system': 'Follow system theme',
    'btn.lang_switch': '切换到中文',
    'btn.menu': 'Menu',
    'btn.x': 'Close',
    'btn.back': 'Go back',
    'social.mail': 'Send an email to Fuxi',
    'social.zhihu': 'Fuxi on Zhihu',
    'social.github': 'Fuxi on GitHub',
    'home.title': "Welcome To Fuxi's Blog",
    'home.cta': 'Start reading',
    'home.stats.label': 'Site statistics',
    'home.stats.posts': 'Posts',
    'home.stats.moments': 'Moments',
    'article.expand': 'Expand',
    'article.collapse': 'Collapse',
    'article.published_at': 'Published at',
    'article.updated_at': 'Updated at',
    'btn.outline': 'Outline',
    'viewer.close': 'Close',
    'viewer.zoom': 'Zoom',
    'viewer.previous': 'Previous image',
    'viewer.next': 'Next image',
    'viewer.error': 'The image could not be loaded',
    'friends.empty': 'No friend for now'
  },
  zh: {
    'site.title': "Fuxi's Blog",
    'site.title_suffix': " | Fuxi's Blog",
    'nav.moments': '动态',
    'nav.posts': '文章',
    'nav.archives': '归档',
    'nav.friends': '友链',
    'nav.about': '关于',
    'btn.search': '搜索',
    'btn.theme': '主题切换',
    'btn.follow_system': '跟随系统主题',
    'btn.lang_switch': 'Switch to English',
    'btn.menu': '菜单',
    'btn.x': '关闭',
    'btn.back': '返回',
    'social.mail': '给伏羲发邮件',
    'social.zhihu': '知乎',
    'social.github': 'GitHub',
    'home.title': "Welcome To Fuxi's Blog",
    'home.cta': '开始阅读',
    'home.stats.label': '站点统计',
    'home.stats.posts': '文章',
    'home.stats.moments': '动态',
    'article.expand': '展开',
    'article.collapse': '收起',
    'article.published_at': '发布于',
    'article.updated_at': '编辑于',
    'btn.outline': '大纲',
    'viewer.close': '关闭',
    'viewer.zoom': '缩放',
    'viewer.previous': '上一张图片',
    'viewer.next': '下一张图片',
    'viewer.error': '图片加载失败',
    'friends.empty': '暂时还没有友链哦'
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type UIKey = keyof (typeof ui)[typeof defaultLang];

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

export function getT(currentLocale: string | undefined) {
  const lang = (currentLocale ?? defaultLang) as Lang;
  return { lang, t: useTranslations(lang) };
}

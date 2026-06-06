import { TEMPLATE_SLOTS } from "./templateSlots.js";

export const QUIET_FEED_THEME = {
  protocol: "postsnail-theme-v1",
  type: "postsnail-frontend-theme",
  id: "quiet-feed",
  name: "Quiet Feed",
  version: "1.0.0",
  requiredFeatures: [],
  optionalFeatures: ["route-assets", "template-slots"],
  templates: {
    home: "templates/home.html",
    post: "templates/post.html",
    archive: "templates/archive.html",
    tag: "templates/tag.html",
  },
  assets: {
    css: ["assets/theme.css"],
    js: [],
  },
  publicAssets: {
    css: ["/themes/quiet-feed/theme.css"],
    js: [],
  },
  slots: [...TEMPLATE_SLOTS],
  settings: {},
  budgets: {
    runtimeJsMaxKb: 1,
    runtimeCssMaxKb: 30,
  },
};

export const DEFAULT_ADMIN_THEME = {
  protocol: "postsnail-theme-v1",
  type: "postsnail-admin-theme",
  id: "default",
  name: "PostSnail Default",
  version: "1.0.0",
  requiredFeatures: [],
  tokens: {
    "--ps-bg": "#fffdf7",
    "--ps-text": "#080a2f",
    "--ps-accent": "#ef4056",
  },
};

export const BUILTIN_THEMES = [QUIET_FEED_THEME, DEFAULT_ADMIN_THEME];

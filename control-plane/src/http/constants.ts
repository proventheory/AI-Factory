export const CONTROL_PLANE_BASE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
export const CONSOLE_URL = (process.env.CONSOLE_URL ?? "").replace(/\/$/, "");
export const SEO_GOOGLE_CALLBACK_PATH = "/v1/seo/google/callback";

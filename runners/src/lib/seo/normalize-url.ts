/**
 * Normalize URL for comparison: strip trailing slash, lowercase host, default path /.
 */
export function normalizeUrl(url: string, baseOrigin?: string): string {
  try {
    const u = new URL(url, baseOrigin ?? undefined);
    u.hash = "";
    u.search = "";
    let path = u.pathname.replace(/\/+/g, "/") || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.href;
  } catch {
    return url;
  }
}

export function getPath(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+/g, "/") || "/";
  } catch {
    return url;
  }
}

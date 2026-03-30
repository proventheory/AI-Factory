/**
 * Normalize URL for comparison: strip trailing slash, lowercase host, default path /.
 */
export declare function normalizeUrl(url: string, baseOrigin?: string): string;
export declare function getPath(url: string): string;

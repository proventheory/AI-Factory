/**
 * Classify URL type from path for SEO inventory.
 */
export type SeoUrlType = "product" | "collection" | "category" | "tag" | "post" | "page" | "policy" | "homepage" | "other";
export declare function classifyUrlType(path: string, basePath?: string): SeoUrlType;

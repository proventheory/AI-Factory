export function classifyUrlType(path, basePath = "") {
    const p = path.toLowerCase().replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "") || "";
    if (p === "" || p === basePath.replace(/^\//, "").replace(/\/$/, ""))
        return "homepage";
    if (/\/(product|prod)\//.test("/" + p) || /^product\//.test(p) || /^prod\//.test(p))
        return "product";
    if (/\/(products)\//.test("/" + p) || /^products\//.test(p))
        return "product";
    if (/\/(collection|collections)\//.test("/" + p) || /^collections\//.test(p))
        return "collection";
    if (/\/(category|categories|product-category)\//.test("/" + p) || /^category\//.test(p) || /^product-category\//.test(p))
        return "category";
    if (/\/(tag|tags)\//.test("/" + p) || /^tag\//.test(p))
        return "tag";
    if (/\/(blog|blogs|post|posts)\//.test("/" + p) || /^blog\//.test(p) || /^blogs\//.test(p))
        return "post";
    if (/\/(policy|policies|privacy|terms|legal)\//.test("/" + p) || /^policies\//.test(p))
        return "policy";
    return "page";
}
//# sourceMappingURL=classify-url.js.map
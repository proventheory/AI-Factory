import type { Request, Response } from "express";

/** RBAC (Plan 12B C2, 12B.5): resolve role from header or JWT. In production use Supabase Auth + custom claim. Default operator. */
export type Role = "viewer" | "operator" | "approver" | "admin";

export function getRole(_req: Request): Role {
  const role = _req.headers["x-role"] as string | undefined;
  if (role === "admin" || role === "approver" || role === "operator" || role === "viewer") return role;
  return "operator";
}

/** Enforce RBAC: if req role not in allowedRoles, send 403 and return true (caller should return). */
export function requireRole(req: Request, res: Response, allowedRoles: Role[]): boolean {
  const role = getRole(req);
  if (allowedRoles.includes(role)) return false;
  res.status(403).json({ error: "Forbidden", required_role: allowedRoles.join(" or ") });
  return true;
}

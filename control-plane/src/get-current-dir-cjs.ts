/**
 * CJS-only: provides current directory for the bundle. No import.meta so esbuild
 * --format=cjs does not warn. Only used when control-plane is built as CJS.
 */
export function getCurrentDir(): string {
  return __dirname;
}

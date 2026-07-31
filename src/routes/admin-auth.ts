import type { Bindings } from "../domain";
import { adminLocale } from "../views/admin";
import { currentAdmin } from "../admin-rbac";

export async function isAdmin(c: {
  env: Bindings;
  req: { raw: Request; path: string; method: string };
}) {
  return Boolean(await currentAdmin(c));
}

export async function adminLocaleOrRedirect(c: {
  env: Bindings;
  req: { raw: Request; path: string; method: string };
}) {
  if (!(await isAdmin(c))) return null;
  return adminLocale(c.req.raw);
}

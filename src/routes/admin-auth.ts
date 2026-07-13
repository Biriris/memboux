import type { Bindings } from "../domain";
import { adminLocale } from "../views/admin";
import { ADMIN_COOKIE } from "../config";
import { constantTimeEqual, sha256 } from "../utils";

async function adminSession(password: string) {
  return sha256(`memboux-admin-session:${password}`);
}

export async function isAdmin(c: {
  env: Bindings;
  req: { header(name: string): string | undefined };
}) {
  const password = c.env.ADMIN_PASSWORD;
  if (!password) return false;
  const cookie = c.req.header("Cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  return Boolean(value && constantTimeEqual(value, await adminSession(password)));
}

export async function adminLocaleOrRedirect(c: {
  env: Bindings;
  req: { header(name: string): string | undefined; raw: Request };
}) {
  if (!(await isAdmin(c))) return null;
  return adminLocale(c.req.raw);
}

export async function createAdminSessionCookie(password: string) {
  return `${ADMIN_COOKIE}=${await adminSession(password)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

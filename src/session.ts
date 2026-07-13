import { createAuth } from "./auth";
import type { Bindings } from "./domain";

type RequestContext = { env: Bindings; req: { raw: Request } };

export async function currentSession(context: RequestContext) {
  return createAuth(context.env).api.getSession({
    headers: context.req.raw.headers,
  });
}

export async function currentUser(context: RequestContext) {
  const session = await currentSession(context);

  return session?.user ?? null;
}

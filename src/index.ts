import { Hono } from "hono";
import type { Bindings } from "./domain";
import { purgeExpiredTrash } from "./repositories";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { eventRoutes } from "./routes/events";
import { galleryRoutes } from "./routes/gallery";
import { publicRoutes } from "./routes/public";

const app = new Hono<{ Bindings: Bindings }>();

app.route("/", publicRoutes);
app.route("/", accountRoutes);
app.route("/", adminRoutes);
app.route("/", eventRoutes);
app.route("/", galleryRoutes);

app.onError((error, c) => {
  console.error(error);
  const host = new URL(c.req.url).hostname;
  if (host === "127.0.0.1" || host === "localhost") return c.text(error.stack ?? error.message, 500);
  return c.text("Παρουσιάστηκε προσωρινό σφάλμα.", 500);
});
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredTrash(env));
  },
};

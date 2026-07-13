import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { Bindings } from "./domain";
import { purgeExpiredTrash } from "./repositories";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { adminMediaRoutes } from "./routes/admin-media";
import { eventProfessionalRoutes } from "./routes/event-professional";
import { eventMediaRoutes } from "./routes/event-media";
import { eventRoutes } from "./routes/events";
import { galleryRoutes } from "./routes/gallery";
import { publicRoutes } from "./routes/public";
import { studioRoutes } from "./routes/studio";

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", secureHeaders({
  permissionsPolicy: {
    camera: [],
    geolocation: [],
    microphone: [],
  },
}));
app.use("*", csrf());
app.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.toLowerCase().startsWith("text/html")) {
    c.header("Cache-Control", "private, no-store");
  }
});

app.route("/", publicRoutes);
app.route("/", accountRoutes);
app.route("/", adminRoutes);
app.route("/", adminMediaRoutes);
app.route("/", eventProfessionalRoutes);
app.route("/", eventMediaRoutes);
app.route("/", eventRoutes);
app.route("/", galleryRoutes);
app.route("/", studioRoutes);

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
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

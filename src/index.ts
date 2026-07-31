import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { Bindings } from "./domain";
import { purgeExpiredTrash } from "./repositories";
import { reconcileAutomaticCloudBackups } from "./cloud-backups";
import { accountRoutes } from "./routes/account";
import { accountTrashRoutes } from "./routes/account-trash";
import { adminRoutes } from "./routes/admin";
import { adminMediaRoutes } from "./routes/admin-media";
import { adminEventRoutes } from "./routes/admin-events";
import { adminUserRoutes } from "./routes/admin-users";
import { eventProfessionalRoutes } from "./routes/event-professional";
import { eventMediaRoutes } from "./routes/event-media";
import { eventRoutes } from "./routes/events";
import { galleryRoutes } from "./routes/gallery";
import { publicRoutes } from "./routes/public";
import { studioRoutes } from "./routes/studio";
import { backupRoutes } from "./routes/backups";
import { invitationRoutes } from "./routes/invitations";
import { experienceRoutes } from "./routes/experience";
import { weddingRoutes } from "./routes/wedding";
import { supportRoutes } from "./routes/support";
import { commerceRoutes } from "./routes/commerce";
import { eventSetupRoutes } from "./routes/event-setup";
import { webhookRoutes } from "./routes/webhooks";
import {
  reconcileResumableUploads,
  resumableUploadRoutes,
} from "./routes/resumable-uploads";
import { adminCan, adminHomeForRole, currentAdmin, permissionForAdminRequest, recordAdminAudit, type AdminIdentity } from "./admin-rbac";
import { reconcileEventTrials } from "./trial-lifecycle";
import { reconcileSupportSlaReminders } from "./support-sla-reminders";
import { handleSupportEmailMessage } from "./inbound-support-email";

export { GoogleDriveBackupWorkflow } from "./google-drive";
export { DropboxBackupWorkflow } from "./dropbox";

const app = new Hono<{ Bindings: Bindings; Variables: { admin: AdminIdentity } }>();

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const isProductionHost = url.hostname === "memboux.com" || url.hostname === "www.memboux.com";
  if (isProductionHost && url.protocol === "http:") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 308);
  }
  await next();
});

app.use("*", secureHeaders({
  permissionsPolicy: {
    camera: [],
    geolocation: [],
    microphone: [],
  },
}));
app.use("*", csrf());
app.use("/admin/*", async (c, next) => {
  if (c.req.path === "/admin/login" || c.req.path === "/admin/logout") return next();
  const admin = await currentAdmin(c);
  if (!admin) {
    if (c.req.path.startsWith("/admin/media/")) return c.text("Unauthorized", 401);
    return c.redirect("/admin/login");
  }
  const permission = permissionForAdminRequest(c.req.path, c.req.method);
  if (!permission || !adminCan(admin.role, permission)) {
    return c.html("<h1>403 · Δεν έχεις άδεια για αυτή την ενέργεια.</h1>", 403);
  }
  c.set("admin", admin);
  await next();
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.res.status < 400 && !c.req.path.startsWith("/admin/team")) {
    c.executionCtx.waitUntil(recordAdminAudit(c, admin, "admin.request_completed", "route", c.req.path, {
      method: c.req.method,
      status: c.res.status,
    }));
  }
});
app.get("/admin", (c) => c.redirect(adminHomeForRole(c.get("admin").role)));
app.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.toLowerCase().startsWith("text/html")) {
    c.header("Cache-Control", "private, no-store");
  }
});

app.route("/", publicRoutes);
app.route("/", accountRoutes);
app.route("/", accountTrashRoutes);
app.route("/", adminRoutes);
app.route("/", adminMediaRoutes);
app.route("/", adminEventRoutes);
app.route("/", adminUserRoutes);
app.route("/", eventProfessionalRoutes);
app.route("/", eventMediaRoutes);
app.route("/", eventRoutes);
app.route("/", galleryRoutes);
app.route("/", resumableUploadRoutes);
app.route("/", studioRoutes);
app.route("/", backupRoutes);
app.route("/", invitationRoutes);
app.route("/", experienceRoutes);
app.route("/", weddingRoutes);
app.route("/", supportRoutes);
app.route("/", commerceRoutes);
app.route("/", eventSetupRoutes);
app.route("/", webhookRoutes);

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  const host = new URL(c.req.url).hostname;
  if (host === "127.0.0.1" || host === "localhost") return c.text(error.stack ?? error.message, 500);
  return c.text("Παρουσιάστηκε προσωρινό σφάλμα.", 500);
});
export default {
  fetch: app.fetch,
  email(message: ForwardableEmailMessage, env: Bindings) {
    return handleSupportEmailMessage(message, env);
  },
  scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    const jobs = controller.cron === "17 3 * * *"
      ? [
          purgeExpiredTrash(env),
          reconcileAutomaticCloudBackups(env),
          reconcileResumableUploads(env),
          reconcileEventTrials(env),
        ]
      : [reconcileSupportSlaReminders(env, controller.scheduledTime)];
    ctx.waitUntil(Promise.allSettled(jobs).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(JSON.stringify({
            event: controller.cron === "17 3 * * *" ? ([
              "trash_reconciliation_failed",
              "drive_reconciliation_failed",
              "multipart_upload_reconciliation_failed",
              "trial_lifecycle_reconciliation_failed",
            ][index] ?? "scheduled_reconciliation_failed") : "support_sla_reconciliation_failed",
            error: result.reason instanceof Error ? result.reason.message.slice(0, 300) : "unknown",
          }));
        }
      });
    }));
  },
};

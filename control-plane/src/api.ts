import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import { registerGraphRoutes } from "./graphs/graph-endpoints.js";
import evolutionRouter from "./evolution/router.js";

import { selectiveRateLimiter } from "./http/middleware/auth-rate-limit.js";
import { brandProfilesGoogleGa4Properties } from "./http/controllers/seo.controller.js";
import healthRouter from "./http/routers/health.router.js";
import dashboardRouter from "./http/routers/dashboard.router.js";
import usageRouter from "./http/routers/usage.router.js";
import initiativesRouter from "./http/routers/initiatives.router.js";
import plansRouter from "./http/routers/plans.router.js";
import releasesRouter from "./http/routers/releases.router.js";
import runsRouter from "./http/routers/runs.router.js";
import approvalsRouter from "./http/routers/approvals.router.js";
import jobsRouter from "./http/routers/jobs.router.js";
import artifactsRouter from "./http/routers/artifacts.router.js";
import deployRouter from "./http/routers/deploy.router.js";
import webhooksRouter from "./http/routers/webhooks.router.js";
import checkpointsRouter from "./http/routers/checkpoints.router.js";
import changeEventsRouter from "./http/routers/change-events.router.js";
import schemaRouter from "./http/routers/schema.router.js";
import incidentsRouter from "./http/routers/incidents.router.js";
import memoryRouter from "./http/routers/memory.router.js";
import seoRouter from "./http/routers/seo.router.js";
import brandsRouter from "./http/routers/brands.router.js";
import taxonomyRouter from "./http/routers/taxonomy.router.js";
import catalogRouter from "./http/routers/catalog.router.js";
import templatesRouter from "./http/routers/templates.router.js";
import emailDesignsRouter from "./http/routers/email-designs.router.js";
import emailTemplatesRouter from "./http/routers/email-templates.router.js";
import emailComponentsRouter from "./http/routers/email-components.router.js";
import launchesRouter from "./http/routers/launches.router.js";
import graphLegacyRouter from "./http/routers/graph-legacy.router.js";

const app = express();
// CORS: allow comma-separated origins (e.g. multiple Vercel URLs) or "*"
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const allowedOrigins = corsOrigin === "*" ? "*" : corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Security headers (per docs/MAESTRON_RECON_2026-03-16.md; align with Console)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(selectiveRateLimiter);

app.get("/v1/seo/google_ga4_properties", brandProfilesGoogleGa4Properties);

app.use(healthRouter);
app.use(dashboardRouter);
app.use(usageRouter);
app.use(initiativesRouter);
app.use(plansRouter);
app.use(releasesRouter);
app.use(runsRouter);
app.use(approvalsRouter);
app.use(jobsRouter);
app.use(artifactsRouter);
app.use(deployRouter);
app.use(webhooksRouter);
app.use(checkpointsRouter);
app.use(changeEventsRouter);
app.use(schemaRouter);
app.use(incidentsRouter);
app.use(memoryRouter);
app.use(seoRouter);
app.use(brandsRouter);
app.use(taxonomyRouter);
app.use(catalogRouter);
app.use(templatesRouter);
app.use(emailDesignsRouter);
app.use(emailTemplatesRouter);
app.use(emailComponentsRouter);
app.use(launchesRouter);
app.use(graphLegacyRouter);
registerGraphRoutes(app);
app.use("/v1/evolution", evolutionRouter);

export function startApi(port: number = Number(process.env.PORT) || 3001): void {
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.listen(port, () => console.log(`[api] Listening on port ${port}`));
}

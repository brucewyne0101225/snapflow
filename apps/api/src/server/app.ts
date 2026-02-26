import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "../routes/auth.router.js";
import { eventPhotosRouter } from "../routes/event-photos.router.js";
import { eventsRouter } from "../routes/events.router.js";
import { publicEventsRouter } from "../routes/public-events.router.js";
import { publicPurchasesRouter } from "../routes/public-purchases.router.js";
import { stripeWebhookHandler } from "../routes/stripe-webhook.js";
import { errorHandler } from "./error-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceEnv = path.resolve(__dirname, "../../../../.env");

dotenv.config();
dotenv.config({ path: workspaceEnv, override: false });

export function createApp() {
  const app = express();

  app.use(cors());
  app.post("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);
  app.use(express.json({ limit: "20mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (_req, res) => {
    res.json({ service: "snapflow-api", phase: "milestone-6" });
  });

  app.use("/auth", authRouter);
  app.use("/events", eventsRouter);
  app.use("/events", eventPhotosRouter);
  app.use("/public/events", publicEventsRouter);
  app.use("/public/purchases", publicPurchasesRouter);
  app.use(errorHandler);

  return app;
}

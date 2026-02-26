import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./server/app.js";

describe("api app", () => {
  const app = createApp();

  it("returns health response", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rejects unauthenticated event access", async () => {
    await request(app).get("/events").expect(401);
  });

  it("validates selfie upload field for find-me", async () => {
    await request(app).post("/public/events/demo-event/find-me").expect(400);
  });

  it("requires stripe signature for webhook", async () => {
    await request(app).post("/webhooks/stripe").send({}).expect(400);
  });
});

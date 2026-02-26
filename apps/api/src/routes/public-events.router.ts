import { PhotoStatus } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { findSelfieMatches } from "../face/rekognition-face-search.js";
import { prisma } from "../lib/prisma.js";
import { PURCHASE_ITEM_ALL_PHOTOS, PURCHASE_ITEM_SINGLE_PHOTO } from "../payments/constants.js";
import { getStripeClient } from "../payments/stripe.js";
import { serializePhoto } from "../photos/serialize-photo.js";
import { subscribeEventUpdates } from "../realtime/event-updates.js";
import { asyncHandler } from "../server/async-handler.js";

const slugParamsSchema = z.object({
  eventSlug: z.string().min(1)
});

const findMeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(24)
});

const checkoutRequestSchema = z
  .object({
    email: z.string().email().max(320),
    productType: z.enum(["single", "all"]),
    photoId: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.productType === "single" && !value.photoId) {
      context.addIssue({
        path: ["photoId"],
        code: z.ZodIssueCode.custom,
        message: "photoId is required for single-photo checkout."
      });
    }
  });

const selfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024
  }
});

export const publicEventsRouter = Router();

function getWebBaseUrl() {
  return process.env.WEB_URL ?? "http://localhost:3000";
}

publicEventsRouter.get(
  "/:eventSlug",
  asyncHandler(async (req, res) => {
    const { eventSlug } = slugParamsSchema.parse(req.params);
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        eventDate: true,
        venue: true,
        pricePhoto: true,
        priceAll: true
      }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({
      event: {
        ...event,
        eventDate: event.eventDate.toISOString()
      }
    });
  })
);

publicEventsRouter.get(
  "/:eventSlug/photos",
  asyncHandler(async (req, res) => {
    const { eventSlug } = slugParamsSchema.parse(req.params);
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const photos = await prisma.photo.findMany({
      where: {
        eventId: event.id,
        isUploaded: true,
        status: PhotoStatus.PUBLISHED
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
    });

    const serialized = await Promise.all(photos.map((photo) => serializePhoto(photo)));
    res.json({ photos: serialized });
  })
);

publicEventsRouter.get(
  "/:eventSlug/stream",
  asyncHandler(async (req, res) => {
    const { eventSlug } = slugParamsSchema.parse(req.params);
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 4000\n\n");

    const unsubscribe = subscribeEventUpdates(eventSlug, (update) => {
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    });

    const keepAliveTimer = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      unsubscribe();
      res.end();
    });
  })
);

publicEventsRouter.post(
  "/:eventSlug/checkout-session",
  asyncHandler(async (req, res) => {
    const stripe = getStripeClient();

    if (!stripe) {
      res.status(503).json({ error: "Stripe checkout is not configured." });
      return;
    }

    const { eventSlug } = slugParamsSchema.parse(req.params);
    const input = checkoutRequestSchema.parse(req.body);
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        pricePhoto: true,
        priceAll: true
      }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const isSingle = input.productType === "single";
    let selectedPhotoId: string | null = null;
    let amount = event.priceAll;
    let itemType = PURCHASE_ITEM_ALL_PHOTOS;
    let lineItemName = `${event.name} - All Photos`;

    if (isSingle) {
      const photo = await prisma.photo.findFirst({
        where: {
          id: input.photoId,
          eventId: event.id,
          isUploaded: true,
          status: PhotoStatus.PUBLISHED
        },
        select: { id: true }
      });

      if (!photo) {
        res.status(404).json({ error: "Photo not found for purchase." });
        return;
      }

      selectedPhotoId = photo.id;
      amount = event.pricePhoto;
      itemType = PURCHASE_ITEM_SINGLE_PHOTO;
      lineItemName = `${event.name} - Single Photo`;
    }

    const webBaseUrl = getWebBaseUrl().replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      success_url: `${webBaseUrl}/e/${event.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webBaseUrl}/e/${event.slug}?checkout=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: {
              name: lineItemName
            }
          }
        }
      ],
      metadata: {
        eventId: event.id,
        eventSlug: event.slug,
        itemType,
        photoId: selectedPhotoId ?? ""
      }
    });

    await prisma.purchase.create({
      data: {
        eventId: event.id,
        buyerEmail: input.email.toLowerCase(),
        stripeSessionId: session.id,
        amountTotal: amount,
        currency: "usd",
        items: {
          create: {
            itemType,
            photoId: selectedPhotoId,
            amount
          }
        }
      }
    });

    res.status(201).json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  })
);

publicEventsRouter.post(
  "/:eventSlug/find-me",
  selfieUpload.single("selfie"),
  asyncHandler(async (req, res) => {
    const { eventSlug } = slugParamsSchema.parse(req.params);
    const { limit } = findMeQuerySchema.parse(req.query);

    if (!req.file) {
      res.status(400).json({ error: "Selfie image is required in field 'selfie'." });
      return;
    }

    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image uploads are allowed for selfie matching." });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const result = await findSelfieMatches({
      eventId: event.id,
      selfieBytes: req.file.buffer,
      limit
    });

    if (result.status === "disabled") {
      res.status(503).json({
        error: result.message ?? "Face search is currently unavailable."
      });
      return;
    }

    if (result.status === "error") {
      res.status(500).json({
        error: result.message ?? "Face search failed."
      });
      return;
    }

    res.json({
      status: result.status,
      matches: result.matches,
      count: result.matches.length,
      message: result.message ?? null
    });
  })
);

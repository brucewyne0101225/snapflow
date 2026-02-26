import { EventStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../server/async-handler.js";
import { generateEventSlug } from "../utils/slug.js";

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventDate: z.coerce.date(),
  venue: z.string().trim().max(255).optional().nullable()
});

const updateEventSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    eventDate: z.coerce.date().optional(),
    venue: z.string().trim().max(255).nullable().optional(),
    status: z.nativeEnum(EventStatus).optional(),
    pricePhoto: z.coerce.number().int().min(0).max(1_000_000).optional(),
    priceAll: z.coerce.number().int().min(0).max(10_000_000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

const eventParamsSchema = z.object({
  eventId: z.string().min(1)
});

function serializeEvent(event: {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  eventDate: Date;
  venue: string | null;
  status: EventStatus;
  pricePhoto: number;
  priceAll: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: event.id,
    ownerId: event.ownerId,
    name: event.name,
    slug: event.slug,
    eventDate: event.eventDate.toISOString(),
    venue: event.venue,
    status: event.status,
    pricePhoto: event.pricePhoto,
    priceAll: event.priceAll,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  };
}

async function createEventWithUniqueSlug(input: {
  ownerId: string;
  name: string;
  eventDate: Date;
  venue: string | null | undefined;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = generateEventSlug(input.name);

    try {
      return await prisma.event.create({
        data: {
          ownerId: input.ownerId,
          name: input.name,
          slug,
          eventDate: input.eventDate,
          venue: input.venue ?? null
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate unique slug");
}

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

eventsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const input = createEventSchema.parse(req.body);
    const event = await createEventWithUniqueSlug({
      ownerId: userId,
      name: input.name,
      eventDate: input.eventDate,
      venue: input.venue
    });

    res.status(201).json({ event: serializeEvent(event) });
  })
);

eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const events = await prisma.event.findMany({
      where: { ownerId: userId },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }]
    });

    res.json({ events: events.map(serializeEvent) });
  })
);

eventsRouter.get(
  "/:eventId/purchases",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const ownsEvent = await prisma.event.findFirst({
      where: { id: eventId, ownerId: userId },
      select: { id: true }
    });

    if (!ownsEvent) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const purchases = await prisma.purchase.findMany({
      where: { eventId },
      include: {
        items: true
      },
      orderBy: [{ createdAt: "desc" }]
    });

    res.json({
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        buyerEmail: purchase.buyerEmail,
        status: purchase.status,
        payoutStatus: purchase.payoutStatus,
        amountTotal: purchase.amountTotal,
        currency: purchase.currency,
        createdAt: purchase.createdAt.toISOString(),
        items: purchase.items.map((item) => ({
          id: item.id,
          itemType: item.itemType,
          photoId: item.photoId,
          amount: item.amount
        }))
      }))
    });
  })
);

eventsRouter.get(
  "/:eventId",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const event = await prisma.event.findFirst({
      where: { id: eventId, ownerId: userId }
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({ event: serializeEvent(event) });
  })
);

eventsRouter.patch(
  "/:eventId",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const input = updateEventSchema.parse(req.body);

    const existing = await prisma.event.findFirst({
      where: { id: eventId, ownerId: userId },
      select: { id: true }
    });

    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: input
    });

    res.json({ event: serializeEvent(event) });
  })
);

eventsRouter.delete(
  "/:eventId",
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { eventId } = eventParamsSchema.parse(req.params);
    const existing = await prisma.event.findFirst({
      where: { id: eventId, ownerId: userId },
      select: { id: true }
    });

    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    await prisma.event.delete({ where: { id: eventId } });
    res.status(204).send();
  })
);

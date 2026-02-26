import { prisma } from "../lib/prisma.js";

export async function assertEventOwner(input: { eventId: string; ownerId: string }) {
  const event = await prisma.event.findFirst({
    where: {
      id: input.eventId,
      ownerId: input.ownerId
    },
    select: {
      id: true,
      slug: true
    }
  });

  return event;
}

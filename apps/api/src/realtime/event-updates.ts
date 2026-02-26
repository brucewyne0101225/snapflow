import { EventEmitter } from "node:events";

export type RealtimePhotoEventType = "photo.uploaded" | "photo.published" | "photo.unpublished";

export interface RealtimePhotoEvent {
  type: RealtimePhotoEventType;
  eventSlug: string;
  photoId: string;
  timestamp: string;
}

const realtimeEmitter = new EventEmitter();
realtimeEmitter.setMaxListeners(0);

function getChannel(eventSlug: string) {
  return `event:${eventSlug}`;
}

export function publishEventUpdate(input: { eventSlug: string; photoId: string; type: RealtimePhotoEventType }) {
  const payload: RealtimePhotoEvent = {
    type: input.type,
    eventSlug: input.eventSlug,
    photoId: input.photoId,
    timestamp: new Date().toISOString()
  };

  realtimeEmitter.emit(getChannel(input.eventSlug), payload);
}

export function subscribeEventUpdates(
  eventSlug: string,
  listener: (event: RealtimePhotoEvent) => void
) {
  const channel = getChannel(eventSlug);
  realtimeEmitter.on(channel, listener);

  return () => {
    realtimeEmitter.off(channel, listener);
  };
}

import { describe, expect, it, vi } from "vitest";
import { publishEventUpdate, subscribeEventUpdates } from "./event-updates.js";

describe("realtime event updates", () => {
  it("publishes updates to subscribed listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEventUpdates("demo-slug", listener);

    publishEventUpdate({
      eventSlug: "demo-slug",
      photoId: "photo_1",
      type: "photo.published"
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      eventSlug: "demo-slug",
      photoId: "photo_1",
      type: "photo.published"
    });

    unsubscribe();
  });

  it("stops sending updates after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEventUpdates("demo-slug-2", listener);

    unsubscribe();

    publishEventUpdate({
      eventSlug: "demo-slug-2",
      photoId: "photo_2",
      type: "photo.unpublished"
    });

    expect(listener).not.toHaveBeenCalled();
  });
});

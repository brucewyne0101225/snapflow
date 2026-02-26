export type UserRole = "PHOTOGRAPHER" | "ADMIN";

export type EventVisibility = "DRAFT" | "PUBLISHED";

export interface EventSummary {
  id: string;
  name: string;
  slug: string;
  eventDate: string;
  venue?: string | null;
  status: "DRAFT" | "LIVE" | "ARCHIVED";
}

export interface PhotoSummary {
  id: string;
  eventId: string;
  status: EventVisibility;
  storageKey: string;
  thumbKey?: string | null;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";

type EventItem = {
  id: string;
  name: string;
  slug: string;
  eventDate: string;
  venue: string | null;
};

type PhotoItem = {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  previewUrl: string;
  createdAt: string;
};

type PurchaseItem = {
  id: string;
  buyerEmail: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  payoutStatus: string;
  amountTotal: number;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    itemType: string;
    photoId: string | null;
    amount: number;
  }>;
};

type UploadInitResponse = {
  upload: {
    method: "PUT";
    url: string;
    headers: {
      "Content-Type": string;
    };
  };
  photo: {
    id: string;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }

  return body as T;
}

function toIsoStringFromInput(value: string) {
  return new Date(value).toISOString();
}

export default function HomePage() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("photo1@example.com");
  const [password, setPassword] = useState("StrongPass123");
  const [token, setToken] = useState<string>("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [photoFilter, setPhotoFilter] = useState<"all" | "draft" | "published">("all");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [shareQrUrl, setShareQrUrl] = useState("");
  const [shareCopyLabel, setShareCopyLabel] = useState("Copy link");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    const existing = window.localStorage.getItem("snapflow_token");
    if (existing) {
      setToken(existing);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadEvents(token);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedEventId) {
      return;
    }

    void loadPhotos(token, selectedEventId, photoFilter);
    void loadPurchases(token, selectedEventId);
  }, [token, selectedEventId, photoFilter]);

  useEffect(() => {
    if (!selectedEvent) {
      setShareUrl("");
      setShareQrUrl("");
      return;
    }

    const url = `${window.location.origin}/e/${selectedEvent.slug}`;
    setShareUrl(url);
    setShareCopyLabel("Copy link");

    void QRCode.toDataURL(url, {
      margin: 1,
      width: 160,
      color: {
        dark: "#0f172a",
        light: "#ffffff"
      }
    })
      .then((value) => setShareQrUrl(value))
      .catch(() => setShareQrUrl(""));
  }, [selectedEvent]);

  async function loadEvents(activeToken: string) {
    const response = await apiRequest<{ events: EventItem[] }>("/events", {}, activeToken);
    setEvents(response.events);

    const firstEvent = response.events[0];

    if (!selectedEventId && firstEvent) {
      setSelectedEventId(firstEvent.id);
    }
  }

  async function loadPhotos(
    activeToken: string,
    eventId: string,
    filter: "all" | "draft" | "published"
  ) {
    const response = await apiRequest<{ photos: PhotoItem[] }>(
      `/events/${eventId}/photos?status=${filter}`,
      {},
      activeToken
    );
    setPhotos(response.photos);
  }

  async function loadPurchases(activeToken: string, eventId: string) {
    const response = await apiRequest<{ purchases: PurchaseItem[] }>(
      `/events/${eventId}/purchases`,
      {},
      activeToken
    );
    setPurchases(response.purchases);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setIsBusy(true);

    try {
      const response = await apiRequest<{ token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      window.localStorage.setItem("snapflow_token", response.token);
      setToken(response.token);
      setStatusMessage(`Authentication successful (${mode}).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !eventName || !eventDate) {
      return;
    }

    setIsBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await apiRequest<{ event: EventItem }>(
        "/events",
        {
          method: "POST",
          body: JSON.stringify({
            name: eventName,
            eventDate: toIsoStringFromInput(eventDate),
            venue: eventVenue || null
          })
        },
        token
      );

      await loadEvents(token);
      setEventName("");
      setEventDate("");
      setEventVenue("");
      setStatusMessage("Event created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Event creation failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUploadFiles() {
    if (!token || !selectedEventId || selectedFiles.length === 0) {
      return;
    }

    setIsBusy(true);
    setErrorMessage("");
    setStatusMessage(`Uploading ${selectedFiles.length} photo(s)...`);

    try {
      for (const file of selectedFiles) {
        const uploadInit = await apiRequest<UploadInitResponse>(
          `/events/${selectedEventId}/photos/upload-url`,
          {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              fileSize: file.size
            })
          },
          token
        );

        const uploadResponse = await fetch(uploadInit.upload.url, {
          method: uploadInit.upload.method,
          headers: uploadInit.upload.headers,
          body: file
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }

        await apiRequest(
          `/events/${selectedEventId}/photos/${uploadInit.photo.id}/complete`,
          { method: "POST" },
          token
        );
      }

      await loadPhotos(token, selectedEventId, photoFilter);
      setSelectedFiles([]);
      setStatusMessage("Upload complete.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function updatePhotoPublishState(photoId: string, action: "publish" | "unpublish") {
    if (!token || !selectedEventId) {
      return;
    }

    setIsBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await apiRequest(
        `/events/${selectedEventId}/photos/${photoId}/${action}`,
        { method: "POST" },
        token
      );
      await loadPhotos(token, selectedEventId, photoFilter);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Publish update failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopyShareLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyLabel("Copied");
    } catch {
      setShareCopyLabel("Copy failed");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("snapflow_token");
    setToken("");
    setEvents([]);
    setPhotos([]);
    setPurchases([]);
    setSelectedEventId("");
    setStatusMessage("Logged out.");
    setErrorMessage("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-700">
          Milestone 6
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">SnapFlow AI Studio</h1>
        <p className="text-sm text-slate-600">Upload event photos, manage publish state, and preview gallery.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {!token ? (
          <form onSubmit={handleAuthSubmit} className="grid gap-3 md:grid-cols-4">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={mode}
              onChange={(event) => setMode(event.target.value as "login" | "signup")}
            >
              <option value="signup">Sign up</option>
              <option value="login">Log in</option>
            </select>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              type="submit"
              disabled={isBusy}
            >
              {isBusy ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
              Authenticated
            </span>
            <span className="text-xs text-slate-500">API: {API_BASE_URL}</span>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              type="button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
      </section>

      {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {token ? (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <form
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              onSubmit={handleCreateEvent}
            >
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Create Event</h2>
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Event name"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  required
                />
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  type="datetime-local"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  required
                />
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Venue (optional)"
                  value={eventVenue}
                  onChange={(event) => setEventVenue(event.target.value)}
                />
                <button
                  className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  type="submit"
                  disabled={isBusy}
                >
                  Create
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Your Events</h2>
              <div className="space-y-2">
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No events yet.</p>
                ) : (
                  events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        selectedEventId === event.id
                          ? "border-slate-900 bg-slate-100"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-medium text-slate-800">{event.name}</p>
                      <p className="text-xs text-slate-500">{new Date(event.eventDate).toLocaleString()}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Event Gallery</h2>
              {selectedEvent ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-slate-600">
                    {selectedEvent.name} ({selectedEvent.slug})
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Share Event</p>
                    <div className="mt-2 flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-700">{shareUrl}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white"
                            type="button"
                            onClick={handleCopyShareLink}
                          >
                            {shareCopyLabel}
                          </button>
                          <a
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-white"
                            href={shareUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open public page
                          </a>
                        </div>
                      </div>
                      {shareQrUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shareQrUrl} alt="Event QR code" className="h-28 w-28 rounded border" />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="file"
                      multiple
                      onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                      className="text-sm"
                    />
                    <button
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      type="button"
                      disabled={isBusy || selectedFiles.length === 0}
                      onClick={handleUploadFiles}
                    >
                      Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}
                    </button>
                    <select
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={photoFilter}
                      onChange={(event) =>
                        setPhotoFilter(event.target.value as "all" | "draft" | "published")
                      }
                    >
                      <option value="all">All uploaded</option>
                      <option value="draft">Draft only</option>
                      <option value="published">Published only</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">
                    Public guest feed will use: <code>/public/events/{selectedEvent.slug}/photos</code>
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Select an event to manage photos.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {photos.map((photo) => (
                <article key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {/* Signed object-storage URLs vary by domain/provider; use native img for MVP flexibility. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={photo.id} className="h-56 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          photo.status === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {photo.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(photo.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {selectedEventId ? (
                      <button
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updatePhotoPublishState(
                            photo.id,
                            photo.status === "PUBLISHED" ? "unpublish" : "publish"
                          )
                        }
                      >
                        {photo.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Purchases</h3>
              <div className="mt-3 space-y-2">
                {purchases.length === 0 ? (
                  <p className="text-sm text-slate-500">No purchases yet.</p>
                ) : (
                  purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-800">{purchase.buyerEmail}</p>
                        <p className="text-xs text-slate-500">
                          {(purchase.amountTotal / 100).toFixed(2)} {purchase.currency.toUpperCase()}
                        </p>
                      </div>
                      <p className="text-xs text-slate-600">
                        Payment: {purchase.status} · Payout: {purchase.payoutStatus}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

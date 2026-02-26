"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  eventDate: string;
  venue: string | null;
  pricePhoto: number;
  priceAll: number;
};

type PublicPhoto = {
  id: string;
  status: "PUBLISHED";
  previewUrl: string;
  createdAt: string;
};

type SelfieMatch = {
  similarity: number;
  photo: PublicPhoto;
};

type FindMeResponse = {
  status: string;
  matches: SelfieMatch[];
  count: number;
  message: string | null;
};

type PurchaseSessionResponse = {
  purchase: {
    id: string;
    status: string;
    eventId: string;
    eventSlug: string;
    eventName: string;
    buyerEmail: string;
    hasAllPhotos: boolean;
    purchasedPhotoIds: string[];
  };
  accessToken: string;
};

type BundleDownloadFile = {
  photoId: string;
  downloadUrl: string;
};

type RealtimePhotoUpdate = {
  type: "photo.uploaded" | "photo.published" | "photo.unpublished";
  eventSlug: string;
  photoId: string;
  timestamp: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }

  return body as T;
}

function formatCurrencyFromCents(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount / 100);
}

async function fetchPublishedPhotos(eventSlug: string) {
  return fetchJson<{ photos: PublicPhoto[] }>(`${API_BASE_URL}/public/events/${eventSlug}/photos`);
}

export default function PublicEventPage() {
  const params = useParams<{ eventSlug: string }>();
  const searchParams = useSearchParams();
  const eventSlug = Array.isArray(params?.eventSlug)
    ? (params?.eventSlug[0] ?? "")
    : (params?.eventSlug ?? "");

  const checkoutState = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id");

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [photos, setPhotos] = useState<PublicPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy link");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [findMeMessage, setFindMeMessage] = useState("");
  const [findMeMatches, setFindMeMatches] = useState<SelfieMatch[]>([]);
  const [hasFindMeAttempt, setHasFindMeAttempt] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [purchaseToken, setPurchaseToken] = useState("");
  const [purchaseInfo, setPurchaseInfo] = useState<PurchaseSessionResponse["purchase"] | null>(null);
  const [bundleDownloads, setBundleDownloads] = useState<BundleDownloadFile[]>([]);
  const [claimedSessionId, setClaimedSessionId] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting"
  );
  const [lastRealtimeUpdate, setLastRealtimeUpdate] = useState<RealtimePhotoUpdate | null>(null);

  const isPurchasedAll = purchaseInfo?.hasAllPhotos ?? false;
  const purchasedPhotoIds = purchaseInfo?.purchasedPhotoIds ?? [];

  const findMePhotoIds = useMemo(() => new Set(findMeMatches.map((match) => match.photo.id)), [findMeMatches]);

  useEffect(() => {
    if (!eventSlug) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    void Promise.all([
      fetchJson<{ event: PublicEvent }>(`${API_BASE_URL}/public/events/${eventSlug}`),
      fetchPublishedPhotos(eventSlug)
    ])
      .then(([eventResponse, photoResponse]) => {
        setEvent(eventResponse.event);
        setPhotos(photoResponse.photos);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load event");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [eventSlug]);

  useEffect(() => {
    if (!eventSlug) {
      return;
    }

    const stream = new EventSource(`${API_BASE_URL}/public/events/${eventSlug}/stream`);
    setRealtimeStatus("connecting");

    stream.onopen = () => {
      setRealtimeStatus("connected");
    };

    stream.onmessage = (message) => {
      try {
        const update = JSON.parse(message.data) as RealtimePhotoUpdate;
        setLastRealtimeUpdate(update);
      } catch {
        return;
      }

      void fetchPublishedPhotos(eventSlug)
        .then((photoResponse) => {
          setPhotos(photoResponse.photos);
          setErrorMessage("");
        })
        .catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Realtime refresh failed");
        });
    };

    stream.onerror = () => {
      setRealtimeStatus("reconnecting");
    };

    return () => {
      stream.close();
    };
  }, [eventSlug]);

  useEffect(() => {
    if (!eventSlug) {
      setShareUrl("");
      return;
    }

    setShareUrl(`${window.location.origin}/e/${eventSlug}`);
  }, [eventSlug]);

  useEffect(() => {
    if (!shareUrl) {
      setQrUrl("");
      return;
    }

    setCopyLabel("Copy link");

    void QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: "#0f172a",
        light: "#ffffff"
      }
    })
      .then((value) => setQrUrl(value))
      .catch(() => setQrUrl(""));
  }, [shareUrl]);

  useEffect(() => {
    if (!checkoutSessionId || claimedSessionId === checkoutSessionId) {
      return;
    }

    setClaimedSessionId(checkoutSessionId);
    setPurchaseMessage("Verifying payment...");

    void fetchJson<PurchaseSessionResponse>(`${API_BASE_URL}/public/purchases/session/${checkoutSessionId}`)
      .then((response) => {
        setPurchaseInfo(response.purchase);
        setPurchaseToken(response.accessToken);
        setGuestEmail((existing) => existing || response.purchase.buyerEmail);
        setPurchaseMessage("Payment confirmed. Downloads are now unlocked.");
      })
      .catch((error: unknown) => {
        setPurchaseMessage(error instanceof Error ? error.message : "Unable to verify purchase.");
      });
  }, [checkoutSessionId, claimedSessionId]);

  useEffect(() => {
    if (checkoutState === "cancelled") {
      setPurchaseMessage("Checkout was cancelled.");
    }
  }, [checkoutState]);

  async function handleCopyLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Copy failed");
    }
  }

  async function handleFindMe() {
    if (!selfieFile || !eventSlug) {
      setFindMeMessage("Select a selfie first.");
      return;
    }

    setIsFinding(true);
    setFindMeMessage("");
    setHasFindMeAttempt(true);

    try {
      const formData = new FormData();
      formData.append("selfie", selfieFile);

      const response = await fetch(`${API_BASE_URL}/public/events/${eventSlug}/find-me?limit=24`, {
        method: "POST",
        body: formData
      });

      const body = (await response.json().catch(() => ({}))) as Partial<FindMeResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Find Me search failed");
      }

      const matches = Array.isArray(body.matches) ? body.matches : [];
      setFindMeMatches(matches);
      setFindMeMessage(
        matches.length > 0
          ? `Found ${matches.length} matching photo(s).`
          : (body.message ?? "No matches found for this selfie.")
      );
    } catch (error) {
      setFindMeMatches([]);
      setFindMeMessage(error instanceof Error ? error.message : "Find Me search failed");
    } finally {
      setIsFinding(false);
    }
  }

  function canDownloadPhoto(photoId: string) {
    return isPurchasedAll || purchasedPhotoIds.includes(photoId);
  }

  async function startCheckout(productType: "single" | "all", photoId?: string) {
    if (!guestEmail) {
      setPurchaseMessage("Enter your email before checkout.");
      return;
    }

    if (!eventSlug) {
      return;
    }

    setIsStartingCheckout(true);
    setPurchaseMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/public/events/${eventSlug}/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: guestEmail,
          productType,
          photoId
        })
      });

      const body = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !body.checkoutUrl) {
        throw new Error(body.error ?? "Failed to create checkout session.");
      }

      window.location.href = body.checkoutUrl;
    } catch (error) {
      setPurchaseMessage(error instanceof Error ? error.message : "Checkout start failed.");
      setIsStartingCheckout(false);
    }
  }

  async function handleDownloadSingle(photoId: string) {
    if (!purchaseInfo || !purchaseToken) {
      setPurchaseMessage("Complete payment first.");
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/public/purchases/${purchaseInfo.id}/download/photo/${photoId}`,
        {
          headers: {
            Authorization: `Bearer ${purchaseToken}`
          }
        }
      );

      const body = (await response.json().catch(() => ({}))) as {
        downloadUrl?: string;
        error?: string;
      };

      if (!response.ok || !body.downloadUrl) {
        throw new Error(body.error ?? "Download not available.");
      }

      window.open(body.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPurchaseMessage(error instanceof Error ? error.message : "Download failed.");
    }
  }

  async function handlePrepareDownloadAll() {
    if (!purchaseInfo || !purchaseToken) {
      setPurchaseMessage("Complete payment first.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/public/purchases/${purchaseInfo.id}/download/all`, {
        headers: {
          Authorization: `Bearer ${purchaseToken}`
        }
      });

      const body = (await response.json().catch(() => ({}))) as {
        files?: BundleDownloadFile[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(body.files)) {
        throw new Error(body.error ?? "Bundle download not available.");
      }

      setBundleDownloads(body.files);
      setPurchaseMessage(`Prepared ${body.files.length} download link(s).`);
    } catch (error) {
      setPurchaseMessage(error instanceof Error ? error.message : "Bundle download failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">SnapFlow Public Event</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {event?.name ?? "Event Gallery"}
        </h1>
        {event ? (
          <p className="text-sm text-slate-600">
            {new Date(event.eventDate).toLocaleString()}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        ) : null}
        <p className="text-xs text-slate-500">
          Realtime: {realtimeStatus}
          {lastRealtimeUpdate ? ` · Last update ${lastRealtimeUpdate.type}` : ""}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Share this event with guests.</p>
            <p className="truncate text-sm text-slate-800">{shareUrl}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                onClick={handleCopyLink}
              >
                {copyLabel}
              </button>
              <Link
                href="/"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Back to studio
              </Link>
            </div>
          </div>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="QR code for public event link" className="h-36 w-36 rounded border" />
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Buy & Download</h2>
        <p className="mt-1 text-sm text-slate-600">Enter your email, then purchase a photo or the full bundle.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            placeholder="guest@example.com"
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => startCheckout("all")}
            disabled={isStartingCheckout || !event}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Buy All Photos {event ? `(${formatCurrencyFromCents(event.priceAll)})` : ""}
          </button>
          {purchaseInfo?.hasAllPhotos ? (
            <button
              type="button"
              onClick={handlePrepareDownloadAll}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Prepare All Downloads
            </button>
          ) : null}
        </div>
        {purchaseMessage ? <p className="mt-2 text-sm text-slate-700">{purchaseMessage}</p> : null}
        {bundleDownloads.length > 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">Bundle download links</p>
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              {bundleDownloads.map((file) => (
                <a
                  key={file.photoId}
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-blue-700 underline"
                >
                  Download photo {file.photoId}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Find Me</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload a clear selfie. We assume one primary face per event photo in this MVP.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setSelfieFile(event.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            disabled={isFinding || !selfieFile}
            onClick={handleFindMe}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isFinding ? "Searching..." : "Find Me"}
          </button>
        </div>
        {findMeMessage ? <p className="mt-2 text-sm text-slate-700">{findMeMessage}</p> : null}
      </section>

      {hasFindMeAttempt ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">My Photos</h2>
          {findMeMatches.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No matched photos yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {findMeMatches.map((item) => (
                <article
                  key={item.photo.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  {/* Signed object-storage URLs vary by domain/provider; use native img for MVP flexibility. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.photo.previewUrl} alt={item.photo.id} className="h-64 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <p className="text-xs font-medium text-slate-700">
                      Match confidence: {item.similarity.toFixed(1)}%
                    </p>
                    {canDownloadPhoto(item.photo.id) ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(item.photo.id)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        Download
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startCheckout("single", item.photo.id)}
                        disabled={isStartingCheckout}
                        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Buy This Photo {event ? `(${formatCurrencyFromCents(event.pricePhoto)})` : ""}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isLoading ? <p className="text-sm text-slate-600">Loading photos...</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {!isLoading && !errorMessage ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Event Gallery</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* Signed object-storage URLs vary by domain/provider; use native img for MVP flexibility. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={photo.id} className="h-64 w-full object-cover" />
                <div className="space-y-2 p-3">
                  <p className="text-xs text-slate-500">{new Date(photo.createdAt).toLocaleString()}</p>
                  {canDownloadPhoto(photo.id) ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(photo.id)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      Download
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startCheckout("single", photo.id)}
                      disabled={isStartingCheckout}
                      className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Buy This Photo {event ? `(${formatCurrencyFromCents(event.pricePhoto)})` : ""}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {photos.length === 0 ? (
              <p className="col-span-full rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No published photos yet.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {!isLoading && findMePhotoIds.size > 0 ? (
        <p className="text-xs text-slate-500">
          Find Me highlighted {findMePhotoIds.size} unique photo(s) in this event.
        </p>
      ) : null}
    </main>
  );
}

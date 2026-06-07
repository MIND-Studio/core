/**
 * Pod I/O for per-app feedback.
 *
 * Storage model: a single **app-owned inbox container** with a public-append
 * ACL. Every submission is POSTed as its own resource into that container
 * (the classic Solid append-only inbox / LDN pattern), so:
 *   • anyone can submit — even logged-out / pod-less users (append needs no
 *     read, and the public ACL grants append to everyone);
 *   • the developer reads **one** place (Read on the container) rather than
 *     crawling every user's pod;
 *   • submitters can't enumerate or read each other's feedback (append-only).
 *
 * Identity is optional: when a session exists the submitter's WebID is attached
 * as `foaf:maker` for attribution; otherwise the record is anonymous.
 */
import {
  buildThing,
  createAcl,
  createAclFromFallbackAcl,
  createContainerAt,
  createSolidDataset,
  createThing,
  getContainedResourceUrlAll,
  getDatetime,
  getResourceAcl,
  getSolidDataset,
  getSolidDatasetWithAcl,
  getSourceUrl,
  getStringNoLocale,
  getThingAll,
  getUrl,
  getUrlAll,
  hasAccessibleAcl,
  hasFallbackAcl,
  hasResourceAcl,
  saveAclFor,
  saveSolidDatasetAt,
  saveSolidDatasetInContainer,
  setAgentDefaultAccess,
  setAgentResourceAccess,
  setPublicDefaultAccess,
  setPublicResourceAccess,
  setStringNoLocale,
  setThing,
  type SolidDataset,
  type ThingPersisted,
} from "@inrupt/solid-client";
import type { PodFetch } from "../apps/pod-client";
import {
  DCT_CREATED,
  FOAF_MAKER,
  KIND_CHOICES,
  MIND_APP_KEY,
  MIND_APP_VERSION,
  MIND_CLIENT_ERRORS,
  MIND_COMMENT,
  MIND_FEEDBACK,
  MIND_KIND,
  MIND_ROUTE,
  FEEDBACK_STATUSES,
  MIND_SCREENSHOT,
  MIND_SENTIMENT,
  MIND_STATUS,
  MIND_TARGET,
  MIND_USER_AGENT,
  MIND_VIEWPORT,
  MIND_VOICE_NOTE,
  RDF_TYPE,
  SENTIMENTS,
  type FeedbackDraft,
  type FeedbackEntry,
  type FeedbackKind,
  type FeedbackStatus,
  type Sentiment,
  type TargetInfo,
} from "./vocab";

/** Normalise an inbox URL to a container (single trailing slash). */
export function feedbackInboxUrl(inbox: string): string {
  return inbox.replace(/\/?$/, "/");
}

/**
 * Provision the app's feedback inbox so submissions can actually land. This is
 * the **owner-only setup step** the public-append model needs: until it runs,
 * the inbox container 404s and nobody — owner or visitor — can send feedback.
 *
 * It (1) creates the container if missing and (2) writes its **append-only**
 * ACL, which needs precise WAC control `universalAccess` can't express:
 *   • **accessTo** (the container itself): public = `Append` → anyone, even
 *     logged-out, can POST a submission; the owner gets full control.
 *   • **default** (inherited by every submitted record): owner-only → so
 *     submitters can't read or enumerate each other's feedback. Public gets
 *     nothing here, which is exactly the privacy guarantee in the module docs.
 *
 * Idempotent and safe to call on every owner visit. Pass the owner's
 * authenticated `podFetch` and their WebID.
 */
export async function ensureFeedbackInbox(
  inbox: string,
  podFetch: PodFetch,
  ownerWebId: string,
): Promise<void> {
  if (!podFetch) {
    throw new Error("ensureFeedbackInbox requires an authenticated fetch");
  }
  const container = feedbackInboxUrl(inbox);
  const fetchOpt = { fetch: podFetch };

  // 1. Create the container if it doesn't exist yet (the first-run case).
  const probe = await podFetch(container, { method: "HEAD" });
  if (probe.status === 404) {
    await createContainerAt(container, fetchOpt);
  } else if (!probe.ok && probe.status !== 401 && probe.status !== 403) {
    throw new Error(`feedback inbox probe failed: ${probe.status}`);
  }

  // 2. Write the append-only ACL.
  const withAcl = await getSolidDatasetWithAcl(container, fetchOpt);
  if (!hasAccessibleAcl(withAcl)) {
    throw new Error(
      "feedback inbox has no accessible ACL — cannot set append-only access",
    );
  }
  let acl = hasResourceAcl(withAcl)
    ? getResourceAcl(withAcl)
    : hasFallbackAcl(withAcl)
      ? createAclFromFallbackAcl(withAcl)
      : createAcl(withAcl);

  // Owner: full control of the container and everything it will contain.
  const owner = { read: true, append: true, write: true, control: true };
  acl = setAgentResourceAccess(acl, ownerWebId, owner);
  acl = setAgentDefaultAccess(acl, ownerWebId, owner);
  // Everyone else: append to the container (submit), nothing on the records.
  acl = setPublicResourceAccess(acl, {
    read: false,
    append: true,
    write: false,
    control: false,
  });
  acl = setPublicDefaultAccess(acl, {
    read: false,
    append: false,
    write: false,
    control: false,
  });

  await saveAclFor(withAcl, acl, fetchOpt);
}

/**
 * Upload a binary attachment (screenshot, voice note, …) into the inbox
 * container and return its URL, to be stamped on a feedback record. Works for
 * anonymous and pod-less submitters: the public-append ACL grants POST, and the
 * file inherits the container's default ACL so only the owner can read it back
 * — exactly the inbox model the rest of the feedback flow uses. Omit `podFetch`
 * to upload anonymously. `fallbackType` is used when the blob has no `type`.
 */
export async function uploadAttachment(
  inbox: string,
  blob: Blob,
  podFetch?: PodFetch,
  fallbackType = "application/octet-stream",
): Promise<string> {
  const container = feedbackInboxUrl(inbox);
  const doFetch = podFetch ?? globalThis.fetch;
  const res = await doFetch(container, {
    method: "POST",
    headers: { "content-type": blob.type || fallbackType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`attachment upload failed: ${res.status} ${res.statusText}`);
  }
  // CSS returns 201 with a (possibly relative) Location for the created file.
  const loc = res.headers.get("location") ?? res.url;
  return new URL(loc, container).href;
}

/** Upload a screenshot PNG; returns its URL for `mind:screenshot`. */
export function uploadScreenshot(
  inbox: string,
  blob: Blob,
  podFetch?: PodFetch,
): Promise<string> {
  return uploadAttachment(inbox, blob, podFetch, "image/png");
}

/** Upload a recorded voice note; returns its URL for `mind:voiceNote`. */
export function uploadVoiceNote(
  inbox: string,
  blob: Blob,
  podFetch?: PodFetch,
): Promise<string> {
  return uploadAttachment(inbox, blob, podFetch, "audio/webm");
}

/**
 * Submit one feedback record by POSTing a fresh resource into the app inbox.
 * Returns the URL of the created resource. Pass `podFetch` for an authenticated
 * session; omit it to submit anonymously against a public-append inbox.
 */
export async function submitFeedback(
  inbox: string,
  appKey: string,
  draft: FeedbackDraft,
  podFetch?: PodFetch,
): Promise<string> {
  const container = feedbackInboxUrl(inbox);
  const now = new Date();
  const id = `fb-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let thing = buildThing(createThing({ name: id }))
    .addUrl(RDF_TYPE, MIND_FEEDBACK)
    .addStringNoLocale(MIND_SENTIMENT, draft.sentiment)
    .addStringNoLocale(MIND_KIND, draft.kind ?? "other")
    .addStringNoLocale(MIND_APP_KEY, appKey)
    .addStringNoLocale(MIND_COMMENT, draft.comment ?? "")
    .addStringNoLocale(MIND_ROUTE, draft.route ?? "")
    .addStringNoLocale(MIND_APP_VERSION, draft.appVersion ?? "")
    .addStringNoLocale(MIND_VIEWPORT, draft.viewport ?? "")
    .addStringNoLocale(MIND_USER_AGENT, draft.userAgent ?? "")
    .addStringNoLocale(MIND_CLIENT_ERRORS, draft.clientErrors ?? "")
    .addDatetime(DCT_CREATED, now);
  if (draft.webId) thing = thing.addUrl(FOAF_MAKER, draft.webId);
  if (draft.screenshot) thing = thing.addUrl(MIND_SCREENSHOT, draft.screenshot);
  if (draft.voiceNote) thing = thing.addUrl(MIND_VOICE_NOTE, draft.voiceNote);
  if (draft.target) {
    thing = thing.addStringNoLocale(MIND_TARGET, JSON.stringify(draft.target));
  }

  const ds = setThing(createSolidDataset(), thing.build());
  const saved = await saveSolidDatasetInContainer(container, ds, {
    slugSuggestion: id,
    ...(podFetch ? { fetch: podFetch } : {}),
  });
  return getSourceUrl(saved) ?? container;
}

/**
 * Set the triage `status` on an existing feedback record. This is an
 * **owner-only** write-back: it edits the record's own resource (the inbox is
 * public-append for *submitters*, but the owner has full control of their
 * inbox). Pass the record's resource URL (`FeedbackEntry.url`) and an
 * authenticated `podFetch`. The pod stays the only store.
 */
export async function setFeedbackStatus(
  resourceUrl: string,
  status: FeedbackStatus,
  podFetch: PodFetch,
): Promise<void> {
  if (!podFetch) {
    throw new Error("setFeedbackStatus requires an authenticated fetch");
  }
  const fetchOpt = { fetch: podFetch };
  const ds = await getSolidDataset(resourceUrl, fetchOpt);
  const target = getThingAll(ds).find((t) =>
    getUrlAll(t, RDF_TYPE).includes(MIND_FEEDBACK),
  );
  if (!target) throw new Error(`no feedback record at ${resourceUrl}`);
  const updated = setStringNoLocale(target, MIND_STATUS, status);
  await saveSolidDatasetAt(resourceUrl, setThing(ds, updated), fetchOpt);
}

function toEntry(t: ThingPersisted): FeedbackEntry {
  const raw = getStringNoLocale(t, MIND_SENTIMENT) ?? "meh";
  const sentiment = (SENTIMENTS as readonly string[]).includes(raw)
    ? (raw as Sentiment)
    : "meh";
  const rawKind = getStringNoLocale(t, MIND_KIND) ?? "other";
  const kind = (KIND_CHOICES as readonly string[]).includes(rawKind)
    ? (rawKind as FeedbackKind)
    : "other";
  const rawStatus = getStringNoLocale(t, MIND_STATUS) ?? "new";
  const status = (FEEDBACK_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as FeedbackStatus)
    : "new";
  const created = getDatetime(t, DCT_CREATED);
  let target: TargetInfo | null = null;
  const rawTarget = getStringNoLocale(t, MIND_TARGET);
  if (rawTarget) {
    try {
      target = JSON.parse(rawTarget) as TargetInfo;
    } catch {
      target = null; // Malformed/legacy value — treat as no target.
    }
  }
  return {
    id: t.url.split("#")[1] ?? t.url,
    url: t.url.split("#")[0],
    sentiment,
    kind,
    status,
    comment: getStringNoLocale(t, MIND_COMMENT) ?? "",
    appKey: getStringNoLocale(t, MIND_APP_KEY) ?? "",
    route: getStringNoLocale(t, MIND_ROUTE) ?? "",
    appVersion: getStringNoLocale(t, MIND_APP_VERSION) ?? "",
    viewport: getStringNoLocale(t, MIND_VIEWPORT) ?? "",
    userAgent: getStringNoLocale(t, MIND_USER_AGENT) ?? "",
    clientErrors: getStringNoLocale(t, MIND_CLIENT_ERRORS) ?? "",
    webId: getUrl(t, FOAF_MAKER),
    screenshot: getUrl(t, MIND_SCREENSHOT),
    voiceNote: getUrl(t, MIND_VOICE_NOTE),
    target,
    createdAt: created ? created.toISOString() : null,
  };
}

function entriesFromDataset(ds: SolidDataset): FeedbackEntry[] {
  return getThingAll(ds)
    .filter((t) => getUrlAll(t, RDF_TYPE).includes(MIND_FEEDBACK))
    .map(toEntry);
}

export type ReadFeedbackOpts = {
  /** Inclusive start date (UTC day). Defaults to no lower bound. */
  from?: Date;
  /** Inclusive end date (UTC day). Defaults to no upper bound. */
  to?: Date;
};

/**
 * Read all feedback in an app inbox, sorted oldest → newest. This is the agent
 * read path — needs Read on the container (the dev/owner), which submitters
 * don't have. A missing inbox yields `[]` rather than throwing. Optionally
 * filter to a UTC date range by `dct:created`.
 */
export async function readFeedback(
  inbox: string,
  podFetch?: PodFetch,
  opts: ReadFeedbackOpts = {},
): Promise<FeedbackEntry[]> {
  const container = feedbackInboxUrl(inbox);
  const fetchOpt = podFetch ? { fetch: podFetch } : undefined;

  let listing: Awaited<ReturnType<typeof getSolidDataset>>;
  try {
    listing = await getSolidDataset(container, fetchOpt);
  } catch {
    return [];
  }

  const out: FeedbackEntry[] = [];
  for (const url of getContainedResourceUrlAll(listing)) {
    if (url.endsWith("/")) continue; // skip sub-containers
    try {
      const ds = await getSolidDataset(url, fetchOpt);
      out.push(...entriesFromDataset(ds));
    } catch {
      // Unreadable/non-RDF child — skip.
    }
  }

  const lo = opts.from
    ? Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth(), opts.from.getUTCDate())
    : -Infinity;
  const hi = opts.to
    ? Date.UTC(opts.to.getUTCFullYear(), opts.to.getUTCMonth(), opts.to.getUTCDate(), 23, 59, 59, 999)
    : Infinity;

  return out
    .filter((e) => {
      if (!e.createdAt) return true;
      const t = Date.parse(e.createdAt);
      return Number.isNaN(t) || (t >= lo && t <= hi);
    })
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

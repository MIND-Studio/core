/**
 * Vocabulary + types for per-app user feedback.
 *
 * Feedback is stored pod-native as RDF/Turtle under each app's data zone
 * (`{pod}/apps/{appKey}/feedback/YYYY/MM/DD.ttl`), one Thing per submission.
 * It is "store only": apps write it, and a triage agent reads it on demand —
 * there is no auto-routing into the issues tracker (see feedback/README.md).
 *
 * We reuse standard `foaf:`/`dct:` predicates where they exist and mint the
 * rest under the same `mind:` namespace the app registry uses
 * (`core/src/apps/registry.ts`), so feedback stays portable and agent-readable.
 */

const MIND = "http://mind.example/voc#";
const FOAF = "http://xmlns.com/foaf/0.1/";
const DCT = "http://purl.org/dc/terms/";

export const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
export const MIND_FEEDBACK = `${MIND}Feedback`;
export const MIND_SENTIMENT = `${MIND}sentiment`;
export const MIND_KIND = `${MIND}kind`;
export const MIND_COMMENT = `${MIND}comment`;
export const MIND_APP_KEY = `${MIND}appKey`;
export const MIND_ROUTE = `${MIND}route`;
export const MIND_APP_VERSION = `${MIND}appVersion`;
export const MIND_VIEWPORT = `${MIND}viewport`;
export const MIND_USER_AGENT = `${MIND}userAgent`;
export const MIND_CLIENT_ERRORS = `${MIND}clientErrors`;
export const MIND_SCREENSHOT = `${MIND}screenshot`;
export const MIND_TARGET = `${MIND}target`;
export const MIND_VOICE_NOTE = `${MIND}voiceNote`;
export const MIND_STATUS = `${MIND}status`;
export const FOAF_MAKER = `${FOAF}maker`;
export const DCT_CREATED = `${DCT}created`;

/** One-tap sentiment scale, ordered worst → best. */
export type Sentiment = "bad" | "meh" | "good" | "love";

export const SENTIMENTS: readonly Sentiment[] = ["bad", "meh", "good", "love"];

/**
 * Optional triage category. Lets an agent route by intent without parsing free
 * text. Unset (`other`) is fine — the fast path never requires it.
 */
export type FeedbackKind = "bug" | "idea" | "praise" | "other";

/** Categories surfaced as one-tap chips in the widget (excludes `other`). */
export const KIND_CHOICES: readonly FeedbackKind[] = ["bug", "idea", "praise"];

/**
 * Triage state of a feedback record, set by the inbox **owner** (the only party
 * with write access) via `setFeedbackStatus`. A record with no `mind:status`
 * predicate — every submission, and all legacy records — reads back as `"new"`.
 */
export type FeedbackStatus = "new" | "in-progress" | "done" | "wontfix";

/** All triage states, in board-column order (left → right). */
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "in-progress",
  "done",
  "wontfix",
];

/** Viewport-relative bounding box of a targeted element, at capture time. */
export type TargetRect = { x: number; y: number; w: number; h: number };

/**
 * A specific UI element the submitter pointed at via the widget's pick mode.
 * Built by `describeElement` (see `element.ts`) — a rich, agent-readable
 * descriptor so triage knows exactly which element the feedback is about.
 *
 * Privacy: `text` is only ever populated for non-message UI (buttons, labels,
 * controls). Anything inside a chat message subtree has `text` omitted so
 * message bodies never enter a feedback record.
 */
export type TargetInfo = {
  /** Human/agent-readable name, e.g. "Send button" or "a chat message". */
  label: string;
  /** Robust CSS selector, `data-testid`-preferred. */
  selector: string;
  /** Lowercased tag name, e.g. "button". */
  tag: string;
  /** ARIA role, if the element exposes one. */
  role?: string;
  /** `data-testid`, if present. */
  testid?: string;
  /** `aria-label`, if present. */
  ariaLabel?: string;
  /** Short visible text — omitted for elements inside a chat message subtree. */
  text?: string;
  /** Bounding box in viewport coordinates when the element was picked. */
  rect: TargetRect;
};

/** What the widget collects and hands to `submitFeedback`. */
export type FeedbackDraft = {
  sentiment: Sentiment;
  /** Optional triage category. Defaults to `other` when omitted. */
  kind?: FeedbackKind;
  /** Optional free text. */
  comment?: string;
  /**
   * Recent client-side errors captured by the widget (one per line), attached
   * automatically so bug reports arrive with a stack-trace head start.
   */
  clientErrors?: string;
  /** Path/URL the user was on. Auto-filled by the widget if omitted. */
  route?: string;
  /** App build/version string, if the app provides one. */
  appVersion?: string;
  /** `WxH` viewport. Auto-filled by the widget if omitted. */
  viewport?: string;
  /** Browser user-agent. Auto-filled by the widget if omitted. */
  userAgent?: string;
  /** WebID of the submitter, only when a session exists. */
  webId?: string;
  /**
   * URL of a screenshot uploaded into the inbox (see `uploadScreenshot`). The
   * widget captures it client-side via the screen-capture API and uploads it
   * before submitting; optional.
   */
  screenshot?: string;
  /**
   * A specific UI element the submitter pointed at via pick mode. Stored as a
   * compact JSON string under `mind:target`; optional.
   */
  target?: TargetInfo;
  /**
   * URL of a voice note uploaded into the inbox (see `uploadVoiceNote`). The
   * widget records it client-side via `MediaRecorder` and uploads it before
   * submitting, exactly like the screenshot; optional.
   */
  voiceNote?: string;
};

/** A feedback record as read back from the pod. */
export type FeedbackEntry = {
  /** Fragment id (`fb-…`). */
  id: string;
  /**
   * The record's **resource** URL (no fragment). Needed to mutate the record
   * (`setFeedbackStatus`) and to key the per-record detail page.
   */
  url: string;
  sentiment: Sentiment;
  kind: FeedbackKind;
  /** Triage state — `"new"` for fresh and legacy records (no `mind:status`). */
  status: FeedbackStatus;
  comment: string;
  appKey: string;
  route: string;
  appVersion: string;
  viewport: string;
  userAgent: string;
  clientErrors: string;
  webId: string | null;
  screenshot: string | null;
  /** URL of an attached voice note, or null if the submission had none. */
  voiceNote: string | null;
  /** The pointed-at element, or null if the submission didn't target one. */
  target: TargetInfo | null;
  /** ISO timestamp from `dct:created`, or null if unparseable. */
  createdAt: string | null;
};

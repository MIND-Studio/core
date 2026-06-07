"use client";

/**
 * Drop-in per-app feedback affordance. Designed to be as effortless as
 * possible: the primary action is a single row of sentiment faces — tapping one
 * submits immediately with auto-captured context. A type chip, note, and recent
 * client errors are optional and never block that fast path.
 *
 * Two shapes via `variant`:
 *   • `inline` (default) — a compact header button; the panel drops as an
 *     anchored popover. Use this in an app's nav bar so feedback is reachable
 *     from everywhere.
 *   • `floating` — a fixed corner pill (the original standalone affordance).
 *
 * Storage-agnostic: pass `podRoot` + an authenticated `fetch` from `useShell()`
 * (in-process apps) or `useSession()` (standalone apps). Identity is optional —
 * a `webId` is attached as `foaf:maker` only when present.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Button, Textarea } from "@mind-studio/ui";
import { submitFeedback, uploadScreenshot, uploadVoiceNote } from "./store";
import { describeElement } from "./element";
import {
  KIND_CHOICES,
  SENTIMENTS,
  type FeedbackDraft,
  type FeedbackKind,
  type Sentiment,
  type TargetInfo,
} from "./vocab";
import type { PodFetch } from "../apps";

const FACE: Record<Sentiment, string> = {
  bad: "😞",
  meh: "😐",
  good: "🙂",
  love: "😍",
};

const LABEL: Record<Sentiment, string> = {
  bad: "Bad",
  meh: "Meh",
  good: "Good",
  love: "Love it",
};

const KIND_META: Record<
  Exclude<FeedbackKind, "other">,
  { icon: string; label: string }
> = {
  bug: { icon: "🐞", label: "Bug" },
  idea: { icon: "💡", label: "Idea" },
  praise: { icon: "🎉", label: "Praise" },
};

/**
 * Module-level ring buffer of recent client errors. Installed once per page so
 * any feedback submission can attach the last few errors — a big head start for
 * bug triage. Kept tiny and message-only (no PII beyond what the error throws).
 */
const ERROR_BUFFER: string[] = [];
let errorCaptureInstalled = false;

function installErrorCapture() {
  if (errorCaptureInstalled || typeof window === "undefined") return;
  errorCaptureInstalled = true;
  const push = (line: string) => {
    ERROR_BUFFER.push(line.slice(0, 500));
    if (ERROR_BUFFER.length > 10) ERROR_BUFFER.shift();
  };
  window.addEventListener("error", (e) => {
    push(`error: ${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}` : ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    push(`unhandledrejection: ${r instanceof Error ? r.message : String(r)}`);
  });
}

/** True when the browser can capture the screen at all. */
function canCaptureScreen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia
  );
}

/** True when the browser can record audio (mic) at all. */
function canRecordAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/**
 * Grab a single still frame from a display-capture stream as a PNG blob, via a
 * detached <video> + <canvas>. Dependency-free (no html-to-canvas lib, which
 * would choke on the design system's `oklch()` colors), and captures the real
 * rendered pixels. Downscales very large screens to keep the upload modest.
 */
async function grabFrame(stream: MediaStream): Promise<Blob> {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  // Wait one frame so videoWidth/Height are populated and a frame is painted.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const MAX_W = 1600;
  const scale = video.videoWidth > MAX_W ? MAX_W / video.videoWidth : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.pause();

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("could not encode screenshot"))),
      "image/png",
    ),
  );
}

/**
 * Full-viewport "inspect mode" overlay. While mounted it puts the page in a
 * crosshair cursor, highlights whatever element is under the pointer (with a
 * label chip), and resolves the user's click into a `TargetInfo` — or `null`
 * if they press Escape. Standard devtools-style picker:
 *   • a document-level capture-phase `mousemove` resolves `elementFromPoint`
 *     and draws a pointer-events-none highlight box, so the real page element
 *     (not the overlay) is always what's measured;
 *   • a capture-phase `click` is intercepted (`preventDefault`/`stopPropagation`)
 *     so picking the Send button doesn't actually send a message.
 * Elements belonging to the widget itself (tagged `data-mind-fb`) are ignored.
 */
function ElementPicker({ onPick }: { onPick: (t: TargetInfo | null) => void }) {
  const [hover, setHover] = useState<TargetInfo | null>(null);

  useEffect(() => {
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    function resolve(x: number, y: number): Element | null {
      const el = document.elementFromPoint(x, y);
      if (!el || el.closest("[data-mind-fb]")) return null;
      return el;
    }
    function onMove(e: MouseEvent) {
      const el = resolve(e.clientX, e.clientY);
      setHover(el ? describeElement(el) : null);
    }
    function onClick(e: MouseEvent) {
      const el = resolve(e.clientX, e.clientY);
      if (!el) return; // clicked our own chrome — let it through
      e.preventDefault();
      e.stopPropagation();
      onPick(describeElement(el));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onPick(null);
      }
    }
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onPick]);

  const box = hover?.rect;
  return createPortal(
    <div
      data-mind-fb
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      {/* Dim scrim so the picked element stands out. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.06)",
        }}
      />
      {box && (
        <>
          <div
            style={{
              position: "fixed",
              top: box.y,
              left: box.x,
              width: box.w,
              height: box.h,
              border: "2px solid var(--primary, #4f9bff)",
              background: "rgba(79,155,255,0.12)",
              borderRadius: "4px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.10)",
              transition: "all 0.04s linear",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: Math.max(2, box.y - 24),
              left: box.x,
              maxWidth: "60vw",
              padding: "2px 8px",
              fontSize: "0.6875rem",
              fontWeight: 600,
              lineHeight: 1.4,
              color: "#fff",
              background: "var(--primary, #4f9bff)",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            🎯 {hover?.label}
          </div>
        </>
      )}
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "0.4rem 0.85rem",
          fontSize: "0.75rem",
          color: "#fff",
          background: "rgba(0,0,0,0.78)",
          borderRadius: "999px",
        }}
      >
        Click an element to attach it · Esc to cancel
      </div>
    </div>,
    document.body,
  );
}

export type FeedbackWidgetProps = {
  /** App slug — stamped on each record as `mind:appKey`. */
  appKey: string;
  /**
   * The app's feedback inbox container (dev-owned, public-append). Every
   * submission is POSTed here as its own resource. Trailing slash optional.
   */
  inbox: string;
  /**
   * Authenticated fetch. Omit to submit anonymously — the inbox's public-append
   * ACL still accepts the write, just without a `foaf:maker`.
   */
  fetch?: PodFetch;
  /** Submitter WebID, when a session exists. Attached as `foaf:maker`. */
  webId?: string | null;
  /** Optional app build/version string, recorded with each submission. */
  appVersion?: string;
  /** Shape of the trigger. Default `inline` (a nav-bar button). */
  variant?: "inline" | "floating";
  /** Corner to anchor a `floating` pill. Ignored when `inline`. */
  position?: "bottom-right" | "bottom-left";
  /** Called after a successful write with the draft that was sent. */
  onSubmitted?: (draft: FeedbackDraft) => void;
};

type Phase = "closed" | "open" | "sending" | "done";

export function FeedbackWidget({
  appKey,
  inbox,
  fetch,
  webId,
  appVersion,
  variant = "inline",
  position = "bottom-right",
  onSubmitted,
}: FeedbackWidgetProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [picked, setPicked] = useState<Sentiment | null>(null);
  const [kind, setKind] = useState<FeedbackKind>("other");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optional screenshot: a captured PNG blob plus a local object-URL preview.
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Optional voice note: a recorded blob plus a local object-URL preview, and
  // whether we're currently recording.
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // Element targeting: the picked element, plus whether pick mode is active.
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [picking, setPicking] = useState(false);
  // Fixed coords for the inline popover, measured from the trigger. The panel
  // renders in a body portal so it escapes host stacking/`backdrop-filter`
  // contexts (a header with `backdrop-blur` would otherwise clip/cover it).
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // MediaRecorder + collected chunks live in refs (not state) so the recording
  // callbacks see current values without re-subscribing.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => installErrorCapture(), []);

  const open = phase !== "closed";

  // Position the inline popover under the trigger whenever it opens / resizes.
  useLayoutEffect(() => {
    if (!open || variant !== "inline") return;
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, variant]);

  // Dismiss on outside click / Escape while the panel is open. The panel lives
  // in a portal, so check it as well as the trigger root.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") reset();
    }
    function onClick(e: MouseEvent) {
      // Pick mode owns all page clicks; don't treat them as outside-dismiss.
      if (picking) return;
      const node = e.target as Node;
      if (rootRef.current?.contains(node)) return;
      if (panelRef.current?.contains(node)) return;
      reset();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, picking]);

  // Keyboard shortcuts while the panel is open (and not in pick mode). Skipped
  // whenever focus is in a text field so typing a note never triggers them:
  //   1–4  send a mood (worst → best), carrying the note + any attachments
  //   n    add / focus the note     s  screenshot
  //   e    point at an element      v  record / stop a voice note
  useEffect(() => {
    if (!open || picking || phase === "sending" || phase === "done") return;
    function isTyping(el: EventTarget | null): boolean {
      const n = el as HTMLElement | null;
      if (!n) return false;
      const tag = n.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || n.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        void send(SENTIMENTS[idx], note.trim() || undefined);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          setShowNote(true);
          requestAnimationFrame(() => noteRef.current?.focus());
          break;
        case "s":
          if (canCaptureScreen()) {
            e.preventDefault();
            void captureScreenshot();
          }
          break;
        case "e":
          e.preventDefault();
          startPicking();
          break;
        case "v":
          if (canRecordAudio()) {
            e.preventDefault();
            toggleRecording();
          }
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, picking, phase, note, recording]);

  function autoContext(): Partial<FeedbackDraft> {
    if (typeof window === "undefined") return {};
    const ctx: Partial<FeedbackDraft> = {
      route: window.location.pathname + window.location.search,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: window.navigator.userAgent,
    };
    if (ERROR_BUFFER.length) ctx.clientErrors = ERROR_BUFFER.slice(-5).join("\n");
    return ctx;
  }

  async function captureScreenshot() {
    if (!canCaptureScreen()) {
      setError("Screenshots aren't supported in this browser.");
      return;
    }
    setError(null);
    setCapturing(true);
    try {
      // `preferCurrentTab` (Chromium) skips the surface picker and grabs this
      // tab directly; other browsers just show their normal share prompt.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
      const blob = await grabFrame(stream);
      stream.getTracks().forEach((t) => t.stop());
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      setShot(blob);
      setShotUrl(URL.createObjectURL(blob));
    } catch {
      // User cancelled the picker or denied permission — leave things as-is.
    } finally {
      setCapturing(false);
    }
  }

  function clearShot() {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    setShot(null);
    setShotUrl(null);
  }

  async function startRecording() {
    if (!canRecordAudio()) {
      setError("Voice notes aren't supported in this browser.");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        if (voiceUrl) URL.revokeObjectURL(voiceUrl);
        setVoice(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Permission denied or no mic — leave things as-is.
      setError("Couldn't access the microphone.");
      setRecording(false);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  function clearVoice() {
    if (recording) stopRecording();
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoice(null);
    setVoiceUrl(null);
  }

  async function send(sentiment: Sentiment, comment?: string) {
    setError(null);
    setPicked(sentiment);
    setPhase("sending");
    const draft: FeedbackDraft = {
      sentiment,
      kind: kind === "other" ? undefined : kind,
      comment,
      appVersion,
      webId: webId ?? undefined,
      ...autoContext(),
    };
    if (target) draft.target = target;
    try {
      if (shot) {
        // Upload the PNG first, then reference it from the feedback record.
        draft.screenshot = await uploadScreenshot(inbox, shot, fetch);
      }
      if (voice) {
        draft.voiceNote = await uploadVoiceNote(inbox, voice, fetch);
      }
      await submitFeedback(inbox, appKey, draft, fetch);
      setPhase("done");
      onSubmitted?.(draft);
      window.setTimeout(() => reset(), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send feedback.");
      setPhase("open");
    }
  }

  function reset() {
    setPhase("closed");
    setPicked(null);
    setKind("other");
    setNote("");
    setShowNote(false);
    setError(null);
    setPicking(false);
    setTarget(null);
    clearShot();
    clearVoice();
  }

  // Enter pick mode: hide the panel so it doesn't obscure the page, but keep
  // the widget logically open so the popover reopens once a pick resolves.
  function startPicking() {
    setError(null);
    setPicking(true);
  }
  // Pick resolved (element) or cancelled (null) — either way leave pick mode.
  // On a successful pick, open the note and focus it so the user can type their
  // thought about that element straight away.
  const onPick = useCallback((t: TargetInfo | null) => {
    setPicking(false);
    if (t) {
      setTarget(t);
      setShowNote(true);
      // Focus after the panel re-renders (it was hidden during pick mode).
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }, []);

  const attachedErrors = ERROR_BUFFER.length;

  // Shared style for the attach toolbar buttons (Screenshot / Element / Voice).
  // `on` highlights a button whose attachment is present (or recording).
  const attachBtn = (on: boolean): CSSProperties => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.3rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    padding: "0.4rem 0.3rem",
    borderRadius: "999px",
    border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
    background: on ? "var(--accent)" : "transparent",
    color: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const panel = open ? (
    <div
      ref={panelRef}
      data-mind-fb
      role="dialog"
      aria-label="Send feedback"
      style={{
        width: "19rem",
        borderRadius: "var(--radius, 0.625rem)",
        border: "1px solid var(--border)",
        background: "var(--popover, var(--background))",
        color: "var(--popover-foreground, var(--foreground))",
        padding: "0.875rem",
        boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        animation: "mind-fb-in 0.12s ease-out",
      }}
    >
      {phase === "done" ? (
        <div style={{ textAlign: "center", padding: "0.75rem 0" }}>
          <div style={{ fontSize: "1.9rem", lineHeight: 1 }}>
            {picked ? FACE[picked] : "💛"}
          </div>
          <div style={{ marginTop: "0.5rem", fontWeight: 600 }}>Thanks!</div>
          <div style={{ fontSize: "0.8125rem", opacity: 0.7 }}>
            Your feedback was sent.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Send feedback</span>
            <button
              type="button"
              aria-label="Close"
              onClick={reset}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "1rem",
                opacity: 0.6,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Attach toolbar — the three rich options, made obvious. Each opens
              its flow; an attached item shows as a preview chip just below. */}
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <button
              type="button"
              title="Capture a screenshot of this tab (s)"
              onClick={() => void captureScreenshot()}
              disabled={!canCaptureScreen() || capturing}
              style={{
                ...attachBtn(!!shot),
                opacity: canCaptureScreen() ? 1 : 0.4,
                cursor: !canCaptureScreen()
                  ? "not-allowed"
                  : capturing
                    ? "wait"
                    : "pointer",
              }}
            >
              <span aria-hidden>📷</span>
              {capturing ? "…" : shot ? "Shot ✓" : "Screenshot"}
            </button>
            <button
              type="button"
              title="Point at an element on the page (e)"
              onClick={startPicking}
              style={attachBtn(!!target)}
            >
              <span aria-hidden>🎯</span>
              {target ? "Element ✓" : "Element"}
            </button>
            <button
              type="button"
              title="Record a voice note (v)"
              onClick={toggleRecording}
              disabled={!canRecordAudio()}
              style={{
                ...attachBtn(recording || !!voice),
                opacity: canRecordAudio() ? 1 : 0.4,
                cursor: canRecordAudio() ? "pointer" : "not-allowed",
                ...(recording
                  ? { borderColor: "var(--destructive, crimson)" }
                  : null),
              }}
            >
              <span aria-hidden>{recording ? "⏺" : voice ? "🎤" : "🎤"}</span>
              {recording ? "Stop" : voice ? "Voice ✓" : "Voice"}
            </button>
          </div>

          {/* Previews for whatever has been attached. */}
          {shotUrl && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shotUrl}
                alt="Screenshot preview"
                style={{
                  width: "3rem",
                  height: "2.25rem",
                  objectFit: "cover",
                  borderRadius: "calc(var(--radius, 0.625rem) - 4px)",
                  border: "1px solid var(--border)",
                }}
              />
              <span style={{ opacity: 0.7 }}>Screenshot attached</span>
              <button
                type="button"
                onClick={clearShot}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "transparent",
                  color: "var(--muted-foreground, currentColor)",
                  cursor: "pointer",
                  opacity: 0.7,
                  fontSize: "0.75rem",
                }}
              >
                ✕ remove
              </button>
            </div>
          )}

          {recording && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--destructive, crimson)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <span aria-hidden>⏺</span> Recording… tap Stop when done.
            </div>
          )}

          {voiceUrl && !recording && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <audio src={voiceUrl} controls style={{ height: "2rem", flex: 1 }} />
              <button
                type="button"
                onClick={clearVoice}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--muted-foreground, currentColor)",
                  cursor: "pointer",
                  opacity: 0.7,
                  fontSize: "0.75rem",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {target && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
                padding: "0.35rem 0.5rem",
                borderRadius: "calc(var(--radius, 0.625rem) - 4px)",
                border: "1px solid var(--primary)",
                background: "var(--accent)",
              }}
              title={target.selector}
            >
              <span aria-hidden>🎯</span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {target.label}
              </span>
              <button
                type="button"
                onClick={() => setTarget(null)}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "transparent",
                  color: "var(--muted-foreground, currentColor)",
                  cursor: "pointer",
                  opacity: 0.7,
                  fontSize: "0.75rem",
                }}
              >
                ✕ remove
              </button>
            </div>
          )}

          {/* Note — the body of the feedback. Auto-opened after picking an
              element so the user can type their thought immediately. */}
          {showNote ? (
            <Textarea
              ref={noteRef}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              placeholder={
                kind === "bug"
                  ? "What went wrong? Steps to reproduce help."
                  : "Anything to add? (optional)"
              }
              rows={3}
              style={{ resize: "none" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowNote(true);
                requestAnimationFrame(() => noteRef.current?.focus());
              }}
              style={{
                alignSelf: "flex-start",
                border: "none",
                background: "transparent",
                color: "var(--muted-foreground, currentColor)",
                fontSize: "0.8125rem",
                cursor: "pointer",
                opacity: 0.8,
                padding: 0,
              }}
            >
              + add a note <span style={{ opacity: 0.6 }}>(n)</span>
            </button>
          )}

          {/* Optional type — set before tapping a face to categorise. */}
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {KIND_CHOICES.map((k) => {
              const meta = KIND_META[k as Exclude<FeedbackKind, "other">];
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(active ? "other" : k)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    padding: "0.3rem 0",
                    borderRadius: "999px",
                    border: active
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: active ? "var(--accent)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span aria-hidden>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Mood faces ARE the send action — one tap submits, carrying the
              note + any attachments. Keys 1–4 do the same from the keyboard. */}
          <div
            style={{
              fontSize: "0.6875rem",
              opacity: 0.7,
              textAlign: "center",
              marginTop: "0.1rem",
            }}
          >
            {phase === "sending" ? "Sending…" : "Tap to send · or press 1–4"}
          </div>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {SENTIMENTS.map((s, i) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.15rem",
                }}
              >
                <button
                  type="button"
                  aria-label={`${LABEL[s]} — send (key ${i + 1})`}
                  title={`${LABEL[s]} (${i + 1})`}
                  disabled={phase === "sending"}
                  onClick={() => void send(s, note.trim() || undefined)}
                  style={{
                    width: "100%",
                    fontSize: "1.5rem",
                    padding: "0.5rem 0",
                    borderRadius: "calc(var(--radius, 0.625rem) - 2px)",
                    border:
                      picked === s
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                    background:
                      picked === s ? "var(--accent)" : "var(--background)",
                    cursor: phase === "sending" ? "wait" : "pointer",
                    transition: "transform 0.08s ease",
                  }}
                >
                  {FACE[s]}
                </button>
                <span
                  style={{
                    fontSize: "0.625rem",
                    opacity: 0.45,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>

          {attachedErrors > 0 && (
            <div
              style={{
                fontSize: "0.6875rem",
                opacity: 0.6,
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
              title="Recent client errors are attached automatically to help triage."
            >
              <span aria-hidden>🐞</span>
              {attachedErrors} recent error{attachedErrors > 1 ? "s" : ""} attached
            </div>
          )}

          {error && (
            <div
              style={{ fontSize: "0.75rem", color: "var(--destructive, crimson)" }}
            >
              {error}
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

  const keyframes = (
    <style>{`@keyframes mind-fb-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
  );

  // Inline: a header button with a popover portaled to <body> so it clears any
  // host stacking / backdrop-filter context.
  if (variant === "inline") {
    return (
      <div ref={rootRef} data-mind-fb style={{ display: "inline-flex" }}>
        {keyframes}
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Send feedback"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Send feedback"
          data-testid="feedback-trigger"
          className="text-base leading-none"
          onClick={() => setPhase(open ? "closed" : "open")}
        >
          <span aria-hidden>💬</span>
        </Button>
        {open &&
          !picking &&
          coords &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              data-mind-fb
              style={{
                position: "fixed",
                top: coords.top,
                right: coords.right,
                zIndex: 9999,
              }}
            >
              {panel}
            </div>,
            document.body,
          )}
        {picking && <ElementPicker onPick={onPick} />}
      </div>
    );
  }

  // Floating: fixed corner pill (original standalone affordance).
  const anchor: CSSProperties =
    position === "bottom-left"
      ? { left: "1rem", alignItems: "flex-start" }
      : { right: "1rem", alignItems: "flex-end" };

  return (
    <div
      ref={rootRef}
      data-mind-fb
      style={{
        position: "fixed",
        bottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        zIndex: 50,
        ...anchor,
      }}
    >
      {keyframes}
      {!picking && panel}
      {picking && <ElementPicker onPick={onPick} />}
      {phase === "closed" && (
        <Button
          type="button"
          size="sm"
          data-testid="feedback-trigger"
          onClick={() => setPhase("open")}
          style={{ borderRadius: "999px", boxShadow: "0 6px 18px rgba(0,0,0,0.15)" }}
        >
          💬 Feedback
        </Button>
      )}
    </div>
  );
}

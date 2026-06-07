/**
 * Framework-free element describer for the feedback widget's "point at an
 * element" pick mode. Turns a clicked DOM element into a rich, agent-readable
 * `TargetInfo`: an accessible label, a robust CSS selector, the ARIA role /
 * `data-testid` / tag, a short text snippet, and the viewport rect.
 *
 * Privacy: `text` is only captured for non-message UI. Anything inside a chat
 * message subtree (`[data-testid="message" | "message-body" | "message-list"]`)
 * has its text omitted and gets a structural label instead, so message bodies
 * never enter a feedback record (the standing no-message-logging constraint).
 *
 * No React, no DOM-mutating side effects — safe to import anywhere a DOM exists.
 */
import type { TargetInfo, TargetRect } from "./vocab";

/** Selector for any subtree whose text content must never be captured. */
const MESSAGE_SUBTREE =
  '[data-testid="message"], [data-testid="message-body"], [data-testid="message-list"]';

const MAX_TEXT = 80;

/** True for ids that look stable enough to use in a selector (not framework-generated). */
function isStableId(id: string): boolean {
  // Skip empty, very long, or obviously generated ids (React/Radix `:r0:`,
  // `radix-…`, uuid-ish, leading digit which isn't a valid bare CSS id).
  if (!id || id.length > 40) return false;
  if (/^[0-9]/.test(id)) return false;
  if (/^(:|radix-|headlessui-|react-)/i.test(id)) return false;
  if (/[a-f0-9]{8}-[a-f0-9]{4}/i.test(id)) return false;
  return /^[A-Za-z][\w-]*$/.test(id);
}

/** CSS.escape with a conservative fallback for older runtimes. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\\]]/g, "\\$&");
}

/** Index of `el` among same-tag siblings (1-based), for `:nth-of-type`. */
function nthOfType(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

/** One selector segment for a single element (no ancestors). */
function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute("data-testid");
  if (testid) return `${tag}[data-testid="${cssEscape(testid)}"]`;
  const id = el.getAttribute("id");
  if (id && isStableId(id)) return `${tag}#${cssEscape(id)}`;
  return `${tag}:nth-of-type(${nthOfType(el)})`;
}

/**
 * Build a short, reasonably robust CSS selector for `el`: walk up to ~4 levels,
 * stopping early at the first ancestor anchored by a `data-testid` or stable id
 * (or `<body>`). `data-testid`/id selectors are preferred at every level.
 */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.tagName !== "BODY" && node.tagName !== "HTML" && depth < 4) {
    const seg = segment(node);
    parts.unshift(seg);
    // A testid/id segment is anchor enough — no need to keep climbing.
    if (seg.includes("[data-testid=") || seg.includes("#")) break;
    node = node.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

/** "compose-send" → "Send", "members-mobile" → "Members mobile". */
export function humanizeTestid(id: string): string {
  const words = id
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(btn|el|wrap|wrapper|container)$/i.test(w));
  if (!words.length) return id;
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** ARIA role: explicit `role` attr, else a light implicit mapping for buttons. */
function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (tag === "input") {
    const t = (el.getAttribute("type") ?? "text").toLowerCase();
    if (t === "checkbox" || t === "radio" || t === "button" || t === "submit") {
      return t === "submit" ? "button" : t;
    }
    return "textbox";
  }
  if (tag === "textarea") return "textbox";
  return undefined;
}

/** Compact, collapsed-whitespace text snippet (≤ MAX_TEXT chars). */
function snippet(el: Element): string {
  const raw = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT - 1)}…` : raw;
}

/**
 * Describe a clicked element as a `TargetInfo`. Pure read of the DOM; never
 * mutates. Honors the message-subtree privacy gate for `text` and `label`.
 */
export function describeElement(el: Element): TargetInfo {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute("data-testid") ?? undefined;
  const ariaLabel = el.getAttribute("aria-label") ?? undefined;
  const role = roleOf(el);
  const rect = boundingRect(el);
  const inMessage = !!el.closest(MESSAGE_SUBTREE);

  const text = inMessage ? undefined : snippet(el) || undefined;

  // Label preference: aria-label → humanized testid → role/text → tag.
  let label: string;
  if (inMessage) {
    label = "a chat message";
  } else if (ariaLabel) {
    label = ariaLabel;
  } else if (testid) {
    label = humanizeTestid(testid);
    if (role && !label.toLowerCase().includes(role)) label = `${label} ${role}`;
  } else if (text) {
    label = role ? `${role}: “${text}”` : `“${text}”`;
  } else {
    label = role ?? tag;
  }

  const info: TargetInfo = { label, selector: selectorFor(el), tag, rect };
  if (role) info.role = role;
  if (testid) info.testid = testid;
  if (ariaLabel) info.ariaLabel = ariaLabel;
  if (text) info.text = text;
  return info;
}

/** Rounded viewport-relative bounding box. */
export function boundingRect(el: Element): TargetRect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

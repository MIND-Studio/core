# `@mind-studio/core/feedback`

A drop-in per-app feedback affordance + the pod store behind it. Feedback is
**store-only**: apps write it, and a triage agent reads it on demand. There is
no auto-routing into the issues tracker (that can be layered on later).

## In an app (capture)

The widget is storage-agnostic — give it a pod root + an authenticated `fetch`.
Identity is optional; pass `webId` when a session exists and it's recorded as
`foaf:maker`.

```tsx
import { FeedbackWidget } from "@mind-studio/core/feedback";
import { useSession } from "@/lib/solid/session"; // standalone app
// or: const { workspacePod, fetch, webId } = useShell();  // in-process app

export function AppChrome() {
  const { fetch, webId, podRoot } = useSession();
  return (
    <FeedbackWidget
      appKey="chat"
      podRoot={podRoot}
      fetch={fetch}
      webId={webId}
      appVersion={process.env.NEXT_PUBLIC_APP_VERSION}
    />
  );
}
```

Defaults to `variant="inline"` — a compact 💬 header button whose panel drops
as a body-portaled popover, so it sits in an app's nav bar and works from every
route. Pass `variant="floating"` for a fixed corner pill instead.

Tapping a sentiment face submits immediately (one tap = done). Optional, never
blocking the fast path: a **type chip** (🐞 bug / 💡 idea / 🎉 praise) for
triage, and a free-text note. The widget auto-captures `route`, `viewport`,
`userAgent`, and the last few **client-side JS errors** (handy on bug reports).

## Storage layout

```
{podRoot}apps/{appKey}/feedback/{YYYY}/{MM}/{DD}.ttl
```

Day-partitioned (UTC), one `mind:Feedback` Thing fragment (`#fb-…`) per
submission. See `vocab.ts` for the predicates.

## For a triage agent (read on demand)

`store.ts` has **no React/UI dependency**, so an agent can import the read path
in Node/`tsx` without pulling in the widget. Authenticate exactly like
`chat/scripts/chat-agent.ts` (`@inrupt/solid-client-authn-node` → DPoP fetch),
then:

```ts
import { readFeedback } from "@mind-studio/core/feedback";

const entries = await readFeedback(podRoot, "chat", session.fetch, {
  from: new Date("2026-06-01"),
  to: new Date(), // inclusive UTC range; missing day files are skipped
});

// entries: { id, sentiment, kind, comment, appKey, route, appVersion, viewport,
//            userAgent, clientErrors, webId, screenshot, createdAt }[]
//            (oldest → newest). `kind` is bug|idea|praise|other; `clientErrors`
//            holds recent JS errors auto-captured at submit time.
//
// Classify (sentiment/type/dedupe), then optionally hand actionable items to
// the `mind-create-issue` skill. Nothing here writes back — triage decides.
```

A thin `mind-feedback-review` skill wrapping this recipe (so it's invocable like
`mind-solve-next`) is a natural follow-up but intentionally not part of this slice.

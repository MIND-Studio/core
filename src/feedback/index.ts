export { FeedbackWidget, type FeedbackWidgetProps } from "./FeedbackWidget";
export {
  submitFeedback,
  readFeedback,
  setFeedbackStatus,
  ensureFeedbackInbox,
  uploadScreenshot,
  uploadVoiceNote,
  uploadAttachment,
  feedbackInboxUrl,
  type ReadFeedbackOpts,
} from "./store";
export {
  SENTIMENTS,
  KIND_CHOICES,
  FEEDBACK_STATUSES,
  type Sentiment,
  type FeedbackKind,
  type FeedbackStatus,
  type FeedbackDraft,
  type FeedbackEntry,
  type TargetInfo,
  type TargetRect,
} from "./vocab";
export { describeElement } from "./element";

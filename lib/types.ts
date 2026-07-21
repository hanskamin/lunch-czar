export type RunStatus =
  | "decree" // picking the restaurant
  | "summons" // restaurant chosen; needs group link + deadline
  | "announced" // posted to Slack; waiting for deadline
  | "last_call" // T-minus 5 minutes; last call posted
  | "tribute" // deadline passed; needs manual submit
  | "submitted" // order placed; waiting on delivery
  | "done" // feast proclaimed
  | "aborted";

export interface LogEntry {
  ts: string;
  kind: "info" | "slack" | "dd" | "error" | "crown";
  msg: string;
}

export interface Restaurant {
  storeId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  ratingDisplay?: string;
}

export interface AutoSubmit {
  armed: boolean;
  cartUuid?: string;
  tipCents: number;
  cardLabel?: string; // e.g. "Visa ···· 3626" — shown when arming
}

export interface LunchRun {
  id: string;
  createdAt: string;
  status: RunStatus;
  restaurant?: Restaurant;
  groupOrderUrl?: string;
  deadline?: string; // ISO timestamp of final order time
  announcedAt?: string;
  lastCallAt?: string;
  autoSubmit: AutoSubmit;
  /** Set the moment a submit is attempted, before the CLI call — the
   * double-charge guard across restarts. */
  submitAttemptedAt?: string;
  orderUuid?: string;
  submittedAt?: string;
  orderConfirmed?: boolean;
  lastStatusPollAt?: string;
  arrivedAt?: string;
  log: LogEntry[];
}

export interface AppState {
  activeRunId?: string;
  runs: LunchRun[];
}

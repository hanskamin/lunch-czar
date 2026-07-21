/**
 * In-process actions — the former Next.js API routes, called directly by the
 * TUI. Same guards, same log lines, same state shapes as the web version.
 */

import {
  checkoutUrl,
  defaultCardLabel,
  listCarts,
  loginCheck,
  previewOrder,
  searchRestaurants,
  submitOrder,
  type CartSummary,
  type SearchStore,
} from "./ddcli";
import { announceMessage, arrivedMessage, lastCallMessage, postToSlack, slackChannelLabel, slackConfigured } from "./slack";
import { activeRun, appendLog, loadState, newRun, updateRun } from "./store";
import type { LunchRun, Restaurant } from "./types";

export interface Fail {
  ok: false;
  error: string;
  needsLogin?: boolean;
  alreadyAttempted?: boolean;
}

export type Result<T> = ({ ok: true } & T) | Fail;

export interface HistoryEntry {
  name: string;
  storeId: string;
  date: string;
}

export interface StateSnapshot {
  run: LunchRun | null;
  history: HistoryEntry[];
  slack: { configured: boolean; channel: string };
}

export function getState(): StateSnapshot {
  const state = loadState();
  const run = activeRun(state);
  const history = state.runs
    .filter((r) => r.status === "done" && r.restaurant)
    .slice(-12)
    .reverse()
    .map((r) => ({ name: r.restaurant!.name, storeId: r.restaurant!.storeId, date: r.createdAt }));
  return {
    run: run ?? null,
    history,
    slack: { configured: slackConfigured(), channel: slackChannelLabel() },
  };
}

export async function getHealth(): Promise<{ dd: { signedIn: boolean; needsLogin: boolean } }> {
  const dd = await loginCheck();
  return { dd: { signedIn: dd.ok, needsLogin: dd.needsLogin } };
}

/* ── Stage I — search ─────────────────────────────────────────── */

export interface FoundStore extends Restaurant {
  etaDisplay?: string;
  deliveryFeeDisplay?: string;
}

const VISIBLE_SEARCH_RESULTS = 12;

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameMatchRank(query: string, store: SearchStore): number {
  const q = normalizedSearchText(query);
  if (!q) return 5;
  const queryWords = q.split(" ");
  const names = [store.name, store.store_name, store.verified_name]
    .filter((name): name is string => Boolean(name))
    .map(normalizedSearchText);

  if (names.some((name) => name === q)) return 0;
  if (names.some((name) => name.startsWith(`${q} `))) return 1;
  if (names.some((name) => name.includes(q))) return 2;
  if (names.some((name) => queryWords.every((word) => name.split(" ").includes(word)))) return 3;
  if (names.some((name) => queryWords.some((word) => name.split(" ").includes(word)))) return 4;
  return 5;
}

/** Put explicit restaurant-name matches ahead of DoorDash discovery results. */
export function rankSearchStores(query: string, stores: SearchStore[]): SearchStore[] {
  return stores
    .map((store, index) => ({ store, index, rank: nameMatchRank(query, store) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ store }) => store);
}

export async function search(query: string): Promise<Result<{ stores: FoundStore[] }>> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Missing query." };
  const res = await searchRestaurants(q);
  if (!res.ok) return { ok: false, error: res.error ?? "Search failed.", needsLogin: res.needsLogin };
  const raw: SearchStore[] = res.data?.stores ?? res.data?.results ?? [];
  const stores = rankSearchStores(q, raw)
    .slice(0, VISIBLE_SEARCH_RESULTS)
    .map((s) => ({
      storeId: String(s.store_id ?? s.id ?? ""),
      name: s.name ?? s.store_name ?? "Unknown",
      imageUrl: s.image_url,
      description: s.description,
      ratingDisplay:
        typeof s.rating === "number"
          ? s.rating.toFixed(1)
          : s.rating?.display_string ?? (s.rating?.average_rating ?? s.average_rating)?.toFixed?.(1),
      etaDisplay: s.eta_display ?? s.delivery_time,
      deliveryFeeDisplay: s.delivery_fee_display,
    }))
    .filter((s) => s.storeId);
  return { ok: true, stores };
}

/* ── Run lifecycle ────────────────────────────────────────────── */

export function startRun(): LunchRun {
  return newRun();
}

export function chooseRestaurant(restaurant: Restaurant): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (!restaurant.storeId || !restaurant.name) return { ok: false, error: "Missing restaurant." };
  const updated = updateRun(run.id, (r) => {
    r.restaurant = restaurant;
    r.status = "summons";
    appendLog(r, "crown", `The decree is issued: ${restaurant.name}.`);
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export function backToDecree(): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (run.status !== "summons") return { ok: false, error: "Not in the Summons stage." };
  const updated = updateRun(run.id, (r) => {
    r.status = "decree";
    appendLog(r, "info", "Back to choosing a restaurant.");
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export function savePlan(groupOrderUrl?: string, deadline?: string): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  const updated = updateRun(run.id, (r) => {
    if (groupOrderUrl !== undefined) r.groupOrderUrl = groupOrderUrl.trim();
    if (deadline !== undefined) r.deadline = deadline;
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export function armAutoSubmit(cartUuid: string, tipCents: number, cardLabel?: string): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (!cartUuid) return { ok: false, error: "Pick a cart first." };
  const updated = updateRun(run.id, (r) => {
    r.autoSubmit = { armed: true, cartUuid, tipCents, cardLabel };
    appendLog(
      r,
      "info",
      `Auto-submit armed: pay at the deadline${cardLabel ? ` on ${cardLabel}` : ""}, tip $${(tipCents / 100).toFixed(2)}.`,
    );
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export function disarmAutoSubmit(): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  const updated = updateRun(run.id, (r) => {
    r.autoSubmit.armed = false;
    appendLog(r, "info", "Auto-submit disarmed — you will submit manually.");
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export function abortRun(): Result<{ run: LunchRun }> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  const updated = updateRun(run.id, (r) => {
    r.status = "aborted";
    r.autoSubmit.armed = false;
    appendLog(r, "info", "Run cancelled.");
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

/* ── Slack posts ──────────────────────────────────────────────── */

export async function announce(): Promise<Result<{ run: LunchRun }>> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (!run.restaurant) return { ok: false, error: "Choose a restaurant first." };
  if (!run.groupOrderUrl) return { ok: false, error: "Paste the group order link first." };
  if (!run.deadline) return { ok: false, error: "Set the order deadline first." };
  const deadline = new Date(run.deadline);
  if (deadline.getTime() <= Date.now()) {
    return { ok: false, error: "The deadline is in the past — pick a later time." };
  }
  const res = await postToSlack(announceMessage(run.restaurant.name, deadline, run.groupOrderUrl));
  if (!res.ok) return { ok: false, error: res.error ?? "Announcement failed." };
  const updated = updateRun(run.id, (r) => {
    r.status = "announced";
    r.announcedAt = new Date().toISOString();
    appendLog(
      r,
      "slack",
      `The summons is posted — orders due by ${deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`,
    );
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export async function sendLastCall(): Promise<Result<{ run: LunchRun }>> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (run.status !== "announced" && run.status !== "last_call") {
    return { ok: false, error: "Announce the lunch first." };
  }
  const res = await postToSlack(lastCallMessage());
  if (!res.ok) return { ok: false, error: res.error ?? "Could not post last call." };
  const updated = updateRun(run.id, (r) => {
    r.status = "last_call";
    r.lastCallAt = new Date().toISOString();
    appendLog(r, "slack", "Last call posted.");
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

export async function proclaimArrival(): Promise<Result<{ run: LunchRun }>> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  const res = await postToSlack(arrivedMessage());
  if (!res.ok) return { ok: false, error: res.error ?? "Could not post." };
  const updated = updateRun(run.id, (r) => {
    r.status = "done";
    r.arrivedAt = new Date().toISOString();
    appendLog(r, "crown", "The feast is proclaimed. Long live the Czar.");
  });
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

/* ── Carts, preview, checkout ─────────────────────────────────── */

export async function findCarts(storeId?: string): Promise<Result<{ carts: CartSummary[] }>> {
  const res = await listCarts(storeId);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not list carts.", needsLogin: res.needsLogin };
  return { ok: true, carts: res.data?.carts ?? [] };
}

/* Shapes documented in `dd-cli order preview --help` */
interface PreviewQuote {
  store_order_cart?: {
    orders?: Array<{
      order_items?: Array<{
        item?: { name?: string };
        quantity?: number;
        unit_price_monetary_fields?: { display_string?: string };
      }>;
    }>;
  };
  line_items?: Array<{ label?: string; final_money?: { display_string?: string } }>;
  net_total_before_tip?: { display_string?: string };
  delivery_address?: { printable_address?: string };
  is_pre_tippable?: boolean;
  tips_suggestion_details?: Array<{
    default_index?: number;
    percentage_to_amount_monetary_values?: Array<{ unit_amount?: number }>;
    percentage_values?: number[];
  }>;
}

export interface BillPreview {
  items: Array<{ name: string; quantity: number; price?: string }>;
  breakdown: Array<{ label: string; amount: string }>;
  total: string | null;
  deliveryAddress: string | null;
  preTippable: boolean;
  tipSuggestion: { cents: number; percent?: number } | null;
  cardLabel: string | null;
}

export async function getPreview(cartUuid: string): Promise<Result<BillPreview>> {
  if (!cartUuid) return { ok: false, error: "Missing cartUuid." };
  const [res, cardLabel] = await Promise.all([previewOrder(cartUuid), defaultCardLabel()]);
  if (!res.ok) return { ok: false, error: res.error ?? "Preview failed.", needsLogin: res.needsLogin };

  const quote = (res.data as { quote?: PreviewQuote })?.quote ?? (res.data as PreviewQuote);
  const items =
    quote?.store_order_cart?.orders?.flatMap(
      (o) =>
        o.order_items?.map((it) => ({
          name: it.item?.name ?? "Item",
          quantity: it.quantity ?? 1,
          price: it.unit_price_monetary_fields?.display_string,
        })) ?? [],
    ) ?? [];
  const breakdown =
    quote?.line_items
      ?.filter((li) => li.label && li.final_money?.display_string)
      .map((li) => ({ label: li.label!, amount: li.final_money!.display_string! })) ?? [];

  let tipSuggestion: { cents: number; percent?: number } | null = null;
  const group = quote?.tips_suggestion_details?.[0];
  if (group && group.default_index != null) {
    const amt = group.percentage_to_amount_monetary_values?.[group.default_index]?.unit_amount;
    if (amt != null) {
      tipSuggestion = { cents: amt, percent: group.percentage_values?.[group.default_index] };
    }
  }

  return {
    ok: true,
    items,
    breakdown,
    total: quote?.net_total_before_tip?.display_string ?? null,
    deliveryAddress: quote?.delivery_address?.printable_address ?? null,
    preTippable: quote?.is_pre_tippable ?? true,
    tipSuggestion,
    cardLabel,
  };
}

export async function getCheckoutUrl(cartUuid: string): Promise<Result<{ url: string }>> {
  if (!cartUuid) return { ok: false, error: "Missing cartUuid." };
  const res = await checkoutUrl(cartUuid);
  if (!res.ok || !res.data?.checkout_url) {
    return { ok: false, error: res.error ?? "No checkout URL returned." };
  }
  return { ok: true, url: res.data.checkout_url };
}

/* ── Manual submit — used from the Tribute stage ──────────────── */

export async function submitNow(
  cartUuid: string,
  tipCents: number,
  force = false,
): Promise<Result<{ run: LunchRun }>> {
  const run = activeRun(loadState());
  if (!run) return { ok: false, error: "No active run." };
  if (!cartUuid) return { ok: false, error: "cartUuid is required." };

  if (run.submitAttemptedAt && !force) {
    return {
      ok: false,
      error:
        "A submit was already attempted for this run. Check DoorDash order history for a duplicate before forcing a retry.",
      alreadyAttempted: true,
    };
  }

  updateRun(run.id, (r) => {
    r.submitAttemptedAt = new Date().toISOString();
    appendLog(r, "dd", `Submitting the group order (tip $${(tipCents / 100).toFixed(2)}).`);
  });

  const res = await submitOrder(cartUuid, tipCents);
  const orderUuid = res.data?.order_uuid;
  const updated = updateRun(run.id, (r) => {
    if (res.ok && orderUuid) {
      r.status = "submitted";
      r.orderUuid = orderUuid;
      r.submittedAt = new Date().toISOString();
      appendLog(r, "dd", "Order accepted by DoorDash — confirming payment went through…");
    } else {
      appendLog(r, "error", `Submit failed: ${res.error ?? res.data?.error_reason ?? "unknown error"}.`);
    }
  });

  if (!res.ok || !orderUuid) {
    return {
      ok: false,
      error: res.error ?? res.data?.error_reason ?? "Submit failed.",
      needsLogin: res.needsLogin,
    };
  }
  return updated ? { ok: true, run: updated } : { ok: false, error: "Run vanished." };
}

/** Open a URL in the default browser (the TUI's stand-in for target="_blank"). */
export function openInBrowser(url: string): void {
  Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
}

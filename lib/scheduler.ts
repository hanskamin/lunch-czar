import { orderStatus, submitOrder } from "./ddcli";
import { lastCallMessage, postToSlack } from "./slack";
import { activeRun, appendLog, loadState, updateRun } from "./store";
import type { LunchRun } from "./types";

const TICK_MS = 15_000;
const LAST_CALL_LEAD_MS = 5 * 60 * 1000;
const STATUS_POLL_MS = 60_000;

let ticking = false;

/** Idempotent — safe to call more than once (dev HMR re-runs register()). */
export function startScheduler(): void {
  const g = globalThis as { __lunchCzarScheduler?: boolean };
  if (g.__lunchCzarScheduler) return;
  g.__lunchCzarScheduler = true;
  setInterval(() => void tick(), TICK_MS);
  console.log("[lunch-czar] scheduler armed — tick every 15s");
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const run = activeRun(loadState());
    if (!run) return;
    const now = Date.now();

    if (run.status === "announced" && run.deadline) {
      const deadline = Date.parse(run.deadline);
      if (now >= deadline) {
        // Slept through the last-call window (laptop lid, etc.) — go
        // straight to the deadline step.
        await handleDeadline(run);
      } else if (now >= deadline - LAST_CALL_LEAD_MS && !run.lastCallAt) {
        await postLastCall(run);
      }
    } else if (run.status === "last_call" && run.deadline) {
      if (now >= Date.parse(run.deadline)) await handleDeadline(run);
    } else if (run.status === "submitted") {
      await pollOrder(run);
    }
  } catch (e) {
    console.error("[lunch-czar] tick failed:", e);
  } finally {
    ticking = false;
  }
}

async function postLastCall(run: LunchRun): Promise<void> {
  const res = await postToSlack(lastCallMessage());
  updateRun(run.id, (r) => {
    if (res.ok) {
      r.status = "last_call";
      r.lastCallAt = new Date().toISOString();
      appendLog(r, "slack", "Last call posted — 5 minutes to the deadline.");
    } else {
      // Leave lastCallAt unset so the next tick retries, but log once a tick.
      appendLog(r, "error", `Last call failed to post: ${res.error}`);
    }
  });
}

async function handleDeadline(run: LunchRun): Promise<void> {
  const { armed, cartUuid, tipCents } = run.autoSubmit;
  if (!armed || !cartUuid) {
    updateRun(run.id, (r) => {
      r.status = "tribute";
      appendLog(r, "info", "Deadline reached. Waiting for you to review and submit.");
    });
    return;
  }
  if (run.submitAttemptedAt) {
    // A submit was already attempted (maybe the process died mid-call).
    // Never fire twice — order submit is not idempotent.
    updateRun(run.id, (r) => {
      r.status = "tribute";
      r.autoSubmit.armed = false;
      appendLog(
        r,
        "error",
        "A submit was already attempted. Check `dd-cli order history` before retrying — resubmitting can double-charge.",
      );
    });
    return;
  }

  updateRun(run.id, (r) => {
    r.submitAttemptedAt = new Date().toISOString();
    appendLog(r, "dd", `Deadline reached — submitting the group order (tip $${(tipCents / 100).toFixed(2)}).`);
  });

  const res = await submitOrder(cartUuid, tipCents);
  const orderUuid = res.data?.order_uuid;
  updateRun(run.id, (r) => {
    if (res.ok && orderUuid) {
      r.status = "submitted";
      r.orderUuid = orderUuid;
      r.submittedAt = new Date().toISOString();
      appendLog(r, "dd", "Order accepted by DoorDash — confirming payment went through…");
    } else {
      r.status = "tribute";
      r.autoSubmit.armed = false;
      appendLog(r, "error", `Auto-submit failed: ${res.error ?? res.data?.error_reason ?? "unknown error"}. Submit manually or finish in the browser.`);
    }
  });
}

async function pollOrder(run: LunchRun): Promise<void> {
  if (!run.orderUuid || run.orderConfirmed) return;
  const last = run.lastStatusPollAt ? Date.parse(run.lastStatusPollAt) : 0;
  if (Date.now() - last < STATUS_POLL_MS) return;

  updateRun(run.id, (r) => {
    r.lastStatusPollAt = new Date().toISOString();
  });
  const res = await orderStatus(run.orderUuid);
  const status = res.data?.status;
  if (!res.ok || !status || status === "pending") return;

  updateRun(run.id, (r) => {
    if (status === "successful") {
      r.orderConfirmed = true;
      appendLog(r, "dd", "Order confirmed and paid. Now we wait for the feast.");
    } else {
      appendLog(
        r,
        "error",
        `Order status: ${status}${res.data?.error_message ? ` — ${res.data.error_message}` : ""}. Check the DoorDash app.`,
      );
      r.orderConfirmed = true; // terminal state — stop polling
    }
  });
}

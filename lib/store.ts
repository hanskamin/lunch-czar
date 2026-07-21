import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AppState, LogEntry, LunchRun } from "./types";

const DATA_DIR = process.env.LUNCH_CZAR_DATA_DIR || join(process.cwd(), "data");
const STATE_PATH = join(DATA_DIR, "state.json");

function emptyState(): AppState {
  return { runs: [] };
}

export function loadState(): AppState {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as AppState;
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_PATH);
}

const DONE_LINGER_MS = 6 * 60 * 60 * 1000;

export function activeRun(state: AppState = loadState()): LunchRun | undefined {
  if (!state.activeRunId) return undefined;
  const run = state.runs.find((r) => r.id === state.activeRunId);
  if (!run || run.status === "aborted") return undefined;
  if (run.status === "done") {
    // Keep the celebration screen up for the afternoon, then retire the run.
    const arrived = run.arrivedAt ? Date.parse(run.arrivedAt) : 0;
    if (Date.now() - arrived > DONE_LINGER_MS) return undefined;
  }
  return run;
}

export function newRun(): LunchRun {
  const state = loadState();
  const existing = activeRun(state);
  if (existing && existing.status !== "done") {
    existing.status = "aborted";
    appendLog(existing, "info", "Run replaced by a new one.");
  }
  const run: LunchRun = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "decree",
    autoSubmit: { armed: false, tipCents: 0 },
    log: [],
  };
  appendLog(run, "crown", "A new lunch run begins.");
  state.runs.push(run);
  state.activeRunId = run.id;
  // Keep history bounded — one run a week for four years is plenty.
  if (state.runs.length > 200) state.runs = state.runs.slice(-200);
  saveState(state);
  return run;
}

/** Load, mutate, and persist a run in one step. Returns the fresh run. */
export function updateRun(id: string, mutate: (run: LunchRun) => void): LunchRun | undefined {
  const state = loadState();
  const run = state.runs.find((r) => r.id === id);
  if (!run) return undefined;
  mutate(run);
  saveState(state);
  return run;
}

export function appendLog(run: LunchRun, kind: LogEntry["kind"], msg: string): void {
  run.log.push({ ts: new Date().toISOString(), kind, msg });
  if (run.log.length > 300) run.log = run.log.slice(-300);
}

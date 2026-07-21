import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import {
  announce, backToDecree, chooseRestaurant, openInBrowser, savePlan, search as searchStores,
  sendLastCall, proclaimArrival, type FoundStore, type HistoryEntry,
} from "../../lib/actions";
import type { LunchRun, Restaurant } from "../../lib/types";
import {
  ASH, BANNER, CRIMSON, GOLD, PARCHMENT, PLUM_DEEP, TEAL_BRIGHT,
} from "../theme";
import { DRUMSTICK, EAGLE, QUEEN, Sprite } from "./pixels";
import { TributePanel } from "./TributePanel";
import { Wheel } from "./Wheel";
import {
  Button, ButtonRow, ErrorLine, FramedInput, Panel, StageTitle, fmtTime, useCountdown, useNow,
  useTyping, useTypingWhile,
} from "./ui";

/* ══ Title screen ═══════════════════════════════════════════════ */

export function TitleScreen({
  history,
  onStart,
}: {
  history: HistoryEntry[];
  onStart: () => void;
}) {
  const { width } = useTerminalDimensions();
  const [starting, setStarting] = useState(false);
  const start = () => {
    if (starting) return;
    setStarting(true);
    onStart();
  };
  useKeyboard((key) => {
    if (key.name === "return") start();
  });
  return (
    <box flexDirection="column" alignItems="center" paddingY={2}>
      <Sprite map={EAGLE} scale={2} />
      <box marginTop={1}>
        <ascii-font text="LUNCH CZAR" font={width >= 92 ? "block" : "tiny"} color={GOLD} />
      </box>
      <text fg={ASH} marginTop={1}>
        Queen of the Office · Lord of Your Lunch · Protector of The Ramp Card
      </text>
      <box marginTop={2}>
        <Button label="START FRIDAY RUN" hotkey="ENTER" disabled={starting} onPress={start} />
      </box>
      {history.length > 0 && (
        <box flexDirection="column" alignItems="center" marginTop={2}>
          <text fg={ASH}>
            <strong>FEASTS OF FRIDAYS PAST</strong>
          </text>
          {history.slice(0, 5).map((h, i) => (
            <text key={i} fg={ASH}>
              {new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
              {h.name}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}

/* ══ Stage I — The Decree ═══════════════════════════════════════ */

export function DecreeStage({
  history,
  onRun,
}: {
  history: HistoryEntry[];
  onRun: (r: LunchRun) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundStore[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchingFor, setSearchingFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [zone, setZone] = useState<"search" | "list">("search");
  const [cursor, setCursor] = useState(0);

  const pastPicks = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((h) => !seen.has(h.storeId) && seen.add(h.storeId)).slice(0, 6);
  }, [history]);

  const listItems: Restaurant[] = results ?? pastPicks.map((h) => ({ storeId: h.storeId, name: h.name }));
  const listKind = results ? "results" : "past";

  useTypingWhile(zone === "search" && !wheelOpen && !busy);

  async function runSearch(query: string) {
    if (busy) return;
    setSearchingFor(query);
    setBusy(true);
    setError(null);
    const res = await searchStores(query);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.needsLogin
          ? "DoorDash sign-in expired — run `dd-cli login` in a terminal, then search again."
          : res.error,
      );
      return;
    }
    setResults(res.stores);
    setCursor(0);
    if (res.stores.length > 0) setZone("list");
  }

  function choose(r: Restaurant) {
    const res = chooseRestaurant(r);
    if (res.ok) onRun(res.run);
    else setError(res.error);
  }

  useKeyboard((key) => {
    if (wheelOpen || busy) return;
    if (zone === "search") {
      if (key.name === "down" || key.name === "escape") setZone("list");
      return; // enter handled by the input's onSubmit
    }
    // list zone
    if (key.name === "up") {
      if (cursor === 0) setZone("search");
      else setCursor((c) => c - 1);
    } else if (key.name === "down") {
      setCursor((c) => Math.min(listItems.length - 1, c + 1));
    } else if (key.name === "return" && listItems[cursor]) {
      choose(listItems[cursor]);
    } else if (key.name === "w" && results && results.length >= 2) {
      setWheelOpen(true);
    } else if (key.name === "/") {
      setZone("search");
    }
  });

  return (
    <Panel>
      <StageTitle numeral="I" name="THE DECREE" sub="Where shall the realm eat today?" />
      <box flexDirection="row" gap={2} alignItems="center">
        <box flexGrow={1}>
          <FramedInput
            value={q}
            placeholder="tacos, thai, sandwiches…"
            focused={zone === "search" && !wheelOpen && !busy}
            onInput={setQ}
            onSubmit={(v) => {
              if (v.trim()) void runSearch(v.trim());
            }}
          />
        </box>
        <Button
          label={busy ? "SCOUTING…" : "SEARCH"}
          hotkey="ENTER"
          disabled={busy || !q.trim()}
          onPress={() => q.trim() && void runSearch(q.trim())}
        />
      </box>
      {busy ? (
        <SearchLoading query={searchingFor} />
      ) : zone === "search" ? (
        <text fg={ASH}>ENTER searches · ESC steps out of the search box</text>
      ) : null}

      {!busy && listKind === "past" && pastPicks.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          <text fg={ASH}>
            <strong>CROWN A PAST FAVORITE</strong> (↑↓ + ENTER)
          </text>
          {pastPicks.map((h, i) => {
            const hot = zone === "list" && i === cursor;
            return (
              <box
                key={h.storeId}
                backgroundColor={hot ? BANNER : undefined}
                paddingX={1}
                onMouseDown={() => choose({ storeId: h.storeId, name: h.name })}
              >
                <text fg={PARCHMENT} bg={hot ? BANNER : undefined}>
                  {hot ? "▶ " : "  "}
                  {h.name}
                </text>
              </box>
            );
          })}
        </box>
      )}

      {!busy && results && (
        <box flexDirection="column" marginTop={1}>
          {results.length === 0 ? (
            <text fg={ASH}>Nothing found — try another craving.</text>
          ) : (
            <>
              {results.map((r, i) => {
                const hot = zone === "list" && i === cursor;
                const meta = [r.ratingDisplay && `★ ${r.ratingDisplay}`, r.etaDisplay, r.description]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <box
                    key={r.storeId}
                    flexDirection="column"
                    backgroundColor={hot ? BANNER : undefined}
                    paddingX={1}
                    onMouseDown={() => choose(r)}
                  >
                    <text fg={hot ? GOLD : PARCHMENT} bg={hot ? BANNER : undefined}>
                      {hot ? "▶ " : "  "}
                      {r.name}
                    </text>
                    {meta ? (
                      <text fg={ASH} bg={hot ? BANNER : undefined}>
                        {"  "}
                        {meta.slice(0, 70)}
                      </text>
                    ) : null}
                  </box>
                );
              })}
              <ButtonRow>
                {results.length >= 2 && (
                  <Button
                    label="☸ CAN'T DECIDE? SPIN THE WHEEL"
                    hotkey="W"
                    tone="teal"
                    onPress={() => setWheelOpen(true)}
                  />
                )}
                <Button label="SEARCH AGAIN" hotkey="/" tone="ghost" onPress={() => setZone("search")} />
              </ButtonRow>
            </>
          )}
        </box>
      )}
      <ErrorLine msg={error} />

      {wheelOpen && results && (
        <Wheel
          options={results}
          onClose={() => setWheelOpen(false)}
          onPick={(i) => {
            setWheelOpen(false);
            choose(results[i]);
          }}
        />
      )}
    </Panel>
  );
}

const SEARCH_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function SearchLoading({ query }: { query: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <box
      border
      borderStyle="heavy"
      borderColor={GOLD}
      backgroundColor={PLUM_DEEP}
      title="SEARCH IN PROGRESS — PLEASE WAIT"
      titleColor={GOLD}
      flexDirection="column"
      paddingX={2}
      marginTop={1}
    >
      <text fg={TEAL_BRIGHT}>
        <strong>{SEARCH_SPINNER[tick % SEARCH_SPINNER.length]} RUMINATING</strong>
      </text>
      <text fg={PARCHMENT}>
        Royal scouts are finding “{query}” · DoorDash may take a moment ·{" "}
        <span fg={ASH}>{Math.floor(tick / 10)}s elapsed</span>
      </text>
    </box>
  );
}

/* ══ Stage II — The Summons ═════════════════════════════════════ */

export function SummonsStage({
  run,
  slackChannel,
  onRun,
}: {
  run: LunchRun;
  slackChannel: string;
  onRun: (r: LunchRun) => void;
}) {
  const [link, setLink] = useState(run.groupOrderUrl ?? "");
  const [time, setTime] = useState(() =>
    run.deadline ? new Date(run.deadline).toTimeString().slice(0, 5) : defaultDeadlineTime(),
  );
  const [zone, setZone] = useState<"link" | "time" | "actions">("link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(15_000);

  useTypingWhile(zone === "link" || zone === "time");

  const timeValid = /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
  const deadlineIso = useMemo(
    () => (timeValid ? timeToTodayIso(time.trim()) : null),
    [time, timeValid],
  );
  const deadlinePast = deadlineIso !== null && Date.parse(deadlineIso) <= now;
  const storeUrl = `https://www.doordash.com/store/${run.restaurant?.storeId}/`;
  const message = `@here today's lunch will be ${run.restaurant?.name}, please get in your order by ${deadlineIso ? fmtTime(deadlineIso) : "—"}`;
  const canPost = !busy && link.trim().length > 0 && timeValid && !deadlinePast;

  async function post() {
    if (!canPost || !deadlineIso) return;
    setBusy(true);
    setError(null);
    // Save the plan, then post.
    const saved = savePlan(link, deadlineIso);
    if (!saved.ok) {
      setBusy(false);
      setError(saved.error);
      return;
    }
    const res = await announce();
    setBusy(false);
    if (res.ok) onRun(res.run);
    else setError(res.error);
  }

  function back() {
    const res = backToDecree();
    if (res.ok) onRun(res.run);
  }

  useKeyboard((key) => {
    if (zone === "link") {
      if (key.name === "down" || key.name === "escape") setZone("time");
      return;
    }
    if (zone === "time") {
      if (key.name === "up") setZone("link");
      else if (key.name === "down" || key.name === "escape") setZone("actions");
      return;
    }
    // actions
    if (key.name === "up") setZone("time");
    else if (key.name === "p" || key.name === "return") void post();
    else if (key.name === "b") back();
    else if (key.name === "o") openInBrowser(storeUrl);
    else if (key.name === "/") setZone("link");
  });

  return (
    <Panel>
      <StageTitle numeral="II" name="THE SUMMONS" sub={`Rally the office to ${run.restaurant?.name}.`} />

      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text fg={GOLD}>
            <strong>1 · CREATE THE GROUP ORDER</strong>
          </text>
          <text fg={PARCHMENT}>
            Press <span fg={GOLD}>[O]</span> to open{" "}
            <span fg={TEAL_BRIGHT}>{run.restaurant?.name} on DoorDash ↗</span> and press{" "}
            <span fg={GOLD}>Group Order</span>, then copy the invite link. (DoorDash only mints
            these itself — the one manual step in the ritual. The DoorDash app on your phone works
            too: share the group order and paste the link here.)
          </text>
          <text fg={ASH}>{storeUrl}</text>
        </box>

        <box flexDirection="column">
          <text fg={GOLD}>
            <strong>2 · PASTE THE INVITE LINK</strong>
            {zone === "link" ? <span fg={ASH}> — paste, then ENTER</span> : null}
          </text>
          <FramedInput
            value={link}
            placeholder="https://doordash.com/group-order/…"
            focused={zone === "link"}
            onInput={setLink}
            onSubmit={() => setZone("time")}
          />
        </box>

        <box flexDirection="column">
          <text fg={GOLD}>
            <strong>3 · SET THE FINAL ORDER TIME</strong>
            <span fg={ASH}> — 24h HH:MM · last call goes out 5 minutes before, automatically</span>
          </text>
          <box flexDirection="row" alignItems="center" gap={2}>
            <FramedInput
              value={time}
              placeholder="12:30"
              focused={zone === "time"}
              width={11}
              maxLength={5}
              onInput={setTime}
              onSubmit={() => setZone("actions")}
            />
            {!timeValid && time.trim() ? <text fg={CRIMSON}>not a time — use HH:MM</text> : null}
          </box>
        </box>
      </box>

      <box
        border
        borderColor="#3a2751"
        backgroundColor="#1c1029"
        paddingX={1}
        flexDirection="column"
        marginTop={1}
      >
        <text fg={ASH}>
          <strong>WILL POST TO {slackChannel.toUpperCase()}</strong>
        </text>
        <text fg={PARCHMENT}>{message}</text>
        <text fg={TEAL_BRIGHT}>{link || "(group order link)"}</text>
      </box>

      <ButtonRow>
        <Button
          label={busy ? "POSTING…" : `POST TO ${slackChannel.toUpperCase()}`}
          hotkey="P"
          disabled={!canPost}
          onPress={() => void post()}
        />
        <Button label="OPEN RESTAURANT PAGE" hotkey="O" tone="ghost" onPress={() => openInBrowser(storeUrl)} />
        <Button label="← DIFFERENT RESTAURANT" hotkey="B" tone="ghost" onPress={back} />
      </ButtonRow>
      {deadlinePast && timeValid && (
        <text fg={ASH} marginTop={1}>
          That time has already passed today — pick a later one.
        </text>
      )}
      {zone !== "actions" && (
        <text fg={ASH} marginTop={1}>
          ENTER/↓ moves to the next field; buttons work once you leave the inputs.
        </text>
      )}
      <ErrorLine msg={error} />
    </Panel>
  );
}

function defaultDeadlineTime(): string {
  // Suggest the next round half-hour at least 35 minutes out.
  const d = new Date(Date.now() + 35 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d.toTimeString().slice(0, 5);
}

function timeToTodayIso(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

/* ══ Stage III — the watch (announced / last call) ══════════════ */

export function WatchStage({
  run,
  onRun,
}: {
  run: LunchRun;
  onRun: (r: LunchRun) => void;
}) {
  const countdown = useCountdown(run.deadline);
  const lastCall = run.status === "last_call";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { typing } = useTyping();

  const sendNow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await sendLastCall();
    setBusy(false);
    if (res.ok) onRun(res.run);
    else setError(res.error);
  }, [busy, onRun]);

  useKeyboard((key) => {
    if (typing) return;
    if (key.name === "l" && !lastCall) void sendNow();
  });

  const urgent = countdown && countdown.msLeft < 5 * 60 * 1000;

  return (
    <box flexDirection="column" gap={1}>
      <Panel tone={lastCall ? "crimson" : "gold"} alarm={lastCall}>
        <StageTitle
          numeral="III"
          name={lastCall ? "LAST CALL RINGS" : "THE WATCH"}
          sub={
            lastCall
              ? "The herald has spoken. The gates close soon."
              : "The summons is posted. The office assembles its orders."
          }
        />
        <box flexDirection="column" alignItems="center" paddingY={1}>
          <text fg={ASH}>ORDERS CLOSE IN</text>
          <ascii-font text={countdown?.label ?? "--:--"} font="block" color={urgent ? CRIMSON : GOLD} />
          <text fg={ASH}>deadline {fmtTime(run.deadline)}</text>
        </box>

        <box flexDirection="column" marginTop={1}>
          <text fg={TEAL_BRIGHT}>✓ announced at {fmtTime(run.announcedAt)}</text>
          <text fg={lastCall ? TEAL_BRIGHT : ASH}>
            {lastCall
              ? `✓ last call posted at ${fmtTime(run.lastCallAt)}`
              : "· last call posts automatically 5 minutes before the deadline"}
          </text>
          <text fg={ASH}>
            ·{" "}
            {run.autoSubmit.armed
              ? `at the deadline the order pays itself${run.autoSubmit.cardLabel ? ` on ${run.autoSubmit.cardLabel}` : ""}`
              : "at the deadline you review and submit (or arm auto-submit below)"}
          </text>
        </box>

        {!lastCall && (
          <ButtonRow>
            <Button label="SEND LAST CALL NOW" hotkey="L" tone="ghost" disabled={busy} onPress={() => void sendNow()} />
          </ButtonRow>
        )}
        <ErrorLine msg={error} />
      </Panel>

      <Panel tone="dim">
        <text fg={GOLD}>
          <strong>PREPARE THE TRIBUTE (STAGE IV)</strong>
        </text>
        <text fg={ASH} marginBottom={1}>
          Find the group cart and arm auto-submit now — then the deadline handles itself.
        </text>
        <TributePanel run={run} onRun={onRun} />
      </Panel>
    </box>
  );
}

/* ══ Stage IV — The Tribute (manual submit after deadline) ══════ */

export function TributeStage({ run, onRun }: { run: LunchRun; onRun: (r: LunchRun) => void }) {
  return (
    <Panel tone="crimson">
      <StageTitle
        numeral="IV"
        name="THE TRIBUTE"
        sub="The gates are closed. Review the bill and pay the tribute."
      />
      <TributePanel run={run} onRun={onRun} />
    </Panel>
  );
}

/* ══ Stage V — The Feast ════════════════════════════════════════ */

export function FeastStage({ run, onRun }: { run: LunchRun; onRun: (r: LunchRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bob, setBob] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBob((b) => !b), 450);
    return () => clearInterval(t);
  }, []);

  const proclaim = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await proclaimArrival();
    setBusy(false);
    if (res.ok) onRun(res.run);
    else setError(res.error);
  }, [busy, onRun]);

  useKeyboard((key) => {
    if (key.name === "return") void proclaim();
  });

  return (
    <Panel tone="teal">
      <StageTitle
        numeral="V"
        name="THE FEAST APPROACHES"
        sub={
          run.orderConfirmed
            ? "Order confirmed and paid. Watch the door for the Dasher."
            : "Order submitted — confirming payment with DoorDash…"
        }
      />
      <box flexDirection="row" gap={3} alignItems="center">
        <box marginTop={bob ? 1 : 0}>
          <Sprite map={QUEEN} />
        </box>
        <box flexDirection="column" flexGrow={1} flexShrink={1}>
          <text fg={PARCHMENT}>
            {run.restaurant?.name} · submitted {fmtTime(run.submittedAt)}
            {run.autoSubmit.armed ? " (auto)" : ""}
          </text>
          <text fg={ASH}>
            Track the courier in the DoorDash app. When the food is at the door, proclaim it:
          </text>
        </box>
      </box>
      <ButtonRow>
        <Button
          label="🔔 LUNCH HAS ARRIVED — TELL THE OFFICE"
          hotkey="ENTER"
          tone="crimson"
          disabled={busy}
          onPress={() => void proclaim()}
        />
      </ButtonRow>
      <ErrorLine msg={error} />
    </Panel>
  );
}

/* ══ Done — celebration ═════════════════════════════════════════ */

export function DoneScreen({ run, onNewRun }: { run: LunchRun; onNewRun: () => void }) {
  const [bob, setBob] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBob((b) => !b), 450);
    return () => clearInterval(t);
  }, []);
  useKeyboard((key) => {
    if (key.name === "return") onNewRun();
  });
  return (
    <box flexDirection="column" alignItems="center" paddingY={2}>
      <Confetti />
      <box flexDirection="row" gap={2} alignItems="center">
        <Sprite map={DRUMSTICK} />
        <box marginTop={bob ? 1 : 0}>
          <Sprite map={QUEEN} />
        </box>
        <Sprite map={DRUMSTICK} flip />
      </box>
      <box marginTop={1}>
        <ascii-font text="THE REALM IS FED" font="tiny" color={GOLD} />
      </box>
      <text fg={ASH} marginTop={1}>
        {run.restaurant?.name} · arrived {fmtTime(run.arrivedAt)} · the office rejoices
      </text>
      <box marginTop={2}>
        <Button label="PLAN NEXT FRIDAY" hotkey="ENTER" onPress={onNewRun} />
      </box>
    </box>
  );
}

const CONFETTI_COLORS = ["#f2b738", "#c22b2b", "#2e9e8f", "#f3e4c3"];

interface Flake {
  x: number;
  y: number;
  speed: number;
  color: string;
}

function Confetti() {
  const { width, height } = useTerminalDimensions();
  const [flakes, setFlakes] = useState<Flake[] | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const initial = Array.from({ length: 50 }, (_, i) => ({
      x: (i * 61) % Math.max(1, width - 1),
      y: -((i % 12) * 2) - 1,
      speed: 1 + (i % 3) * 0.5,
      color: CONFETTI_COLORS[i % 4],
    }));
    setFlakes(initial);
    const fall = setInterval(() => {
      setFlakes((fs) =>
        fs
          ? fs.map((f) => ({ ...f, y: f.y + f.speed }))
          : fs,
      );
    }, 120);
    const stop = setTimeout(() => {
      setGone(true);
      clearInterval(fall);
    }, 9000);
    return () => {
      clearInterval(fall);
      clearTimeout(stop);
    };
  }, [width]);

  if (gone || !flakes) return null;
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" zIndex={90}>
      {flakes
        .filter((f) => f.y >= 0 && f.y < height)
        .map((f, i) => (
          <box
            key={i}
            position="absolute"
            left={f.x}
            top={Math.floor(f.y)}
            width={1}
            height={1}
            backgroundColor={f.color}
          />
        ))}
    </box>
  );
}

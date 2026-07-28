import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { abortRun, getHealth, getState, startRun, type StateSnapshot } from "../lib/actions";
import type { LogEntry, LunchRun } from "../lib/types";
import {
  ASH, CRIMSON, GOLD, GOLD_DIM, KREMLIN, PARCHMENT, PLUM_DEEP, PLUM_LIGHT, TEAL_BRIGHT,
} from "./theme";
import { Skyline } from "./components/Skyline";
import {
  DecreeStage, DoneScreen, FeastStage, SummonsStage, TitleScreen, TributeStage, WatchStage,
} from "./components/stages";
import { TypingProvider, fmtTime, useCountdown, useTyping } from "./components/ui";

export function App() {
  return (
    <TypingProvider>
      <Root />
    </TypingProvider>
  );
}

function Root() {
  const [snap, setSnap] = useState<StateSnapshot | null>(null);
  const [ddOk, setDdOk] = useState<boolean | undefined>(undefined);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const refresh = useCallback(() => {
    setSnap(getState());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    void getHealth().then((h) => setDdOk(h.dd.signedIn));
    return () => clearInterval(t);
  }, [refresh]);

  const onRun = useCallback((run: LunchRun) => {
    setSnap((s) => (s ? { ...s, run } : s));
  }, []);

  const newRun = useCallback(() => {
    startRun();
    refresh();
  }, [refresh]);

  // PgUp/PgDn scroll the console when a tall stage overflows the terminal.
  useKeyboard((key) => {
    const sb = scrollRef.current;
    if (!sb) return;
    if (key.name === "pageup") sb.scrollTop = Math.max(0, sb.scrollTop - 10);
    else if (key.name === "pagedown") sb.scrollTop = sb.scrollTop + 10;
  });

  const run = snap?.run ?? null;

  return (
    <box width="100%" height="100%" backgroundColor={KREMLIN} flexDirection="column">
      <Header
        slackOk={snap?.slack.configured ?? false}
        slackChannel={snap?.slack.channel ?? "#atx-lunch"}
        ddOk={ddOk}
        run={run}
      />

      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        style={{
          rootOptions: { backgroundColor: KREMLIN },
          wrapperOptions: { backgroundColor: KREMLIN },
          viewportOptions: { backgroundColor: KREMLIN },
          contentOptions: { backgroundColor: KREMLIN, flexDirection: "column", paddingX: 2, paddingY: 1 },
          scrollbarOptions: {
            trackOptions: { foregroundColor: GOLD_DIM, backgroundColor: PLUM_DEEP },
          },
        }}
      >
        {!snap ? (
          <text fg={ASH}>LOADING…</text>
        ) : !run ? (
          <TitleScreen history={snap.history} onStart={newRun} />
        ) : (
          <>
            <Skyline status={run.status} />

            {run.status === "decree" && <DecreeStage history={snap.history} onRun={onRun} />}
            {run.status === "summons" && (
              <SummonsStage run={run} slackChannel={snap.slack.channel} onRun={onRun} />
            )}
            {(run.status === "announced" || run.status === "last_call") && (
              <WatchStage run={run} onRun={onRun} />
            )}
            {run.status === "tribute" && <TributeStage run={run} onRun={onRun} />}
            {run.status === "submitted" && <FeastStage run={run} onRun={onRun} />}
            {run.status === "done" && <DoneScreen run={run} onNewRun={newRun} />}

            {run.status !== "done" && <Chronicle log={run.log} onAbort={refresh} />}
          </>
        )}
      </scrollbox>

      {run && run.status !== "done" && <Hud run={run} />}
    </box>
  );
}

function Header({
  slackOk,
  slackChannel,
  ddOk,
  run,
}: {
  slackOk: boolean;
  slackChannel: string;
  ddOk?: boolean;
  run: LunchRun | null;
}) {
  return (
    <box
      border={["bottom"]}
      borderColor={PLUM_LIGHT}
      backgroundColor={KREMLIN}
      flexShrink={0}
      paddingX={2}
      flexDirection="row"
      justifyContent="space-between"
      gap={2}
    >
      <text fg={GOLD}>
        <strong>♔ LUNCH CZAR</strong>
      </text>
      <text>
        <StatusLight
          ok={ddOk}
          label={process.env.LUNCH_CZAR_FAKE === "1" ? "DOORDASH FAKE" : "DOORDASH"}
          hint={ddOk === false ? "run `dd-cli login`" : undefined}
        />
        <span>  </span>
        <StatusLight
          ok={slackOk}
          label={slackChannel.replace("#", "").toUpperCase()}
          hint={!slackOk ? "set Slack vars in .env.local" : undefined}
        />
        {run && run.status !== "done" ? <span fg={ASH}>  {stageLabel(run)}</span> : null}
      </text>
    </box>
  );
}

function StatusLight({ ok, label, hint }: { ok?: boolean; label: string; hint?: string }) {
  const color = ok === false ? CRIMSON : ok ? TEAL_BRIGHT : ASH;
  return (
    <span fg={color}>
      {ok === false ? "○" : ok ? "●" : "◌"} {label}
      {hint ? <span fg={ASH}> ({hint})</span> : null}
    </span>
  );
}

function stageLabel(run: LunchRun): string {
  switch (run.status) {
    case "decree":
      return "STAGE I";
    case "summons":
      return "STAGE II";
    case "announced":
    case "last_call":
      return "STAGE III";
    case "tribute":
      return "STAGE IV";
    case "submitted":
      return "STAGE V";
    default:
      return "";
  }
}

const LOG_ICON: Record<LogEntry["kind"], string> = {
  crown: "♔",
  slack: "✉",
  dd: "⚙",
  info: "·",
  error: "✖",
};

function Chronicle({ log, onAbort }: { log: LogEntry[]; onAbort: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { typing } = useTyping();

  useKeyboard((key) => {
    if (typing) return;
    if (key.name === "x") {
      if (confirming) {
        abortRun();
        setConfirming(false);
        onAbort();
      } else {
        setConfirming(true);
      }
    } else if (key.name === "escape" && confirming) {
      setConfirming(false);
    }
  });

  return (
    <box
      border
      borderColor={PLUM_LIGHT}
      backgroundColor={PLUM_DEEP}
      paddingX={1}
      flexDirection="column"
      marginTop={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={ASH}>
          <strong>THE CHRONICLE</strong>
        </text>
        {confirming ? (
          <text>
            <span fg={CRIMSON}>[X] CONFIRM CANCEL</span>
            <span fg={ASH}> · [ESC] KEEP GOING</span>
          </text>
        ) : (
          <text fg={ASH}>[X] CANCEL RUN</text>
        )}
      </box>
      <box flexDirection="column" maxHeight={8} overflow="hidden">
        {[...log]
          .reverse()
          .slice(0, 8)
          .map((e, i) => (
            <text
              key={i}
              fg={e.kind === "error" ? CRIMSON : e.kind === "crown" ? GOLD : PARCHMENT}
            >
              <span fg={ASH}>{fmtTime(e.ts)}</span> {LOG_ICON[e.kind]} {e.msg}
            </text>
          ))}
      </box>
    </box>
  );
}

function Hud({ run }: { run: LunchRun }) {
  const countdown = useCountdown(run.deadline);
  const showCountdown = countdown && (run.status === "announced" || run.status === "last_call");
  return (
    <box
      border={["top"]}
      borderColor={GOLD_DIM}
      backgroundColor={PLUM_DEEP}
      flexShrink={0}
      paddingX={2}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <box flexDirection="column">
        <text fg={PARCHMENT}>{run.restaurant ? `⚑ ${run.restaurant.name.toUpperCase()}` : "⚑ —"}</text>
        <text fg={ASH}>DEADLINE {run.deadline ? fmtTime(run.deadline).toUpperCase() : "—"}</text>
      </box>
      <text fg={showCountdown && countdown.msLeft < 5 * 60 * 1000 ? CRIMSON : GOLD}>
        <strong>{showCountdown ? `⏳ ${countdown.label}` : statusWord(run)}</strong>
      </text>
    </box>
  );
}

function statusWord(run: LunchRun): string {
  switch (run.status) {
    case "decree":
      return "CHOOSING";
    case "summons":
      return "RALLYING";
    case "tribute":
      return "PAY UP";
    case "submitted":
      return run.orderConfirmed ? "EN ROUTE" : "CONFIRMING";
    default:
      return "";
  }
}

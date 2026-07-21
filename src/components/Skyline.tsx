import { useEffect, useState } from "react";
import { useTerminalDimensions } from "@opentui/react";
import type { RunStatus } from "../../lib/types";
import { ASH, GOLD, PARCHMENT, TEAL_BRIGHT } from "../theme";
import { QUEEN, Sprite, Tower } from "./pixels";

export const STAGES = [
  { numeral: "I", name: "THE DECREE", job: "choose the restaurant" },
  { numeral: "II", name: "THE SUMMONS", job: "announce to the office" },
  { numeral: "III", name: "LAST CALL", job: "herald the deadline" },
  { numeral: "IV", name: "THE TRIBUTE", job: "pay and submit" },
  { numeral: "V", name: "THE FEAST", job: "proclaim arrival" },
] as const;

export function stageIndex(status: RunStatus): number {
  switch (status) {
    case "decree":
      return 0;
    case "summons":
      return 1;
    case "announced":
    case "last_call":
      return 2;
    case "tribute":
      return 3;
    case "submitted":
      return 4;
    case "done":
      return 5;
    default:
      return 0;
  }
}

/** The Kremlin level-map: five towers, one per stage of the Friday ritual.
 *  Done towers glow gold, the active one is teal with the czar on top. */
export function Skyline({ status }: { status: RunStatus }) {
  const active = stageIndex(status);
  const { height } = useTerminalDimensions();
  // On short terminals the queen steps off the map (like the web app hiding
  // tower names on small screens) — a bobbing crown marks her place instead.
  const roomy = height >= 38;
  const [bob, setBob] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBob((b) => !b), 450);
    return () => clearInterval(t);
  }, []);

  return (
    <box flexDirection="column" alignItems="center" marginY={1}>
      <box flexDirection="row" gap={2} alignItems="flex-end">
        {STAGES.map((s, i) => {
          const state = i < active ? "done" : i === active ? "active" : "locked";
          return (
            <box key={s.name} flexDirection="column" alignItems="center">
              {roomy ? (
                <box height={9} flexDirection="column" justifyContent="flex-end">
                  {i === active && (
                    <box marginBottom={bob ? 1 : 0}>
                      <Sprite map={QUEEN} />
                    </box>
                  )}
                </box>
              ) : (
                <box height={1}>
                  {i === active && <text fg={GOLD}>{bob ? "♛" : "♕"}</text>}
                </box>
              )}
              <Tower state={state} />
              <text fg={state === "done" ? GOLD : state === "active" ? TEAL_BRIGHT : ASH}>
                {center(s.numeral, 12)}
              </text>
              <text fg={state === "active" ? PARCHMENT : ASH}>{center(s.name, 12)}</text>
            </box>
          );
        })}
      </box>
      {STAGES[active] && (
        <text marginTop={1}>
          <span fg={PARCHMENT}>
            {STAGES[active].numeral} · {STAGES[active].name}
          </span>
          <span fg={ASH}> — {STAGES[active].job}</span>
        </text>
      )}
    </box>
  );
}

function center(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  const left = Math.floor((w - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(w - s.length - left);
}

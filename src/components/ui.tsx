import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ASH, BANNER, CRIMSON, DISABLED_BG, GOLD, GOLD_DIM, KREMLIN, PARCHMENT, PLUM,
  PLUM_DEEP, PLUM_LIGHT, TEAL, TEAL_BRIGHT,
} from "../theme";

/* ── Typing context: while an <input> is focused, screens must not
      treat letter keys as hotkeys ───────────────────────────────── */

const TypingContext = createContext<{ typing: boolean; setTyping: (v: boolean) => void }>({
  typing: false,
  setTyping: () => {},
});

export function TypingProvider({ children }: { children: ReactNode }) {
  const [typing, setTyping] = useState(false);
  return <TypingContext.Provider value={{ typing, setTyping }}>{children}</TypingContext.Provider>;
}

export function useTyping() {
  return useContext(TypingContext);
}

/** Declare that this component's input is focused while `active` is true. */
export function useTypingWhile(active: boolean) {
  const { setTyping } = useTyping();
  useEffect(() => {
    setTyping(active);
    return () => setTyping(false);
  }, [active, setTyping]);
}

/* ── Panel: the chunky pixel frame ────────────────────────────── */

export type Tone = "gold" | "crimson" | "teal" | "dim" | "ash";

export const TONE_COLOR: Record<Tone, string> = {
  gold: GOLD,
  crimson: CRIMSON,
  teal: TEAL,
  dim: PLUM_LIGHT,
  ash: ASH,
};

export function Panel({
  children,
  tone = "gold",
  alarm = false,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  alarm?: boolean;
  title?: string;
}) {
  // The last-call alarm: flash the panel fill like the web app's .alarm keyframes.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!alarm) return;
    const t = setInterval(() => setFlash((f) => !f), 800);
    return () => clearInterval(t);
  }, [alarm]);
  return (
    <box
      border
      borderStyle="heavy"
      borderColor={TONE_COLOR[tone]}
      backgroundColor={alarm && flash ? BANNER : PLUM}
      title={title}
      titleColor={TONE_COLOR[tone]}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      {children}
    </box>
  );
}

export function StageTitle({ numeral, name, sub }: { numeral: string; name: string; sub: string }) {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text fg={GOLD}>
        <strong>STAGE {numeral} · {name}</strong>
      </text>
      <text fg={ASH}>{sub}</text>
    </box>
  );
}

export function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <text fg={CRIMSON} marginTop={1}>
      ✖ {msg}
    </text>
  );
}

/* ── Buttons: gold cartridges with a [HOTKEY] label ───────────── */

export function Button({
  label,
  hotkey,
  tone = "gold",
  disabled = false,
  onPress,
}: {
  label: string;
  hotkey?: string;
  tone?: "gold" | "crimson" | "teal" | "ghost";
  disabled?: boolean;
  onPress?: () => void;
}) {
  const bg = disabled
    ? DISABLED_BG
    : tone === "crimson"
      ? CRIMSON
      : tone === "teal"
        ? TEAL
        : tone === "ghost"
          ? PLUM_LIGHT
          : GOLD;
  const fg = disabled
    ? PLUM
    : tone === "crimson"
      ? PARCHMENT
      : tone === "ghost"
        ? PARCHMENT
        : KREMLIN;
  return (
    <box
      backgroundColor={bg}
      paddingX={1}
      height={1}
      onMouseDown={() => {
        if (!disabled) onPress?.();
      }}
    >
      <text fg={fg} bg={bg}>
        {hotkey ? <span fg={disabled ? PLUM : tone === "ghost" ? TEAL_BRIGHT : fg}>[{hotkey}] </span> : null}
        <strong>{label.toUpperCase()}</strong>
      </text>
    </box>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return (
    <box flexDirection="row" flexWrap="wrap" gap={2} marginTop={1}>
      {children}
    </box>
  );
}

/* ── Framed input: gold-dim frame that brightens on focus ─────── */

export function FramedInput({
  value,
  placeholder,
  focused,
  width,
  maxLength,
  onInput,
  onSubmit,
}: {
  value: string;
  placeholder?: string;
  focused: boolean;
  width?: number | "100%";
  maxLength?: number;
  onInput: (v: string) => void;
  onSubmit?: (v: string) => void;
}) {
  return (
    <box
      border
      borderColor={focused ? GOLD : GOLD_DIM}
      backgroundColor={PLUM_DEEP}
      height={3}
      width={width ?? "100%"}
      paddingRight={1}
    >
      <input
        value={value}
        placeholder={placeholder}
        focused={focused}
        maxLength={maxLength}
        onInput={onInput}
        onSubmit={(arg: string | unknown) => onSubmit?.(typeof arg === "string" ? arg : value)}
        backgroundColor={PLUM_DEEP}
        textColor={PARCHMENT}
        focusedBackgroundColor={PLUM_DEEP}
        focusedTextColor={PARCHMENT}
        placeholderColor={ASH}
      />
    </box>
  );
}

/* ── Time helpers (same as the web app) ───────────────────────── */

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Live countdown to an ISO deadline. Returns null when no deadline. */
export function useCountdown(deadline?: string): { label: string; msLeft: number } | null {
  const now = useNow(1000);
  if (!deadline) return null;
  const msLeft = Date.parse(deadline) - now;
  const abs = Math.abs(msLeft);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const core = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return { label: msLeft < 0 ? `-${core}` : core, msLeft };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { ASH, BANNER, GOLD, KREMLIN, PARCHMENT, PLUM_DEEP } from "../theme";
import { Button, ButtonRow } from "./ui";

/**
 * The Wheel of Decree — a slot-machine roulette over the candidate
 * restaurants, for the Fridays when deciding is the hard part.
 */
export function Wheel({
  options,
  onPick,
  onClose,
}: {
  options: { storeId: string; name: string }[];
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const [cursor, setCursorState] = useState(0);
  const cursorRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function setCursor(v: number) {
    cursorRef.current = v;
    setCursorState(v);
  }

  function spin() {
    if (spinning || options.length === 0) return;
    setWinner(null);
    setSpinning(true);
    const target = Math.floor(Math.random() * options.length);
    const laps = 3;
    let steps = 0;
    const totalSteps = laps * options.length + target - (cursorRef.current % options.length);
    const advance = () => {
      steps += 1;
      setCursor((cursorRef.current + 1) % options.length);
      if (steps >= totalSteps) {
        setSpinning(false);
        setWinner(target);
        return;
      }
      // ease-out: start fast, land slow — like a wheel losing momentum
      const t = steps / totalSteps;
      timer.current = setTimeout(advance, 50 + 380 * t * t);
    };
    timer.current = setTimeout(advance, 50);
  }

  useKeyboard((key) => {
    if (spinning) return;
    if (key.name === "escape") onClose();
    else if (key.name === "s") spin();
    else if (key.name === "return") {
      if (winner !== null) onPick(winner);
      else spin();
    }
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={100}
      alignItems="center"
      justifyContent="center"
    >
      <box
        border
        borderStyle="heavy"
        borderColor={GOLD}
        backgroundColor={PLUM_DEEP}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        minWidth={50}
        maxWidth={76}
      >
        <text fg={GOLD}>
          <strong>☸ THE WHEEL OF DECREE</strong>
        </text>
        <text fg={ASH} marginBottom={1}>
          Let fate pick. The wheel is never wrong.
        </text>

        <box flexDirection="column" marginBottom={1}>
          {options.map((o, i) => {
            const isCursor = i === cursor;
            const crowned = isCursor && winner !== null;
            return (
              <box
                key={o.storeId}
                backgroundColor={crowned ? GOLD : isCursor ? BANNER : undefined}
                paddingX={1}
              >
                <text fg={crowned ? KREMLIN : PARCHMENT} bg={crowned ? GOLD : isCursor ? BANNER : undefined}>
                  {crowned ? "♔ " : isCursor ? "▶ " : "  "}
                  {o.name}
                </text>
              </box>
            );
          })}
        </box>

        <ButtonRow>
          {winner === null ? (
            <Button label={spinning ? "SPINNING…" : "SPIN"} hotkey="S" disabled={spinning} onPress={spin} />
          ) : (
            <>
              <Button
                label={`SO DECREED: ${options[winner].name.slice(0, 18)}`}
                hotkey="ENTER"
                onPress={() => onPick(winner)}
              />
              <Button label="SPIN AGAIN" hotkey="S" tone="ghost" onPress={spin} />
            </>
          )}
          <Button label="CLOSE" hotkey="ESC" tone="ghost" onPress={onClose} />
        </ButtonRow>
      </box>
    </box>
  );
}

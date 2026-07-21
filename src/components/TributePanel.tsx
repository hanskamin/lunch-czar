import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import {
  armAutoSubmit, disarmAutoSubmit, findCarts, getCheckoutUrl, getPreview, openInBrowser,
  submitNow, type BillPreview,
} from "../../lib/actions";
import type { CartSummary } from "../../lib/ddcli";
import type { LunchRun } from "../../lib/types";
import { ASH, BANNER, GOLD, PARCHMENT, TEAL_BRIGHT } from "../theme";
import { Button, ButtonRow, ErrorLine, FramedInput, useTyping, useTypingWhile } from "./ui";

/**
 * The Tribute: find the group cart, review the bill, set the Dasher tip,
 * then either ARM auto-submit (fires at the deadline) or submit now.
 */
export function TributePanel({
  run,
  onRun,
  keysEnabled = true,
}: {
  run: LunchRun;
  onRun: (r: LunchRun) => void;
  keysEnabled?: boolean;
}) {
  const manual = run.status === "tribute";
  const [carts, setCarts] = useState<CartSummary[] | null>(null);
  const [cartCursor, setCartCursor] = useState(0);
  const [cartUuid, setCartUuid] = useState<string | null>(run.autoSubmit.cartUuid ?? null);
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [tipCents, setTipCents] = useState<number>(run.autoSubmit.tipCents);
  const [tipTouched, setTipTouched] = useState(run.autoSubmit.armed);
  const [tipEditing, setTipEditing] = useState(false);
  const [tipDraft, setTipDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [forceNeeded, setForceNeeded] = useState(false);
  const { typing } = useTyping();
  useTypingWhile(tipEditing);

  const lookForCarts = useCallback(async () => {
    setBusy("carts");
    setError(null);
    const res = await findCarts(run.restaurant?.storeId);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCarts(res.carts);
    setCartCursor(0);
    if (res.carts.length === 1) setCartUuid(res.carts[0].cart_uuid);
  }, [run.restaurant?.storeId]);

  useEffect(() => {
    void lookForCarts();
  }, [lookForCarts]);

  const tipTouchedRef = useRef(tipTouched);
  tipTouchedRef.current = tipTouched;
  useEffect(() => {
    if (!cartUuid) return;
    let stale = false;
    setBusy("preview");
    setPreview(null);
    void getPreview(cartUuid).then((res) => {
      if (stale) return;
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res);
      if (!tipTouchedRef.current && res.tipSuggestion) setTipCents(res.tipSuggestion.cents);
    });
    return () => {
      stale = true;
    };
  }, [cartUuid]);

  async function arm() {
    if (!cartUuid) return;
    setBusy("arm");
    const res = armAutoSubmit(cartUuid, tipCents, preview?.cardLabel ?? undefined);
    setBusy(null);
    if (res.ok) onRun(res.run);
    else setError(res.error);
  }

  function disarm() {
    const res = disarmAutoSubmit();
    if (res.ok) onRun(res.run);
  }

  async function doSubmit(force = false) {
    if (!cartUuid || busy === "submit") return;
    setBusy("submit");
    setError(null);
    const res = await submitNow(cartUuid, tipCents, force);
    setBusy(null);
    setConfirming(false);
    if (res.ok) {
      onRun(res.run);
      return;
    }
    if (res.alreadyAttempted) {
      setForceNeeded(true);
      setError(res.error);
      return;
    }
    setError(res.error);
  }

  async function finishInBrowser() {
    if (!cartUuid) return;
    setBusy("browser");
    const res = await getCheckoutUrl(cartUuid);
    setBusy(null);
    if (res.ok) openInBrowser(res.url);
    else setError(res.error);
  }

  function commitTipDraft() {
    setTipCents(Math.max(0, Math.round(Number(tipDraft || 0) * 100)));
    setTipTouched(true);
    setTipEditing(false);
  }

  useKeyboard((key) => {
    if (!keysEnabled) return;
    if (tipEditing) {
      if (key.name === "escape") setTipEditing(false);
      return; // enter is handled by the input's onSubmit
    }
    if (typing) return;

    if (!cartUuid) {
      if (!carts || carts.length === 0) {
        if (key.name === "r") void lookForCarts();
        return;
      }
      if (key.name === "up") setCartCursor((c) => Math.max(0, c - 1));
      else if (key.name === "down") setCartCursor((c) => Math.min(carts.length - 1, c + 1));
      else if (key.name === "return") setCartUuid(carts[cartCursor]?.cart_uuid ?? null);
      else if (key.name === "r") void lookForCarts();
      return;
    }

    if (!preview) return;
    if (key.name === "1" && preview.tipSuggestion) {
      setTipCents(preview.tipSuggestion.cents);
      setTipTouched(true);
    } else if (key.name === "0") {
      setTipCents(0);
      setTipTouched(true);
    } else if (key.name === "t") {
      setTipDraft((tipCents / 100).toString());
      setTipEditing(true);
    } else if (key.name === "b") {
      void finishInBrowser();
    } else if (key.name === "d") {
      setCartUuid(null);
      setPreview(null);
      setConfirming(false);
      setForceNeeded(false);
      void lookForCarts();
    } else if (!manual && key.name === "a") {
      if (run.autoSubmit.armed) disarm();
      else void arm();
    } else if (manual) {
      if (forceNeeded && key.name === "f") void doSubmit(true);
      else if (confirming && key.name === "y") void doSubmit();
      else if (confirming && key.name === "escape") setConfirming(false);
      else if (!confirming && !forceNeeded && key.name === "s") setConfirming(true);
    }
  });

  const tipDollars = (tipCents / 100).toFixed(2);

  /* ── Cart discovery ── */
  if (!cartUuid) {
    return (
      <box flexDirection="column">
        {carts === null ? (
          <text fg={ASH}>Looking for the group cart…</text>
        ) : carts.length === 0 ? (
          <box flexDirection="column">
            <text fg={PARCHMENT}>
              No open cart at {run.restaurant?.name} yet. It appears here once the group order has
              items in it.
            </text>
            <text fg={ASH}>
              If it never shows up, finish checkout from your group order link in the browser —
              some group carts are only visible there.
            </text>
          </box>
        ) : (
          <box flexDirection="column">
            <text fg={PARCHMENT} marginBottom={1}>
              Pick the cart to pay for (↑↓ + ENTER):
            </text>
            {carts.map((c, i) => (
              <box
                key={c.cart_uuid}
                backgroundColor={i === cartCursor ? BANNER : undefined}
                paddingX={1}
                onMouseDown={() => setCartUuid(c.cart_uuid)}
              >
                <text fg={PARCHMENT} bg={i === cartCursor ? BANNER : undefined}>
                  {i === cartCursor ? "▶ " : "  "}
                  {c.store_name ?? "Cart"} · {c.items_count ?? c.items?.length ?? "?"} items
                </text>
              </box>
            ))}
          </box>
        )}
        <ButtonRow>
          <Button
            label={busy === "carts" ? "CHECKING…" : "CHECK AGAIN"}
            hotkey="R"
            tone="ghost"
            disabled={busy === "carts"}
            onPress={() => void lookForCarts()}
          />
        </ButtonRow>
        <ErrorLine msg={error} />
      </box>
    );
  }

  /* ── Bill review ── */
  return (
    <box flexDirection="column">
      {busy === "preview" && <text fg={ASH}>Tallying the bill…</text>}
      {preview && (
        <box flexDirection="column">
          <box flexDirection="column">
            {preview.items.map((it, i) => (
              <box key={i} flexDirection="row" justifyContent="space-between">
                <text fg={PARCHMENT}>
                  {it.quantity}× {it.name}
                </text>
                <text fg={ASH}>{it.price ?? ""}</text>
              </box>
            ))}
          </box>
          <text fg={ASH}>{"·".repeat(40)}</text>
          <box flexDirection="column">
            {preview.breakdown.map((b, i) => (
              <box key={i} flexDirection="row" justifyContent="space-between">
                <text fg={ASH}>{b.label}</text>
                <text fg={ASH}>{b.amount}</text>
              </box>
            ))}
            <box flexDirection="row" justifyContent="space-between" marginTop={1}>
              <text fg={GOLD}>
                <strong>TOTAL (before tip)</strong>
              </text>
              <text fg={GOLD}>
                <strong>{preview.total ?? "—"}</strong>
              </text>
            </box>
          </box>

          {/* Tip */}
          <box flexDirection="column" marginTop={1}>
            <text fg={ASH}>DASHER TIP — now ${tipDollars}</text>
            <ButtonRow>
              {preview.tipSuggestion && (
                <Button
                  label={`$${(preview.tipSuggestion.cents / 100).toFixed(2)}${preview.tipSuggestion.percent ? ` (${preview.tipSuggestion.percent}%)` : ""}`}
                  hotkey="1"
                  tone={tipCents === preview.tipSuggestion.cents ? "gold" : "ghost"}
                  onPress={() => {
                    setTipCents(preview.tipSuggestion!.cents);
                    setTipTouched(true);
                  }}
                />
              )}
              <Button
                label="NO TIP"
                hotkey="0"
                tone={tipCents === 0 && tipTouched ? "gold" : "ghost"}
                onPress={() => {
                  setTipCents(0);
                  setTipTouched(true);
                }}
              />
              <Button
                label="CUSTOM $"
                hotkey="T"
                tone="ghost"
                onPress={() => {
                  setTipDraft((tipCents / 100).toString());
                  setTipEditing(true);
                }}
              />
            </ButtonRow>
            {tipEditing && (
              <box flexDirection="row" alignItems="center" gap={1} marginTop={1}>
                <text fg={ASH}>custom $</text>
                <FramedInput
                  value={tipDraft}
                  focused
                  width={12}
                  onInput={setTipDraft}
                  onSubmit={commitTipDraft}
                />
                <text fg={ASH}>ENTER to set · ESC to cancel</text>
              </box>
            )}
          </box>

          {/* Payment */}
          <text fg={PARCHMENT} marginTop={1}>
            Charged to <span fg={TEAL_BRIGHT}>{preview.cardLabel ?? "your default DoorDash payment method"}</span>
            {preview.deliveryAddress ? (
              <span>
                {" "}
                · delivered to <span fg={TEAL_BRIGHT}>{preview.deliveryAddress}</span>
              </span>
            ) : null}
          </text>
          {!preview.cardLabel && (
            <text fg={ASH}>
              Couldn't read the card on file — if the default might be a wallet, use the browser
              checkout below to confirm it.
            </text>
          )}

          {/* Actions */}
          <ButtonRow>
            {!manual ? (
              run.autoSubmit.armed ? (
                <>
                  <box paddingX={1}>
                    <text fg={TEAL_BRIGHT}>✓ ARMED — pays at the deadline, tip ${tipDollars}</text>
                  </box>
                  <Button label="DISARM" hotkey="A" tone="ghost" onPress={disarm} />
                </>
              ) : (
                <Button
                  label="ARM AUTO-SUBMIT AT DEADLINE"
                  hotkey="A"
                  tone="teal"
                  disabled={busy === "arm"}
                  onPress={() => void arm()}
                />
              )
            ) : forceNeeded ? (
              <Button
                label="I CHECKED HISTORY — SUBMIT ANYWAY"
                hotkey="F"
                tone="crimson"
                disabled={busy === "submit"}
                onPress={() => void doSubmit(true)}
              />
            ) : confirming ? (
              <Button
                label={
                  busy === "submit"
                    ? "SUBMITTING…"
                    : `CONFIRM — PAY ${preview.total ?? ""} + $${tipDollars} TIP`
                }
                hotkey="Y"
                tone="crimson"
                disabled={busy === "submit"}
                onPress={() => void doSubmit()}
              />
            ) : (
              <Button label="SUBMIT AND PAY" hotkey="S" onPress={() => setConfirming(true)} />
            )}
            <Button
              label="FINISH IN BROWSER INSTEAD"
              hotkey="B"
              tone="ghost"
              disabled={busy === "browser"}
              onPress={() => void finishInBrowser()}
            />
            <Button
              label="DIFFERENT CART"
              hotkey="D"
              tone="ghost"
              onPress={() => {
                setCartUuid(null);
                setPreview(null);
                setConfirming(false);
                setForceNeeded(false);
                void lookForCarts();
              }}
            />
          </ButtonRow>
          {confirming && !forceNeeded && (
            <text fg={ASH} marginTop={1}>
              press Y to pay, ESC to back out
            </text>
          )}
        </box>
      )}
      <ErrorLine msg={error} />
    </box>
  );
}

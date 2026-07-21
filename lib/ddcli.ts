import { execFile } from "node:child_process";

export interface DdResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  needsLogin?: boolean;
}

const DD_BIN = process.env.DD_CLI_BIN || "dd-cli";
const TIMEOUT_MS = 90_000;

interface DdCliEnvelope<T> {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: T;
  isError?: boolean;
}

/**
 * Run `dd-cli --json-output <args>` and parse the JSON envelope.
 * All DoorDash access flows through here.
 */
export function dd<T = unknown>(args: string[]): Promise<DdResult<T>> {
  return new Promise((resolve) => {
    execFile(
      DD_BIN,
      ["--json-output", ...args],
      { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const parsed = extractJson<unknown>(stdout);
        const envelope = isDdCliEnvelope<T>(parsed) ? parsed : undefined;
        const errorText = envelopeError(envelope) || firstLine(stderr) || err?.message || "";
        const needsLogin = /missing credentials|not authenticated|dd-cli login/i.test(
          `${stdout}\n${stderr}\n${errorText}`,
        );

        if (needsLogin && (err || envelope?.isError)) {
          resolve({
            ok: false,
            needsLogin: true,
            error: "DoorDash sign-in expired. Run `dd-cli login` in a terminal, then retry.",
          });
          return;
        }

        if (err && parsed === undefined) {
          resolve({ ok: false, error: firstLine(stderr) || err.message });
          return;
        }
        if (parsed === undefined) {
          resolve({ ok: false, error: "Could not parse dd-cli output." });
          return;
        }

        if (envelope?.isError) {
          resolve({ ok: false, error: errorText || "dd-cli command failed." });
          return;
        }

        // Current dd-cli releases use the MCP tool-result envelope. Keep
        // accepting the former direct JSON shape for older installations.
        resolve({ ok: true, data: (envelope ? envelope.structuredContent : parsed) as T });
      },
    );
  });
}

function isDdCliEnvelope<T>(value: unknown): value is DdCliEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return "structuredContent" in record || "isError" in record || Array.isArray(record.content);
}

function envelopeError(envelope: DdCliEnvelope<unknown> | undefined): string {
  if (!envelope?.isError) return "";
  const structured = envelope.structuredContent;
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  }
  return envelope.content?.find((item) => item.type === "text" && item.text?.trim())?.text?.trim() ?? "";
}

/** Parse stdout that should be one JSON value, tolerating stray log lines. */
function extractJson<T>(stdout: string): T | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function firstLine(s: string): string {
  return s.trim().split("\n")[0] ?? "";
}

/* ── Typed helpers for the calls Lunch Czar makes ─────────────── */

interface AddressList {
  addresses?: Array<{
    is_default?: boolean;
    lat?: number;
    lng?: number;
    printable_address?: string;
  }>;
}

let cachedCoords: { lat: number; lng: number } | null = null;

/** Office coords: env override first, else the default saved address. */
export async function officeCoords(): Promise<{ lat: number; lng: number } | null> {
  if (process.env.OFFICE_LAT && process.env.OFFICE_LNG) {
    return { lat: Number(process.env.OFFICE_LAT), lng: Number(process.env.OFFICE_LNG) };
  }
  if (cachedCoords) return cachedCoords;
  const res = await dd<AddressList>(["address", "list"]);
  const def = res.data?.addresses?.find((a) => a.is_default);
  if (def?.lat != null && def?.lng != null) {
    cachedCoords = { lat: def.lat, lng: def.lng };
    return cachedCoords;
  }
  return null;
}

export interface SearchStore {
  store_id?: string | number;
  id?: string | number;
  name?: string;
  store_name?: string;
  verified_name?: string;
  image_url?: string;
  average_rating?: number;
  rating?: number | { average_rating?: number; display_string?: string };
  description?: string;
  price_range?: number;
  delivery_fee_display?: string;
  eta_display?: string;
  delivery_time?: string;
}

export async function searchRestaurants(query: string) {
  const coords = await officeCoords();
  // DoorDash changes its candidate selection with the requested limit. A
  // narrow limit can omit an exact store-name match in favor of discovery
  // results, so fetch a wider pool and let the action layer rank it.
  const args = ["search", "--query", query, "--limit", "50"];
  if (coords) args.push("--lat", String(coords.lat), "--lng", String(coords.lng));
  return dd<{ stores?: SearchStore[]; results?: SearchStore[] }>(args);
}

export interface CartSummary {
  cart_uuid: string;
  store_id?: string | number;
  store_name?: string;
  items?: Array<{ name?: string; quantity?: number; price?: string | number }>;
  items_count?: number;
  updated_at?: number | null;
  created_at?: number | null;
}

export async function listCarts(storeId?: string) {
  const args = ["cart", "list"];
  if (storeId) args.push("--store-id", storeId);
  return dd<{ carts?: CartSummary[] }>(args);
}

export async function previewOrder(cartUuid: string) {
  return dd<Record<string, unknown>>(["order", "preview", "--cart-uuid", cartUuid]);
}

export async function submitOrder(cartUuid: string, tipCents: number) {
  return dd<{ order_uuid?: string; success?: boolean; error_reason?: string }>([
    "order",
    "submit",
    "--cart-uuid",
    cartUuid,
    "--tip-cents",
    String(Math.max(0, Math.round(tipCents))),
    "--yes",
  ]);
}

export async function orderStatus(orderUuid: string) {
  return dd<{ status?: string; error_message?: string }>([
    "order",
    "status",
    "--order-uuid",
    orderUuid,
  ]);
}

export async function checkoutUrl(cartUuid: string) {
  return dd<{ checkout_url?: string }>(["order", "checkout-url", "--cart-uuid", cartUuid]);
}

export interface PaymentMethods {
  default_payment_method_id?: string;
  cards?: Array<{
    payment_method_id?: string;
    brand?: string;
    last4?: string;
    last_4?: string;
    exp_month?: number;
    exp_year?: number;
  }>;
}

export async function defaultCardLabel(): Promise<string | null> {
  const res = await dd<PaymentMethods>(["payment-method", "list"]);
  if (!res.ok || !res.data) return null;
  const { default_payment_method_id, cards } = res.data;
  const card = cards?.find((c) => c.payment_method_id === default_payment_method_id);
  if (!card) return null;
  const last4 = card.last4 ?? card.last_4;
  if (!card.brand && !last4) return null;
  return `${card.brand ?? "Card"} ···· ${last4 ?? "????"}`;
}

/** Cheap signed-in probe: address list is small and requires auth. */
export async function loginCheck(): Promise<{ ok: boolean; needsLogin: boolean }> {
  const res = await dd(["address", "list"]);
  return { ok: res.ok, needsLogin: Boolean(res.needsLogin) };
}

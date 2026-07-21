/**
 * Lunch Czar — a retro imperial console for the Friday lunch ritual,
 * now living directly in your terminal. Bun loads .env.local itself;
 * the scheduler (T−5 last call, armed auto-submit) runs in-process.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { startScheduler } from "../lib/scheduler";
import { App } from "./App";
import { KREMLIN } from "./theme";

startScheduler();

const renderer = await createCliRenderer({
  backgroundColor: KREMLIN,
  exitOnCtrlC: true,
});

createRoot(renderer).render(<App />);

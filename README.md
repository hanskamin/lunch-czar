# ♔ Lunch Czar

Queen of the Office, Lord of Your Lunch, and Protector of The Ramp Card. The all-in-one solution to DoorDash orders for your office.

Lunch Czar turns the Friday lunch ritual into a five-stage quest, run from a
retro imperial console right in your terminal (built with
[Bun](https://bun.sh) and [OpenTUI](https://github.com/anomalyco/opentui)):

| Stage | What happens | Who does it |
|---|---|---|
| **I · The Decree** | Search DoorDash near the office, or spin the Wheel of Decree | You (or fate) |
| **II · The Summons** | Create the group order link, set the deadline, announce in `#atx-lunch` | You paste the link; the app posts |
| **III · Last Call** | `@here last call for orders` 5 minutes before the deadline | Automatic |
| **IV · The Tribute** | Review the bill, set the tip, pay and submit the group order | Automatic if armed, else one keypress |
| **V · The Feast** | `@here lunch has arrived, come get it` | One keypress when the food shows up |

It runs entirely on your own laptop. The console shells out to the DoorDash
CLI (`dd-cli`), which uses the DoorDash login saved in your macOS keychain —
nothing is deployed anywhere, no credentials leave your machine.

## One-time setup

1. **Bun** — install from [bun.sh](https://bun.sh) if you don't have it.

2. **DoorDash CLI** — make sure `dd-cli` is on your PATH, then sign in once:

   ```bash
   dd-cli login
   ```

3. **Slack** — copy the env template and fill in one of the two options:

   ```bash
   cp .env.example .env.local
   ```

   - *Bot token (recommended):* create a Slack app, add the `chat:write` scope,
     install it to the workspace, invite the bot to the channel
     (`/invite @Lunch Czar` in `#atx-lunch`), and set `SLACK_BOT_TOKEN` +
     `SLACK_CHANNEL`.
   - *Webhook:* create an incoming webhook pointed at `#atx-lunch` and set
     `SLACK_WEBHOOK_URL`.

4. **Install dependencies**:

   ```bash
   bun install
   ```

## Every Friday

```bash
bun run czar
```

That opens the console in the current terminal and runs `caffeinate` so the
laptop can't sleep through the last-call timer or an armed auto-submit. Keep
the terminal open until lunch arrives, then Ctrl-C.

Use a reasonably sized terminal window (at least ~90×30 for the full Kremlin
skyline; smaller works, and PgUp/PgDn scrolls). A truecolor terminal
(Terminal.app, iTerm2, Ghostty, WezTerm…) gets the full imperial palette.

### Controls

Every button shows its key in brackets — `[S] SUBMIT AND PAY` means press
`S`. Beyond that:

- `↑` `↓` move through lists, `ENTER` picks
- `ENTER` / `↓` move between input fields; buttons work once you leave the inputs
- `W` spins the Wheel of Decree over search results
- `X` cancels the run (press it twice), `ESC` backs out of confirms
- `PgUp` / `PgDn` scroll, mouse clicks and wheel also work
- `Ctrl-C` quits the console (the run state survives — reopen to resume)

### Run it from your phone

The console is a terminal app now, so the phone story is SSH: enable *Remote
Login* on the laptop (System Settings → Sharing), install an SSH client on
your phone (Termius, Blink…), connect over the office wifi, and run
`bun run czar` inside `tmux` so the session survives disconnects. The laptop
still has to stay awake and on the network.

### Notes on how the automation works

- **Group order links** can only be created on doordash.com — the CLI has no
  command for them. Stage II opens the restaurant page in your browser (`O`);
  you press *Group Order*, copy the link, and paste it into the console.
  Everything after that is automated.
- **Auto-submit** ("arm the tribute") is optional. Arming shows you the bill,
  the Dasher tip, and the exact card that will be charged, and fires at the
  deadline. If you don't arm it, the app moves to a manual pay-and-submit
  screen at the deadline instead. A submit is never attempted twice — if
  anything is ambiguous the app stops and tells you to check
  `dd-cli order history` before retrying.
- **The group cart** is found via `dd-cli cart list` for your restaurant. If
  DoorDash doesn't expose your group cart to the CLI, use the
  *Finish in browser instead* action (`B`) — it fetches a checkout URL (or
  fall back to your group order link).
- **Delivery arrival** isn't exposed by the CLI, so Stage V is a single
  glorious keypress when the Dasher appears.
- Run state lives in `data/state.json` (gitignored) — the same file the old
  web version used, so history carries over. Slack secrets live in
  `.env.local` (gitignored); Bun loads it automatically.

## Development

```bash
bun run start        # run the console
bun run typecheck    # typecheck
```

### Fake end-to-end run

Run the normal app with every DoorDash call replaced by deterministic test
data:

```bash
bun run czar --fake
```

This uses the normal `data/state.json` and real Slack settings from
`.env.local`, but it cannot place or charge a real DoorDash order. The header
shows `DOORDASH FAKE` for the entire run.

Search for anything, choose **Fake Lunch Palace**, and use a harmless group
order URL such as `https://example.invalid/group-order/test`. Set a deadline a
minute or two ahead and arm auto-submit to exercise the announcement, automatic
last call, fake submission, fake payment confirmation, and arrival message.
Slack messages are live, including `@here`, so use a test channel when
appropriate.

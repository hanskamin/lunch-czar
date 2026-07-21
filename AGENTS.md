# Terminal app, not a web app

Lunch Czar is a Bun + OpenTUI terminal application — there is no browser, no
DOM, and no CSS. UI is built from OpenTUI renderables (`<box>`, `<text>`,
`<span>`, `<input>`, `<ascii-font>`…) via the `@opentui/react` reconciler.
OpenTUI is young and moves fast: check the actual API in
`node_modules/@opentui/react/README.md` and the `.d.ts` files in
`node_modules/@opentui/core/` before writing code — do not trust training
data. To see the app run, drive it inside tmux (`tmux new-session -d -s czar
-x 100 -y 42 'bun src/index.tsx'`, then `tmux send-keys` / `capture-pane`).

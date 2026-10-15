# Fathom · Kindle

A bioluminescent maze chase in the deep sea. Graze plankton to expand your window into the dark, send sonar around corners, and evade three predators that hunt by light and sound. Clear the trench to descend into a more crowded abyss.

Install with `npm ci`. Start development with `npm run dev`.

`npm run build` creates the complete static site in `dist/`. Serve that directory at a server root or under a sub-path. `npm run preview` previews the production build.

## Controls

- Arrow keys / WASD: swim; up/down select menu items.
- Space: sonar. Shift: ink.
- Enter / Space: confirm. Click or tap menu items to select them.
- P / Escape: pause or resume. Escape also returns from menus.
- M: mute. Backtick: engine diagnostics.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`. Tests cover maze topology, immutable debug poses, progression, sensing, life reserves, and a real Simple 2D engine with a counted clock. The simulation runs at 120 ticks per second independently of rendering.

The engine owns input, audio synthesis, assets, canvas fitting and the frame loop. Game state and the debug surface are exported from `src/game.ts`; no debug object is installed on the page. The seeded art remains under `assets/`. Store-page screenshots and copy live in `showcase/`.

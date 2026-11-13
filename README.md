# VOIDBLOOM

**Survive the swarm · Bloom the void**

A neon survivors-like for the browser and desktop. Pick a ship, drop into an arena, and survive 15 minutes of escalating swarms while your weapons fire on their own — then kill what waits at the end.

**▶ Play in your browser:** https://ryangils.github.io/voidbloom/
**⬇ Windows download:** see [Releases](https://github.com/ryangils/voidbloom/releases)
**📱 iPhone / iPad:** open the link above in Safari → Share → **Add to Home Screen** for a full-screen app that also works offline

## Features

- **Campaign** — 15 short sectors across the three arenas, each with a twist (swarm, haste, elite rush, glass, famine, tide) and three stars to earn
- **Pilot Rank, Contracts and paints** — every run earns rank XP with a reward at every rank (shards, perks, ships, ship paints); three rotating contracts pay out shards; first run of the day earns double XP
- **BEAT SYNC** — the soundtrack is the game clock. Dash **on the beat** for a PERFECT (invulnerable, slashes everything in your path), chain PERFECTs to climb Groove ×2 → ×3 → ×4 → **OVERDRIVE**, and the synth score builds with you. Every bar, a shockwave pulses from your ship.

- **Void Pacts & HEAT** — once your build is maxed, level-ups offer uncapped power… and every pact cranks up the swarm
- **Void Rot** — after 8:00 healing weakens, so late-game sustain can't trivialize the swarm
- **Solo or local co-op** — two pilots, one screen
- **5 ships** — Vanguard, Tempest, Bastion, plus unlockable Revenant and Wraith
- **3 arenas** — The Drift, Reactor Core, Void Garden — and a Nightmare mode
- **11 evolving weapons**, achievements, and permanent upgrades in **the Hangar**
- **Settings and accessibility** — volume, neon glow, screen shake, reduced flashes, damage numbers, fullscreen
- **Zero art or audio files** — every sprite is drawn in code and every sound is synthesized live
- Plays on iPhone/iPad and Android: touch joystick, notch-safe layout, installable to the home screen, offline play
- Progress is saved locally (browser storage / desktop app storage)

## Controls

| Action | Keys |
| --- | --- |
| Move | `WASD` or arrow keys |
| Beat Dash | `Space` (P2: `Enter` / `Right Shift`) · gamepad `A` · touch: tap a second finger |
| Pause | `Esc` |
| Mute | `M` |
| Fullscreen (desktop app) | `F11` |
| Touch (phone/tablet) | drag anywhere to fly · ❚❚ button to pause |

## Project layout

```
web/                 the game itself (plain HTML/CSS/JS, no build step)
  index.html
  css/style.css
  fonts/             Oxanium typeface (SIL Open Font License)
  js/version.js      version number and studio name shown in-game
  js/util.js         math helpers, RNG, spatial hash, pooling, player options
  js/sprites.js      pre-rendered neon sprites
  js/audio.js        synthesized SFX + adaptive music
  js/beat.js         Beat Sync: beat clock, Beat Dash, Groove/Overdrive
  js/data.js         all balance tables — tune the game here
  js/progress.js     campaign sectors, pilot rank rewards, contracts, end-of-run payout
  js/game.js         core simulation + world rendering
  js/ui.js           overlays, HUD, procedural icons
  js/main.js         boot, input, game loop, saves
  sw.js, manifest.webmanifest, icons/   home-screen install + offline play
electron/main.js     desktop app shell (window, auto-update, CI smoke test)
electron/preload.js  lets the Settings screen switch fullscreen
store/               cover art, screenshots, store page text and launch checklist
build/icon.png       app icon
.github/workflows/   auto-deploy to GitHub Pages + Windows builds
```

## Running locally

```bash
npm start            # serves the web game at http://localhost:8080
npm install          # once, to get Electron
npm run desktop      # run as a desktop app
npm run dist:win     # build a Windows installer + portable .exe into dist/
```

You can also just open `web/index.html` directly in a browser.

## Releasing a new desktop version

1. Bump `"version"` in `package.json` and `GAME_VERSION` in `web/js/version.js` to the same number (the build refuses to run if they differ).
2. Tag and push: `git tag v1.0.1 && git push --tags`
3. GitHub Actions builds the game, starts the packaged app to check it boots, then attaches to the Release:
   - `VOIDBLOOM-Setup-x.y.z.exe` and `VOIDBLOOM-Portable-x.y.z.exe`
   - `VOIDBLOOM-x.y.z-windows-store.zip` for itch.io or Steam (no self-updater)
   - `VOIDBLOOM-x.y.z-web.zip` for itch.io browser play

See `store/LAUNCH_CHECKLIST.md` for putting the game on sale.

Every push to `main` that touches `web/` redeploys the browser version automatically.
When you change game files, also bump `VERSION` in `web/sw.js` so phones that installed the game pick up the update.

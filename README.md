# VOIDBLOOM

**Survive the swarm · Bloom the void**

A neon survivors-like for the browser and desktop. Pick a ship, drop into an arena, and survive 15 minutes of escalating swarms while your weapons fire on their own — then kill what waits at the end.

**▶ Play in your browser:** https://ryangils.github.io/voidbloom/
**⬇ Windows download:** see [Releases](https://github.com/ryangils/voidbloom/releases)

## Features

- **Solo or local co-op** — two pilots, one screen
- **5 ships** — Vanguard, Tempest, Bastion, plus unlockable Revenant and Wraith
- **3 arenas** — The Drift, Reactor Core, Void Garden — and a Nightmare mode
- **11 evolving weapons**, achievements, and permanent upgrades in **the Hangar**
- **Zero assets** — every sprite is drawn in code and every sound is synthesized live
- Progress is saved locally (browser storage / desktop app storage)

## Controls

| Action | Keys |
| --- | --- |
| Move | `WASD` or arrow keys |
| Pause | `Esc` |
| Mute | `M` |
| Fullscreen (desktop app) | `F11` |

## Project layout

```
web/                 the game itself (plain HTML/CSS/JS, no build step)
  index.html
  css/style.css
  js/util.js         math helpers, RNG, spatial hash, pooling
  js/sprites.js      pre-rendered neon sprites
  js/audio.js        synthesized SFX + adaptive music
  js/data.js         all balance tables — tune the game here
  js/game.js         core simulation + world rendering
  js/ui.js           overlays, HUD, procedural icons
  js/main.js         boot, input, game loop, saves
electron/main.js     desktop app shell
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

1. Bump `"version"` in `package.json`.
2. Tag and push: `git tag v1.0.1 && git push --tags`
3. GitHub Actions builds `VOIDBLOOM-Setup-x.y.z.exe` and `VOIDBLOOM-Portable-x.y.z.exe` and attaches them to a new Release.

Every push to `main` that touches `web/` redeploys the browser version automatically.

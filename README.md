# Among Us — Web Multiplayer Clone (Enhanced Edition)

A real-time multiplayer web clone of **Among Us** built with **Phaser 3**, **React 19**, **Express 5**, and **Socket.IO**.

This repository recreates and upgrades the architecture of `arizkhalid/among-us-clone` with authoritative server validation, WebGL shader & animation upgrades, interactive Skeld tasks, imposter venting, ghost mode, meeting chat, and full ejection/role-reveal cutscenes.

## Key Improvements & Features

- **Upgraded WebGL Shaders & Zero-Leak Pipelines**
  - `ColorSwapPipeline` decodes primary body (red), shadow (blue), and visor (green → authentic icy cyan) channels in a single shared pipeline using per-vertex tints (`outTint`), eliminating per-sprite WebGL pipeline leaks.
  - `VisionRadiusPipeline` renders an atmospheric radial fog-of-war with smooth flashlight falloff and hides out-of-range players, nameplates, and dead bodies.
- **Animations & Visual Effects**
  - **Cinematic Role Reveal (`SHHHHHH!`)** using spinning sunburst, animated finger-to-visor reveal, and Crewmate/Impostor lineup card.
  - **Lobby & Movement Juice:** Drop-ship thruster exhaust particles, glowing customization laptop, floating player nameplates, ground drop shadows, walking dust puffs, and 60fps remote player interpolation.
  - **Kill & Death FX:** Victim-colored 42-frame death animation (`Dead0001`–`Dead0042`), crimson impact particles, camera shake/flash, persistent colored dead bodies, and **Ghost Mode** (`ghost0001`–`ghost0048` animation, translucent floating, pass-through walls, full vision).
  - **Imposter Venting:** Connected Skeld vent network with animated vent covers (`Vent0001`–`Vent0007`), dust bursts, and directional jump markers.
  - **Meetings & Ejections:** Animated *Emergency Meeting* / *Dead Body Reported* slam banners, tablet voting UI with Skip Vote, one-vote enforcement, vote-tally reveal badges, live discussion & ghost chat, and a starry space ejection cutscene.
  - **Synthesized Web Audio SFX:** Procedural sound effects with a HUD mute toggle (`🔊` / `🔇`).
- **8 Interactive Skeld Tasks + Live Mini-Map**
  - Swipe Card (Admin), Bio-Scan (MedBay), Fix Wiring (Electrical), Clear Asteroids (Weapons), Unlock Manifolds (Reactor), Empty Chute (Cafeteria), Prime Shields (Shields), and Chart Course (Navigation), plus an interactive `[M]` Skeld Mini-Map.
- **Authoritative Backend**
  - Impostor identity is never leaked in room payloads; roles are delivered privately per socket.
  - Server-side validation for kill range/cooldown, vent links, task completion, meeting triggers, single-vote enforcement, per-room meeting timers, and Play Again room resets.

## Controls

- **Move:** `W A S D` or `Arrow Keys`
- **Use Task / Call Emergency Meeting:** `E`
- **Report Dead Body:** `R`
- **Toggle Mini-Map:** `M`
- **Kill (Impostor):** `Q` or `K`
- **Vent (Impostor):** `V`

## Project Structure

```
among-us/
├── backend/                  # Express 5 + Socket.IO authoritative server
│   ├── src/
│   │   ├── config/           # Skeld coordinates, tasks, vents, game constants
│   │   ├── events/           # roomEvents.js & gameEvents.js
│   │   ├── managers/         # players.manager.js & rooms.manager.js
│   │   ├── routes/           # REST endpoints (/status, /rooms, /player, /isImposter)
│   │   ├── types/            # JSDoc typedefs (checked via tsconfig)
│   │   └── server.js
│   └── tests/                # Node test suite
├── frontend/                 # React 19 + Vite + Phaser 3 client
│   ├── public/assets/        # Sprites, tilemaps, fonts, UI icons
│   ├── src/
│   │   ├── components/       # RoleReveal, Meeting, TaskModal, MiniMap, EjectionOverlay, EndGame
│   │   ├── game/             # Phaser scenes, WebGL shaders, player/imposter/vision utils
│   │   ├── pages/            # Animated Menu & room browser
│   │   ├── services/         # Socket.IO client
│   │   └── utils/            # URLs, colors, procedural Web Audio SFX
│   └── vite/                 # Vite dev (with proxy) & prod configs
└── misc/                     # Architecture diagrams
```

## Development Setup

```bash
# 1. Install all dependencies
npm run install:all

# 2. Run backend tests
npm test

# 3. Start backend (port 3000) & frontend (port 8080)
npm run dev
```

Or run them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

### Production Build

```bash
npm run build
npm --prefix backend start
```

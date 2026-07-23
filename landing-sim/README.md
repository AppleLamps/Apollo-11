# LUMINARY — Lunar Landing Sim (MVP)

A modern, browser-based Lunar Module descent sandbox inspired by `Luminary099`.

- **Sim core** — point-mass physics under lunar gravity, fuel burn, pitch/throttle
- **Autopilot** — simplified P63 → approach → final descent guidance
- **Fault model** — engine underthrust, radar glitch, computer overload (1202), steep slope, RCS drift
- **Web UI** — Three.js viewport, telemetry, fault injector

This lives beside the historical AGC sources; it does **not** modify or replace them.

## Run

```bash
cd landing-sim
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Scripts

| Command        | Purpose                |
| -------------- | ---------------------- |
| `npm run dev`  | Dev server             |
| `npm run build`| Typecheck + production |
| `npm test`     | Vitest unit tests      |
| `npm run preview` | Preview production build |

## Controls

1. Optionally arm faults in **Inject fault**
2. Press **Engage**
3. Watch descent; use **Pause** / **Reset** as needed

## Security notes

- Fonts (Syne, IBM Plex Mono) are self-hosted via `@fontsource` — no Google Fonts runtime dependency
- Production builds inject a Content-Security-Policy meta tag; `vite preview` / `vite` also send CSP headers
- Production source maps are disabled

## Notes

Guidance and numbers are intentionally simplified for an interactive MVP, not a bit-accurate AGC recreation. For the original flight software, see `../Luminary099`.

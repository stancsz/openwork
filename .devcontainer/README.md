# Daytona / Dev Container Setup

Full-stack dev environment that runs the **real Electron app** + Den stack in a cloud sandbox. You see and steer the desktop app through your browser via noVNC.

## What's included

| Service | Port | Description |
|---------|------|-------------|
| **Desktop App (noVNC)** | 6080 | The real Electron app rendered in a virtual display, accessible in your browser |
| **Den Web** | 3005 | Admin dashboard for managing orgs, restrictions, providers |
| **Den API** | 8788 | Control plane API |
| **CDP Debug** | 9825 | Chrome DevTools Protocol — for automation and Chrome MCP |
| **Vite HMR** | 5173 | Hot module replacement for the React UI |
| **MySQL** | 3306 | Database (internal) |

## Quick start with Daytona Electron/noVNC

```bash
bash .devcontainer/test-on-daytona.sh [branch-or-commit]
```

The script creates a large Daytona sandbox from `.devcontainer/Dockerfile.daytona-vnc`
with `--memory 8 --disk 10`, starts XFCE/noVNC, Vite, and Electron, then prints
the noVNC and CDP URLs.

Do not use the generic `daytona create https://github.com/different-ai/openwork`
flow for Electron/noVNC tests. The default resource size is too small and the
generic image path does not guarantee the desktop stack we need.

## How it works

1. `.devcontainer/Dockerfile.daytona-vnc` starts from `daytonaio/sandbox:0.6.0`,
   which includes Daytona's expected desktop packages: Xvfb, XFCE, x11vnc,
   noVNC, websockify, and dbus-x11.
2. `.devcontainer/start-daytona-vnc.sh` starts Xvfb, XFCE, x11vnc, and noVNC on
   display `:99`.
3. Vite serves the React UI on port 5173.
4. Electron renders the real desktop app on display `:99`.
5. **CDP on port 9825** enables Chrome MCP and browser-tool automation.

## Testing the customization system

1. Open **Den Web** (port 3005) in a separate tab
2. Sign up → create org → Org Settings → UI Customization
3. Set overrides → Save
4. In the **Electron app** (noVNC on port 6080):
   - Cloud → developer mode → base URL `http://localhost:3005`
   - Sign in → Customization → see locked toggles

## Architecture

```
Your Browser
    │
    ├── :6080 noVNC ──▶ x11vnc ──▶ XFCE/Xvfb ──▶ Electron App
    │                              │
    │                              ├── CDP :9825 (automatable)
    │                              └── Vite HMR :5173
    │
    ├── :3005 Den Web (Next.js)
    │
    └── :8788 Den API (Hono) ──▶ MySQL :3306
```

## Automation

The Electron app exposes CDP on port 9825. You can:

- Connect Playwright: `const browser = await chromium.connectOverCDP('ws://localhost:9825')`
- Connect Chrome MCP for AI agent testing
- Take screenshots, run UI tests, etc.

# PeachAgent Studio frontend

[中文](README.md) | [Complete backend setup](../backend/README_EN.md)

Vue 3 + TypeScript + Pinia + Vue Router + Vite. P1 connects real REST and SSE; no localStorage persistence of cookies, secrets, conversations or simulated runs.

1. Install Node.js 22 (at least 22.12) and npm.
2. Configure .env, start middleware, API and Worker using the backend guide. API uses PUBLIC_ORIGIN=http://127.0.0.1:5173 and COOKIE_SECURE=false for local HTTP only; default API port 8080.
3. From frontend:

```bash
npm install
npm run dev
```

Visit http://127.0.0.1:5173, not localhost. vite.config.ts proxies /api to http://127.0.0.1:8080 with changeOrigin=false. Update target when API port changes and PUBLIC_ORIGIN when frontend port changes. Browser uses HttpOnly cookie, CSRF token on writes, SSE for events.

Run npm run build for TypeScript checking and production dist/. Use the backend's same-origin static mode; npm run preview alone is not the full backend. Playwright is pinned in package.json; install Chromium with npx playwright install chromium. [CI](../.github/workflows/p1-backend.yml) seeds disposable identity and model fixtures before npm run qa:browser; the script alone does not seed data. Screenshots go to qa/evidence/. Run npm audit --audit-level=high for security alerts.

P1 exposes ten workbench pages; later phases are unavailable. Track live provider and full UI acceptance in [#18](https://github.com/Ryan-Guizhou/PeachAgent/issues/18).

# UpKeep Work Order Dashboard

Static Next.js dashboard for the **Weekly Team Performance Report Group** at Welch Packaging · Elkhat. Deployed to GitHub Pages, rebuilds every 15 minutes via GitHub Actions.

**Live:** <https://soeprbp.github.io/upkeep-dashboard/>
**TV view:** <https://soeprbp.github.io/upkeep-dashboard/tv/>

---

## Pages

### `/` — Main Dashboard
- KPI cards: Open, In Progress, On Hold, Complete, Other, Total Cached
- Aging: open orders older than 7 / 14 / 30 days
- Donut chart + bar chart + status table + priority breakdown
- Technician on-time performance bars
- Scrolling team member ticker (pauses on hover)
- Dark mode toggle (sun/moon, localStorage persistence)
- Auto-refresh via `<meta http-equiv="refresh" content="900">`

### `/tv/` — TV Dashboard
- Always-dark 16:9 layout (vmin units)
- 5 metric cards: Open Orders, Unassigned Orders, Pending Requests, MTD Created, MTD Completed
- Team-filtered metrics; `dateCompleted` for MTD Completed

---

## Architecture

| Layer | Detail |
|---|---|
| Framework | Next.js `output: 'export'` |
| Deploy | GitHub Pages via Actions |
| Data | UpKeep API v2, build-time `getStaticProps` |
| Auth | `UPKEEP_EMAIL` / `UPKEEP_PASSWORD` secrets |

### Data Flow
1. `POST /api/v2/auth` → session token
2. `GET /api/v2/teams?name=Weekly Team Performance Report Group` → team ID
3. `GET /api/v2/teams/{id}/users` → user IDs + names
4. `GET /api/v2/work-orders?limit=200&offset=N` (max 5 pages)
5. Filter by `assignedToUser` in team set
6. Compute metrics → static HTML

### Constants
| Constant | index.tsx | tv.tsx |
|---|---|---|
| Lookback | 30 days | 60 days |
| Max pages | 5 / ~1,000 orders | 5 |
| API timeout | 15s | 20s |
| Static timeout | 180s (next.config.js) | 180s |

### Priority Mapping
`0` ↦ NONE, `1` ↦ LOW, `2` ↦ MEDIUM, `3` ↦ HIGH, else ↦ Unspecified

### Status Groups
Open | In Progress | On Hold | Complete (incl. Closed) | Other

---

## CI/CD

`.github/workflows/deploy.yml`:
- Triggers: push to `master`, cron `*/15 * * * *`, manual dispatch
- Build: `npm ci && npm run build` with secrets injected
- Deploy: `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`

## Local Dev
```bash
npm install
copy .env.local.example .env.local  # fill credentials
npm run dev                           # dev server
set GITHUB_ACTIONS=true && npm run build  # static build
npx serve out
```

# Codexa — AI-Native Repository Intelligence

**Chat with your codebase · Living Wiki · Architecture Graph · Change Intelligence**

Codexa indexes any GitHub repository (private or public) into a canonical Postgres store + Pinecone vector projection, then lets you chat, browse files, visualize dependencies, and keep a living wiki fresh against the indexed commit.

> Built on Next.js 15 (App Router) + TypeScript + Prisma + Pinecone + Inngest.

---

## Features

| Area | What ships |
|---|---|
| **Auth** | GitHub OAuth via NextAuth v5 (Auth.js). Prisma `database` sessions. First login auto-creates a personal `Organization`. Org invites (`Invite` + email token). |
| **Repository connect** | Paste `owner/repo` or GitHub URL → creates `Repository` + `RepositorySnapshot` (`PENDING → RUNNING → COMPLETED/FAILED`) → Inngest `indexRepo` job. Poll real status on dashboard. |
| **Indexing pipeline** (`indexRepo`) | Octokit `getTree` → skip binaries/lockfiles/large files → first 200 blobs → Babel AST symbol extraction (functions/classes/methods/interfaces/routes) → symbol-aware chunking → embed (`text-embedding-3-small`) → Pinecone `saveChunks` → persist `RepositoryFile`/`RepositorySymbol` linked to snapshot. |
| **Hybrid RAG Chat** | `/api/chat` + `/api/chat/stream` (SSE) — keyword pass over Postgres symbols/paths (metadata-filtered Pinecone) merged with semantic vector search. Sources cited as `path:startLine-endLine — symbolName`. Sessions via `ChatSession`/`ChatMessage`. |
| **Living Wiki** | `wiki/planner.ts` proposes only pages with material in the snapshot; `wiki/writer.ts` writes each page from hybrid context (wider `topK`) with guardrails not to invent. `generateWiki` Inngest function writes pages independently (retryable). `freshness: 1.0` + `sourceCommit` anchored to indexed SHA. UI: `/repo/[id]/wiki` + `/wiki/[slug]` (markdown, TOC, freshness badge, sources). |
| **Code Explorer** | `/repo/[id]/explorer` — file tree from `RepositoryFile` (with root-level files fix), filter, breadcrumb, live file fetch via `octokit.repos.getContent` with tree-scan fallback. |
| **Architecture Graph** | `/repo/[id]/architecture` — React Flow (`@xyflow/react`) graph from `dependencies.ts` + `RepositoryRelationship`. |
| **Change Intelligence** | `/repo/[id]/changes` — `ChangeReport` + `Commit` anchored diffs; `processPush` Inngest on GitHub webhook. |
| **Insights & Health** | `/repo/[id]/dashboard` + `/insights` — snapshot counts, `freshness` avg, `StatusBadge`, `MetricCard`/`DashboardMetrics` (Client wrapper fixes RSC `icon` serialization). |
| **Rate limiting & security** | `withRateLimit` (`@upstash/ratelimit` + Redis), `securityHeaders` middleware, `errors.ts` structured handlers, `middleware.ts` auth gate + callback redirects. |
| **Theming & motion** | Semantic CSS-variable tokens (`tailwind.config.ts` + `globals.css`) — dark/light via `theme-toggle`. GSAP (`@gsap/react`) staggered reveals + counter animations in `src/lib/animations/*`. |
| **Observability** | `@sentry/nextjs` (client/edge/server), logging middleware, `EmptyState`/`StatusBadge` UI. |

---

## Stack

`Next.js 15 · React 19 · TypeScript 5 · Tailwind CSS · Prisma 6 · PostgreSQL (Neon) · Pinecone · OpenAI (gpt-4o-mini + text-embedding-3-small) · Inngest · Upstash Redis · Octokit · LangChain · Shiki · GSAP · Sentry · XYFlow`

---

## Quick start

```bash
npm install
cp .env.example .env   # fill values (see below)
npx prisma migrate dev # or prisma migrate deploy in prod
npx prisma generate
npm run dev
```

In a second terminal (background indexing must run):

```bash
npx inngest-cli@latest dev
```

Open http://localhost:3000 → Login with GitHub → Dashboard → Connect repo (`owner/repo`).

### Docker (optional)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up      # dev
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d  # prod
```

Services: `postgres` (16-alpine), `redis` (7-alpine), `app` (runner). See `docker-compose.yml`.

---

## Environment variables

Copy `.env.example` → `.env`. Never commit `.env` (ignored). Backups like `.env.bak`, `*.bak`, `prisma/_bak/` are also ignored — GitHub push protection (GH013) will block pushes containing secrets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Pooler** Postgres URL for the app (`…-pooler…?sslmode=require`). Used at runtime + by `prisma studio`. |
| `DIRECT_URL` | **Direct** Postgres URL for migrations (`…` *without* `-pooler` … `?sslmode=require`). Required — `prisma migrate` fails on the pooler (`P1001`). See `prisma/schema.prisma:directUrl`. |
| `AUTH_SECRET` | `openssl rand -base64 32` — NextAuth encryption. |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app. Callback: `http://localhost:3000/api/auth/callback/github` (add prod URL too). Scopes: `read:user user:email repo`. |
| `GITHUB_TOKEN` | Fallback PAT for indexing unauthenticated / public repos. Signed-in user's own token is preferred (`getGithubTokenForUser`). |
| `OPENAI_API_KEY` | Embeddings + chat. |
| `PINECONE_API_KEY` / `PINECONE_INDEX` | Vector store index (default `git-wiki`). Create before first index. |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Required in prod; local `inngest dev` needs neither. `INNGEST_DEV=1` for local. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (optional local: use docker `redis:6379`). |
| `SENTRY_*` / `NEXT_PUBLIC_SENTRY_DSN` | Optional — Sentry ingestion. |

> **Neon tip — `P1001` can't reach database:**
> - `DATABASE_URL` = pooler host (`…-pooler.c-5…`), `DIRECT_URL` = same host **without** `-pooler.` and with `?sslmode=require`.
> - Do **not** append `&channel_binding=require` — it breaks `libquery-engine` on Prisma 6.19.x even though TCP is open. After any `.env` change run `npx prisma generate` and **restart `next dev`** (Prisma is cached in `globalForPrisma` at boot).

---

## Database & Prisma

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- `prisma/schema.prisma` is the source of truth — Phase 2+ tables (`RepositoryFile`, `RepositorySymbol`, `RepositoryRelationship`, `WikiPage`, `Commit`, `ChangeReport`, etc.) already exist so future features do not need a breaking migration.
- Current migrations: `20260908180611_ndefined`, `20260911051704`, `20260912_codexa_displayname_sessions`, `20260913153012`.
- One bad migration (`20260911092307`) was tombstoned under `prisma/_bak/` (ignored). If you see divergence, `npx prisma migrate status` → `migrate resolve --rolled-back <name>` → `migrate deploy`.

---

## Folder structure

```
prisma/schema.prisma
src/
  lib/
    auth.ts                 NextAuth + PrismaAdapter + getGithubTokenForUser
    prisma.ts               Prisma singleton (globalForPrisma)
    org.ts                  ensurePersonalOrganization
    github.ts               parseRepo, fetchRepoFiles (Octokit, skip dirs/exts, cap 200 files)
    symbolExtractor.ts      Babel AST → RepositorySymbol
    chunker.ts              symbol-aware chunking (fallback: recursive split)
    dependencies.ts         import graph → RepositoryRelationship
    vectorStore.ts          saveChunks, search, searchByVector (metadata filter)
    hybridSearch.ts         keyword (Postgres) + vector (Pinecone) merge
    rag.ts                  askQuestion + citations path:line—symbol
    ratelimit.ts / withRateLimit.ts
    errors.ts               structured error handlers
    wiki/planner.ts         conditional page plan from snapshot signals
    wiki/writer.ts          per-page hybrid context → markdown
    incremental.ts          incremental indexing helpers
    inngest/{client.ts,functions/{indexRepo.ts,generateWiki.ts,processPush.ts}}
    animations/{gsap.ts,reveal.ts,stagger.ts,counters.ts,pageTransitions.ts}
  middleware/securityHeaders.ts
  app/
    page.tsx                landing
    login/page.tsx
    dashboard/{page.tsx,dashboard-client.tsx,connect-repo-form.tsx}
    invite/[token]/page.tsx
    repo/[id]/
      layout.tsx            repo shell + sidebar
      page.tsx              redirect → dashboard
      dashboard/page.tsx    snapshot health (DashboardMetrics client wrapper)
      explorer/{page.tsx,ExplorerClient.tsx}  file tree + live viewer
      architecture/{page.tsx,ArchitectureGraph.tsx}
      changes/{page.tsx,ChangesList.tsx}
      wiki/{page.tsx,[slug]/{page.tsx,wiki-client.tsx}}
      insights/page.tsx  settings/{page.tsx,settings-client.tsx}  integrations/page.tsx
      chat-panel.tsx
    api/
      auth/[...nextauth]/route.ts  inngest/route.ts  health/route.ts
      repositories/{route.ts,[id]/{route.ts,files/route.ts,graph/route.ts,changes/route.ts,reindex/route.ts}}
      chat/{route.ts,stream/route.ts,sessions/{route.ts,[id]/route.ts}}
      organizations/[id]/invites/route.ts  webhooks/github/route.ts
  components/
    app-shell/{repo-sidebar.tsx,top-bar.tsx,command-palette.tsx,theme-toggle.tsx,…}
    repo/{dashboard-metrics.tsx,metric-card.tsx,metric-grid.tsx,repo-header.tsx}
    chat/{chat-input.tsx,chat-message.tsx,session-sidebar.tsx}
    ui/{button,input,badge,card,empty-state,dialog,skeleton,…}
    landing/hero-diagram.tsx
middleware.ts               auth gate + securityHeaders
next.config.mjs             web-tree-sitter externals, ignore-loader for tests
tailwind.config.ts          semantic tokens, typography scale, spacing rhythm
tests/{chunking,dependencies,ratelimit}.test.ts
```

---

## API routes

`GET /api/repositories` · `POST /api/repositories` (connect+index) · `GET/DELETE /api/repositories/[id]` · `GET /api/repositories/[id]/files[?path=]` · `GET /api/repositories/[id]/graph` · `GET /api/repositories/[id]/changes` · `POST /api/repositories/[id]/reindex` · `POST /api/chat` · `POST /api/chat/stream` (SSE, `auth` gated) · `GET/POST /api/chat/sessions` · `PATCH/DELETE /api/chat/sessions/[id]` · `POST/GET /api/organizations/[id]/invites` · `POST /api/webhooks/github` · `POST/PUT /api/inngest` · `GET /api/health`

---

## Testing

```bash
npm test            # jest + ts-jest (tests/setup.ts mocks)
```

Suites: `chunking.test.ts` · `dependencies.test.ts` · `ratelimit.test.ts`. Ignored in prod build via `ignore-loader`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1001 can't reach database … -pooler …:5432` | Migrations need `DIRECT_URL` (direct host, no `-pooler`, `?sslmode=require`). App keeps pooler `DATABASE_URL`. Run `npx prisma generate` + restart `next dev`. Remove `&channel_binding=require` if present. |
| `P3006 migration failed on shadow DB` | Bad/stale migration. `npx prisma migrate status` → `migrate resolve --rolled-back <name>` → `migrate deploy`. Keep `prisma/_bak` ignored. |
| `Only plain objects can be passed to Client Components — icon={FileCode}` | Don't pass component types from Server → Client. Import icons inside the Client component (see `dashboard-metrics.tsx`). |
| Explorer shows `0 files` though snapshot is `COMPLETED` | Fixed: parent for root-level files is `""`, not `slice(0,-1)`. If seen again, check `src/app/api/repositories/[id]/files/route.ts`. |
| `AdapterError / SessionTokenError` after `.env` edit | Restart `next dev` + `inngest dev`. Next caches `DATABASE_URL` at boot via `globalForPrisma`. |
| `GH013 push blocked — secrets` | Never commit `.env*`/`*.bak`/`prisma/_bak`. The repo now ignores them; reset to `origin/master` and rebuild the commit without the file. Rotate any leaked keys. |

---

## Roadmap

- Wiki `freshness` recalculation on drift (Phase 5 Change Intelligence already has `sourceCommit` anchor)
- Incremental indexing (skip unchanged blobs)
- Streaming chat UX polish + multi-agent Planner/Writer split

---

## License

Private — all rights reserved unless a `LICENSE` file is added.

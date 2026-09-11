# Codexa — Phase 1 + 2 + 3

Next.js (App Router, TypeScript) rebuild — Codexa (previously git-wiki-build). Phase 1: authentication,
canonical Postgres/Prisma store, repository connect flow, dashboard, chat. Phase 2:
AST symbol extraction, semantic chunking, hybrid retrieval, line-range citations.
Phase 3: Living Wiki — pages planned per-repo and written from the same hybrid
retrieval, with freshness tracking anchored to the indexed commit.

## Phase 2 — Knowledge Layer

- **Symbol extraction** (`src/lib/symbolExtractor.ts`): Babel-based AST parsing for the
  JS/TS family (`.js .jsx .mjs .cjs .ts .tsx`), extracting functions, classes, methods,
  interfaces, type aliases, and a heuristic pass for Express-style routes
  (`app.get("/login", ...)` → `RepositorySymbol{symbolType: "route"}`). Unsupported
  languages and parse failures degrade gracefully to "no symbols for this file" rather
  than failing the run — the file is still recorded, just without symbols.
- **Semantic chunking** (`src/lib/chunker.ts`): one chunk per top-level symbol, tagged
  with `symbolName` / `symbolType` / `startLine` / `endLine` in Pinecone metadata, plus
  chunks for the gaps between symbols (imports, top-level config) so nothing outside a
  function body is dropped. Files with no extracted symbols fall back to the original
  plain recursive-character split.
- **Canonical storage**: `indexRepo` now writes `RepositoryFile` + `RepositorySymbol`
  rows per indexed file, linked to the snapshot — the symbol graph Phase 4
  (Architecture Explorer) will read from.
- **Hybrid retrieval** (`src/lib/hybridSearch.ts`): pulls identifier-like tokens
  (camelCase/snake_case/paths) out of the question, looks them up against known
  symbols/paths in Postgres, and uses a Pinecone metadata filter to *guarantee* that
  exact match is included in context — merged with normal semantic vector search. So
  "where is `generateToken`?" reliably surfaces that function even if it isn't the
  closest semantic match.
- **Richer citations**: chat answers now cite `path:startLine-endLine — symbolName`
  instead of just a file path.

## Phase 3 — Living Wiki

- **Wiki Planner** (`src/lib/wiki/planner.ts`): looks at what's actually in the indexed
  snapshot — manifest files, path patterns, route/symbol counts — and only proposes
  pages with real material behind them. No `package.json`/`requirements.txt` → no
  Getting Started page. No auth-looking files → no Authentication page. Every repo
  gets Overview and Project Structure; everything else is conditional.
- **Wiki Writer** (`src/lib/wiki/writer.ts`): runs the same hybrid retrieval used by
  chat (wider `topK`) against a per-page query, then asks the LLM to write the page
  using only those sources — told explicitly not to invent behavior that isn't shown.
- **Trigger**: `indexRepo` fires `wiki/generate.requested` as its last step, so a wiki
  regenerates automatically after every (re-)index. `generateWiki` (Inngest function)
  writes each planned page as its own step — one page failing doesn't lose the others,
  and each is independently retryable.
- **Freshness**: every generated page stores `sourceCommit` (now captured from GitHub
  at index time — `RepositorySnapshot.commitSha`) and starts at `freshness: 1.0`.
  Recalculating that score down when source files drift from `sourceCommit` is Phase 5
  (Change Intelligence) — the field and the commit anchor it needs already exist.
- **UI**: repo pages now have Chat / Wiki tabs. Wiki index lists generated pages;
  each page renders as markdown with a sidebar, freshness badge, and a source list
  (`path:startLine-endLine`) at the bottom.

Still not built: Architecture Explorer, Code Explorer, GitHub webhooks, incremental
indexing, dependency-relationship extraction, Change Intelligence itself, streaming
chat, multi-agent split beyond Planner/Writer.

## What's implemented (Phase 1)

- **Auth**: GitHub OAuth via NextAuth v5, Prisma-backed sessions. First sign-in
  auto-creates a personal `Organization` (multi-member orgs are a later phase).
- **Repository connect**: paste `owner/repo` or a GitHub URL → creates a
  `Repository` + `RepositorySnapshot` row → fires the existing indexing pipeline
  as an Inngest background job.
- **Indexing** (`src/lib/inngest/functions/indexRepo.ts`): same steps as the
  original — fetch tree via Octokit, recursive-character chunk, embed, upsert
  to Pinecone — now also writes progress/result into `RepositorySnapshot`
  (`PENDING → RUNNING → COMPLETED/FAILED`) so the UI can poll real status
  instead of guessing.
- **Chat**: `/api/chat` runs the same vector-search + GPT-4o-mini RAG call
  synchronously (not through Inngest — a chat box needs an answer back on the
  same request, which is why this one route diverges from the original's
  event-driven pattern) and persists `ChatSession`/`ChatMessage` rows.
- **Dashboard & repository page**: list connected repos with live status
  badges; open one to chat once indexing completes.

## What's intentionally NOT built yet (later phases per the plan)

- Living Wiki, Architecture Explorer, Code Explorer, Change Intelligence, GitHub
  webhooks, incremental indexing, AST/symbol extraction, hybrid (keyword + graph)
  retrieval, streaming chat responses, multi-agent split, rate limiting, tests.
- The Prisma schema already includes the Phase 2+ tables (`RepositoryFile`,
  `RepositorySymbol`, `RepositoryRelationship`, `WikiPage`, `Commit`,
  `ChangeReport`, ...) so those phases won't require a breaking migration —
  they're just unpopulated for now.
- Organizations are single-member only; there's no invite flow.

## Running it

```bash
npm install
cp .env.example .env      # fill in the values below
npx prisma migrate dev    # creates tables in your Postgres database
npm run dev
```

In a second terminal, run the Inngest dev server so background indexing jobs execute:

```bash
npx inngest-cli@latest dev
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string — the canonical store |
| `AUTH_SECRET` | Random string for NextAuth session encryption (`openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app credentials (callback URL: `http://localhost:3000/api/auth/callback/github`) |
| `GITHUB_TOKEN` | Fallback token for indexing if a signed-in user hasn't granted repo scope |
| `OPENAI_API_KEY` | Embeddings (`text-embedding-3-small`) + chat (`gpt-4o-mini`) |
| `PINECONE_API_KEY` / `PINECONE_INDEX` | Vector projection store — create the index in Pinecone first |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Only required in production; the local `inngest dev` server needs neither |

## Folder structure

```
prisma/schema.prisma          canonical model (Phase 1 tables + Phase 2+ stubs)
src/lib/
  auth.ts                     NextAuth config + getGithubTokenForUser
  prisma.ts                   Prisma client singleton
  org.ts                      personal-organization bootstrap
  github.ts                   ported: parseRepo, fetchRepoFiles
  symbolExtractor.ts          Phase 2: Babel AST symbol extraction, per-language
  chunker.ts                  Phase 2: symbol-aware chunking (was plain recursive split)
  vectorStore.ts              saveChunks, search + searchByVector with metadata filter
  hybridSearch.ts             Phase 2: keyword (Postgres) + vector (Pinecone) merge
  rag.ts                      askQuestion — now uses hybridSearch, structured citations
  wiki/
    planner.ts                Phase 3: decides which wiki pages apply to this repo
    writer.ts                 Phase 3: generates one page's markdown from hybrid context
  inngest/
    client.ts
    functions/
      indexRepo.ts             ported indexRepo, now persists files/symbols, fires wiki gen
      generateWiki.ts          Phase 3: plans + writes + persists wiki pages
src/app/
  page.tsx                    landing
  login/page.tsx              GitHub sign-in
  dashboard/page.tsx          repo list + connect form
  repo/[id]/
    page.tsx                   chat tab
    tabs.tsx                   Chat / Wiki tab bar
    wiki/page.tsx               wiki page list
    wiki/[slug]/page.tsx         wiki page detail (markdown, freshness, sources)
  api/
    auth/[...nextauth]/route.ts
    inngest/route.ts
    repositories/route.ts     GET list / POST connect+index
    repositories/[id]/route.ts
    chat/route.ts
src/components/ui/            button, card, input, status badge
middleware.ts                 protects /dashboard and /repo
```

## Next phase

Phase 4 (Architecture Intelligence) builds on `RepositorySymbol` directly: populate
`RepositoryRelationship` (calls/imports/extends between symbols) during indexing, then
add the Architecture Explorer (React Flow graph) and Code Explorer UI on top of data
this phase already produces.

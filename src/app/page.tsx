import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { HeroDiagram } from "@/components/landing/hero-diagram";

export default async function LandingPage() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  return (
    <div className="min-h-screen bg-background codexa-grid-soft">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">C</span>
            <span className="text-sm font-semibold tracking-tight text-text">Codexa</span>
          </Link>
          <nav className="flex items-center gap-2">
            {loggedIn ? (
              <Link href="/dashboard">
                <Button size="sm">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden text-sm text-text-muted hover:text-text sm:inline">
                  Sign in
                </Link>
                <Link href="/login">
                  <Button size="sm">Connect a repo</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="max-w-2xl codexa-enter">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-text-muted">AI-powered codebase intelligence</p>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-text sm:text-5xl">
            Understand any codebase.
            <br />
            <span className="codexa-neon-text">Instantly.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
            Chat with your codebase, explore its architecture, and build a living understanding of how your software works.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {loggedIn ? (
              <Link href="/dashboard">
                <Button size="lg">Go to dashboard</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="lg">Connect a repo</Button>
              </Link>
            )}
            <span className="text-sm text-text-muted">Free for public repositories · GitHub OAuth</span>
          </div>
        </div>

        <div className="mt-10 hidden justify-center sm:flex">
          <HeroDiagram />
        </div>

        {/* Hero visual — minimal terminal preview */}
        <div className="mt-12 overflow-hidden rounded-xl border border-border bg-surface codexa-hero-glow codexa-card-hover">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-error/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
            <span className="ml-3 font-mono text-xs text-text-muted">codexa — acme/web-app</span>
          </div>
          <div className="space-y-3 p-6 font-mono text-xs leading-relaxed sm:text-sm">
            <p className="text-text-muted">
              <span className="text-text">You:</span> How does authentication work in this repo?
            </p>
            <div className="rounded-lg bg-surface-muted p-4 text-text-muted">
              <p className="text-text">
                Authentication uses NextAuth with the GitHub provider and a Prisma adapter. Sessions are stored in Postgres.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded bg-background px-2 py-1 text-[11px]">src/lib/auth.ts:12–38 — auth</span>
                <span className="rounded bg-background px-2 py-1 text-[11px]">prisma/schema.prisma:18–42 — Session</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <h2 className="text-lg font-medium text-text">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { n: "01", t: "Connect", d: "Connect a GitHub repository. Codexa works with public and private repos you can access." },
              { n: "02", t: "Understand", d: "Codexa indexes the repository and builds a semantic map of code, symbols, and relationships." },
              { n: "03", t: "Explore", d: "Chat with the codebase, inspect architecture, and browse living documentation that stays in sync." },
            ].map((s) => (
              <div key={s.n} className="rounded-lg border border-border bg-surface p-6 codexa-card-hover">
                <p className="font-mono text-xs text-text-muted">{s.n}</p>
                <h3 className="mt-2 text-sm font-medium text-text">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="text-lg font-medium text-text">Everything you need to understand a codebase</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "AI Codebase Chat", d: "Ask questions about unfamiliar code and get answers grounded in the actual repository." },
            { t: "Source-Grounded Answers", d: "Every answer cites the files, lines, and symbols it came from. No hallucinations." },
            { t: "Architecture Intelligence", d: "Explore how parts of the repository connect. See imports, dependencies, and modules." },
            { t: "Living Documentation", d: "Automatically generated wiki that evolves as the repository changes — not a stale README." },
            { t: "Change Intelligence", d: "Understand what changed and what it affects. Know the blast radius before you merge." },
            { t: "Developer Workflow", d: "Question → Code → Evidence → Understanding. Without grepping through hundreds of files." },
          ].map((f) => (
            <div key={f.t} className="rounded-lg border border-border bg-surface p-6 codexa-card-hover">
              <h3 className="text-sm font-medium text-text">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Repository management + multi-session */}
      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-6 codexa-card-hover">
              <h3 className="text-sm font-medium text-text">Repository management</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Connect, open, rename, re-index, and delete repositories from a single dashboard. Full control over what Codexa knows.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2 font-mono text-xs text-text-muted">
                <li className="rounded bg-surface-muted px-2 py-1">Connect</li>
                <li className="rounded bg-surface-muted px-2 py-1">Open</li>
                <li className="rounded bg-surface-muted px-2 py-1">Rename</li>
                <li className="rounded bg-surface-muted px-2 py-1">Re-index</li>
                <li className="rounded bg-surface-muted px-2 py-1">Delete</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-surface p-6 codexa-card-hover">
              <h3 className="text-sm font-medium text-text">Multi-session chat</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Keep investigations separate. Create, rename, switch, delete, and continue previous investigations — pick up where you left off.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2 font-mono text-xs text-text-muted">
                <li className="rounded bg-surface-muted px-2 py-1">New chat</li>
                <li className="rounded bg-surface-muted px-2 py-1">Rename</li>
                <li className="rounded bg-surface-muted px-2 py-1">Switch</li>
                <li className="rounded bg-surface-muted px-2 py-1">Delete</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-base font-medium text-text">Start understanding your codebase</h2>
            <p className="mt-1 text-sm text-text-muted">Connect a repository and ask your first question in under a minute.</p>
          </div>
          <Link href={loggedIn ? "/dashboard" : "/login"}>
            <Button size="lg">{loggedIn ? "Go to dashboard" : "Connect a repo"}</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text">Codexa</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">
              AI-powered codebase intelligence for developers. Chat with your code, explore its architecture, keep its knowledge alive.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <a href="https://github.com/Sameer9823/gitwiki" target="_blank" rel="noopener noreferrer" className="hover:text-text">
              GitHub
            </a>
            <span>© {new Date().getFullYear()} Codexa</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

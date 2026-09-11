import { prisma } from "@/lib/prisma";

export interface PlannedPage {
  slug: string;
  title: string;
  /** Retrieval query used to gather context for the Wiki Writer. */
  query: string;
}

function pathsMatch(paths: string[], pattern: RegExp) {
  return paths.some((p) => pattern.test(p));
}

/**
 * Heuristic planner: looks at what's actually in the repository (file paths,
 * manifest files, extracted symbol types) and only proposes pages that have
 * real material behind them. A repo with no auth-related files gets no
 * Authentication page; a repo with no routes gets no API Reference.
 */
export async function planWikiPages(repositoryId: string, snapshotId: string): Promise<PlannedPage[]> {
  const files = await prisma.repositoryFile.findMany({
    where: { snapshotId },
    select: { path: true, language: true },
  });
  const paths = files.map((f: { path: string }) => f.path);

  const routeCount = await prisma.repositorySymbol.count({
    where: { file: { snapshotId }, symbolType: "route" },
  });

  const hasPackageJson = paths.includes("package.json");
  const hasPythonManifest = pathsMatch(paths, /(^|\/)(requirements\.txt|pyproject\.toml)$/);
  const hasApiLikePaths = pathsMatch(paths, /(^|\/)(routes?|controllers?|api)\//i);
  const hasAuthFiles = pathsMatch(paths, /auth/i);
  const hasSchema = pathsMatch(paths, /(schema\.prisma$|(^|\/)models?\/)/i);
  const hasDeployConfig = pathsMatch(paths, /(^|\/)(Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml)$/i);
  const hasEnvExample = pathsMatch(paths, /\.env(\.example)?$/);
  const totalSymbolCount = await prisma.repositorySymbol.count({ where: { file: { snapshotId } } });

  const pages: PlannedPage[] = [
    {
      slug: "overview",
      title: "Overview",
      query: "What does this project do? Summarize its purpose and main components.",
    },
    {
      slug: "project-structure",
      title: "Project Structure",
      query: "What is the folder and file structure of this project and what does each major directory contain?",
    },
  ];

  if (hasPackageJson || hasPythonManifest) {
    pages.push({
      slug: "getting-started",
      title: "Getting Started",
      query: "How do you install dependencies and run this project locally? What scripts or commands are available?",
    });
  }

  if (totalSymbolCount > 5) {
    pages.push({
      slug: "architecture",
      title: "Architecture",
      query: "What is the overall architecture of this codebase? How do the main modules, services, and layers interact?",
    });
  }

  if (routeCount > 0 || hasApiLikePaths) {
    pages.push({
      slug: "api-reference",
      title: "API Reference",
      query: "What API routes or endpoints does this project expose, and what does each one do?",
    });
  }

  if (hasAuthFiles) {
    pages.push({
      slug: "authentication",
      title: "Authentication",
      query: "How does authentication work in this codebase? Describe login, token/session handling, and where it's implemented.",
    });
  }

  if (hasSchema) {
    pages.push({
      slug: "database",
      title: "Database",
      query: "What is the database schema or data model used by this project? Describe the main entities and their relationships.",
    });
  }

  if (hasEnvExample) {
    pages.push({
      slug: "configuration",
      title: "Configuration",
      query: "What environment variables or configuration does this project require, and what does each control?",
    });
  }

  if (hasDeployConfig) {
    pages.push({
      slug: "deployment",
      title: "Deployment",
      query: "How is this project deployed? Describe the deployment configuration and process.",
    });
  }

  return pages;
}

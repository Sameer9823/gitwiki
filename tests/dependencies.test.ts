// Tests for dependency analysis and impact computation
import { resolveImport, buildImportGraph, computeImpact, findAffectedWikiPages } from "@/lib/dependencies";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repositoryFile: {
      findMany: jest.fn(),
    },
    wikiPage: {
      findMany: jest.fn(),
    },
    repositorySymbol: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

describe("Dependency Analysis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("resolveImport", () => {
    test("resolves relative imports to normalized base (extension resolved by buildImportGraph)", () => {
      expect(resolveImport("src/services/auth.ts", "./user")).toBe("src/services/user");
      expect(resolveImport("src/services/auth.ts", "../utils/helpers")).toBe("src/utils/helpers");
      expect(resolveImport("src/a/b/c.ts", "../../config")).toBe("src/config");
    });

    test("preserves extension-bearing imports", () => {
      expect(resolveImport("src/services/auth.ts", "./models.ts")).toBe("src/services/models.ts");
      expect(resolveImport("src/a.ts", "./b.js")).toBe("src/b.js");
    });

    test("returns null for external packages", () => {
      expect(resolveImport("src/a.ts", "lodash")).toBeNull();
      expect(resolveImport("src/a.ts", "@prisma/client")).toBeNull();
      expect(resolveImport("src/a.ts", "react")).toBeNull();
    });

    test("normalizes paths", () => {
      expect(resolveImport("src/a/b.ts", "./../c")).toBe("src/c");
    });
  });

  describe("resolveImportCandidates", () => {
    test("generates index + extension candidates for bare imports", async () => {
      const { resolveImportCandidates } = await import("@/lib/dependencies");
      const candidates = resolveImportCandidates("src/services/auth.ts", "./user");
      expect(candidates).toContain("src/services/user/index.ts");
      expect(candidates).toContain("src/services/user.ts");
      expect(candidates[0]).toBe("src/services/user/index.ts"); // index tried first
    });

    test("returns single candidate for extension-bearing imports", async () => {
      const { resolveImportCandidates } = await import("@/lib/dependencies");
      expect(resolveImportCandidates("src/a.ts", "./b.ts")).toEqual(["src/b.ts"]);
    });

    test("returns empty for external packages", async () => {
      const { resolveImportCandidates } = await import("@/lib/dependencies");
      expect(resolveImportCandidates("src/a.ts", "lodash")).toEqual([]);
    });
  });

  describe("buildImportGraph", () => {
    test("builds edges from imports", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", imports: ["./b", "lodash"] },
        { path: "src/b/index.ts", imports: ["../c"] },
        { path: "src/c/index.ts", imports: [] },
      ]);

      const edges = await buildImportGraph("snapshot-1");

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({ fromFile: "src/a.ts", toFile: "src/b/index.ts", importSpecifier: "./b" });
      expect(edges).toContainEqual({ fromFile: "src/b/index.ts", toFile: "src/c/index.ts", importSpecifier: "../c" });
    });

    test("ignores external imports", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", imports: ["lodash", "react"] },
      ]);

      const edges = await buildImportGraph("snapshot-1");
      expect(edges).toHaveLength(0);
    });
  });

  describe("computeImpact", () => {
    test("computes transitive importers", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", imports: ["./b"] },
        { path: "src/b/index.ts", imports: ["../c"] },
        { path: "src/c/index.ts", imports: [] },
        { path: "src/d.ts", imports: ["./b"] },
      ]);

      const result = await computeImpact("snapshot-1", ["src/c/index.ts"]);

      expect(result.impactedFiles).toContain("src/c/index.ts");
      expect(result.impactedFiles).toContain("src/b/index.ts");
      expect(result.impactedFiles).toContain("src/a.ts");
      expect(result.impactedFiles).toContain("src/d.ts");
      expect(result.importersByFile["src/c/index.ts"]).toContain("src/b/index.ts");
      expect(result.importersByFile["src/b/index.ts"]).toContain("src/a.ts");
      expect(result.importersByFile["src/b/index.ts"]).toContain("src/d.ts");
    });

    test("respects maxDepth", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", imports: ["./b"] },
        { path: "src/b/index.ts", imports: ["../c"] },
        { path: "src/c/index.ts", imports: ["../d"] },
        { path: "src/d/index.ts", imports: [] },
      ]);

      const result = await computeImpact("snapshot-1", ["src/d/index.ts"], 2);

      // With maxDepth=2: d -> c -> b (depth 2), but not a (depth 3)
      expect(result.impactedFiles).toContain("src/d/index.ts");
      expect(result.impactedFiles).toContain("src/c/index.ts");
      expect(result.impactedFiles).toContain("src/b/index.ts");
      expect(result.impactedFiles).not.toContain("src/a.ts");
    });
  });

  describe("findAffectedWikiPages", () => {
    test("finds pages with overlapping sources", async () => {
      (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
        { slug: "authentication", sources: [{ path: "src/auth/service.ts" }] },
        { slug: "api-reference", sources: [{ path: "src/routes/api.ts" }] },
        { slug: "overview", sources: [{ path: "README.md" }] },
      ]);

      const affected = await findAffectedWikiPages("repo-1", ["src/auth/service.ts", "src/routes/api.ts"]);

      expect(affected).toContain("authentication");
      expect(affected).toContain("api-reference");
      expect(affected).not.toContain("overview");
    });
  });
});
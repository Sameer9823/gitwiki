// Tests for symbol extraction and chunking
import { analyzeFile, hashContent } from "@/lib/symbolExtractor";
import { chunkFiles } from "@/lib/chunker";
import type { RepoFile } from "@/lib/github";

describe("Symbol Extraction", () => {
  test("extracts TypeScript functions and classes", async () => {
    const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}

interface User {
  name: string;
  email: string;
}
`;

    const result = await analyzeFile("src/example.ts", code);

    expect(result.language).toBe("typescript");
    expect(result.symbols).toHaveLength(4); // function, class, method, interface
    expect(result.symbols.find((s) => s.name === "greet")).toBeTruthy();
    expect(result.symbols.find((s) => s.name === "Calculator")).toBeTruthy();
    expect(result.symbols.find((s) => s.name === "add")).toBeTruthy();
    expect(result.symbols.find((s) => s.name === "User")).toBeTruthy();
  });

  test("extracts route definitions", async () => {
    const code = `
import { Router } from "express";
const router = Router();

router.get("/users", getUsers);
router.post("/users", createUser);
`;

    const result = await analyzeFile("src/routes.ts", code);

    expect(result.symbols.some((s) => s.symbolType === "route")).toBe(true);
    expect(result.symbols.find((s) => s.name === "GET /users")).toBeTruthy();
  });

  test("detects language from file extension", async () => {
    expect((await analyzeFile("test.ts", "")).language).toBe("typescript");
    expect((await analyzeFile("test.js", "")).language).toBe("javascript");
    // Python detection is synchronous (no WASM load for the extension check);
    // the WASM is only needed when actually parsing Python content.
    const { detectLanguage } = await import("@/lib/symbolExtractor");
    expect(detectLanguage("test.py")).toBe("python");
  });

  test("generates consistent content hashes", () => {
    const content = "export const x = 1;";
    expect(hashContent(content)).toHaveLength(64); // SHA256 hex
    expect(hashContent(content)).toBe(hashContent(content));
  });
});

describe("Semantic Chunking", () => {
  test("chunks TypeScript file by symbols", async () => {
    const files: RepoFile[] = [
      {
        path: "src/math.ts",
        content: `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

const PI = 3.14159;
`,
      },
    ];

    const result = await chunkFiles(files, "test/repo");

    expect(result).toHaveLength(1);
    expect(result[0].chunks.length).toBeGreaterThan(0);
    expect(result[0].chunks.some((c) => c.metadata.symbolName === "add")).toBe(true);
    expect(result[0].chunks.some((c) => c.metadata.symbolName === "multiply")).toBe(true);
  });

  test("handles files without symbols (fallback to recursive)", async () => {
    const files: RepoFile[] = [
      {
        path: "README.md",
        content: "# Hello\n\nThis is a markdown file without code symbols.\n\n## Section\n\nMore content here.",
      },
    ];

    const result = await chunkFiles(files, "test/repo");

    expect(result).toHaveLength(1);
    expect(result[0].chunks.length).toBeGreaterThan(0);
    // Should not have symbol metadata
    expect(result[0].chunks[0].metadata.symbolName).toBeUndefined();
  });

  test("includes imports in chunked file metadata", async () => {
    const files: RepoFile[] = [
      {
        path: "src/service.ts",
        content: `
import { Database } from "./db";
import { Logger } from "../utils/logger";

export function connect() {
  return new Database();
}
`,
      },
    ];

    const result = await chunkFiles(files, "test/repo");

    expect(result[0].imports).toContain("./db");
    expect(result[0].imports).toContain("../utils/logger");
  });
});
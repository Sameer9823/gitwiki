import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { createHash } from "node:crypto";
import { Parser, Language } from "web-tree-sitter";

// @babel/traverse's ESM/CJS interop is inconsistent across bundlers — normalize once.
const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

export type SymbolType = "function" | "class" | "method" | "interface" | "type" | "route";

export interface ExtractedSymbol {
  name: string;
  symbolType: SymbolType;
  startLine: number;
  endLine: number;
  parentSymbol?: string;
}

export interface FileAnalysis {
  language: string | null;
  contentHash: string;
  symbols: ExtractedSymbol[];
  /** Raw import specifiers (e.g. "./auth.service", "@prisma/client"), for the dependency graph. */
  imports: string[];
}

const EXT_LANGUAGE: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
};

const AST_SUPPORTED = new Set(["javascript", "typescript", "python"]);

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "use"]);
const ROUTER_LIKE_NAMES = /^(app|router|api)$/i;

// Tree-sitter Python parser (lazy-initialized)
let pythonParser: Parser | null = null;
let pythonLanguage: any = null;

async function getPythonParser(): Promise<Parser> {
  if (pythonParser) return pythonParser;
  await Parser.init();
  pythonParser = new Parser();
  
  // Load Python language from the WASM file
  if (!pythonLanguage) {
    pythonLanguage = await Language.load("node_modules/tree-sitter-python/tree-sitter-python.wasm");
  }
  pythonParser.setLanguage(pythonLanguage);
  return pythonParser;
}

function extOf(path: string) {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function detectLanguage(path: string): string | null {
  return EXT_LANGUAGE[extOf(path)] ?? null;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Best-effort symbol extraction. Never throws on unparsable input — a syntax
 * error in one file should degrade to "no symbols for this file", not fail
 * the whole indexing run.
 */
export async function analyzeFile(path: string, content: string): Promise<FileAnalysis> {
  const language = detectLanguage(path);
  const contentHash = hashContent(content);

  if (!language || !AST_SUPPORTED.has(language)) {
    return { language, contentHash, symbols: [], imports: [] };
  }

  try {
    if (language === "python") {
      return analyzePythonFile(content, contentHash);
    }
    // JavaScript/TypeScript path (existing)
    return analyzeJSFile(content, language, contentHash);
  } catch {
    // Parse failure (unsupported syntax, truncated file, etc.) — degrade gracefully.
    return { language, contentHash, symbols: [], imports: [] };
  }
}


function analyzeJSFile(content: string, language: string, contentHash: string): FileAnalysis {
  const ast = parse(content, {
    sourceType: "module",
    plugins: ["typescript", "jsx", "decorators-legacy"],
    errorRecovery: true,
  });

  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const push = (s: ExtractedSymbol) => symbols.push(s);

  traverse(ast, {
    ImportDeclaration(p) {
      imports.add(p.node.source.value);
    },
    FunctionDeclaration(p) {
      if (!p.node.id || !p.node.loc) return;
      push({ name: p.node.id.name, symbolType: "function", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
    VariableDeclarator(p) {
      const init = p.node.init;
      if (!init || !p.node.loc) return;
      if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") return;
      if (p.node.id.type !== "Identifier") return;
      push({ name: p.node.id.name, symbolType: "function", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
    ClassDeclaration(p) {
      if (!p.node.id || !p.node.loc) return;
      push({ name: p.node.id.name, symbolType: "class", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
    ClassMethod(p) {
      if (p.node.key.type !== "Identifier" || !p.node.loc) return;
      const classPath = p.findParent((parent) => parent.isClassDeclaration());
      const parentSymbol = classPath?.isClassDeclaration() ? classPath.node.id?.name : undefined;
      push({
        name: p.node.key.name,
        symbolType: "method",
        startLine: p.node.loc.start.line,
        endLine: p.node.loc.end.line,
        parentSymbol,
      });
    },
    TSInterfaceDeclaration(p) {
      if (!p.node.loc) return;
      push({ name: p.node.id.name, symbolType: "interface", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
    TSTypeAliasDeclaration(p) {
      if (!p.node.loc) return;
      push({ name: p.node.id.name, symbolType: "type", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (!p.node.loc) return;
      // require("...") — CommonJS imports
      if (callee.type === "Identifier" && callee.name === "require") {
        const arg = p.node.arguments[0];
        if (arg?.type === "StringLiteral") imports.add(arg.value);
        return;
      }
      if (callee.type !== "MemberExpression") return;
      if (callee.object.type !== "Identifier" || !ROUTER_LIKE_NAMES.test(callee.object.name)) return;
      if (callee.property.type !== "Identifier" || !ROUTE_METHODS.has(callee.property.name)) return;
      const routePath = p.node.arguments[0];
      const routeLabel =
        routePath && routePath.type === "StringLiteral"
          ? `${callee.property.name.toUpperCase()} ${routePath.value}`
          : `${callee.object.name}.${callee.property.name}(...)`;
      push({ name: routeLabel, symbolType: "route", startLine: p.node.loc.start.line, endLine: p.node.loc.end.line });
    },
  });

  return { language, contentHash, symbols, imports: [...imports] };
}
async function analyzePythonFile(content: string, contentHash: string): Promise<FileAnalysis> {
  const parser = await getPythonParser();
  const tree = parser.parse(content);
  if (!tree) {
    return { language: "python", contentHash, symbols: [], imports: [] };
  }
  const rootNode = tree.rootNode;

  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const push = (s: ExtractedSymbol) => symbols.push(s);

  // Track parent class for method detection
  let currentClass: string | null = null;

  function visit(node: any) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    if (type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const name = nameNode.text;
        const symbolType = currentClass ? "method" : "function";
        push({ name, symbolType, startLine, endLine, parentSymbol: currentClass || undefined });
      }
    } else if (type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const className = nameNode.text;
        push({ name: className, symbolType: "class", startLine, endLine });
        // Visit children with this class as parent
        const prevClass = currentClass;
        currentClass = className;
        for (const child of node.namedChildren) {
          visit(child);
        }
        currentClass = prevClass;
        return; // Skip default traversal since we manually visited children
      }
    } else if (type === "import_statement") {
      // import x, import x.y
      for (const child of node.namedChildren) {
        if (child.type === "dotted_name") {
          imports.add(child.text);
        }
      }
    } else if (type === "import_from_statement") {
      // from x import y
      const moduleNode = node.childForFieldName("module_name");
      if (moduleNode) {
        imports.add(moduleNode.text);
      }
    } else if (type === "decorated_definition") {
      // Handle decorators like @app.route(...)
      const decorator = node.childForFieldName("decorator");
      const definition = node.childForFieldName("definition");
      if (decorator && definition) {
        const decoratorText = decorator.text;
        // Flask @app.route(...)
        const flaskMatch = decoratorText.match(/@(\w+)\.route\(["']([^"']+)["']/);
        if (flaskMatch) {
          const nameNode = definition.childForFieldName("name");
          if (nameNode) {
            push({ name: `GET ${flaskMatch[2]}`, symbolType: "route", startLine, endLine });
          }
        }
        // FastAPI @app.get(...), @app.post(...), etc.
        const fastapiMatch = decoratorText.match(/@(\w+)\.(get|post|put|patch|delete|head|options)\(["']([^"']+)["']/i);
        if (fastapiMatch) {
          const method = fastapiMatch[2].toUpperCase();
          const path = fastapiMatch[3];
          const nameNode = definition.childForFieldName("name");
          if (nameNode) {
            push({ name: `${method} ${path}`, symbolType: "route", startLine, endLine });
          }
        }
        // Django @login_required etc. - just visit the definition
        visit(definition);
      }
    } else {
      // Default: visit all children
      for (const child of node.namedChildren) {
        visit(child);
      }
    }
  }

  visit(rootNode);

  return { language: "python", contentHash, symbols, imports: [...imports] };
}
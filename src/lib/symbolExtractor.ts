import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  go: "go",
  rs: "rust",
  java: "java",
};

const AST_SUPPORTED = new Set(["javascript", "typescript", "python", "go", "rust", "java"]);

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "use"]);
const ROUTER_LIKE_NAMES = /^(app|router|api)$/i;

// Tree-sitter grammars are all loaded the same way (init parser, load a WASM
// grammar, cache both) — the wasm path is the only thing that varies.
const TREE_SITTER_WASM_PATH: Record<string, string> = {
  python: "node_modules/tree-sitter-python/tree-sitter-python.wasm",
  go: "node_modules/tree-sitter-go/tree-sitter-go.wasm",
  rust: "node_modules/tree-sitter-rust/tree-sitter-rust.wasm",
  java: "node_modules/tree-sitter-java/tree-sitter-java.wasm",
};

const treeSitterParsers = new Map<string, Parser>();
const treeSitterLanguages = new Map<string, any>();
let treeSitterInitialized = false;

async function getTreeSitterParser(language: string): Promise<Parser> {
  const cached = treeSitterParsers.get(language);
  if (cached) return cached;

  if (!treeSitterInitialized) {
    await Parser.init();
    treeSitterInitialized = true;
  }

  let grammar = treeSitterLanguages.get(language);
  if (!grammar) {
    const wasmPath = TREE_SITTER_WASM_PATH[language];
    if (!wasmPath) throw new Error(`No tree-sitter grammar configured for language "${language}"`);
    // Language.load(path) does an internal dynamic import("fs/promises") to
    // read the file, which Jest's CJS sandbox rejects ("dynamic import
    // callback was invoked without --experimental-vm-modules"). Reading the
    // bytes ourselves and passing a Uint8Array sidesteps that branch entirely
    // — Language.load() uses the buffer directly with no import() involved.
    const bytes = await readFile(wasmPath);
    grammar = await Language.load(new Uint8Array(bytes));
    treeSitterLanguages.set(language, grammar);
  }

  const parser = new Parser();
  parser.setLanguage(grammar);
  treeSitterParsers.set(language, parser);
  return parser;
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
      return await analyzePythonFile(content, contentHash);
    }
    if (language === "go") {
      return await analyzeGoFile(content, contentHash);
    }
    if (language === "rust") {
      return await analyzeRustFile(content, contentHash);
    }
    if (language === "java") {
      return await analyzeJavaFile(content, contentHash);
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
  const parser = await getTreeSitterParser("python");
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
      // `decorator` is a positional child here, not a named field (only
      // `definition` is) — this previously always found nothing, so no
      // Flask/FastAPI route was ever detected.
      const decorator = (node.namedChildren ?? []).find((c: any) => c.type === "decorator");
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

function textOf(node: any): string {
  return typeof node.text === "string" ? node.text : "";
}

function stripQuotes(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
}

const GO_ROUTE_METHOD_NAMES = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

/**
 * Recursively collect every descendant node of a given type — used where a
 * grammar's wrapping structure varies (e.g. Go wraps multiple imports in an
 * `import_spec_list` but a single import has no wrapper at all).
 */
function collectByType(node: any, type: string, out: any[] = []): any[] {
  if (node.type === type) out.push(node);
  for (const child of node.namedChildren ?? []) {
    collectByType(child, type, out);
  }
  return out;
}

async function analyzeGoFile(content: string, contentHash: string): Promise<FileAnalysis> {
  const parser = await getTreeSitterParser("go");
  const tree = parser.parse(content);
  if (!tree) return { language: "go", contentHash, symbols: [], imports: [] };

  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const push = (s: ExtractedSymbol) => symbols.push(s);

  function receiverTypeName(receiver: any): string | undefined {
    const paramList = receiver?.namedChildren?.[0]; // parameter_declaration
    const typeNode = paramList?.childForFieldName?.("type");
    if (!typeNode) return undefined;
    // `*Server` receivers are wrapped in pointer_type — unwrap to the identifier.
    const identNode = typeNode.type === "pointer_type" ? typeNode.namedChildren?.[0] : typeNode;
    return identNode ? textOf(identNode) : undefined;
  }

  function visit(node: any) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    if (type === "import_declaration") {
      for (const spec of collectByType(node, "import_spec")) {
        const pathNode = spec.childForFieldName("path");
        if (pathNode) imports.add(stripQuotes(textOf(pathNode)));
      }
      return;
    }

    if (type === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) push({ name: textOf(nameNode), symbolType: "function", startLine, endLine });
      // Don't recurse into the body — route calls inside are still worth
      // finding, so fall through to default traversal below instead of returning.
    } else if (type === "method_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const receiver = node.childForFieldName("receiver");
        push({ name: textOf(nameNode), symbolType: "method", startLine, endLine, parentSymbol: receiverTypeName(receiver) });
      }
    } else if (type === "type_declaration") {
      for (const spec of node.namedChildren ?? []) {
        if (spec.type !== "type_spec") continue;
        const nameNode = spec.childForFieldName("name");
        const typeNode = spec.childForFieldName("type");
        if (!nameNode || !typeNode) continue;
        const symbolType: SymbolType = typeNode.type === "interface_type" ? "interface" : typeNode.type === "struct_type" ? "class" : "type";
        push({ name: textOf(nameNode), symbolType, startLine, endLine });
      }
      return;
    } else if (type === "call_expression") {
      const callee = node.childForFieldName("function");
      if (callee?.type === "selector_expression") {
        const operand = callee.childForFieldName("operand");
        const field = callee.childForFieldName("field");
        const fieldName = field ? textOf(field) : "";
        const isRouteCall = fieldName.toLowerCase() === "handlefunc" || GO_ROUTE_METHOD_NAMES.has(fieldName.toLowerCase());
        if (isRouteCall) {
          const args = node.childForFieldName("arguments");
          const firstArg = args?.namedChildren?.[0];
          const routePath = firstArg?.type === "interpreted_string_literal" || firstArg?.type === "raw_string_literal" ? stripQuotes(textOf(firstArg)) : null;
          const label = routePath
            ? `${fieldName.toLowerCase() === "handlefunc" ? "ROUTE" : fieldName.toUpperCase()} ${routePath}`
            : `${operand ? textOf(operand) + "." : ""}${fieldName}(...)`;
          push({ name: label, symbolType: "route", startLine, endLine });
        }
      }
    }

    for (const child of node.namedChildren ?? []) {
      visit(child);
    }
  }

  visit(tree.rootNode);

  return { language: "go", contentHash, symbols, imports: [...imports] };
}

async function analyzeRustFile(content: string, contentHash: string): Promise<FileAnalysis> {
  const parser = await getTreeSitterParser("rust");
  const tree = parser.parse(content);
  if (!tree) return { language: "rust", contentHash, symbols: [], imports: [] };

  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const push = (s: ExtractedSymbol) => symbols.push(s);

  function implTargetName(implNode: any): string | undefined {
    const typeNode = implNode.childForFieldName("type");
    if (!typeNode) return undefined;
    // `impl<T> Foo<T>` wraps the target in generic_type — unwrap to the base name.
    const base = typeNode.type === "generic_type" ? typeNode.childForFieldName("type") : typeNode;
    return base ? textOf(base) : textOf(typeNode);
  }

  function visit(node: any, currentClass?: string) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    if (type === "use_declaration") {
      const argument = node.childForFieldName("argument");
      if (argument) imports.add(textOf(argument));
      return;
    }

    if (type === "function_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        push({
          name: textOf(nameNode),
          symbolType: currentClass ? "method" : "function",
          startLine,
          endLine,
          parentSymbol: currentClass,
        });
      }
      // Nested items inside a function body aren't worth descending into.
      return;
    }

    if (type === "function_signature_item") {
      // Trait method declarations with no body (e.g. `fn handle(&self);`).
      const nameNode = node.childForFieldName("name");
      if (nameNode) push({ name: textOf(nameNode), symbolType: "method", startLine, endLine, parentSymbol: currentClass });
      return;
    }

    if (type === "struct_item" || type === "enum_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) push({ name: textOf(nameNode), symbolType: "class", startLine, endLine });
      return;
    }

    if (type === "trait_item") {
      const nameNode = node.childForFieldName("name");
      const traitName = nameNode ? textOf(nameNode) : undefined;
      if (traitName) push({ name: traitName, symbolType: "interface", startLine, endLine });
      const body = node.childForFieldName("body");
      for (const child of body?.namedChildren ?? []) visit(child, traitName);
      return;
    }

    if (type === "impl_item") {
      const targetName = implTargetName(node);
      const body = node.childForFieldName("body");
      for (const child of body?.namedChildren ?? []) visit(child, targetName);
      return;
    }

    for (const child of node.namedChildren ?? []) {
      visit(child, currentClass);
    }
  }

  visit(tree.rootNode);

  return { language: "rust", contentHash, symbols, imports: [...imports] };
}

const JAVA_MAPPING_ANNOTATION = /@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;

async function analyzeJavaFile(content: string, contentHash: string): Promise<FileAnalysis> {
  const parser = await getTreeSitterParser("java");
  const tree = parser.parse(content);
  if (!tree) return { language: "java", contentHash, symbols: [], imports: [] };

  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const push = (s: ExtractedSymbol) => symbols.push(s);

  function visit(node: any, currentClass?: string) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    if (type === "import_declaration") {
      const path = textOf(node).replace(/^import\s+(static\s+)?/, "").replace(/;\s*$/, "").trim();
      if (path) imports.add(path);
      return;
    }

    if (type === "class_declaration" || type === "interface_declaration" || type === "enum_declaration") {
      const nameNode = node.childForFieldName("name");
      const className = nameNode ? textOf(nameNode) : undefined;
      if (className) {
        push({ name: className, symbolType: type === "interface_declaration" ? "interface" : "class", startLine, endLine });
      }
      const body = node.childForFieldName("body");
      for (const child of body?.namedChildren ?? []) visit(child, className);
      return;
    }

    if (type === "method_declaration" || type === "constructor_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        push({ name: textOf(nameNode), symbolType: "method", startLine, endLine, parentSymbol: currentClass });

        // `modifiers` (which carries annotations like @GetMapping) is a
        // positional child of method_declaration, not a named field.
        const modifiers = (node.namedChildren ?? []).find((c: any) => c.type === "modifiers");
        const modifiersText = modifiers ? textOf(modifiers) : "";
        const match = modifiersText.match(JAVA_MAPPING_ANNOTATION);
        if (match) {
          const verb = match[1].toLowerCase() === "request" ? "MAPPING" : match[1].toUpperCase();
          push({ name: `${verb} ${match[2]}`, symbolType: "route", startLine, endLine });
        }
      }
      return;
    }

    for (const child of node.namedChildren ?? []) {
      visit(child, currentClass);
    }
  }

  visit(tree.rootNode);

  return { language: "java", contentHash, symbols, imports: [...imports] };
}

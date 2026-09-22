// Tests for the new Go/Rust/Java support in src/lib/symbolExtractor.ts.
// Unlike most of this test suite, these exercise the real tree-sitter WASM
// grammars against real code — there's no meaningful way to mock a parser
// and still verify the node-type/field assumptions in the extraction logic.
import { analyzeFile, detectLanguage } from "@/lib/symbolExtractor";

describe("detectLanguage — new extensions", () => {
  test("maps .go, .rs, .java to their languages", () => {
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("src/lib.rs")).toBe("rust");
    expect(detectLanguage("src/Main.java")).toBe("java");
  });
});

describe("analyzeFile — Go", () => {
  const code = `package main

import (
	"fmt"
	"net/http"
)

type Server struct {
	addr string
}

type Handler interface {
	Handle()
}

func (s *Server) Start() error {
	return nil
}

func main() {
	router.GET("/users", getUsers)
	http.HandleFunc("/ping", pingHandler)
	fmt.Println("hi")
}
`;

  test("extracts structs as classes and interfaces as interfaces", async () => {
    const result = await analyzeFile("server.go", code);
    expect(result.language).toBe("go");
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Server", symbolType: "class" }));
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Handler", symbolType: "interface" }));
  });

  test("extracts a pointer-receiver method with its receiver type as parentSymbol", async () => {
    const result = await analyzeFile("server.go", code);
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "Start", symbolType: "method", parentSymbol: "Server" })
    );
  });

  test("extracts a top-level function", async () => {
    const result = await analyzeFile("server.go", code);
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "main", symbolType: "function" }));
  });

  test("extracts imports from a multi-import block", async () => {
    const result = await analyzeFile("server.go", code);
    expect(result.imports).toEqual(expect.arrayContaining(["fmt", "net/http"]));
  });

  test("extracts a single, unparenthesized import", async () => {
    const result = await analyzeFile("main.go", 'package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }\n');
    expect(result.imports).toEqual(["fmt"]);
  });

  test("recognizes router.GET(...) and http.HandleFunc(...) as routes", async () => {
    const result = await analyzeFile("server.go", code);
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "GET /users", symbolType: "route" }));
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "ROUTE /ping", symbolType: "route" }));
  });
});

describe("analyzeFile — Rust", () => {
  const code = `use std::io;
use crate::foo::Bar;

struct Server {
    addr: String,
}

enum Status {
    Up,
    Down,
}

trait Handler {
    fn handle(&self);
}

impl Server {
    fn start(&self) -> Result<(), io::Error> {
        Ok(())
    }
}

fn main() {
    println!("hi");
}
`;

  test("extracts structs and enums as classes, traits as interfaces", async () => {
    const result = await analyzeFile("lib.rs", code);
    expect(result.language).toBe("rust");
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Server", symbolType: "class" }));
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Status", symbolType: "class" }));
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Handler", symbolType: "interface" }));
  });

  test("attributes an impl block's function to the struct it implements", async () => {
    const result = await analyzeFile("lib.rs", code);
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "start", symbolType: "method", parentSymbol: "Server" })
    );
  });

  test("attributes a trait's method signature to the trait", async () => {
    const result = await analyzeFile("lib.rs", code);
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "handle", symbolType: "method", parentSymbol: "Handler" })
    );
  });

  test("extracts a top-level function", async () => {
    const result = await analyzeFile("lib.rs", code);
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "main", symbolType: "function" }));
  });

  test("extracts use-declaration imports as full paths", async () => {
    const result = await analyzeFile("lib.rs", code);
    expect(result.imports).toEqual(expect.arrayContaining(["std::io", "crate::foo::Bar"]));
  });
});

describe("analyzeFile — Java", () => {
  const code = `package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {
    @GetMapping("/users")
    public String getUsers() {
        return "ok";
    }
}

interface Handler {
    void handle();
}
`;

  test("extracts a class and an interface", async () => {
    const result = await analyzeFile("UserController.java", code);
    expect(result.language).toBe("java");
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "UserController", symbolType: "class" }));
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Handler", symbolType: "interface" }));
  });

  test("extracts a method with its enclosing class as parentSymbol", async () => {
    const result = await analyzeFile("UserController.java", code);
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "getUsers", symbolType: "method", parentSymbol: "UserController" })
    );
  });

  test("extracts an abstract interface method with the interface as parentSymbol", async () => {
    const result = await analyzeFile("UserController.java", code);
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "handle", symbolType: "method", parentSymbol: "Handler" })
    );
  });

  test("recognizes @GetMapping as a route", async () => {
    const result = await analyzeFile("UserController.java", code);
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "GET /users", symbolType: "route" }));
  });

  test("extracts imports without the import/static keywords or trailing semicolon", async () => {
    const result = await analyzeFile("UserController.java", code);
    expect(result.imports).toEqual(
      expect.arrayContaining(["org.springframework.web.bind.annotation.GetMapping", "org.springframework.web.bind.annotation.RestController"])
    );
  });
});

describe("analyzeFile — Python (regression: Language.load previously failed silently under Jest)", () => {
  const code = `import os
from typing import Optional

class Server:
    def start(self) -> None:
        pass

@app.route("/users")
def get_users():
    return []
`;

  test("actually extracts symbols instead of silently returning none", async () => {
    // Language.load(path) internally used a dynamic import("fs/promises"),
    // which Jest's CJS sandbox rejects — the whole tree-sitter Python path
    // returned {symbols: [], imports: []} for every file, silently, because
    // analyzeFile's catch-all swallowed the error. Fixed by reading the wasm
    // bytes ourselves (see getTreeSitterParser). This test would have caught it.
    const result = await analyzeFile("server.py", code);
    expect(result.language).toBe("python");
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "Server", symbolType: "class" }));
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "start", symbolType: "method", parentSymbol: "Server" })
    );
    expect(result.symbols).toContainEqual(expect.objectContaining({ name: "get_users", symbolType: "function" }));
    expect(result.imports).toEqual(expect.arrayContaining(["os", "typing"]));
  });
});

describe("analyzeFile — unparsable input degrades gracefully", () => {
  test("Go syntax error yields empty symbols instead of throwing", async () => {
    const result = await analyzeFile("broken.go", "package main\nfunc {{{ not valid go");
    expect(result.language).toBe("go");
    expect(Array.isArray(result.symbols)).toBe(true);
  });
});

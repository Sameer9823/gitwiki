/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    // Include .js/.mjs: @babel/parser & @babel/traverse are ESM-only .js files
    // that must be transpiled to CJS for Jest's default require() runtime.
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        esModuleInterop: true,
        useESM: false,
        isolatedModules: true,
        diagnostics: false,
        tsconfig: { allowJs: true, esModuleInterop: true },
      },
    ],
  },
  transformIgnorePatterns: [
    // All @babel/* packages and their transitive deps are ESM-only; transform them.
    "node_modules/(?!(?:@babel|@langchain|@pinecone-database|@upstash|zod|obug|js-tokens)/)",
  ],
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "!src/lib/inngest/**",
    "!**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000,
};
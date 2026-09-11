// Jest setup file
import { config } from "dotenv";

config({ path: ".env.test" });

// Mock external services
jest.mock("@/lib/vectorStore", () => ({
  saveChunks: jest.fn().mockResolvedValue({ saved: true, chunkCount: 10 }),
  search: jest.fn().mockResolvedValue([]),
  searchByVector: jest.fn().mockResolvedValue([]),
  embedQuery: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

jest.mock("@/lib/github", () => ({
  fetchRepoFiles: jest.fn().mockResolvedValue({
    files: [
      { path: "src/index.ts", content: "export function hello() { return 'world'; }" },
    ],
    defaultBranch: "main",
    commitSha: "abc123",
  }),
  parseRepo: jest.fn((input: string) => {
    const clean = input.replace("https://github.com/", "").replace(".git", "");
    const [owner, repo] = clean.split("/");
    return { owner, repo, repoKey: `${owner}/${repo}` };
  }),
}));

jest.mock("@pinecone-database/pinecone", () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: () => ({
      namespace: () => ({
        upsert: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue({ matches: [] }),
      }),
    }),
  })),
}));

jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]),
  })),
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: "Test response" }),
  })),
}));

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));

jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn().mockResolvedValue({ user: { id: "test-user", name: "Test User" } }),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

jest.mock("next-auth/providers/github", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

// Global test utilities
declare global {
  var testUtils: {
    createMockRepository: () => {
      id: string;
      organizationId: string;
      ownerLogin: string;
      repoName: string;
      fullName: string;
      defaultBranch: string;
      connectedById: string;
    };
    createMockSnapshot: () => {
      id: string;
      repositoryId: string;
      branch: string;
      commitSha: string;
      status: string;
      fileCount: number;
      chunkCount: number;
    };
  };
}

global.testUtils = {
  createMockRepository: () => ({
    id: "repo-1",
    organizationId: "org-1",
    ownerLogin: "test",
    repoName: "repo",
    fullName: "test/repo",
    defaultBranch: "main",
    connectedById: "user-1",
  }),
  createMockSnapshot: () => ({
    id: "snapshot-1",
    repositoryId: "repo-1",
    branch: "main",
    commitSha: "abc123",
    status: "COMPLETED",
    fileCount: 10,
    chunkCount: 100,
  }),
};
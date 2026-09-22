import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repository: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/inngest/client", () => ({
  inngest: { send: jest.fn() },
}));

import { POST } from "@/app/api/webhooks/github/route";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

const SECRET = "test-webhook-secret";

function signedRequest(payload: unknown, eventType: string, secretOverride = SECRET) {
  const body = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", secretOverride).update(body).digest("hex");
  return new NextRequest("https://example.com/api/webhooks/github", {
    method: "POST",
    headers: {
      "x-hub-signature-256": signature,
      "x-github-event": eventType,
      "content-type": "application/json",
    },
    body,
  });
}

describe("GitHub webhook route", () => {
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  test("rejects an invalid signature regardless of event type", async () => {
    const req = signedRequest({ ref: "refs/heads/main" }, "push", "wrong-secret");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  test("ignores an event type it doesn't handle", async () => {
    const req = signedRequest({ some: "payload" }, "issues");
    const res = await POST(req);
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  describe("push events", () => {
    test("queues repo/push.received for a tracked repo", async () => {
      (prisma.repository.findFirst as jest.Mock).mockResolvedValue({ id: "repo-1", organizationId: "org-1" });
      const req = signedRequest(
        {
          ref: "refs/heads/main",
          before: "before-sha",
          head_commit: { id: "head-sha" },
          repository: { owner: { login: "owner" }, name: "repo" },
        },
        "push"
      );

      const res = await POST(req);
      const json = await res.json();

      expect(json).toEqual({ ok: true, queued: true });
      expect(inngest.send).toHaveBeenCalledWith({
        name: "repo/push.received",
        data: {
          repositoryId: "repo-1",
          repoKey: "owner/repo",
          owner: "owner",
          repo: "repo",
          headSha: "head-sha",
          beforeSha: "before-sha",
          branch: "main",
        },
      });
    });

    test("ignores a push to a repo Codexa doesn't track", async () => {
      (prisma.repository.findFirst as jest.Mock).mockResolvedValue(null);
      const req = signedRequest(
        { ref: "refs/heads/main", before: "b", head_commit: { id: "h" }, repository: { owner: { login: "o" }, name: "r" } },
        "push"
      );
      const res = await POST(req);
      expect((await res.json()).ignored).toBe(true);
      expect(inngest.send).not.toHaveBeenCalled();
    });

    test("ignores a tag push", async () => {
      const req = signedRequest(
        { ref: "refs/tags/v1.0.0", before: "b", head_commit: { id: "h" }, repository: { owner: { login: "o" }, name: "r" } },
        "push"
      );
      const res = await POST(req);
      expect((await res.json()).ignored).toBe(true);
      expect(prisma.repository.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("pull_request events", () => {
    const prPayload = (action: string) => ({
      action,
      pull_request: {
        number: 42,
        title: "Add feature X",
        html_url: "https://github.com/owner/repo/pull/42",
        base: { sha: "base-sha" },
        head: { sha: "head-sha" },
      },
      repository: { owner: { login: "owner" }, name: "repo" },
    });

    test("queues repo/pull_request.received on 'opened'", async () => {
      (prisma.repository.findFirst as jest.Mock).mockResolvedValue({ id: "repo-1" });
      const res = await POST(signedRequest(prPayload("opened"), "pull_request"));
      const json = await res.json();

      expect(json).toEqual({ ok: true, queued: true });
      expect(inngest.send).toHaveBeenCalledWith({
        name: "repo/pull_request.received",
        data: {
          repositoryId: "repo-1",
          repoKey: "owner/repo",
          owner: "owner",
          repo: "repo",
          prNumber: 42,
          prTitle: "Add feature X",
          prUrl: "https://github.com/owner/repo/pull/42",
          baseSha: "base-sha",
          headSha: "head-sha",
        },
      });
    });

    test("queues on 'reopened' and 'synchronize' too", async () => {
      (prisma.repository.findFirst as jest.Mock).mockResolvedValue({ id: "repo-1" });
      await POST(signedRequest(prPayload("reopened"), "pull_request"));
      await POST(signedRequest(prPayload("synchronize"), "pull_request"));
      expect(inngest.send).toHaveBeenCalledTimes(2);
    });

    test("ignores actions that aren't new content (labeled, closed, edited)", async () => {
      for (const action of ["labeled", "closed", "edited", "assigned"]) {
        const res = await POST(signedRequest(prPayload(action), "pull_request"));
        expect((await res.json()).ignored).toBe(true);
      }
      expect(inngest.send).not.toHaveBeenCalled();
      expect(prisma.repository.findFirst).not.toHaveBeenCalled();
    });

    test("ignores a PR on a repo Codexa doesn't track", async () => {
      (prisma.repository.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await POST(signedRequest(prPayload("opened"), "pull_request"));
      expect((await res.json()).ignored).toBe(true);
      expect(inngest.send).not.toHaveBeenCalled();
    });
  });
});

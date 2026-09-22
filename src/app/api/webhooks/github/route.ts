import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

const PR_ACTIONS_TO_REVIEW = new Set(["opened", "reopened", "synchronize"]);

export async function POST(req: NextRequest) {
  // 1. Verify signature
  const signature = req.headers.get("x-hub-signature-256");
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("GITHUB_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await req.text();
  const expectedSig = "sha256=" + createHmac("sha256", webhookSecret).update(body).digest("hex");

  let valid = false;
  if (signature && signature.length === expectedSig.length) {
    try {
      valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    console.warn("Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload and dispatch by GitHub's own event-type header — more
  // robust than sniffing payload shape, and required to tell "push" and
  // "pull_request" events apart (both carry a `repository` object).
  const payload = JSON.parse(body);
  const eventType = req.headers.get("x-github-event");

  if (eventType === "push") {
    return handlePush(payload);
  }
  if (eventType === "pull_request") {
    return handlePullRequest(payload);
  }
  return NextResponse.json({ ok: true, ignored: true });
}

async function handlePush(payload: any) {
  if (!payload.ref || !payload.head_commit || !payload.repository) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { ref, head_commit, before, repository } = payload;

  // Only process pushes to branches (not tags)
  if (!ref.startsWith("refs/heads/")) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const branch = ref.replace("refs/heads/", "");
  const owner = repository.owner.login;
  const repo = repository.name;
  const fullName = `${owner}/${repo}`;

  const repoRecord = await prisma.repository.findFirst({
    where: { fullName },
    select: { id: true, organizationId: true },
  });

  if (!repoRecord) {
    console.info(`Push to ${fullName} but not tracked in Codexa`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  await inngest.send({
    name: "repo/push.received",
    data: {
      repositoryId: repoRecord.id,
      repoKey: fullName,
      owner,
      repo,
      headSha: head_commit.id,
      beforeSha: before,
      branch,
    },
  });

  return NextResponse.json({ ok: true, queued: true });
}

async function handlePullRequest(payload: any) {
  if (!payload.pull_request || !payload.repository || !payload.action) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Only review on genuinely new content — not on edits to the PR
  // description, labels, assignment changes, closing, etc.
  if (!PR_ACTIONS_TO_REVIEW.has(payload.action)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { pull_request: pr, repository } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const fullName = `${owner}/${repo}`;

  const repoRecord = await prisma.repository.findFirst({
    where: { fullName },
    select: { id: true },
  });

  if (!repoRecord) {
    console.info(`Pull request on ${fullName} but not tracked in Codexa`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  await inngest.send({
    name: "repo/pull_request.received",
    data: {
      repositoryId: repoRecord.id,
      repoKey: fullName,
      owner,
      repo,
      prNumber: pr.number,
      prTitle: pr.title as string,
      prUrl: pr.html_url as string,
      baseSha: pr.base.sha as string,
      headSha: pr.head.sha as string,
    },
  });

  return NextResponse.json({ ok: true, queued: true });
}
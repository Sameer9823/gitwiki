import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { parseRepo } from "@/lib/github";

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

  // 2. Parse payload
  const payload = JSON.parse(body);

  // We only care about push events
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

  // 3. Find our repository record
  const repoRecord = await prisma.repository.findFirst({
    where: { fullName },
    select: { id: true, organizationId: true },
  });

  if (!repoRecord) {
    console.info(`Push to ${fullName} but not tracked in Codexa`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 4. Send to Inngest for async processing
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
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { indexRepo } from "@/lib/inngest/functions/indexRepo";
import { generateWiki } from "@/lib/inngest/functions/generateWiki";
import { processPush } from "@/lib/inngest/functions/processPush";
import { reindexRepo } from "@/lib/inngest/functions/reindexRepo";
import { recalculateFreshnessCron } from "@/lib/inngest/functions/recalculateFreshnessCron";
import { reviewPullRequest } from "@/lib/inngest/functions/reviewPullRequest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [indexRepo, generateWiki, processPush, reindexRepo, recalculateFreshnessCron, reviewPullRequest],
});

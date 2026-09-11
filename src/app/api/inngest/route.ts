import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { indexRepo } from "@/lib/inngest/functions/indexRepo";
import { generateWiki } from "@/lib/inngest/functions/generateWiki";
import { processPush } from "@/lib/inngest/functions/processPush";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [indexRepo, generateWiki, processPush],
});

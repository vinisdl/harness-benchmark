import { z } from "zod";
import { publicError } from "@/lib/errors";
import { uiMessages } from "@/lib/history";
import { getStore } from "@/lib/store";
import { readConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Invalid conversation." }, { status: 400 });
  try {
    const conversation = getStore().get(id);
    return Response.json(
      conversation
        ? {
            title: conversation.title,
            messages: uiMessages(conversation.history),
            tokens: conversation.tokens,
            budget: conversation.budget,
            warning: conversation.warning,
          }
        : {
            title: "New conversation",
            messages: [],
            tokens: 0,
            budget: readConfig().TOKEN_BUDGET,
            warning: null,
          },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: publicError(undefined) }, { status: 503 });
  }
}

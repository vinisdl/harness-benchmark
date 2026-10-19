import { z } from "zod";
import { store } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  try {
    const row = store().read(id);
    return Response.json(
      {
        messages: row?.ui ?? [],
        title: row?.title ?? "New conversation",
        tokens: row?.tokens ?? 0,
        pending: Boolean(row && row.leaseUntil > Date.now()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load this conversation. Please try again." },
      { status: 503 },
    );
  }
}

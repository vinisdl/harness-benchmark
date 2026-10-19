import { handleChat } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;
export async function POST(request: Request) {
  return handleChat(request);
}

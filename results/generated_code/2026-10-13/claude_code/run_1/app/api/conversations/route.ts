import { getStore } from '@/lib/db/store';
import { errorResponse } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST() {
  try {
    return Response.json(getStore().create(), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

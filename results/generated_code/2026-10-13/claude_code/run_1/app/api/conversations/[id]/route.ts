import { z } from 'zod';
import { getStore } from '@/lib/db/store';
import { AppError, errorResponse } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AppError('invalid_id', 'Choose a valid conversation.');
    return Response.json(getStore().get(id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

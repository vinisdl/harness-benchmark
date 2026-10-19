import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { checkedFetch, loadConversation } from '@/lib/client-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads or creates typed conversation snapshots', async () => {
  const snapshot = {
    id: randomUUID(),
    title: null,
    messages: [],
    tokens: 0,
    budget: 100,
    expiresAt: Date.now() + 1000,
  };
  const fetchMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(snapshot)));
  vi.stubGlobal('fetch', fetchMock);
  expect(await loadConversation()).toEqual(snapshot);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/conversations',
    expect.objectContaining({ method: 'POST', cache: 'no-store' }),
  );
  await loadConversation(snapshot.id);
  expect(fetchMock).toHaveBeenLastCalledWith(
    `/api/conversations/${snapshot.id}`,
    expect.objectContaining({ method: 'GET' }),
  );
});
it('preserves safe API errors and handles network/non-JSON failures', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockRejectedValueOnce(new Error('network details'));
  await expect(checkedFetch('/api')).rejects.toThrow('Check your connection');
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'Friendly error' }, { status: 429 }),
  );
  await expect(checkedFetch('/api')).rejects.toThrow('Friendly error');
  fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));
  await expect(checkedFetch('/api')).rejects.toThrow('could not complete');
  fetchMock.mockResolvedValueOnce(Response.json({ nope: true }));
  await expect(loadConversation()).rejects.toThrow();
});

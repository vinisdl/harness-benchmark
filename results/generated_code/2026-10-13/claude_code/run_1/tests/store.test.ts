import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationStore, type StoreOptions } from '@/lib/db/store';
import { getConfig } from '@/lib/config';
import { historyBytes } from '@/lib/history';

const stores: ConversationStore[] = [];
const dirs: string[] = [];
function store(overrides: Partial<StoreOptions> = {}) {
  const instance = new ConversationStore({
    ...getConfig(),
    databasePath: ':memory:',
    ...overrides,
  });
  stores.push(instance);
  return instance;
}
function exchange(
  instance: ConversationStore,
  id: string,
  number: number,
  tokens = 10,
) {
  const lease = instance.acquire(id, `u${String(number)}`);
  const snapshot = instance.commit(
    lease,
    {
      id: `u${String(number)}`,
      role: 'user',
      content: `Question ${String(number)}`,
    },
    {
      id: `a${String(number)}`,
      role: 'assistant',
      content: `Answer ${String(number)}`,
    },
    tokens,
  );
  instance.release(lease);
  return snapshot;
}
afterEach(() => {
  stores.forEach((instance) => {
    instance.close();
  });
  stores.length = 0;
  dirs.forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
  dirs.length = 0;
});

describe('transactional SQLite persistence', () => {
  it('survives connection restarts and shares data/leases across independent connections', () => {
    const directory = mkdtempSync(join(tmpdir(), 'chat-test-'));
    dirs.push(directory);
    const path = join(directory, 'nested', 'chat.sqlite');
    const first = store({ databasePath: path });
    const second = store({ databasePath: path });
    const conversation = first.create();
    const lease = first.acquire(conversation.id, 'u1');
    expect(() => second.acquire(conversation.id, 'u2')).toThrow('another tab');
    expect(second.get(conversation.id).messages).toEqual([]);
    first.commit(
      lease,
      { id: 'u1', role: 'user', content: 'Hello' },
      { id: 'a1', role: 'assistant', content: 'Hi' },
      22,
    );
    first.setTitle(lease, 'A short greeting', 3);
    first.release(lease);
    expect(second.get(conversation.id)).toMatchObject({
      tokens: 25,
      title: 'A short greeting',
    });
    expect(() => second.acquire(conversation.id, 'u1')).toThrow(
      'already been saved',
    );
    first.close();
    stores.splice(stores.indexOf(first), 1);
    const reopened = store({ databasePath: path });
    expect(
      reopened.get(conversation.id).messages.map((message) => message.content),
    ).toEqual(['Hello', 'Hi']);
  });
  it('stores successful exchanges atomically and never replays failed turns', () => {
    const instance = store();
    const { id } = instance.create();
    const failed = instance.acquire(id, 'failed');
    instance.release(failed, 4);
    expect(instance.get(id)).toMatchObject({ messages: [], tokens: 4 });
    const successful = instance.acquire(id, 'u1');
    expect(successful.history).toEqual([]);
    expect(successful.firstExchange).toBe(true);
    instance.release(successful);
    exchange(instance, id, 1);
    const next = instance.acquire(id, 'u2');
    expect(next.firstExchange).toBe(false);
    expect(next.history).toHaveLength(2);
  });
  it('fences expired workers and allows recovery after a process dies', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const instance = store({ leaseMs: 100 });
    const { id } = instance.create();
    const stale = instance.acquire(id, 'u1');
    vi.spyOn(Date, 'now').mockReturnValue(1101);
    expect(() =>
      instance.commit(
        stale,
        { id: 'u', role: 'user', content: 'Hi' },
        { id: 'a', role: 'assistant', content: 'Hello' },
        1,
      ),
    ).toThrow('timed out');
    const fresh = instance.acquire(id, 'u2');
    instance.release(stale);
    expect(() => instance.acquire(id, 'u3')).toThrow('another tab');
    expect(() => instance.setTitle(stale, 'Old title', 1)).toThrow('timed out');
    instance.release(fresh);
  });
  it('enforces lifetime budget regardless of retained history', () => {
    const instance = store({ tokenBudget: 20, maxMessages: 2 });
    const { id } = instance.create();
    exchange(instance, id, 1, 10);
    exchange(instance, id, 2, 10);
    expect(instance.get(id).messages).toHaveLength(2);
    expect(() => instance.acquire(id, 'u3')).toThrow('token budget');
  });
  it('enforces message and byte bounds without half-exchanges', () => {
    const instance = store({ maxMessages: 4, maxBytes: 250 });
    const { id } = instance.create();
    for (let i = 1; i <= 10; i++) exchange(instance, id, i);
    const snapshot = instance.get(id);
    expect(snapshot.messages.length).toBeLessThanOrEqual(4);
    expect(historyBytes(snapshot.messages)).toBeLessThanOrEqual(250);
    expect(snapshot.messages[0]?.role).toBe('user');
    const lease = instance.acquire(id, 'large');
    expect(() =>
      instance.commit(
        lease,
        { id: 'large', role: 'user', content: 'x'.repeat(500) },
        { id: 'a', role: 'assistant', content: 'No' },
        1,
      ),
    ).toThrow('too large');
    expect(instance.get(id).messages).toEqual(snapshot.messages);
    instance.release(lease);
  });
  it('expires data by TTL and bounds total conversation count', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const instance = store({ ttlMs: 100, maxConversations: 1 });
    const first = instance.create();
    const second = instance.create();
    expect(() => instance.get(first.id)).toThrow('expired');
    const lease = instance.acquire(second.id, 'u');
    expect(() => instance.create()).toThrow('All chat slots');
    instance.release(lease);
    vi.spyOn(Date, 'now').mockReturnValue(1101);
    expect(() => instance.get(second.id)).toThrow('expired');
    expect(() => instance.acquire(second.id, 'u')).toThrow('expired');
    expect(instance.create().messages).toEqual([]);
  });
  it('truncates titles and applies title usage', () => {
    const instance = store();
    const { id } = instance.create();
    const lease = instance.acquire(id, 'u');
    instance.commit(
      lease,
      { id: 'u', role: 'user', content: 'Hi' },
      { id: 'a', role: 'assistant', content: 'Hello' },
      2,
    );
    expect(instance.setTitle(lease, 'x'.repeat(100), 3)).toMatchObject({
      title: 'x'.repeat(80),
      tokens: 5,
    });
    instance.release(lease);
  });
});

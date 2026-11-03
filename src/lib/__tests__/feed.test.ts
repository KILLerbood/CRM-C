import { describe, expect, it } from 'vitest';
import { bucketOf, buildFeed, groupFeed, inFilter } from '../feed';
import { isSnoozed, pruneSnoozes, snoozeUntil } from '../snooze';
import type { Booking, Lead, Task, Thread } from '../../api/schemas';

const NOW = Date.parse('2026-11-03T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const lead = (o: Partial<Lead>) => ({ id: 'L1', business: 'Nour', name: 'Nour', stage: 'عرض مرسل', type: 'محتمل', created: iso(NOW - 30 * 864e5), lastContact: iso(NOW - 1 * 864e5), firstReply: 'x', nextFollowUp: '', ...o }) as unknown as Lead;
const task = (o: Partial<Task>) => ({ id: 'T1', leadId: 'L1', task: 't', due: iso(NOW), status: 'مفتوحة', ...o }) as unknown as Task;
const meet = (o: Partial<Booking>) => ({ id: 'B1', leadId: 'L1', status: 'مؤكد', start: iso(NOW + 3600e3), ...o }) as unknown as Booking;

describe('feed buckets', () => {
  it('puts overdue work and imminent meetings in «now», later work further out', () => {
    expect(bucketOf('task-late', NOW - 864e5, NOW)).toBe('now');
    expect(bucketOf('meet-soon', NOW + 3600e3, NOW)).toBe('now');
    expect(bucketOf('task-today', NOW, NOW)).toBe('today');
    expect(bucketOf('task-later', NOW + 3 * 864e5, NOW)).toBe('week');
    expect(bucketOf('task-later', NOW + 20 * 864e5, NOW)).toBe('later');
  });
  it('builds, orders and groups a mixed feed', () => {
    const items = buildFeed({
      leads: [lead({})],
      tasks: [task({ id: 'late', due: iso(NOW - 2 * 864e5) }), task({ id: 'next', due: iso(NOW + 4 * 864e5) })],
      bookings: [meet({}), meet({ id: 'B2', start: iso(NOW + 2 * 864e5) })],
      threads: [{ id: 'TH1', unread: 2, lastMessageAt: iso(NOW - 60e3), leadId: '' } as unknown as Thread, { id: 'TH2', unread: 0 } as unknown as Thread]
    }, NOW, 7);
    const g = groupFeed(items);
    expect(g.map((x) => x.bucket)).toEqual(['now', 'week']);
    expect(g[0].items.map((i) => i.kind)).toEqual(['meet-soon', 'task-late', 'message']);
    expect(g[1].items.map((i) => i.kind).sort()).toEqual(['meet-later', 'task-later']);
    expect(items.some((i) => i.thread?.id === 'TH2')).toBe(false);
  });
  it('filters by chip', () => {
    const [a] = buildFeed({ leads: [lead({})], tasks: [task({ due: iso(NOW - 864e5) })], bookings: [] }, NOW, 7);
    expect(inFilter(a, 'late')).toBe(true);
    expect(inFilter(a, 'messages')).toBe(false);
    expect(inFilter(a, 'all')).toBe(true);
  });
});

describe('snooze', () => {
  it('knows what is snoozed and prunes the rest', () => {
    const m = { a: NOW + 1000, b: NOW - 1000 };
    expect(isSnoozed(m, 'a', NOW)).toBe(true);
    expect(isSnoozed(m, 'b', NOW)).toBe(false);
    expect(pruneSnoozes(m, NOW)).toEqual({ a: NOW + 1000 });
  });
  it('computes snooze ends', () => {
    expect(snoozeUntil('hours', NOW)).toBe(NOW + 3 * 3600e3);
    expect(new Date(snoozeUntil('tomorrow', NOW)).toISOString()).toBe('2026-11-04T06:00:00.000Z');
    expect(new Date(snoozeUntil('week', NOW)).toISOString()).toBe('2026-11-10T06:00:00.000Z');
  });
});

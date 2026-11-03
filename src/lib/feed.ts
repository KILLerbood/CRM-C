import type { Booking, Lead, Task, Thread } from '../api/schemas';
import { DAY, dayKey, todayKey } from './time';
import { buildNow, NOW_RANK, type NowKind } from './now';

/** The home feed: everything that needs the person, grouped by when it needs them. */
export type FeedKind = NowKind | 'message' | 'meet-later' | 'task-later';
export type FeedBucket = 'now' | 'today' | 'week' | 'later';
export type FeedItem = { key: string; kind: FeedKind; bucket: FeedBucket; at: number; lead?: Lead; booking?: Booking; task?: Task; thread?: Thread };
export const BUCKETS: FeedBucket[] = ['now', 'today', 'week', 'later'];

const RANK: Record<FeedKind, number> = { ...NOW_RANK, message: 3.5, 'meet-later': 5.5, 'task-later': 6.5 };

/** Which group a kind of item belongs to, for items that already exist today (what buildNow returns). */
export function bucketOf(kind: FeedKind, at: number, now: number): FeedBucket {
  switch (kind) {
    case 'meet-soon': case 'meet-outcome': case 'task-late': case 'lead-noreply': case 'message': return 'now';
    case 'follow-up': case 'task-today': return 'today';
    case 'renewal': return at - now <= 7 * DAY ? 'week' : 'later';
    default: {
      const d = dayKey(new Date(at)), t0 = todayKey();
      if (d <= t0) return 'today';
      return at - now <= 7 * DAY ? 'week' : 'later';
    }
  }
}

export function buildFeed(
  data: { leads: Lead[]; tasks: Task[]; bookings: Booking[]; threads?: Thread[] },
  now: number, staleDays: number, horizonDays = 30
): FeedItem[] {
  const byId = new Map(data.leads.map((l) => [l.id, l]));
  const out: FeedItem[] = buildNow(data, now, staleDays).map((n) => ({ ...n, bucket: bucketOf(n.kind, n.at, now) }));
  const t0 = todayKey();
  const limit = now + horizonDays * DAY;
  for (const b of data.bookings) {
    if (b.status !== 'مؤكد') continue;
    const at = Date.parse(b.start);
    if (isNaN(at) || at < now + 3 * 3600e3 || at > limit) continue;
    out.push({ key: 'ml' + b.id, kind: 'meet-later', bucket: bucketOf('meet-later', at, now), at, booking: b, lead: byId.get(b.leadId) });
  }
  for (const x of data.tasks) {
    if (x.status !== 'مفتوحة' || !x.due) continue;
    const at = Date.parse(x.due);
    if (isNaN(at) || dayKey(x.due) <= t0 || at > limit) continue;
    out.push({ key: 'tf' + x.id, kind: 'task-later', bucket: bucketOf('task-later', at, now), at, task: x, lead: byId.get(x.leadId) });
  }
  for (const th of data.threads || []) {
    if (!th.unread) continue;
    out.push({ key: 'u' + th.id, kind: 'message', bucket: 'now', at: Date.parse(th.lastMessageAt) || 0, thread: th, lead: th.leadId ? byId.get(th.leadId) : undefined });
  }
  return out.sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || RANK[a.kind] - RANK[b.kind] || a.at - b.at);
}

export function groupFeed(items: FeedItem[]): { bucket: FeedBucket; items: FeedItem[] }[] {
  return BUCKETS.map((bucket) => ({ bucket, items: items.filter((i) => i.bucket === bucket) })).filter((g) => g.items.length);
}

/** Filter chips: which kinds each chip keeps. */
export type FeedFilter = 'all' | 'late' | 'meetings' | 'leads' | 'messages' | 'stale';
export const FILTER_KINDS: Record<Exclude<FeedFilter, 'all'>, FeedKind[]> = {
  late: ['task-late', 'meet-outcome'],
  meetings: ['meet-soon', 'meet-later', 'meet-outcome'],
  leads: ['lead-noreply'],
  messages: ['message'],
  stale: ['follow-up', 'renewal']
};
export const inFilter = (i: FeedItem, f: FeedFilter) => f === 'all' || FILTER_KINDS[f].includes(i.kind);

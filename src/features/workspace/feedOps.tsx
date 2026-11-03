import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/overlay';
import { PATH } from '../../api/schemas';
import type { FeedItem, FeedKind } from '../../lib/feed';
import { addDays, todayKey } from '../../lib/time';
import { ago, digits, fDT, fDate, fTime, money, rel } from '../../lib/format';
import { leadName } from '../../lib/rules';
import { store } from '../../lib/storage';
import { pruneSnoozes, snoozeUntil, type SnoozeChoice, type SnoozeMap } from '../../lib/snooze';
import { useLeadOps } from '../lead/mutations';
import { useOpenLead } from '../lead/useOpenLead';
import type { Lead } from '../../api/schemas';

export const KIND_ICON: Record<FeedKind, string> = { 'meet-soon': 'video', 'meet-later': 'calendar', 'meet-outcome': 'note', 'task-late': 'alert', 'task-today': 'tasks', 'task-later': 'tasks', 'lead-noreply': 'wa', 'follow-up': 'phone', renewal: 'refresh', message: 'inbox' };
const KEY = 'mg-crm-snooze';

/** Snoozed rows, remembered on this device. */
export function useSnoozes() {
  const [map, setMap] = useState<SnoozeMap>(() => pruneSnoozes(store.json<SnoozeMap>(KEY, {}), Date.now()));
  const write = useCallback((fn: (m: SnoozeMap) => SnoozeMap) => setMap((m) => { const n = fn(m); store.setJson(KEY, n); return n; }), []);
  return { map, set: (key: string, until: number) => write((m) => ({ ...m, [key]: until })), clear: (key: string) => write((m) => { const n = { ...m }; delete n[key]; return n; }) };
}

export const nextStage = (l?: Lead) => { const i = l ? PATH.indexOf(l.stage) : -1; return i >= 0 && i < PATH.length - 2 ? PATH[i + 1] : ''; };

export type Act = { id: string; icon: string; label: string; key?: string; run: () => void; disabled?: boolean; href?: string };

/** What every feed row can do, in one place, so the buttons, the menu and the keyboard all agree. */
export function useFeedOps(snoozes: ReturnType<typeof useSnoozes>, leave: (key: string, then: () => void) => void) {
  const { t, v, lang } = useI18n();
  const actions = useActions();
  const ops = useLeadOps();
  const nav = useNavigate();
  const openLead = useOpenLead();
  const toast = useToast();

  const openIt = (it: FeedItem) => {
    if (it.thread) nav('/inbox/' + it.thread.id);
    else if (it.lead) openLead(it.lead.id, it.booking ? 'log' : it.task ? 'tasks' : undefined);
  };
  const phoneOf = (it: FeedItem) => digits(it.lead?.phone);

  const snooze = (it: FeedItem, choice: SnoozeChoice) => {
    const until = snoozeUntil(choice, Date.now());
    const when = choice === 'hours' ? t('بعد 3 ساعات', 'in 3 hours') : choice === 'tomorrow' ? t('لبكرة الصبح', 'until tomorrow morning') : t('للأسبوع الجاي', 'until next week');
    leave(it.key, () => {
      const l = it.lead;
      if (it.kind === 'follow-up' && l) {
        // A stale deal is snoozed for the whole team, using the real follow-up date.
        const d = addDays(todayKey(), choice === 'hours' ? 1 : choice === 'tomorrow' ? 1 : 7);
        const prev = l.nextFollowUp;
        void ops.save(l, { nextFollowUp: d }, undefined).then((r) => { if (r) toast(t('اتأجّلت ', 'Snoozed ') + '· ' + fDate(d + 'T12:00:00+03:00', lang), { action: { label: t('تراجع', 'Undo'), run: () => { void ops.save(r, { nextFollowUp: prev }); } }, ms: 5000 }); });
        return;
      }
      snoozes.set(it.key, until);
      toast(t('اتأجّلت ', 'Snoozed ') + when, { action: { label: t('تراجع', 'Undo'), run: () => snoozes.clear(it.key) }, ms: 5000 });
    });
  };

  const primary = (it: FeedItem): Act | null => {
    const l = it.lead, b = it.booking, x = it.task;
    switch (it.kind) {
      case 'meet-soon':
        return b?.meetLink ? { id: 'join', icon: 'video', label: t('ادخل', 'Join'), href: b.meetLink, run: () => window.open(b.meetLink, '_blank', 'noopener') } : { id: 'open', icon: 'next', label: t('افتح', 'Open'), run: () => openIt(it) };
      case 'meet-outcome': return { id: 'outcome', icon: 'note', label: t('سجّل النتيجة', 'Log outcome'), run: () => l && openLead(l.id, 'log') };
      case 'meet-later': case 'message': return { id: 'open', icon: it.thread ? 'reply' : 'next', label: it.thread ? t('رد', 'Reply') : t('افتح', 'Open'), run: () => openIt(it) };
      case 'task-late': case 'task-today': case 'task-later':
        return { id: 'done', icon: 'check', label: t('خلّصت', 'Done'), key: 'E', run: () => leave(it.key, () => { void ops.setTask(x!, 'تمت'); }) };
      case 'lead-noreply': return { id: 'wa', icon: 'wa', label: t('رحّب بيه', 'Welcome'), key: 'E', disabled: !l?.phone, run: () => l && actions.compose(l, 'واتساب') };
      case 'follow-up': return l?.stage === 'عرض مرسل' && l.phone ? { id: 'wa', icon: 'wa', label: t('تابع العرض', 'Follow up'), key: 'E', run: () => actions.compose(l, 'واتساب') } : { id: 'log', icon: 'note', label: t('سجّل تواصل', 'Log contact'), key: 'E', run: () => l && actions.logActivity(l) };
      case 'renewal': return { id: 'wa', icon: 'wa', label: t('كلّمه', 'Reach out'), key: 'E', disabled: !l?.phone, run: () => l && actions.compose(l, 'واتساب') };
    }
  };

  const call = (it: FeedItem): Act => ({ id: 'call', icon: 'phone', label: t('اتصل', 'Call'), key: 'C', disabled: !phoneOf(it), href: phoneOf(it) ? 'tel:+' + phoneOf(it) : undefined, run: () => { if (phoneOf(it)) window.location.href = 'tel:+' + phoneOf(it); } });
  const wa = (it: FeedItem): Act => ({ id: 'wa2', icon: 'wa', label: t('واتساب', 'WhatsApp'), key: 'W', disabled: !it.lead?.phone, run: () => it.lead && actions.compose(it.lead, 'واتساب') });
  const advance = (it: FeedItem): Act | null => {
    const n = nextStage(it.lead);
    return n && it.lead ? { id: 'advance', icon: 'stage', label: t('المرحلة الجاية: ', 'Next stage: ') + v(n), key: 'A', run: () => void ops.changeStage(it.lead!, n, { delayed: true }) } : null;
  };
  const noShow = (it: FeedItem): Act | null => (it.booking && it.kind !== 'meet-later' ? { id: 'noshow', icon: 'close', label: t('لم يحضر', 'No-show'), run: () => void ops.updateBooking(it.booking!.id, it.booking!.leadId, { status: 'لم يحضر' }) } : null);
  return { openIt, primary, call, wa, advance, noShow, snooze, ops };
}

/** Row copy: title, one quiet line, and when. */
export function describe(it: FeedItem, now: number, t: (a: string, e: string) => string, v: (s: string) => string, lang: 'ar' | 'en', title: (th: NonNullable<FeedItem['thread']>) => string) {
  const { lead: l, booking: b, task: x, thread: th } = it;
  const person = l ? leadName(l) : '';
  let name = person, sub = '', when = '', late = false, kind = '';
  switch (it.kind) {
    case 'meet-soon': {
      const mins = Math.round((it.at - now) / 60000);
      name = b!.business || b!.name; kind = t('اجتماع', 'Meeting'); sub = [b!.platform, b!.meetingType].filter(Boolean).join(' · ');
      when = mins > 60 ? Math.floor(mins / 60) + t(' س ', 'h ') + (mins % 60) + t(' د', 'm') : mins > 0 ? mins + t(' دقيقة', ' min') : t('شغال دلوقتي', 'Live now');
      break;
    }
    case 'meet-outcome': name = b!.business || b!.name; kind = t('اجتماع من غير نتيجة', 'Meeting without an outcome'); sub = b!.meetingType || ''; when = fDate(b!.start, lang); late = true; break;
    case 'meet-later': name = b!.business || b!.name; kind = t('اجتماع', 'Meeting'); sub = [b!.platform, b!.meetingType].filter(Boolean).join(' · '); when = fDT(b!.start, lang); break;
    case 'task-late': case 'task-today': case 'task-later':
      name = x!.task; kind = it.kind === 'task-late' ? t('متأخرة', 'Overdue') : t('مهمة', 'Task'); sub = person || t('مهمة عامة', 'General task');
      late = it.kind === 'task-late'; when = late ? rel(x!.due, lang) : it.kind === 'task-today' ? fTime(x!.due, lang) : fDT(x!.due, lang); break;
    case 'lead-noreply': kind = t('عميل جديد لسه مارددناش عليه', 'New lead, no reply yet'); sub = l!.source ? v(l!.source) : ''; late = true; when = rel(l!.created, lang); break;
    case 'follow-up': kind = t('محتاج متابعة', 'Needs a follow-up'); sub = v(l!.stage); when = l!.lastContact ? rel(l!.lastContact, lang) : t('ماتواصلناش', 'Not contacted'); break;
    case 'renewal': kind = t('تجديد', 'Renewal'); sub = money(l!.mrr) + t(' ر.س شهريًا', ' SAR/mo'); when = fDate(l!.renewal, lang); break;
    case 'message': name = title(th!); kind = t('رسالة جديدة', 'New message'); sub = th!.lastMessage ? (th!.lastMessage.fromName ? th!.lastMessage.fromName.split(' ')[0] + ': ' : '') + th!.lastMessage.body : ''; when = ago(th!.lastMessageAt, lang); break;
  }
  return { name, sub, when, late, kind };
}

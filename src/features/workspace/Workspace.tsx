import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useNow } from '../../lib/hooks';
import { DAY, dayKey, todayKey } from '../../lib/time';
import { foldAr, leadMatches, money } from '../../lib/format';
import { buildFeed, groupFeed, inFilter, type FeedBucket, type FeedFilter, type FeedItem } from '../../lib/feed';
import { isSnoozed } from '../../lib/snooze';
import { interest, leadName } from '../../lib/rules';
import { ACTIVE, PATH } from '../../api/schemas';
import type { Lead, Thread } from '../../api/schemas';
import { useThreads } from '../../api/queries';
import { Avatar, Chip, Dots, Empty, StatBig, Tip } from '../../components/ui';
import { DayStrip } from '../../components/ScheduleBar';
import { Icon } from '../../components/Icon';
import { QuickCapture } from './NowPanel';
import { FeedRow } from './FeedRow';
import { describe, useFeedOps, useSnoozes } from './feedOps';
import { useOpenLead } from '../lead/useOpenLead';
import { useLeadOps } from '../lead/mutations';

type InterestF = 'all' | 'hot' | 'high' | 'medium' | 'low' | 'none';
const SHOWN: Record<FeedBucket, number> = { now: 12, today: 12, week: 5, later: 4 };

export function Workspace() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const nav = useNavigate();
  const now = useNow(60_000);
  const t0 = todayKey();
  const threads = useThreads();
  const [params] = useSearchParams();
  const openId = params.get('lead');
  const openLead = useOpenLead();
  const ops0 = useLeadOps();
  const snoozes = useSnoozes();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [q, setQ] = useState('');
  const [more, setMore] = useState<Partial<Record<FeedBucket, boolean>>>({});
  const [cursor, setCursor] = useState('');
  const [kbd, setKbd] = useState(false); // the cursor row is only drawn once the keyboard is in use
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [leadF, setLeadF] = useState<InterestF>('all');
  const [showFresh, setShowFresh] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const leave = useCallback((key: string, then: () => void) => {
    setLeaving((s) => new Set(s).add(key));
    window.setTimeout(() => { then(); window.setTimeout(() => setLeaving((s) => { const n = new Set(s); n.delete(key); return n; }), 350); }, 200);
  }, []);
  const ops = useFeedOps(snoozes, leave);

  const threadTitle = (th: Thread) => th.type === 'مباشرة'
    ? (boot.me.isAdmin && th.members[0] !== boot.me.email ? boot.team.find((m) => m.email === th.members[0])?.name || th.members[0] : t('الإدارة', 'Management'))
    : th.type === 'عميل' ? leadName(boot.leads.find((l) => l.id === th.leadId)) || th.title : th.title || v(th.type);

  const all = useMemo(() => buildFeed({ leads: boot.leads, tasks: boot.tasks, bookings: boot.bookings, threads: threads.data?.items }, now, boot.settings.staleDays), [boot, threads.data, now]);
  const live = useMemo(() => all.filter((i) => !isSnoozed(snoozes.map, i.key, now)), [all, snoozes.map, now]);
  const snoozed = all.length - live.length;
  const text = (i: FeedItem) => { const d = describe(i, now, t, v, lang, threadTitle); return foldAr(d.name + ' ' + d.sub + ' ' + d.kind + ' ' + (i.lead ? i.lead.city + ' ' + i.lead.phone : '')); };
  const shown = useMemo(() => live.filter((i) => inFilter(i, filter) && (!q.trim() || text(i).includes(foldAr(q)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, filter, q, lang]);
  const groups = groupFeed(shown);
  const visible = groups.flatMap((g) => (more[g.bucket] || !!q.trim() || filter !== 'all' ? g.items : g.items.slice(0, SHOWN[g.bucket])));
  const count = (f: FeedFilter) => live.filter((i) => inFilter(i, f)).length;

  /* ---------- keyboard: J/K move, Enter opens, E/S/C/W/A act on the row under the cursor ---------- */
  const cur = visible.find((i) => i.key === cursor) || visible[0];
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if ((el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"], [role="menu"]')) return;
      const k = e.key.toLowerCase();
      const idx = cur ? visible.indexOf(cur) : -1;
      const go = (n: number) => { const nx = visible[Math.max(0, Math.min(visible.length - 1, n))]; if (nx) { setCursor(nx.key); listRef.current?.querySelector(`[data-key="${nx.key}"]`)?.scrollIntoView({ block: 'nearest' }); } };
      if (['j', 'k', 'ت', 'ن', 'arrowdown', 'arrowup', 'e', 'ث', 's', 'س', 'c', 'ؤ', 'w', 'ص', 'a', 'ش'].includes(k)) setKbd(true);
      if (k === 'j' || k === 'ت' || k === 'arrowdown') { e.preventDefault(); go(idx + 1); return; }
      if (k === 'k' || k === 'ن' || k === 'arrowup') { e.preventDefault(); go(idx - 1); return; }
      if (!cur) return;
      if ((k === 'enter' && (!el || el === document.body)) || k === 'o' || k === 'خ') { e.preventDefault(); ops.openIt(cur); }
      else if (k === 'e' || k === 'ث') { e.preventDefault(); ops.primary(cur)?.run(); }
      else if (k === 's' || k === 'س') { e.preventDefault(); if (cur.kind !== 'meet-soon' && cur.kind !== 'meet-outcome') { go(idx + 1 < visible.length ? idx + 1 : idx - 1); ops.snooze(cur, 'tomorrow'); } }
      else if (k === 'c' || k === 'ؤ') { e.preventDefault(); if (cur.lead?.phone) ops.call(cur).run(); }
      else if (k === 'w' || k === 'ص') { e.preventDefault(); if (cur.lead?.phone) ops.wa(cur).run(); }
      else if (k === 'a' || k === 'ش') { e.preventDefault(); ops.advance(cur)?.run(); }
    };
    const off = () => setKbd(false);
    window.addEventListener('keydown', on);
    window.addEventListener('pointerdown', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('pointerdown', off); };
  });

  /* ---------- the numbers ---------- */
  const monthStart = t0.slice(0, 8) + '01';
  const prevMonthStart = (() => { const [y, m] = t0.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10); })();
  const inMonth = (iso: string, from: string, to: string) => { const k = dayKey(iso); return !!k && k >= from && k < to; };
  const open = boot.leads.filter((l) => ACTIVE.includes(l.stage));
  const wonNow = boot.leads.filter((l) => inMonth(l.clientSince, monthStart, '9999')).length;
  const wonPrev = boot.leads.filter((l) => inMonth(l.clientSince, prevMonthStart, monthStart)).length;
  const lostAt = (l: Lead) => (l.stage === 'خسرناه' ? l.updated : '');
  const lostNow = boot.leads.filter((l) => inMonth(lostAt(l), monthStart, '9999')).length;
  const lostPrev = boot.leads.filter((l) => inMonth(lostAt(l), prevMonthStart, monthStart)).length;
  const openPrev = boot.leads.filter((l) => ACTIVE.includes(l.stage) && dayKey(l.created) < monthStart).length;

  /* ---------- done today, recent arrivals ---------- */
  const doneToday = boot.tasks.filter((x) => x.status === 'تمت' && dayKey(x.doneAt) === t0);
  const fresh = useMemo(() => boot.leads
    .filter((l) => l.stage !== 'خسرناه' && Date.now() - Date.parse(l.created) < 14 * DAY)
    .filter((l) => leadF === 'all' || interest(l).key === leadF)
    .filter((l) => leadMatches(l, ''))
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created)), [boot.leads, leadF]);
  const freshAll = boot.leads.filter((l) => l.stage !== 'خسرناه' && Date.now() - Date.parse(l.created) < 14 * DAY).length;

  const name = boot.me.name.split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: 'numeric', hour12: false }).format(new Date(now)));
  const meetsToday = boot.bookings.filter((b) => dayKey(b.start) === t0 && b.status === 'مؤكد').length;
  const urgent = live.filter((i) => i.bucket === 'now').length;
  const bucketName: Record<FeedBucket, string> = { now: t('دلوقتي', 'Now'), today: t('النهارده', 'Today'), week: t('الأسبوع ده', 'This week'), later: t('بعدين', 'Later') };
  const chips: [FeedFilter, string][] = [['all', t('الكل', 'All')], ['late', t('متأخر', 'Overdue')], ['meetings', t('اجتماعات', 'Meetings')], ['leads', t('عملاء جداد', 'New')], ['messages', t('رسايل', 'Messages')], ['stale', t('متابعة', 'Follow-ups')]];

  return (
    <div className="feed">
      <header className="feed__head">
        <h1 className="feed__hello display">{hour < 12 ? t('صباح الخير', 'Good morning') : t('مساء الخير', 'Good evening')}{t('، ', ', ')}{name}</h1>
        <p className="feed__sum" aria-live="polite">
          {urgent ? <><b>{urgent}</b>{t(urgent === 1 ? ' حاجة مستنياك دلوقتي' : ' حاجات مستنياك دلوقتي', urgent === 1 ? ' thing needs you now' : ' things need you now')}</> : t('مفيش حاجة مستعجلة دلوقتي', 'Nothing urgent right now')}
          {meetsToday ? <> · <b>{meetsToday}</b>{meetsToday === 1 ? t(' اجتماع النهارده', ' meeting today') : t(' اجتماعات النهارده', ' meetings today')}</> : null}
        </p>
        <div className="hide-sm"><DayStrip boot={boot} /></div>
      </header>

      <QuickCapture />

      <div className="feed__bar">
        <div className="chips chips--scroll" role="group" aria-label={t('فلتر القايمة', 'Filter the feed')}>
          {chips.map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)} n={count(k)}>{l}</Chip>)}
        </div>
        <label className="feed__find search"><Icon name="search" /><span className="sr-only">{t('بحث في القايمة', 'Search the feed')}</span>
          <input className="input input--sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث سريع', 'Quick find')} />
        </label>
      </div>

      <div ref={listRef} className="feed__list">
        {groups.length === 0 ? (
          <div className="feed__empty">
            <Empty icon="check" title={q.trim() || filter !== 'all' ? t('مفيش نتايج بالفلتر ده', 'Nothing matches this filter') : t('كله تمام. مفيش حاجة مستنياك', 'All clear. Nothing is waiting for you')}
              action={q.trim() || filter !== 'all' ? <button className="btn" onClick={() => { setQ(''); setFilter('all'); }}>{t('امسح الفلتر', 'Clear filter')}</button> : <button className="btn" onClick={() => actions.book()}><Icon name="calendar" />{t('احجز اجتماع', 'Book a meeting')}</button>}>
              {q.trim() || filter !== 'all' ? null : t('وقت كويس تتواصل مع عملاء جداد أو تراجع المسار.', 'A good moment to reach out to new leads or review the pipeline.')}
            </Empty>
          </div>
        ) : groups.map((g) => {
          const lim = more[g.bucket] || !!q.trim() || filter !== 'all' ? g.items.length : SHOWN[g.bucket];
          return (
            <section key={g.bucket} className={'fgroup fgroup--' + g.bucket} aria-labelledby={'fg-' + g.bucket}>
              <h2 id={'fg-' + g.bucket} className="fgroup__t display">{bucketName[g.bucket]}<span className="fgroup__n num">{g.items.length}</span></h2>
              <ul className="fgroup__list">
                {g.items.slice(0, lim).map((it) => (
                  <FeedRow key={it.key} it={it} now={now} ops={ops} title={threadTitle}
                    selected={!!it.lead && it.lead.id === openId} cursor={kbd && cur?.key === it.key} leaving={leaving.has(it.key)} onCursor={() => setCursor(it.key)} />
                ))}
              </ul>
              {g.items.length > lim ? <button type="button" className="fgroup__more" onClick={() => setMore((m) => ({ ...m, [g.bucket]: true }))}>{t('اعرض الباقي', 'Show the other ')}{g.items.length - lim}</button> : null}
            </section>
          );
        })}
        {snoozed ? <p className="feed__snoozed muted"><Icon name="history" />{snoozed}{t(' حاجة مؤجّلة', ' snoozed')}<button type="button" onClick={() => all.forEach((i) => snoozes.clear(i.key))}>{t('رجّعهم', 'Bring back')}</button></p> : null}
      </div>

      <section className="fsec" aria-labelledby="fs-fresh">
        <h2 id="fs-fresh" className="fsec__t display">{t('وصلوا حديثًا', 'Recently arrived')}<span className="fgroup__n num">{freshAll}</span>
          <button type="button" className="fsec__btn" aria-expanded={showFresh} onClick={() => setShowFresh((x) => !x)}>{showFresh ? t('اخفي', 'Hide') : t('اعرض', 'Show')}</button>
          <button type="button" className="fsec__btn" onClick={() => nav('/contacts?view=prospects')}>{t('كل العملاء', 'All contacts')}</button>
        </h2>
        {showFresh ? <>
          <div className="chips chips--scroll" role="group" aria-label={t('فلتر الاهتمام', 'Interest filter')}>
            {([['all', t('الكل', 'All')], ['hot', t('🔥 ساخن', '🔥 Hot')], ['high', t('اهتمام عالي', 'High')], ['medium', t('متوسط', 'Medium')], ['low', t('ضعيف', 'Low')], ['none', t('بدون تقييم', 'Not rated')]] as [InterestF, string][]).map(([k, l]) => <Chip key={k} on={leadF === k} onClick={() => setLeadF(k)}>{l}</Chip>)}
          </div>
          <ul className="fgroup__list">
            {fresh.length ? fresh.slice(0, 8).map((l) => (
              <li key={l.id} className={'frow frow--plain' + (openId === l.id ? ' is-open' : '')}>
                <button type="button" className="frow__main" onClick={() => openLead(l.id)}>
                  <Avatar name={leadName(l)} size="sm" />
                  <span className="frow__t"><b>{leadName(l)}</b><small>{[v(l.source), l.city].filter(Boolean).join(' · ') || '—'}</small></span>
                  <span className="frow__when"><Dots lead={l} /></span>
                </button>
              </li>
            )) : <li className="muted feed__none">{t('مفيش عملاء جداد بالفلتر ده', 'No new leads for this filter')}</li>}
          </ul>
        </> : null}
      </section>

      {doneToday.length ? (
        <section className="fsec" aria-labelledby="fs-done">
          <h2 id="fs-done" className="fsec__t display">{t('خلصت النهارده', 'Done today')}<span className="fgroup__n num">{doneToday.length}</span>
            <button type="button" className="fsec__btn" aria-expanded={showDone} onClick={() => setShowDone((x) => !x)}>{showDone ? t('اخفي', 'Hide') : t('اعرض', 'Show')}</button></h2>
          {showDone ? <ul className="fgroup__list">{doneToday.map((x) => (
            <li key={x.id} className="frow frow--plain frow--done">
              <div className="frow__main"><span className="av av--sm"><Icon name="check" size={15} /></span><span className="frow__t"><b>{x.task}</b><small>{x.leadName}</small></span>
                <button type="button" className="fact fact--text" onClick={() => void ops0.setTask(x, 'مفتوحة')}>{t('رجّعها', 'Reopen')}</button></div>
            </li>))}</ul> : null}
        </section>
      ) : null}

      <section className="fsec fsec--nums" aria-label={t('الشهر ده', 'This month')}>
        <div className="nums">
          <StatBig value={open.length} unit={t('صفقة مفتوحة', 'open deals')} delta={open.length - openPrev} deltaLabel={t('عن الشهر اللي فات', 'vs last month')} />
          <StatBig value={wonNow} unit={t('اتكسبت', 'won')} delta={wonNow - wonPrev} deltaLabel={t('عن الشهر اللي فات', 'vs last month')} />
          <StatBig value={lostNow} unit={t('خسرناها', 'lost')} delta={lostNow - lostPrev} invert deltaLabel={t('عن الشهر اللي فات', 'vs last month')} />
        </div>
        <div className="heat" role="list" aria-label={t('المسار دلوقتي', 'Pipeline now')}>
          {PATH.map((s, i) => {
            const list = boot.leads.filter((l) => l.stage === s && !(l.type === 'محتمل' && s === 'جديد'));
            const val = list.reduce((a, l) => a + ((i === 7 ? l.mrr : l.dealValue) || 0), 0);
            return (
              <Tip key={s} label={v(s) + ': ' + list.length + (val ? ' · ' + money(val) + (i === 7 ? t(' ر.س شهريًا', ' SAR/mo') : t(' ر.س', ' SAR')) : '')}>
                <button role="listitem" onClick={() => nav('/contacts?stage=' + encodeURIComponent(s))}>
                  <i style={{ background: `var(--heat-${i})` }} aria-hidden="true" /><b className="num">{list.length}</b><span>{v(s)}</span>
                </button>
              </Tip>
            );
          })}
        </div>
      </section>
    </div>
  );
}

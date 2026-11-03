import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { dayKey, todayKey } from '../../lib/time';
import { fDT, fDate, rel } from '../../lib/format';
import { isLate, leadName } from '../../lib/rules';
import type { Task } from '../../api/schemas';
import { Empty, Seg } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useLeadOps } from '../lead/mutations';
import { useOpenLead } from '../lead/useOpenLead';

type TabK = 'late' | 'today' | 'next' | 'done';

export function Tasks() {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const ops = useLeadOps();
  const openLead = useOpenLead();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabK) || (boot.tasks.some(isLate) ? 'late' : 'today');
  const mine = params.get('mine') === '1';
  const [q, setQ] = useState('');
  const [striking, setStriking] = useState<string[]>([]);
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const leads = useMemo(() => new Map(boot.leads.map((l) => [l.id, l])), [boot.leads]);
  const t0 = todayKey();
  const base = boot.tasks.filter((x) => (!mine || x.owner === boot.me.name) && (!q || (x.task + ' ' + x.leadName + ' ' + leadName(leads.get(x.leadId))).toLowerCase().includes(q.toLowerCase())));
  const groups: Record<TabK, Task[]> = {
    late: base.filter(isLate),
    today: base.filter((x) => x.status === 'مفتوحة' && !isLate(x) && dayKey(x.due) === t0),
    next: base.filter((x) => x.status === 'مفتوحة' && !isLate(x) && dayKey(x.due) > t0),
    done: base.filter((x) => x.status !== 'مفتوحة')
  };
  const list = groups[tab].slice().sort((a, b) => tab === 'done' ? Date.parse(b.doneAt || b.due) - Date.parse(a.doneAt || a.due) : Date.parse(a.due) - Date.parse(b.due));
  const finish = (x: Task) => { setStriking((s) => [...s, x.id]); setTimeout(() => { ops.setTask(x, 'تمت'); setStriking((s) => s.filter((y) => y !== x.id)); }, 560); };

  const row = (x: Task) => {
    const lead = leads.get(x.leadId);
    const open = x.status === 'مفتوحة';
    const when = x.status === 'تمت' ? t('خلصت ', 'Done ') + fDate(x.doneAt, lang) : x.status === 'ملغاة' ? t('ملغاة', 'Cancelled') : isLate(x) ? rel(x.due, lang) + ' · ' + fDT(x.due, lang) : fDT(x.due, lang);
    return (
      <li key={x.id} className={'frow frow--plain trow' + (striking.includes(x.id) ? ' is-leaving' : '') + (isLate(x) ? ' is-late' : '') + (open ? '' : ' frow--done')}>
        {open
          ? <button type="button" className="trow__check" aria-label={t('خلّصت: ', 'Mark done: ') + x.task} onClick={() => finish(x)}><Icon name="check" /></button>
          : <button type="button" className="trow__check is-done" aria-label={t('افتحها تاني: ', 'Reopen: ') + x.task} onClick={() => ops.setTask(x, 'مفتوحة')}><Icon name="check" /></button>}
        <button type="button" className="frow__main" onClick={x.leadId ? () => openLead(x.leadId, 'tasks') : undefined} disabled={!x.leadId}>
          <span className="frow__t"><b>{x.task}</b><small><span>{lead ? leadName(lead) : t('مهمة عامة', 'General task')}</span><span className="frow__sub"> · {x.owner}</span></small></span>
          <span className={'frow__when' + (isLate(x) ? ' late' : '')}>{when}</span>
        </button>
        <Menu.Root>
          <Menu.Trigger asChild><button className="fact trow__more" aria-label={t('إجراءات', 'Actions')}><Icon name="more" /></button></Menu.Trigger>
          <Menu.Portal><Menu.Content className="menu" align="end">
            {open ? <Menu.Item className="menu__item" onSelect={() => ops.setTask(x, 'ملغاة')}><Icon name="x" />{t('إلغاء المهمة', 'Cancel task')}</Menu.Item> : <Menu.Item className="menu__item" onSelect={() => ops.setTask(x, 'مفتوحة')}><Icon name="refresh" />{t('افتحها تاني', 'Reopen')}</Menu.Item>}
            {x.leadId ? <Menu.Item className="menu__item" onSelect={() => openLead(x.leadId)}><Icon name="contacts" />{t('افتح العميل', 'Open client')}</Menu.Item> : null}
          </Menu.Content></Menu.Portal>
        </Menu.Root>
      </li>
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('المهام', 'Tasks')}</h1>
        <span className="grow" />
        <div className="search" style={{ width: 240 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('مهمة أو عميل', 'Task or client')} aria-label={t('بحث', 'Search')} /></div>
        <button className="btn btn--primary" onClick={() => actions.newTask()}><span className="btn__plus"><Icon name="plus" /></span>{t('مهمة جديدة', 'New task')}</button>
      </div>
      <div className="row wrap" style={{ marginBottom: 22 }}>
        <Seg value={tab} onChange={(x) => set('tab', x)} label={t('المهام', 'Tasks')} options={[['late', t('متأخرة', 'Overdue'), groups.late.length], ['today', t('النهارده', 'Today'), groups.today.length], ['next', t('جاية', 'Upcoming'), groups.next.length], ['done', t('خلصت', 'Done'), groups.done.length]]} />
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => set('mine', e.target.checked ? '1' : '')} />{t('مهامي بس', 'Only mine')}</label>
      </div>
      {list.length === 0 ? <div className="card"><Empty title={{ late: t('مفيش مهام متأخرة', 'Nothing overdue'), today: t('مفيش مهام النهارده', 'Nothing due today'), next: t('مفيش مهام جاية', 'Nothing upcoming'), done: t('لسه ماخلصتش مهام', 'Nothing completed yet') }[tab]}>{tab === 'done' ? t('المهام اللي خلصت آخر 30 يوم بتظهر هنا.', 'Tasks completed in the last 30 days show here.') : null}</Empty></div>
        : <ul className="fgroup__list tlist">{list.map(row)}</ul>}
    </div>
  );
}

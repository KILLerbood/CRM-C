import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bootstrap } from '../api/schemas';
import { useI18n } from '../i18n';
import { useNow } from '../lib/hooks';
import { dayKey, todayKey, minutesOfDay } from '../lib/time';
import { fTime } from '../lib/format';
import { leadName } from '../lib/rules';
import { Tip } from './ui';
import { Icon } from './Icon';
import { useOpenLead } from '../features/lead/useOpenLead';

const START = 9 * 60, END = 19 * 60; // the strip covers 9 am – 7 pm Riyadh
const pct = (iso: string | number) => Math.max(1, Math.min(99, ((minutesOfDay(new Date(iso)) - START) / (END - START)) * 100));

/** «Today»: one hairline from 9 to 7 with a dot per meeting or task and a moving «now» mark. */
export function DayStrip({ boot }: { boot: Bootstrap }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const openLead = useOpenLead();
  const now = useNow(60_000);
  const t0 = todayKey();
  const events = useMemo(() => {
    const leads = new Map(boot.leads.map((l) => [l.id, l]));
    const meets = boot.bookings.filter((b) => dayKey(b.start) === t0 && !['ملغي', 'أعيدت جدولته'].includes(b.status))
      .map((b) => ({ id: b.id, at: b.start, leadId: b.leadId, label: b.business || b.name, kind: 'meet' as const }));
    const tasks = boot.tasks.filter((x) => x.status === 'مفتوحة' && dayKey(x.due) === t0)
      .map((x) => ({ id: x.id, at: x.due, leadId: x.leadId, label: x.task + (leads.get(x.leadId) ? ' · ' + leadName(leads.get(x.leadId)) : ''), kind: 'task' as const }));
    return [...meets, ...tasks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [boot, t0]);
  const nowPct = Math.max(0, Math.min(100, ((minutesOfDay(new Date(now)) - START) / (END - START)) * 100));
  const hours = [9, 11, 13, 15, 17, 19];
  const hourLabel = (h: number) => fTime(new Date(Date.UTC(2020, 0, 1, h - 3)), lang).replace(':00', '');
  return (
    <div className="strip" role="group" aria-label={t('جدولك النهارده', 'Your schedule today')}>
      <div className="strip__line">
        <div className="strip__past" style={{ width: nowPct + '%' }} />
        {nowPct > 0 && nowPct < 100 ? <span className="strip__now" style={{ insetInlineStart: nowPct + '%' }} aria-hidden="true" /> : null}
        {events.map((e) => {
          const past = Date.parse(e.at) < now;
          const label = fTime(e.at, lang) + ' · ' + e.label;
          return (
            <Tip key={e.id} label={label}>
              <button type="button" className={'strip__ev strip__ev--' + e.kind + (past ? ' is-past' : '')} style={{ insetInlineStart: pct(e.at) + '%' }}
                aria-label={label} onClick={() => (e.leadId ? openLead(e.leadId) : nav('/tasks'))}>
                {e.kind === 'meet' ? <Icon name="video" /> : null}
              </button>
            </Tip>
          );
        })}
      </div>
      <div className="strip__hours" aria-hidden="true">{hours.map((h) => <span key={h}>{hourLabel(h)}</span>)}</div>
      <button type="button" className="strip__more" onClick={() => nav('/schedule')}>{events.length ? t('الجدول كله', 'Full schedule') : t('يومك فاضي · الجدول', 'Day is clear · Schedule')}<Icon name="next" className="flip" /></button>
    </div>
  );
}

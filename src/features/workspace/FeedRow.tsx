import * as Menu from '@radix-ui/react-dropdown-menu';
import { Avatar, Tip } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import type { FeedItem } from '../../lib/feed';
import { describe, KIND_ICON, type Act } from './feedOps';
import type { SnoozeChoice } from '../../lib/snooze';

type RowOps = {
  openIt: (it: FeedItem) => void;
  primary: (it: FeedItem) => Act | null;
  call: (it: FeedItem) => Act;
  wa: (it: FeedItem) => Act;
  advance: (it: FeedItem) => Act | null;
  noShow: (it: FeedItem) => Act | null;
  snooze: (it: FeedItem, c: SnoozeChoice) => void;
};

function ActBtn({ a, primary }: { a: Act; primary?: boolean }) {
  const label = a.label + (a.key ? ' (' + a.key + ')' : '');
  const cls = primary ? 'fact fact--primary' : 'fact fact--sec';
  const inner = <><Icon name={a.icon} />{primary ? <span>{a.label}</span> : null}</>;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const btn = a.href && !a.disabled
    ? <a className={cls} href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" aria-label={label} onClick={stop}>{inner}</a>
    : <button type="button" className={cls} aria-label={label} disabled={a.disabled} onClick={(e) => { stop(e); a.run(); }}>{inner}</button>;
  return primary ? btn : <Tip label={label}>{btn}</Tip>;
}

export function FeedRow({ it, now, selected, cursor, leaving, ops, onCursor, title }: {
  it: FeedItem; now: number; selected: boolean; cursor: boolean; leaving: boolean; ops: RowOps; onCursor: () => void;
  title: (th: NonNullable<FeedItem['thread']>) => string;
}) {
  const { t, v, lang } = useI18n();
  const d = describe(it, now, t, v, lang, title);
  const prim = ops.primary(it);
  const adv = ops.advance(it);
  const ns = ops.noShow(it);
  const hasLead = !!it.lead;
  const showCall = hasLead && it.kind !== 'message' && !!it.lead!.phone;
  const label = d.name + '. ' + d.kind + (d.sub ? ', ' + d.sub : '') + '. ' + d.when;
  const snoozable = it.kind !== 'meet-soon' && it.kind !== 'meet-outcome';
  return (
    <li className={'frow' + (selected ? ' is-open' : '') + (cursor ? ' is-cursor' : '') + (leaving ? ' is-leaving' : '') + (d.late ? ' is-late' : '') + ' frow--' + it.kind} data-key={it.key}>
      <button type="button" className="frow__main" aria-label={label} aria-current={selected ? 'true' : undefined} onFocus={onCursor} onClick={() => { onCursor(); ops.openIt(it); }}>
        {it.thread || it.lead || it.booking ? <Avatar name={d.name} size="sm" /> : <span className="av av--sm"><Icon name="tasks" size={15} /></span>}
        <span className="frow__t">
          <b>{d.name}</b>
          <small><Icon name={KIND_ICON[it.kind]} className="frow__k" /><span className={d.late ? 'late' : ''}>{d.kind}</span>{d.sub ? <span className="frow__sub"> · {d.sub}</span> : null}<span className="frow__wm"> · {d.when}</span></small>
        </span>
        <span className={'frow__when' + (d.late ? ' late' : '')}>{d.when}</span>
      </button>
      <div className="frow__acts">
        {prim ? <ActBtn a={prim} primary /> : null}
        {showCall ? <ActBtn a={ops.call(it)} /> : null}
        {hasLead && it.kind !== 'lead-noreply' && it.kind !== 'follow-up' && it.kind !== 'renewal' && it.lead!.phone ? <ActBtn a={ops.wa(it)} /> : null}
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="fact" aria-label={t('المزيد', 'More')} onClick={(e) => e.stopPropagation()}><Icon name="more" /></button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="menu" align="end" sideOffset={6} onCloseAutoFocus={(e) => e.preventDefault()}>
              {hasLead ? <Menu.Item className="menu__item" onSelect={() => ops.openIt(it)}><Icon name="user" />{t('افتح العميل', 'Open client')}<kbd className="menu__k">↵</kbd></Menu.Item> : null}
              {showCall ? <Menu.Item className="menu__item" onSelect={ops.call(it).run}><Icon name="phone" />{t('اتصل', 'Call')}<kbd className="menu__k">C</kbd></Menu.Item> : null}
              {hasLead && it.lead!.phone ? <Menu.Item className="menu__item" onSelect={ops.wa(it).run}><Icon name="wa" />{t('واتساب', 'WhatsApp')}<kbd className="menu__k">W</kbd></Menu.Item> : null}
              {adv ? <Menu.Item className="menu__item" onSelect={adv.run}><Icon name="stage" />{adv.label}<kbd className="menu__k">A</kbd></Menu.Item> : null}
              {ns ? <Menu.Item className="menu__item" onSelect={ns.run}><Icon name="close" />{ns.label}</Menu.Item> : null}
              {snoozable ? <>
                <Menu.Separator className="menu__sep" />
                <div className="menu__label">{t('أجّلها', 'Snooze')}</div>
                <Menu.Item className="menu__item" onSelect={() => ops.snooze(it, 'hours')}><Icon name="history" />{t('بعد 3 ساعات', 'In 3 hours')}</Menu.Item>
                <Menu.Item className="menu__item" onSelect={() => ops.snooze(it, 'tomorrow')}><Icon name="history" />{t('لبكرة الصبح', 'Tomorrow morning')}<kbd className="menu__k">S</kbd></Menu.Item>
                <Menu.Item className="menu__item" onSelect={() => ops.snooze(it, 'week')}><Icon name="history" />{t('الأسبوع الجاي', 'Next week')}</Menu.Item>
              </> : null}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </li>
  );
}

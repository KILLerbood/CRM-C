import { useI18n } from '../../i18n';
import { Logo } from '../../components/Logo';

/** The detail pane before anything is open: a quiet cheat-sheet for the feed's keys. */
export function PaneEmpty() {
  const { t } = useI18n();
  const rows: [string[], string][] = [
    [['J', 'K'], t('انزل أو اطلع في القايمة', 'Move down or up')],
    [['↵'], t('افتح العميل هنا', 'Open the client here')],
    [['E'], t('خلّصها (الإجراء الأساسي)', 'Do it (the main action)')],
    [['S'], t('أجّلها لبكرة', 'Snooze until tomorrow')],
    [['C', 'W'], t('اتصل · واتساب', 'Call · WhatsApp')],
    [['A'], t('انقله للمرحلة الجاية', 'Move to the next stage')],
    [['Esc'], t('اقفل التفاصيل', 'Close the details')],
    [['/'], t('بحث وأوامر', 'Search and commands')]
  ];
  return (
    <div className="pane__empty">
      <Logo size={44} />
      <h2 className="display">{t('اختار حاجة من القايمة', 'Pick something from the feed')}</h2>
      <p className="muted">{t('تفاصيلها هتفتح هنا من غير ما تسيب القايمة.', 'Its details open here, without leaving the list.')}</p>
      <dl className="keys keys--plain">
        {rows.map(([k, l]) => <div key={l}><dt>{k.map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{l}</dd></div>)}
      </dl>
    </div>
  );
}

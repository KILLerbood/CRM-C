import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, upsertLead } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/overlay';
import { Icon } from '../../components/Icon';
import { parseQuick } from '../../lib/format';
import { leadName } from '../../lib/rules';
import { useOpenLead } from '../lead/useOpenLead';


/** One-line lead capture: «name phone» then Enter. Everything else can be filled in later. */
export function QuickCapture() {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail, newLead } = useActions();
  const openLead = useOpenLead();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'dup'; text: string; id?: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const { name, phone } = parseQuick(text);
    if (!name) { setMsg({ kind: 'err', text: phone ? t('اكتب اسم النشاط أو الشخص مع الرقم', 'Add the business or contact name next to the number') : t('اكتب اسم العميل (ومعاه رقم الجوال لو موجود)', 'Type the client name (and the phone if you have it)') }); ref.current?.focus(); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.saveLead({ business: name, ...(phone ? { phone } : {}), type: 'محتمل', stage: 'جديد', source: 'تواصل مباشر (Outreach)', service: 'غير محدد', owner: boot.me.name, priority: 'متوسطة' });
      if (!r.ok && r.error === 'duplicate') {
        const visible = !!r.id && boot.leads.some((l) => l.id === r.id);
        setMsg({ kind: 'dup', id: visible ? r.id : undefined, text: visible ? t('موجود قبل كده: ', 'Already exists: ') + (r.name || '') : t('الرقم ده مسجّل عند حد تاني في الفريق', 'This number is registered to someone else on the team') });
      } else {
        upsertLead(qc, r.lead);
        refreshAfterWrite(qc);
        qc.invalidateQueries({ queryKey: qk.boot });
        setText('');
        toast(t('اتضاف ', 'Added ') + leadName(r.lead), { action: r.lead ? { label: t('افتحه', 'Open'), run: () => openLead(r.lead!.id) } : undefined, ms: 5000 });
      }
    } catch (er) { fail(er); }
    setBusy(false);
    ref.current?.focus();
  }

  return (
    <form className="qc" onSubmit={submit} role="search" aria-label={t('إضافة عميل سريعة', 'Quick add a client')}>
      <span className="qc__ic" aria-hidden="true"><Icon name="userplus" /></span>
      <input ref={ref} className="qc__in" value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} enterKeyHint="done" autoComplete="off"
        aria-label={t('اسم العميل والجوال', 'Client name and phone')} aria-invalid={msg?.kind === 'err' || undefined} aria-describedby={msg ? 'qc-msg' : undefined}
        placeholder={t('ضيف عميل: معرض النور 0551234567', 'Add a client: Nour Showroom 0551234567')} />
      <button className="btn btn--hl btn--sm" type="submit" disabled={busy || !text.trim()}>{t('ضيف', 'Add')}</button>
      <button className="btn btn--ghost btn--sm hide-sm" type="button" onClick={newLead}>{t('نموذج كامل', 'Full form')}</button>
      {msg ? <div id="qc-msg" className={'qc__msg qc__msg--' + msg.kind} role="alert">{msg.text}{msg.id ? <button type="button" onClick={() => openLead(msg.id!)}>{t('افتحه', 'Open')}</button> : null}</div> : null}
    </form>
  );
}


import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useBootstrap, usePulse } from '../api/queries';
import { BootCtx } from './boot';
import { ActionsProvider, useActions } from './actions';
import { useI18n } from '../i18n';
import { useTheme } from './theme';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';
import { Avatar, Tip, Skel } from '../components/ui';
import { PaneEmpty } from '../features/workspace/PaneEmpty';
import { NotificationsBell } from '../components/NotificationsPanel';
import { CommandPalette } from '../components/CommandPalette';
import { Shortcuts, Tour, markTourSeen, tourSeen } from '../components/Tour';
import { AnnouncementBanner, UrgentModal } from '../components/Announcements';
import { errorText } from '../api/errors';
import { LostReasonProvider } from '../features/lead/mutations';
import { isLate } from '../lib/rules';
import { useMediaQuery, useOnline } from '../lib/hooks';
import { store } from '../lib/storage';
import type { Bootstrap } from '../api/schemas';
import { api } from '../api/endpoints';
import { refreshDevice } from '../lib/push';

const LeadDrawer = lazy(() => import('../features/lead/LeadView').then((m) => ({ default: m.LeadDrawer })));
const LeadPane = lazy(() => import('../features/lead/LeadView').then((m) => ({ default: m.LeadPane })));

export function Shell() {
  const { t, lang } = useI18n();
  const boot = useBootstrap();
  if (boot.isLoading || (!boot.data && !boot.isError)) return <BootSkeleton />;
  if (!boot.data) {
    return (
      <div className="auth" style={{ gridTemplateColumns: '1fr' }}>
        <div className="auth__box" style={{ maxWidth: 480 }}>
          <h1 className="display">{t('الـ CRM مافتحش', 'The CRM didn’t load')}</h1>
          <p>{errorText(boot.error, lang)}</p>
          <button className="btn btn--primary btn--plain" onClick={() => boot.refetch()}>{t('حمّل تاني', 'Reload')}</button>
        </div>
      </div>
    );
  }
  return (
    <BootCtx.Provider value={boot.data}>
      <LostReasonProvider reasons={boot.data.lists['سبب الخسارة'] || []}>
        <ActionsProvider>
          <ShellFrame boot={boot.data} refreshing={boot.isFetching} onRefresh={() => boot.refetch()} />
        </ActionsProvider>
      </LostReasonProvider>
    </BootCtx.Provider>
  );
}

function ShellFrame({ boot, refreshing, onRefresh }: { boot: Bootstrap; refreshing: boolean; onRefresh: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { theme, pref, setPref } = useTheme();
  const { signOut, authed } = useAuth();
  const actions = useActions();
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const pulse = usePulse(authed);
  const online = useOnline();
  // A new version of the site is downloaded and waiting (see main.tsx).
  const [update, setUpdate] = useState(false);
  // Keep this device's push subscription known to the server (once a day).
  const pushKey = boot.settings.pushKey;
  useEffect(() => { if (pushKey) void refreshDevice(api, pushKey); }, [pushKey]);
  useEffect(() => { const on = () => setUpdate(true); window.addEventListener('mg-update', on); return () => window.removeEventListener('mg-update', on); }, []);
  const [cmdk, setCmdk] = useState(false);
  const [tour, setTour] = useState(false);
  const [keys, setKeys] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const me = boot.me;
  const lateTasks = boot.tasks.filter(isLate).length;
  const unreadMsgs = pulse.data?.unread.messages ?? boot.inbox?.unread ?? 0;
  const unreadAnns = pulse.data?.unread.announcements ?? boot.announcements.filter((a) => !a.seenAt).length;
  const unreadNotifs = pulse.data?.unread.notifications ?? 0;
  const leadId = params.get('lead');
  const closeLead = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('lead'); n.delete('ltab'); return n; });
  const [sideOpen, setSideOpen] = useState(() => store.get('mg-crm-side') === 'open');
  const toggleSide = () => setSideOpen((o) => { store.set('mg-crm-side', o ? 'slim' : 'open'); return !o; });

  // First run: a short tour, once per person per device. It waits until no dialog (e.g. an urgent announcement) is open.
  const myEmail = boot.me.email;
  useEffect(() => {
    if (tourSeen(myEmail)) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries++;
      if (!document.querySelector('[role="dialog"]')) { window.clearInterval(id); setTour(true); }
      else if (tries > 20) window.clearInterval(id);
    }, 1500);
    return () => window.clearInterval(id);
  }, [myEmail]);
  const closeTour = () => { markTourSeen(myEmail); setTour(false); };
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  // Keyboard shortcuts: Ctrl/⌘+K, «/», N, T, M.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') { e.preventDefault(); setCmdk(true); }
      else if (e.key === 'n' || e.key === 'ى') { e.preventDefault(); actions.newLead(); }
      else if (e.key === 't' || e.key === 'ف') { e.preventDefault(); actions.newTask(); }
      else if (e.key === 'm' || e.key === 'ة') { e.preventDefault(); actions.newThread(); }
      else if (e.key === '?' || e.key === '؟') { e.preventDefault(); setKeys(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [actions]);

  const NAV: [string, string, string, number?][] = [
    ['/', 'home', t('الرئيسية', 'Home')],
    ['/schedule', 'calendar', t('الجدول', 'Schedule')],
    ['/contacts', 'contacts', t('جهات الاتصال', 'Contacts')],
    ['/companies', 'building', t('الشركات', 'Companies')],
    ['/tasks', 'tasks', t('المهام', 'Tasks'), lateTasks],
    ['/inbox', 'inbox', t('المحادثات', 'Inbox'), unreadMsgs],
    ['/sales-tools', 'tools', t('أدوات البيع', 'Sales tools')],
    ['/announcements', 'megaphone', t('الإعلانات', 'Announcements'), unreadAnns]
  ];
  const active = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p));
  const tipSide = document.documentElement.dir === 'rtl' ? 'left' : 'right';
  const wide = useMediaQuery('(min-width: 1200px)');
  const home = loc.pathname === '/';
  const paneOn = wide && (!!leadId || home);

  const account = (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button className="avbtn" aria-label={t('قايمة الحساب', 'Account menu')}><Avatar name={me.name} size="sm" /></button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={8}>
          <div className="menu__who">
            <Avatar name={me.name} size="sm" />
            <div style={{ minWidth: 0 }}><b>{me.name}</b><small className="faint ltr">{me.email}</small></div>
          </div>
          <Menu.Separator className="menu__sep" />
          <Menu.Item className="menu__item" onSelect={() => nav('/profile')}><Icon name="user" />{t('حسابي', 'Profile')}</Menu.Item>
          <Menu.Item className="menu__item" onSelect={() => nav('/settings')}><Icon name="settings" />{t('الإعدادات', 'Settings')}</Menu.Item>
          <Menu.Item className="menu__item" onSelect={() => setTour(true)}><Icon name="sparkle" />{t('جولة سريعة', 'Quick tour')}</Menu.Item>
          <Menu.Item className="menu__item" onSelect={() => setKeys(true)}><Icon name="edit" />{t('اختصارات الكيبورد', 'Keyboard shortcuts')}<kbd style={{ marginInlineStart: 'auto' }}>?</kbd></Menu.Item>
          <Menu.Item className="menu__item" onSelect={onRefresh}><Icon name="refresh" />{refreshing ? t('بيتحدّث…', 'Refreshing…') : t('تحديث البيانات', 'Refresh data')}</Menu.Item>
          <Menu.Separator className="menu__sep" />
          <div className="menu__label">{t('المظهر', 'Appearance')}</div>
          {([['light', 'sun', t('فاتح', 'Light')], ['dark', 'moon', t('غامق', 'Dark')], ['auto', 'monitor', t('حسب الجهاز', 'System')]] as const).map(([k, ic, l]) => (
            <Menu.Item key={k} className="menu__item" onSelect={() => setPref(k)}><Icon name={ic} />{l}{pref === k ? <Icon name="check" className="menu__check" /> : null}</Menu.Item>
          ))}
          <Menu.Item className="menu__item" onSelect={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="globe" />{lang === 'ar' ? 'English' : 'العربية'}</Menu.Item>
          {boot.settings.sheetUrl ? <Menu.Item className="menu__item" onSelect={() => window.open(boot.settings.sheetUrl, '_blank', 'noopener')}><Icon name="template" />{t('افتح الشيت', 'Open the sheet')}</Menu.Item> : null}
          <Menu.Separator className="menu__sep" />
          <Menu.Item className="menu__item" onSelect={() => signOut()}><Icon name="logout" />{t('خروج', 'Sign out')}</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );

  return (
    <>
      <button type="button" className="skip" onClick={() => document.getElementById('main')?.focus()}>{t('تخطّى للمحتوى', 'Skip to content')}</button>
      <div className="shell" data-side={sideOpen ? 'open' : 'slim'} data-pane={paneOn ? 'on' : 'off'}>
        <nav className="side" aria-label={t('القائمة الرئيسية', 'Main menu')}>
          <NavLink to="/" className="side__logo" aria-label="Magmafy CRM"><Logo size={32} /><span className="side__brand">Magmafy</span></NavLink>
          <div className="side__nav">
            {NAV.map(([p, ic, label, n]) => (
              <Tip key={p} label={sideOpen ? '' : label} side={tipSide}>
                <NavLink to={p} end={p === '/'} className="side__it" aria-label={label + (n ? ' (' + n + ')' : '')} aria-current={active(p) ? 'page' : undefined}>
                  <span className="side__ic"><Icon name={ic} />{n ? <span className={'dot' + (p === '/tasks' ? ' dot--bad' : '')} aria-hidden="true" /> : null}</span>
                  <span className="side__lbl">{label}</span>
                  {n ? <span className={'side__n' + (p === '/tasks' ? ' side__n--bad' : '')} aria-hidden="true">{n > 99 ? '99+' : n}</span> : null}
                </NavLink>
              </Tip>
            ))}
          </div>
          <div className="side__foot">
            <Tip label={sideOpen ? '' : t('الإعدادات', 'Settings')} side={tipSide}>
              <NavLink to="/settings" className="side__it" aria-label={t('الإعدادات', 'Settings')} aria-current={active('/settings') ? 'page' : undefined}><span className="side__ic"><Icon name="settings" /></span><span className="side__lbl">{t('الإعدادات', 'Settings')}</span></NavLink>
            </Tip>
            <Tip label={sideOpen ? '' : theme === 'dark' ? t('الوضع الفاتح', 'Light mode') : t('الوضع الغامق', 'Dark mode')} side={tipSide}>
              <button type="button" className="side__it" onClick={() => setPref(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t('الوضع الفاتح', 'Light mode') : t('الوضع الغامق', 'Dark mode')}>
                <span className="side__ic"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></span><span className="side__lbl">{theme === 'dark' ? t('الوضع الفاتح', 'Light mode') : t('الوضع الغامق', 'Dark mode')}</span>
              </button>
            </Tip>
            <button type="button" className="side__it side__toggle" onClick={toggleSide} aria-expanded={sideOpen} aria-label={sideOpen ? t('صغّر القايمة', 'Collapse menu') : t('وسّع القايمة', 'Expand menu')}>
              <span className="side__ic"><Icon name="back" className="flip side__chev" /></span><span className="side__lbl">{t('صغّر القايمة', 'Collapse')}</span>
            </button>
          </div>
        </nav>

        <div className="shell__col">
          <header role="banner" className={'topbar' + (scrolled ? ' is-scrolled' : '')}>
            <NavLink to="/" className="topbar__logo show-sm" aria-label="Magmafy CRM"><Logo size={30} /></NavLink>
            <button type="button" className="cmdbtn" onClick={() => setCmdk(true)} aria-label={t('بحث (Ctrl+K)', 'Search (Ctrl+K)')}>
              <Icon name="search" /><span className="cmdbtn__t">{t('ابحث عن عميل أو اكتب أمر', 'Search clients or type a command')}</span><kbd className="cmdbtn__k">Ctrl K</kbd>
            </button>
            <span className="grow" />
            <Menu.Root>
              <Menu.Trigger asChild><button className="btn btn--primary btn--sm newbtn" aria-label={t('جديد', 'New')}><Icon name="plus" /><span className="newbtn__t">{t('جديد', 'New')}</span></button></Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="menu" align="end" sideOffset={8}>
                  <Menu.Item className="menu__item" onSelect={actions.newLead}><Icon name="userplus" />{t('عميل جديد', 'New client')}<kbd className="menu__k">N</kbd></Menu.Item>
                  <Menu.Item className="menu__item" onSelect={() => actions.newTask()}><Icon name="tasks" />{t('مهمة جديدة', 'New task')}<kbd className="menu__k">T</kbd></Menu.Item>
                  <Menu.Item className="menu__item" onSelect={() => actions.book()}><Icon name="calendar" />{t('احجز اجتماع', 'Book a meeting')}</Menu.Item>
                  <Menu.Item className="menu__item" onSelect={actions.newThread}><Icon name="inbox" />{t('رسالة جديدة', 'New message')}<kbd className="menu__k">M</kbd></Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
            <NotificationsBell unread={unreadNotifs} />
            {account}
          </header>

          <div className="shell__banner">
            {!online ? <div className="banner banner--عاجل" role="alert"><span className="pulse-dot" />{t('مفيش نت دلوقتي. البيانات اللي قدامك للقراية بس لحد ما النت يرجع.', 'You’re offline. What you see is read-only until you’re back online.')}</div> : null}
            {update ? (
              <div className="banner" role="status"><Icon name="sparkle" size={16} /><span className="grow">{t('فيه نسخة جديدة من الموقع.', 'A new version is available.')}</span>
                <button className="btn btn--sm btn--primary btn--plain" onClick={() => { navigator.serviceWorker?.getRegistration().then((r) => (r?.waiting ? r.waiting.postMessage('skip') : location.reload())); }}>{t('حدّث', 'Update')}</button></div>
            ) : null}
            <AnnouncementBanner boot={boot} />
          </div>

          <main className="shell__main" id="main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>

        {paneOn ? (
          <aside className="pane" aria-label={t('تفاصيل العميل', 'Client details')}>
            {leadId ? <Suspense fallback={<div className="pane__body"><Skel h={90} /></div>}><LeadPane key={leadId} id={leadId} onClose={closeLead} /></Suspense> : <PaneEmpty />}
          </aside>
        ) : null}
      </div>

      <nav className="bnav" aria-label={t('التنقل', 'Navigation')}>
        {([['/', 'home', t('الرئيسية', 'Home')], ['/contacts', 'contacts', t('العملاء', 'Clients')], ['/tasks', 'tasks', t('المهام', 'Tasks')], ['/inbox', 'inbox', t('المحادثات', 'Chat')], ['/more', 'more', t('المزيد', 'More')]] as const).map(([p, ic, l]) => (
          <NavLink key={p} to={p} end={p === '/'} className="bnav__it" aria-current={active(p) ? 'page' : undefined}>
            <span className="bnav__ic"><Icon name={ic} />{p === '/inbox' && unreadMsgs ? <span className="cnt" aria-hidden="true">{unreadMsgs > 9 ? '9+' : unreadMsgs}</span> : null}{p === '/tasks' && lateTasks ? <span className="cnt cnt--bad" aria-hidden="true">{lateTasks > 9 ? '9+' : lateTasks}</span> : null}</span>
            <span className="bnav__lbl">{l}</span>
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={null}>{leadId && !paneOn ? <LeadDrawer id={leadId} onClose={closeLead} /> : null}</Suspense>
      <CommandPalette boot={boot} open={cmdk} onOpenChange={setCmdk} onAction={(a) => (a === 'lead' ? actions.newLead() : a === 'task' ? actions.newTask() : a === 'message' ? actions.newThread() : a === 'tour' ? setTour(true) : a === 'keys' ? setKeys(true) : actions.editAnnouncement())} />
      <Tour open={tour} onClose={closeTour} />
      <Shortcuts open={keys} onClose={() => setKeys(false)} />
      <UrgentModal pulse={pulse.data} boot={boot} />
    </>
  );
}

function BootSkeleton() {
  return (
    <div className="shell" data-side="slim" data-pane="off">
      <nav className="side"><div className="side__logo"><Logo size={32} /></div></nav>
      <div className="shell__col">
        <header className="topbar"><Skel h={40} w={360} r={10} /></header>
        <main className="shell__main" aria-busy="true">
          <div className="stack" style={{ gap: 18, maxWidth: 720 }}>
            <Skel h={54} w="55%" r={12} />
            <Skel h={20} w="35%" r={8} />
            {[0, 1, 2, 3, 4].map((i) => <Skel key={i} h={64} r={12} />)}
          </div>
        </main>
      </div>
    </div>
  );
}

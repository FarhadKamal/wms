import { useEffect, useState } from 'react';
import { api, COMPANY_LABEL, ROLE_LABEL } from './api';
import { DispatchPage } from './pages/DispatchPage';
import { LayoutPage } from './pages/LayoutPage';
import { MovePage } from './pages/MovePage';
import { OverviewPage } from './pages/OverviewPage';
import { PutAwayPage } from './pages/PutAwayPage';
import { ReceivePage } from './pages/ReceivePage';
import { BoardsPage, ChallansPage, LookupPage, StockPage } from './pages/RecordsPages';
import { SetupPage } from './pages/SetupPage';
import { ChangePassword, UsersPage } from './pages/UsersPage';
import { useWms, WmsProvider } from './wms';

type Page = 'overview' | 'receive' | 'putaway' | 'move' | 'dispatch' | 'layout' | 'boards' | 'setup' | 'stock' | 'lookup' | 'challans' | 'users';
const TITLES: Record<Page, [string, string]> = {
  overview: ['Overview', 'Dashboard'],
  receive: ['Stock movement', 'Receive (IN)'], putaway: ['Stock movement', 'Put-away'], move: ['Stock movement', 'Move between locations'], dispatch: ['Stock movement', 'Dispatch (OUT)'],
  layout: ['Warehouse', 'Layout & Racks'], boards: ['Warehouse', 'Bay Boards'], setup: ['Warehouse', 'Warehouse Setup'],
  stock: ['Records', 'Stock'], lookup: ['Records', 'Scan & Lookup'], challans: ['Records', 'Challans'],
  users: ['Administration', 'Users'],
};
const NAV: Array<[string, Array<[Page, string]>]> = [
  ['Overview', [['overview', '▣ Dashboard']]],
  ['Stock movement', [['receive', '↓ Receive (IN)'], ['putaway', '⇥ Put-away'], ['move', '⇄ Move'], ['dispatch', '↑ Dispatch (OUT)']]],
  ['Warehouse', [['layout', '⊞ Layout & Racks'], ['boards', '▤ Bay Boards'], ['setup', '⚙ Warehouse Setup']]],
  ['Records', [['stock', '☰ Stock'], ['lookup', '⌕ Scan & Lookup'], ['challans', '▤ Challans']]],
  ['Administration', [['users', '👤 Users']]],
];
const MOVEMENT: Page[] = ['receive', 'putaway', 'move', 'dispatch'];

/** Page from the address bar, e.g. #/putaway or #/setup/racks — so pages can be bookmarked. */
function pageFromHash(): Page {
  const p = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return p in TITLES ? (p as Page) : 'overview';
}

function Shell() {
  const { me, can, logout, warehouses, wh, setWh, structure, version } = useWms();
  const allowed = (p: Page) => (MOVEMENT.includes(p) ? can.moveStock : p === 'setup' ? can.setup : p === 'users' ? can.manageUsers : true);
  const [page, setPage] = useState<Page>(() => (allowed(pageFromHash()) ? pageFromHash() : 'overview'));
  const [rackToConfigure, setRackToConfigure] = useState<{ block: string; rack: string } | null>(null);
  const [badges, setBadges] = useState({ putaway: 0, boards: 0 });
  const [menu, setMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const go = (p: Page) => { if (!allowed(p)) return; setRackToConfigure(null); setPage(p); window.location.hash = `/${p}`; window.scrollTo(0, 0); };
  useEffect(() => { api.dashboard(wh).then((d) => setBadges({ putaway: d.staging, boards: d.boardsToUpdate })).catch(() => {}); }, [wh, version]);
  const weightFull = structure?.summary.shelvesAtWeightLimit.length ?? 0;
  const badge: Partial<Record<Page, [number, string]>> = { putaway: [badges.putaway, ''], boards: [badges.boards, ''], layout: [weightFull, 'red'] };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">AZ</div><div><div className="name">Azneo Limited</div><div className="sub">Warehouse System</div></div></div>
        <nav>
          {NAV.map(([group, items]) => {
            const visible = items.filter(([id]) => allowed(id));
            return visible.length ? (
              <div key={group}>
                <div className="nav-label">{group}</div>
                {visible.map(([id, label]) => (
                  <button key={id} className={`nav-btn${page === id ? ' active' : ''}`} onClick={() => go(id)}>
                    {label}{badge[id]?.[0] ? <span className={`nav-badge ${badge[id]![1]}`}>{badge[id]![0]}</span> : null}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="sidebar-foot">
          {structure && <><b>{structure.warehouse.name} warehouse</b><br />{structure.warehouse.address}<br /></>}
          <span style={{ opacity: 0.8 }}>WMS operated by Azneo Limited</span>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div><div className="crumb">{TITLES[page][0]}</div><h1>{TITLES[page][1]}</h1></div>
          <div className="row">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>Warehouse
              <select value={wh} onChange={(e) => setWh(e.target.value)} disabled={warehouses.length < 2}>
                {warehouses.map((w) => <option key={w.code} value={w.code}>{w.name}{w.status === 'PLANNED' ? ' (planned)' : ''}</option>)}
              </select>
            </label>
            <div className="user-menu">
              <button className="user-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>
                <span className="avatar">{me.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span style={{ textAlign: 'left', lineHeight: 1.25 }}><b>{me.fullName}</b><br /><span className="note">{ROLE_LABEL[me.role]} · {COMPANY_LABEL[me.company]}</span></span>
              </button>
              {menu && (
                <div className="user-pop" onMouseLeave={() => setMenu(false)}>
                  <button className="nav-btn" onClick={() => { setMenu(false); setPwOpen(true); }}>Change password</button>
                  <button className="nav-btn" onClick={logout}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="view">
          {page === 'overview' && <OverviewPage go={(p) => go(p)} />}
          {page === 'receive' && <ReceivePage goPutAway={() => go('putaway')} />}
          {page === 'putaway' && <PutAwayPage />}
          {page === 'move' && <MovePage />}
          {page === 'dispatch' && <DispatchPage />}
          {page === 'layout' && <LayoutPage onConfigureRack={(block, rack) => { setRackToConfigure({ block, rack }); setPage('setup'); }} />}
          {page === 'boards' && <BoardsPage />}
          {page === 'setup' && <SetupPage key={rackToConfigure ? rackToConfigure.rack : wh} initialRack={rackToConfigure} />}
          {page === 'stock' && <StockPage />}
          {page === 'lookup' && <LookupPage />}
          {page === 'challans' && <ChallansPage />}
          {page === 'users' && <UsersPage />}
        </div>
      </div>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

export default function App() {
  return <WmsProvider><Shell /></WmsProvider>;
}

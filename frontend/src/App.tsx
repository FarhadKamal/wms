import { useEffect, useState } from 'react';
import { api } from './api';
import { DispatchPage } from './pages/DispatchPage';
import { LayoutPage } from './pages/LayoutPage';
import { MovePage } from './pages/MovePage';
import { OverviewPage } from './pages/OverviewPage';
import { PutAwayPage } from './pages/PutAwayPage';
import { ReceivePage } from './pages/ReceivePage';
import { BoardsPage, ChallansPage, LookupPage, StockPage } from './pages/RecordsPages';
import { SetupPage } from './pages/SetupPage';
import { useWms, WmsProvider } from './wms';

type Page = 'overview' | 'receive' | 'putaway' | 'move' | 'dispatch' | 'layout' | 'boards' | 'setup' | 'stock' | 'lookup' | 'challans';
const TITLES: Record<Page, [string, string]> = {
  overview: ['Overview', 'Dashboard'],
  receive: ['Stock movement', 'Receive (IN)'], putaway: ['Stock movement', 'Put-away'], move: ['Stock movement', 'Move between locations'], dispatch: ['Stock movement', 'Dispatch (OUT)'],
  layout: ['Warehouse', 'Layout & Racks'], boards: ['Warehouse', 'Bay Boards'], setup: ['Warehouse', 'Warehouse Setup'],
  stock: ['Records', 'Stock'], lookup: ['Records', 'Scan & Lookup'], challans: ['Records', 'Challans'],
};
const NAV: Array<[string, Array<[Page, string]>]> = [
  ['Overview', [['overview', '▣ Dashboard']]],
  ['Stock movement', [['receive', '↓ Receive (IN)'], ['putaway', '⇥ Put-away'], ['move', '⇄ Move'], ['dispatch', '↑ Dispatch (OUT)']]],
  ['Warehouse', [['layout', '⊞ Layout & Racks'], ['boards', '▤ Bay Boards'], ['setup', '⚙ Warehouse Setup']]],
  ['Records', [['stock', '☰ Stock'], ['lookup', '⌕ Scan & Lookup'], ['challans', '▤ Challans']]],
];

/** Page from the address bar, e.g. #/putaway or #/setup/racks — so pages can be bookmarked. */
function pageFromHash(): Page {
  const p = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return p in TITLES ? (p as Page) : 'overview';
}

function Shell() {
  const { warehouses, wh, setWh, structure, version } = useWms();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [rackToConfigure, setRackToConfigure] = useState<{ block: string; rack: string } | null>(null);
  const [badges, setBadges] = useState({ putaway: 0, boards: 0 });
  const go = (p: Page) => { setRackToConfigure(null); setPage(p); window.location.hash = `/${p}`; window.scrollTo(0, 0); };
  useEffect(() => { api.dashboard(wh).then((d) => setBadges({ putaway: d.staging, boards: d.boardsToUpdate })).catch(() => {}); }, [wh, version]);
  const weightFull = structure?.summary.shelvesAtWeightLimit.length ?? 0;
  const badge: Partial<Record<Page, [number, string]>> = { putaway: [badges.putaway, ''], boards: [badges.boards, ''], layout: [weightFull, 'red'] };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">AZ</div><div><div className="name">Azneo Limited</div><div className="sub">Warehouse System</div></div></div>
        <nav>
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {items.map(([id, label]) => (
                <button key={id} className={`nav-btn${page === id ? ' active' : ''}`} onClick={() => go(id)}>
                  {label}{badge[id]?.[0] ? <span className={`nav-badge ${badge[id]![1]}`}>{badge[id]![0]}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {structure && <><b>{structure.warehouse.name} warehouse</b><br />{structure.warehouse.address}<br /></>}
          <span style={{ opacity: 0.8 }}>WMS operated by Azneo Limited</span>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div><div className="crumb">{TITLES[page][0]}</div><h1>{TITLES[page][1]}</h1></div>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>Warehouse
            <select value={wh} onChange={(e) => setWh(e.target.value)}>
              {warehouses.map((w) => <option key={w.code} value={w.code}>{w.name}{w.status === 'PLANNED' ? ' (planned)' : ''}</option>)}
            </select>
          </label>
        </div>
        <div className="view">
          {page === 'overview' && <OverviewPage go={go} />}
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
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <WmsProvider><Shell /></WmsProvider>;
}

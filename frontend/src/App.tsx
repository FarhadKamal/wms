import { useState } from 'react';
import { LayoutPage } from './pages/LayoutPage';
import { OverviewPage } from './pages/OverviewPage';
import { SetupPage } from './pages/SetupPage';
import { useWms, WmsProvider } from './wms';

type Page = 'overview' | 'layout' | 'setup';
const TITLES: Record<Page, [string, string]> = {
  overview: ['Overview', 'Dashboard'], layout: ['Warehouse', 'Layout & Racks'], setup: ['Warehouse', 'Warehouse Setup'],
};
const NEXT_MODULE = ['Receive (IN)', 'Put-away', 'Move', 'Dispatch (OUT)', 'Stock', 'Challans'];

/** Page from the address bar, e.g. #/layout or #/setup/racks — so pages can be bookmarked. */
function pageFromHash(): Page {
  const p = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return p in TITLES ? (p as Page) : 'overview';
}

function Shell() {
  const { warehouses, wh, setWh, structure } = useWms();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [rackToConfigure, setRackToConfigure] = useState<{ block: string; rack: string } | null>(null);
  const go = (p: Page) => { setRackToConfigure(null); setPage(p); window.location.hash = `/${p}`; window.scrollTo(0, 0); };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">AZ</div><div><div className="name">Azneo Limited</div><div className="sub">Warehouse System</div></div></div>
        <div>
          <div className="nav-label">Overview</div>
          <button className={`nav-btn${page === 'overview' ? ' active' : ''}`} onClick={() => go('overview')}>▣ Dashboard</button>
          <div className="nav-label">Warehouse</div>
          <button className={`nav-btn${page === 'layout' ? ' active' : ''}`} onClick={() => go('layout')}>⊞ Layout &amp; Racks</button>
          <button className={`nav-btn${page === 'setup' ? ' active' : ''}`} onClick={() => go('setup')}>⚙ Warehouse Setup</button>
          <div className="nav-label">Stock movement</div>
          {NEXT_MODULE.map((m) => <button key={m} className="nav-btn" disabled>{m}<span className="soon">next</span></button>)}
        </div>
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
          {page === 'layout' && <LayoutPage onConfigureRack={(block, rack) => { setRackToConfigure({ block, rack }); setPage('setup'); }} />}
          {page === 'setup' && <SetupPage key={rackToConfigure ? `${rackToConfigure.rack}` : wh} initialRack={rackToConfigure} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <WmsProvider><Shell /></WmsProvider>;
}

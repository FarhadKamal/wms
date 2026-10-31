import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { BoardRow, Doc, DocRow, DocType, Product, StockRow, UnitDetail } from '../api';
import { BayCard, DocModal } from '../components/Docs';
import { PositionDrawer, PositionView } from '../components/PositionDrawer';
import { QR, unitQR } from '../components/QR';
import { ScanBox } from '../components/ScanBox';
import { useWms } from '../wms';

const DOC_LABEL: Record<DocType, string> = { RCV: 'Receiving Challan', DSP: 'Dispatch Challan', TRF: 'Transfer Slip' };
const DOC_PILL: Record<DocType, string> = { RCV: 'good', DSP: 'critical', TRF: 'info' };

/** Opens a document by number in a modal. */
export function useDocViewer() {
  const { toast } = useWms();
  const [doc, setDoc] = useState<Doc | null>(null);
  const open = (no: string) => api.document(no).then(setDoc).catch((e) => toast(e instanceof ApiError ? e.message : String(e), true));
  return { open, modal: doc && <DocModal doc={doc} onClose={() => setDoc(null)} /> };
}

export function DocRows({ docs, onOpen }: { docs: DocRow[]; onOpen: (no: string) => void }) {
  if (!docs.length) return <div className="empty">No documents yet in this warehouse.</div>;
  return <>{docs.map((d) => (
    <div key={d.no} className="list-row click" onClick={() => onOpen(d.no)}>
      <div className={`row-ic ${d.type}`}>{d.type === 'RCV' ? '↓' : d.type === 'DSP' ? '↑' : '⇄'}</div>
      <div className="row-main"><div className="t1">{d.no} · {d.party}</div><div className="t2">{d.products.map((p) => `${p.qty}× ${p.name}`).join(', ')}</div></div>
      <div className="row-side">{d.docDate.slice(0, 10)}<br />{d.units} units</div>
    </div>
  ))}</>;
}

// ---------------------------------------------------------------- Stock

export function StockPage() {
  const { wh, version } = useWms();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [inStock, setInStock] = useState(true);
  const [open, setOpen] = useState<StockRow | null>(null);
  const [where, setWhere] = useState<Array<{ address: string; kind: string; boardCode: string | null; uids: string[] }>>([]);
  const [pos, setPos] = useState<string | null>(null);
  useEffect(() => { api.stock(wh).then(setRows).catch(() => setRows([])); }, [wh, version]);
  useEffect(() => { if (open) api.stockOf(wh, open.sku).then(setWhere).catch(() => setWhere([])); }, [open, wh, version]);
  const cats = [...new Set(rows.map((r) => r.category))];
  const shown = rows.filter((r) => (cat === 'all' || r.category === cat) && (!inStock || r.total > 0) && (!q || `${r.name} ${r.sku} ${r.brand} ${r.aliases.join(' ')}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search product, SKU, brand or alias code…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <button className={`filter-chip${cat === 'all' ? ' active' : ''}`} onClick={() => setCat('all')}>All</button>
        {cats.map((c) => <button key={c} className={`filter-chip${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> Only products in stock ({rows.filter((r) => r.total > 0).length})
        </label>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Category</th><th className="num">Size (cm)</th><th className="num">Unit wt</th><th className="num">On shelf</th><th className="num">In receiving</th><th className="num">Total</th><th className="num">Locations</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const st = r.total <= r.reorderPoint / 2 ? 'critical' : r.total < r.reorderPoint ? 'warning' : 'good';
              return (
                <tr key={r.sku} className="click" onClick={() => setOpen(r)}>
                  <td><b>{r.name}</b><div className="note mono">{r.sku}</div></td><td>{r.category}</td>
                  <td className="num mono">{r.lengthCm}×{r.widthCm}×{r.heightCm}</td><td className="num">{r.weightKg} kg</td>
                  <td className="num">{r.onShelf}</td><td className="num">{r.inReceiving || '—'}</td><td className="num"><b>{r.total}</b></td><td className="num">{r.locations}</td>
                  <td><span className={`pill ${st}`}>{st === 'good' ? 'OK' : st === 'warning' ? 'Low' : 'Critical'}</span></td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={9} className="empty">{inStock && !q ? 'Nothing in stock here.' : 'No products match.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(null)} />
          <aside className="drawer" style={{ width: 520 }}>
            <div className="drawer-head"><div><div className="crumb">{open.category} · {open.brand}</div><h2>{open.name}</h2></div><button className="x-btn" onClick={() => setOpen(null)} aria-label="Close">×</button></div>
            <div className="drawer-body">
              <div className="kpis" style={{ ['--cols' as string]: 3 }}>
                <div className="kpi"><div className="k">In warehouse</div><div className="v">{open.total}</div><div className="s">units</div></div>
                <div className="kpi"><div className="k">Size</div><div className="v" style={{ fontSize: 15 }}>{open.lengthCm}×{open.widthCm}×{open.heightCm}</div><div className="s">cm per unit</div></div>
                <div className="kpi"><div className="k">Weight</div><div className="v">{open.weightKg}</div><div className="s">kg per unit</div></div>
              </div>
              <div className="section-title">Where it is</div>
              {where.length ? where.map((w) => (
                <div key={w.address} className={`list-row${w.boardCode ? ' click' : ''}`} onClick={() => w.boardCode && setPos(w.boardCode)}>
                  <div className="row-main"><div className="t1"><span className={`code${w.kind === 'PLATE' ? ' plate' : ''}`}>{w.address}</span></div><div className="t2 mono">{w.uids.join(', ')}</div></div>
                  <div className="row-side"><b>{w.uids.length}</b> units</div>
                </div>
              )) : <div className="empty">None in stock.</div>}
              <p className="note">{open.idRule === 'VIN' ? 'Identified by VIN; the QR sticker carries the VIN.' : 'Each unit has a WMS-generated ID printed as a QR label at receiving.'}</p>
            </div>
          </aside>
        </>
      )}
      {pos && <PositionDrawer code={pos} onClose={() => setPos(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Scan & lookup

const EV_TEXT = { RECEIVED: 'Received into Receiving Area', PUT_AWAY: 'Put away to', MOVED: 'Moved', DISPATCHED: 'Dispatched to' } as const;

function UnitCard({ u }: { u: UnitDetail }) {
  const st = u.status === 'DISPATCHED' ? ['critical', 'Dispatched'] : u.status === 'STAGING' ? ['warning', 'In Receiving Area'] : ['good', 'In stock'];
  return (
    <div className="card pad stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="crumb">{u.product.category.name} · {u.product.brand} · {u.warehouse.name}</div>
          <h2 style={{ fontSize: 18 }}>{u.product.name}</h2>
          <div className="note mono" style={{ marginTop: 4 }}>{u.product.category.idRule === 'VIN' ? 'VIN ' : 'Unit ID '}{u.uid} <span className={`pill ${st[0]}`}>{st[1]}</span></div>
        </div>
        <QR text={unitQR(u.uid)} size={80} />
      </div>
      {u.status === 'DISPATCHED'
        ? <div className="board-status dirty">Left the warehouse on <b>&nbsp;{u.dispatchDoc?.no}</b>&nbsp;to {u.dispatchDoc?.party}.</div>
        : <div><div className="section-title">Exact location</div><span className={`code${u.location?.kind === 'PLATE' ? ' plate' : ''}`} style={{ fontSize: 15, padding: '5px 10px' }}>{u.location?.address}</span></div>}
      <div>
        <div className="section-title">History (tagged to this ID)</div>
        <div className="timeline">
          {u.events.map((e) => (
            <div key={e.id} className="tl">
              <div className="d">{e.at.slice(0, 10)}<br />{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              <div className={`dot ${e.type}`} />
              <div><b>{EV_TEXT[e.type]}{e.type === 'PUT_AWAY' ? ` ${e.toCode}` : e.type === 'MOVED' ? ` ${e.fromCode} → ${e.toCode}` : e.type === 'DISPATCHED' ? ` ${e.document.party}` : ''}</b><div className="note">{e.document.no} · by {e.by}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A product found by SKU or alias code: its details and where its stock is in this warehouse. */
function ProductCard({ p }: { p: Product }) {
  const { wh, version } = useWms();
  const [where, setWhere] = useState<Array<{ address: string; kind: string; boardCode: string | null; uids: string[] }>>([]);
  const [pos, setPos] = useState<string | null>(null);
  useEffect(() => { api.stockOf(wh, p.sku).then(setWhere).catch(() => setWhere([])); }, [wh, p.sku, version]);
  const total = where.reduce((s, w) => s + w.uids.length, 0);
  return (
    <div className="card pad stack">
      <div>
        <div className="crumb">{p.category.name} · {p.brand}</div>
        <h2 style={{ fontSize: 18 }}>{p.name}</h2>
        <div className="note mono" style={{ marginTop: 4 }}>SKU {p.sku}{p.aliases.some(Boolean) && <> · alias {p.aliases.filter(Boolean).join(', ')}</>}</div>
      </div>
      <div className="kpis" style={{ ['--cols' as string]: 3 }}>
        <div className="kpi"><div className="k">In this warehouse</div><div className="v">{total}</div><div className="s">units</div></div>
        <div className="kpi"><div className="k">Size</div><div className="v" style={{ fontSize: 15 }}>{p.lengthCm}×{p.widthCm}×{p.heightCm}</div><div className="s">cm per unit</div></div>
        <div className="kpi"><div className="k">Weight</div><div className="v">{p.weightKg}</div><div className="s">kg per unit</div></div>
      </div>
      <div>
        <div className="section-title">Where it is</div>
        {where.length ? where.map((w) => (
          <div key={w.address} className={`list-row${w.boardCode ? ' click' : ''}`} onClick={() => w.boardCode && setPos(w.boardCode)}>
            <div className="row-main"><div className="t1"><span className={`code${w.kind === 'PLATE' ? ' plate' : ''}`}>{w.address}</span></div><div className="t2 mono">{w.uids.join(', ')}</div></div>
            <div className="row-side"><b>{w.uids.length}</b> units</div>
          </div>
        )) : <div className="empty">None in stock here.</div>}
      </div>
      {pos && <PositionDrawer code={pos} onClose={() => setPos(null)} />}
    </div>
  );
}

export function LookupPage() {
  const { wh, toast } = useWms();
  const [result, setResult] = useState<{ unit?: UnitDetail; board?: string; product?: Product } | null>(null);
  const docs = useDocViewer();
  const lookup = async (raw: string) => {
    try {
      const s = await api.scan(wh, raw);
      if (s.type === 'unit') setResult({ unit: await api.unit(s.uid) });
      else if (s.type === 'location') setResult({ board: s.board });
      else if (s.type === 'product') setResult({ product: await api.product(s.sku) });
      else { setResult(null); await docs.open(s.no); }
    } catch (e) { setResult(null); toast(e instanceof ApiError ? e.message : String(e), true); }
  };
  return (
    <div style={{ maxWidth: 860 }} className="stack">
      <div className="card pad">
        <div className="section-title">Scan or type any code — unit, car VIN, location, plate, challan, SKU or alias code</div>
        <ScanBox placeholder="e.g. PDR-PQM60-0012, A-RK2-S1-B3, PL-CTG-0004, DSP-CTG-2026-0001, ERP-1001" onScan={lookup} autoFocus />
      </div>
      {result?.unit && <UnitCard u={result.unit} />}
      {result?.board && <div className="card pad"><PositionView code={result.board} /></div>}
      {result?.product && <ProductCard p={result.product} />}
      {docs.modal}
    </div>
  );
}

// ---------------------------------------------------------------- Challans

export function ChallansPage() {
  const { wh, version } = useWms();
  const [type, setType] = useState<DocType | undefined>();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const viewer = useDocViewer();
  useEffect(() => { api.documents(wh, type).then(setDocs).catch(() => setDocs([])); }, [wh, type, version]);
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`filter-chip${!type ? ' active' : ''}`} onClick={() => setType(undefined)}>All</button>
        {(['RCV', 'DSP', 'TRF'] as DocType[]).map((t) => <button key={t} className={`filter-chip${type === t ? ' active' : ''}`} onClick={() => setType(t)}>{DOC_LABEL[t]}</button>)}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Document no.</th><th>Type</th><th>Date</th><th>Party</th><th>Products</th><th className="num">Units</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.no} className="click" onClick={() => viewer.open(d.no)}>
                <td className="mono"><b>{d.no}</b></td><td><span className={`pill ${DOC_PILL[d.type]}`}>{DOC_LABEL[d.type]}</span></td><td>{d.docDate.slice(0, 10)}</td>
                <td>{d.party}{d.reference && <div className="note">{d.reference}</div>}</td><td>{d.products.map((p) => <div key={p.name}>{p.qty}× {p.name}</div>)}</td><td className="num">{d.units}</td>
              </tr>
            ))}
            {!docs.length && <tr><td colSpan={6} className="empty">No documents in this warehouse yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {viewer.modal}
    </>
  );
}

// ---------------------------------------------------------------- Bay boards

export function BoardsPage() {
  const { wh, version, run, print, can } = useWms();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [floor, setFloor] = useState(true);
  const [pos, setPos] = useState<string | null>(null);
  useEffect(() => { api.boards(wh).then(setBoards).catch(() => setBoards([])); }, [wh, version]);
  const shown = boards.filter((b) => b.onRack || floor);
  const card = (b: BoardRow) => <BayCard key={b.code} wh={wh} code={b.code} pos={{ description: '', items: b.items.map((i) => ({ ...i, sku: i.name, uids: [] })), qty: b.qty, kg: b.kg, shelf: null }} />;

  return (
    <>
      <div className="banner" style={{ background: 'var(--primary-soft)' }}>▤ <span><b>Bay boards:</b> every rack position has a board showing its items, quantity and weight. The WMS keeps the live numbers; the warehouse manager updates the physical board from this list.</span></div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={floor} onChange={(e) => setFloor(e.target.checked)} /> Include floor cells &amp; floor plates ({boards.filter((b) => !b.onRack).length})</label>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={!shown.length} onClick={() => print(<>{shown.map(card)}</>)}>Print all changed cards</button>
        {can.moveStock && <button className="btn btn-sm btn-primary" disabled={!boards.length} onClick={() => run(() => api.boardUpdated(wh, '*'), (r) => `${r.updated} boards marked as updated.`)}>Mark all as updated</button>}
      </div>
      {shown.length ? (
        <div className="two-col">
          {shown.map((b) => (
            <div key={b.code} className="card pad">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><span className="code" style={{ fontSize: 13 }}>{b.code}</span><span className="note">last updated {b.lastUpdatedAt ? b.lastUpdatedAt.slice(0, 10) : 'never'}</span></div>
              {card(b)}
              <div className="row">
                <button className="btn btn-sm btn-primary" onClick={() => print(card(b))}>Print card</button>
                {can.moveStock && <button className="btn btn-sm" onClick={() => run(() => api.boardUpdated(wh, b.code), `Board ${b.code} marked as updated.`)}>Mark updated</button>}
                <button className="btn btn-sm btn-ghost" onClick={() => setPos(b.code)}>Details</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card pad"><div className="empty">✓ All boards match the WMS. Boards appear here as soon as stock moves in or out of a position.</div></div>}
      {pos && <PositionDrawer code={pos} onClose={() => setPos(null)} />}
    </>
  );
}

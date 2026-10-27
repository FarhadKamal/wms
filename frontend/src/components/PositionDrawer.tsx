import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Position } from '../api';
import { pct } from '../autofill';
import { useWms } from '../wms';
import { BayCard, LocationLabel } from './Docs';
import { QR, locQR } from './QR';

const EV = { RECEIVED: 'received', PUT_AWAY: 'put away', MOVED: 'moved', DISPATCHED: 'dispatched' } as Record<string, string>;

/** The bay dashboard: what is in a rack position / floor cell, its weight, plates, board status and history. */
export function PositionView({ code }: { code: string }) {
  const { wh, version, print, run } = useWms();
  const [p, setP] = useState<Position | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.position(wh, code).then((x) => { setP(x); setErr(''); }).catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [wh, code, version]);
  if (err) return <div className="note err">{err}</div>;
  if (!p) return <div className="empty">Loading…</div>;
  const board = p.board ?? code;
  const full = p.shelf && p.shelf.usedKg >= 0.95 * p.shelf.capKg;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><div className="mono" style={{ fontSize: 19, fontWeight: 700, color: 'var(--primary)' }}>{board}</div><div className="note">{p.description}</div></div>
        <QR text={locQR(wh, board)} size={70} />
      </div>
      <div className="kpis" style={{ ['--cols' as string]: 3 }}>
        <div className="kpi"><div className="k">Items</div><div className="v">{p.items.length}</div><div className="s">products</div></div>
        <div className="kpi"><div className="k">Quantity</div><div className="v">{p.qty}</div><div className="s">units</div></div>
        <div className="kpi"><div className="k">Weight</div><div className="v">{Math.round(p.kg)}</div><div className="s">kg here</div></div>
      </div>
      {p.shelf && (
        <div>
          {full && <div className="board-status red" style={{ marginBottom: 8 }}>⚠ Shelf {p.shelf.level} is at its weight limit ({Math.round(p.shelf.usedKg)}/{p.shelf.capKg} kg) with only {pct(p.shelf.usedCm3, p.shelf.volumeCm3)}% of its space used. Nothing more can go on it.</div>}
          <div className="section-title">Shelf {p.shelf.level}{p.shelf.span > 1 ? `+${p.shelf.level + 1}` : ''} (all bays together) · fits items up to {p.shelf.heightCm} cm</div>
          <div className="dual">
            <span>Weight</span><div className="meter"><div className={`meter-fill ${full ? 'full' : p.shelf.usedKg >= 0.75 * p.shelf.capKg ? 'warn' : 'ok'}`} style={{ width: `${Math.min(100, pct(p.shelf.usedKg, p.shelf.capKg))}%` }} /></div><span className="v">{Math.round(p.shelf.usedKg)} / {p.shelf.capKg} kg</span>
            <span>Space</span><div className="meter"><div className="meter-fill" style={{ width: `${Math.min(100, pct(p.shelf.usedCm3, p.shelf.volumeCm3))}%` }} /></div><span className="v">{pct(p.shelf.usedCm3, p.shelf.volumeCm3)}% used</span>
          </div>
        </div>
      )}
      {p.board && (p.boardDirty
        ? <div className="board-status dirty"><span className="dirty-dot" /> The physical board shows old contents — stock changed{p.boardUpdatedAt ? ` since ${p.boardUpdatedAt.slice(0, 10)}` : ''}. Print a new card and swap it in.</div>
        : <div className="board-status clean">✓ Physical board up to date{p.boardUpdatedAt ? ` (updated ${p.boardUpdatedAt.slice(0, 10)})` : ''}.</div>)}
      {p.plates.length > 0 && (
        <div>
          <div className="section-title">Plates here</div>
          {p.plates.map((pl) => (
            <div key={pl.label} className="list-row">
              <span className="code plate">{pl.label}</span>
              <div className="row-main"><div className="t1">{pl.address} · {pl.type}</div><div className="t2">{pl.items.length ? pl.items.map((i) => `${i.qty}× ${i.name}`).join(', ') : 'empty'}</div></div>
              <div className="row-side">{Math.round(pl.kg)}{pl.capKg ? ` / ${pl.capKg}` : ''} kg</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="section-title">In this position</div>
        {p.items.length ? (
          <>
            <table><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Weight</th></tr></thead>
              <tbody>{p.items.map((i) => <tr key={i.sku}><td>{i.name}<div className="note mono">{i.sku}</div></td><td className="num">{i.qty}</td><td className="num">{Math.round(i.kg)} kg</td></tr>)}</tbody></table>
            <p className="note" style={{ marginTop: 6 }}>Units: <span className="mono">{p.items.flatMap((i) => i.uids).join(', ')}</span></p>
          </>
        ) : <div className="empty">Empty{p.heightCm ? ` · fits items up to ${Math.round(p.heightCm)} cm` : ''}.</div>}
      </div>
      {p.events.length > 0 && (
        <div>
          <div className="section-title">Recent activity</div>
          {p.events.slice(0, 8).map((e, i) => (
            <div key={i} className="list-row"><div className="row-main"><div className="t1">{e.inbound ? '+1' : '−1'} · {EV[e.type] ?? e.type}</div><div className="t2">{e.doc} · {e.by}</div></div><div className="row-side">{e.at.slice(0, 10)}</div></div>
          ))}
        </div>
      )}
      <div className="row">
        <button className="btn btn-sm btn-primary" onClick={() => print(<BayCard wh={wh} code={board} pos={p} />)}>Print bay card</button>
        {p.boardDirty && <button className="btn btn-sm" onClick={() => run(() => api.boardUpdated(wh, board), `Board ${board} marked as updated.`)}>Mark board updated</button>}
        <button className="btn btn-sm" onClick={() => print(<LocationLabel wh={wh} code={board} sub={p.description} />)}>Print location QR label</button>
      </div>
    </div>
  );
}

export function PositionDrawer({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" style={{ width: 520 }} aria-label={code}>
        <div className="drawer-head"><div><div className="crumb">Bay dashboard</div><h2>{code}</h2></div><button className="x-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="drawer-body"><PositionView code={code} /></div>
      </aside>
    </>
  );
}

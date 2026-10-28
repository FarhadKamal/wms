import { useEffect, useState } from 'react';
import { api, ApiError, parseScan } from '../api';
import type { PendingGroup, Suggestion } from '../api';
import { ScanBox } from '../components/ScanBox';
import { useWms } from '../wms';

/** Units waiting in the Receiving Area → a shelf / bay / plate / floor cell. Scan unit, scan location. */
export function PutAwayPage() {
  const { wh, version, run } = useWms();
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const [only, setOnly] = useState<string[] | null>(null); // a single scanned unit
  const [qty, setQty] = useState(1);
  const [best, setBest] = useState<number | null>(null);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [dest, setDest] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; c: 'ok' | 'err' | 'warn' } | null>(null);

  useEffect(() => { api.pending(wh).then(setGroups).catch(() => setGroups([])); }, [wh, version]);
  const g = groups.find((x) => `${x.doc}|${x.sku}` === key) ?? groups[0];
  const pool = only ?? g?.uids ?? [];
  const moving = pool.slice(0, qty);

  // Best quantity for the group (the most that fits one location) — recomputed when the group or stock changes.
  useEffect(() => {
    if (!g) return;
    let live = true;
    api.suggest(wh, pool).then((r) => { if (live) { setBest(r.bestQty); setQty(Math.min(pool.length, r.bestQty ?? 1)); setDest(null); } }).catch(() => {});
    return () => { live = false; };
  }, [g?.doc, g?.sku, only?.join(), wh, version]);
  // Suggestions for exactly the units being moved — keyed on their IDs, not the array identity.
  useEffect(() => {
    if (!moving.length) { setSugg([]); return; }
    let live = true;
    api.suggest(wh, moving).then((r) => live && setSugg(r.suggestions)).catch(() => live && setSugg([]));
    return () => { live = false; };
  }, [moving.join(), wh]);

  const pick = (k: string) => { setKey(k); setOnly(null); setMsg(null); setDest(null); };
  const scanUnit = (raw: string) => {
    const uid = parseScan(raw);
    const hit = groups.find((x) => x.uids.includes(uid));
    if (!hit) return setMsg({ t: `${uid} is not waiting for put-away here.`, c: 'err' });
    setKey(`${hit.doc}|${hit.sku}`); setOnly([uid]); setQty(1); setDest(null);
    setMsg({ t: `Scanned ${uid}. Now scan or pick its location.`, c: 'ok' });
  };
  const confirm = async (location: string) => {
    const r = await run(() => api.putAway(wh, { uids: moving, location }), (x) => `${x.placed} unit${x.placed === 1 ? '' : 's'} put away to ${x.location} (${x.note}).`);
    if (r) { setOnly(null); setDest(null); setMsg(null); }
  };
  const scanLocation = async (raw: string) => {
    try { await api.scan(wh, raw); setDest(parseScan(raw)); setMsg({ t: `${parseScan(raw)} selected — space and weight are checked when you confirm.`, c: 'ok' }); }
    catch (e) { setMsg({ t: e instanceof ApiError ? e.message : String(e), c: 'err' }); }
  };

  if (!groups.length) return <div className="card pad"><div className="empty">Nothing is waiting in the Receiving Area. Everything received has been shelved.</div></div>;
  const p = g.product;

  return (
    <>
      <p className="lead">Pick a group (or scan one unit's QR), then choose or scan where it goes. Every suggestion is checked for <b>space</b> and the <b>shelf's weight limit</b>, and checked again when you confirm.</p>
      <div className="split">
        <div className="card pad">
          <div className="section-title">Waiting in Receiving Area</div>
          {groups.map((x) => (
            <button key={`${x.doc}|${x.sku}`} className={`group-card${x === g ? ' sel' : ''}`} onClick={() => pick(`${x.doc}|${x.sku}`)}>
              <span className="cnt">{x.uids.length}</span>
              <span><b>{x.product.name}</b><div className="note mono">{x.doc} · {x.product.lengthCm}×{x.product.widthCm}×{x.product.heightCm} cm · {x.product.weightKg} kg</div></span>
            </button>
          ))}
        </div>
        <div className="card pad">
          <div className="step-label"><span className="num">1</span> Units</div>
          <ScanBox placeholder="Or scan one unit's QR / VIN" onScan={scanUnit} />
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <b>{p.name}</b> · put away{' '}
            <input type="number" min={1} max={pool.length} value={qty} disabled={!p.stackable} style={{ width: 70, padding: '5px 8px' }}
              onChange={(e) => { setQty(Math.max(1, Math.min(pool.length, Number(e.target.value) || 1))); setDest(null); }} /> of {pool.length}
          </div>
          {best != null && best < pool.length && p.stackable && <p className="note" style={{ marginTop: 6 }}>Auto: <b>{best}</b> is the most that fits in one location (space &amp; weight). Put the rest in a second location.</p>}
          <p className="note" style={{ marginTop: 6 }}>{qty} × {p.weightKg} kg = <b>{Math.round(qty * p.weightKg)} kg</b> · <span className="mono">{moving.slice(0, 5).join(', ')}{moving.length > 5 ? ' …' : ''}</span></p>

          <div className="step-label" style={{ marginTop: 16 }}><span className="num">2</span> Scan or pick the location</div>
          <ScanBox placeholder="Scan location / plate label" onScan={scanLocation} />
          <div style={{ marginTop: 10 }}>
            {sugg.length ? sugg.map((s) => (
              <button key={s.code} className={`loc-opt${dest === s.code ? ' sel' : ''}`} onClick={() => setDest(s.code)}>
                <span><span className={`code${s.kind === 'PLATE' ? ' plate' : ''}`}>{s.address}</span> <span className="why">{s.sameProduct ? 'already holds this product' : s.empty ? 'empty' : 'has other items'}{s.kind === 'PLATE' ? ` · plate ${s.code}` : ''}</span></span>
                <span className="fit">✓ {s.note}</span>
              </button>
            )) : <div className="msg err">No location has space and weight capacity for {qty} of these. Try fewer units.</div>}
          </div>
          {msg && <div className={`msg ${msg.c}`}>{msg.t}</div>}
          <div className="form-actions"><button className="btn btn-primary" disabled={!dest} onClick={() => dest && confirm(dest)}>Put away {qty} → {dest ? (sugg.find((s) => s.code === dest)?.address ?? dest) : 'choose a location'}</button></div>
        </div>
      </div>
    </>
  );
}

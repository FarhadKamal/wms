import { useEffect, useState } from 'react';
import { api, parseScan } from '../api';
import type { Doc, Suggestion } from '../api';
import { DocModal } from '../components/Docs';
import { ScanBox } from '../components/ScanBox';
import { useWms } from '../wms';
import { UnitList, useUnitPicker } from './UnitPicker';

/** Internal move: the unit's QR never changes — the WMS updates its location and logs a Transfer Slip. */
export function MovePage() {
  const { wh, run } = useWms();
  const picker = useUnitPicker('move');
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [dest, setDest] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null);
  const uids = picker.units.map((u) => u.uid);
  const from = new Set(picker.units.map((u) => u.location?.code));

  // Suggestions for the scanned units (leaving out where they already are) — keyed on their IDs.
  useEffect(() => {
    if (!uids.length) { setSugg([]); return; }
    let live = true;
    api.suggest(wh, uids, from.size === 1 ? [...from][0] : undefined).then((r) => live && setSugg(r.suggestions)).catch(() => live && setSugg([]));
    return () => { live = false; };
  }, [uids.join(), wh]);

  const submit = async () => {
    if (!dest) return;
    const r = await run(() => api.transfer(wh, { uids, location: dest, reason }), (d) => `${d.units} units moved on ${d.no}.`);
    if (r) { setDoc(r); picker.clear(); setDest(null); setReason(''); }
  };

  return (
    <>
      <p className="lead">Internal move between locations. The unit's QR label <b>never changes</b> — the WMS updates its location and logs a <b>Transfer Slip</b>.</p>
      <div className="split">
        <div className="card pad">
          <div className="step-label"><span className="num">1</span> Scan units to move</div>
          <UnitList picker={picker} />
          <label className="field" style={{ marginTop: 16 }}>Reason <span className="hint">optional</span><input value={reason} placeholder="e.g. shelf at weight limit" onChange={(e) => setReason(e.target.value)} /></label>
        </div>
        <div className="card pad">
          <div className="step-label"><span className="num">2</span> Destination</div>
          <ScanBox placeholder="Scan location / plate label" onScan={(raw) => setDest(parseScan(raw))} />
          <div style={{ marginTop: 10 }}>
            {!uids.length ? <div className="empty">Scan units first; locations with enough space and weight capacity appear here.</div>
              : sugg.length ? sugg.map((s) => (
                <button key={s.code} className={`loc-opt${dest === s.code ? ' sel' : ''}`} onClick={() => setDest(s.code)}>
                  <span><span className={`code${s.kind === 'PLATE' ? ' plate' : ''}`}>{s.address}</span> <span className="why">{s.sameProduct ? 'already holds this product' : s.empty ? 'empty' : 'has other items'}</span></span>
                  <span className="fit">✓ {s.note}</span>
                </button>
              )) : <div className="msg err">No single location fits all of these.</div>}
          </div>
          <div className="form-actions"><button className="btn btn-primary" disabled={!uids.length || !dest} onClick={submit}>Move {uids.length} → {dest ? (sugg.find((s) => s.code === dest)?.address ?? dest) : '…'} &amp; create Transfer Slip</button></div>
        </div>
      </div>
      {doc && <DocModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

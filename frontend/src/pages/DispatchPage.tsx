import { useState } from 'react';
import { api, todayLocal } from '../api';
import type { Doc } from '../api';
import { DocModal } from '../components/Docs';
import { useWms } from '../wms';
import { UnitList, useUnitPicker } from './UnitPicker';

/** Enter the receiver, scan every unit going out: one Dispatch Challan per receiver. */
export function DispatchPage() {
  const { wh, me, run } = useWms();
  const picker = useUnitPicker('dispatch');
  const [party, setParty] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [doc, setDoc] = useState<Doc | null>(null);

  const submit = async () => {
    const r = await run(() => api.dispatch(wh, { party, destination, date, uids: picker.units.map((u) => u.uid) }),
      (d) => `${d.units} units dispatched to ${d.party} on ${d.no}.`);
    if (r) { setDoc(r); picker.clear(); setParty(''); setDestination(''); }
  };

  return (
    <>
      <p className="lead">Enter the receiver, then quick-scan every unit going out. All scans for this receiver go on <b>one Dispatch Challan</b>.</p>
      <div className="split">
        <div className="card pad">
          <div className="step-label"><span className="num">1</span> Receiver</div>
          <div className="form-grid">
            <label className="field full">Receiver name <input value={party} placeholder="e.g. Agrani Traders" onChange={(e) => setParty(e.target.value)} /></label>
            <label className="field full">Destination / address <input value={destination} placeholder="e.g. Cox's Bazar" onChange={(e) => setDestination(e.target.value)} /></label>
            <label className="field">Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field">Dispatched by <span className="hint">from your login</span><input value={me.fullName} readOnly /></label>
          </div>
        </div>
        <div className="card pad">
          <div className="step-label"><span className="num">2</span> Scan units</div>
          <UnitList picker={picker} />
          <div className="form-actions">
            <button className="btn btn-primary" disabled={!party.trim() || !picker.units.length} onClick={submit}>Confirm dispatch of {picker.units.length} &amp; print challan</button>
            <button className="btn btn-ghost btn-sm" onClick={picker.clear}>Clear scans</button>
          </div>
        </div>
      </div>
      {doc && <DocModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

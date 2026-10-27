// Shared by Move and Dispatch: a scanned list of units, checked against the server as they are scanned.
import { useState } from 'react';
import { api, ApiError, parseScan } from '../api';
import type { UnitDetail } from '../api';
import { ScanBox } from '../components/ScanBox';
import { useWms } from '../wms';

export function useUnitPicker(mode: 'move' | 'dispatch') {
  const { wh } = useWms();
  const [units, setUnits] = useState<UnitDetail[]>([]);
  const [msg, setMsg] = useState<{ t: string; c: 'ok' | 'err' | 'warn' } | null>(null);

  const add = async (raw: string) => {
    const uid = parseScan(raw);
    if (units.some((u) => u.uid === uid)) return setMsg({ t: `${uid} is already scanned.`, c: 'warn' });
    try {
      const u = await api.unit(uid);
      if (u.warehouse.code !== wh) return setMsg({ t: `${uid} belongs to another warehouse (${u.warehouse.name}).`, c: 'err' });
      if (u.status === 'DISPATCHED') return setMsg({ t: `${uid} already left on ${u.dispatchDoc?.no}.`, c: 'err' });
      if (mode === 'move' && u.status === 'STAGING') return setMsg({ t: `${uid} is still in the Receiving Area — use Put-away.`, c: 'err' });
      setUnits((x) => [...x, u]);
      setMsg(u.status === 'STAGING'
        ? { t: `Added ${uid} — note: it goes out straight from the Receiving Area.`, c: 'warn' }
        : { t: `Added ${uid} · ${u.product.name} · from ${u.location?.address}`, c: 'ok' });
    } catch (e) {
      // A location or challan scanned by mistake gets a clearer message.
      const s = await api.scan(wh, raw).catch(() => null);
      setMsg({ t: s?.type === 'location' ? `${uid} is a location label — scan the product's QR.` : e instanceof ApiError ? e.message : String(e), c: 'err' });
    }
  };
  const remove = (uid: string) => setUnits((x) => x.filter((u) => u.uid !== uid));
  const clear = () => { setUnits([]); setMsg(null); };
  return { units, add, remove, clear, msg, setMsg };
}

export function UnitList({ picker }: { picker: ReturnType<typeof useUnitPicker> }) {
  const by = new Map<string, typeof picker.units>();
  picker.units.forEach((u) => by.set(u.product.name, [...(by.get(u.product.name) ?? []), u]));
  return (
    <>
      <ScanBox placeholder="Scan or type unit ID / VIN, press Enter" onScan={picker.add} autoFocus />
      {picker.msg && <div className={`msg ${picker.msg.c}`}>{picker.msg.t}</div>}
      {!picker.units.length && <div className="empty">No units scanned yet.</div>}
      {[...by].map(([name, us]) => (
        <div key={name} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{name} <span className="pill neutral">{us.length}</span></div>
          {us.map((u) => <span key={u.uid} className="uid-chip">{u.uid}<button aria-label={`Remove ${u.uid}`} onClick={() => picker.remove(u.uid)}>×</button></span>)}
        </div>
      ))}
    </>
  );
}

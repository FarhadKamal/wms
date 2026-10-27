import { useEffect, useState } from 'react';
import { api } from '../../api';
import { nextTypeName } from '../../autofill';
import { useWms } from '../../wms';

export function TypesStep() {
  const { rackTypes, plateTypes, run } = useWms();
  const [rt, setRt] = useState({ name: '', lengthCm: 400, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 300 });
  const [pt, setPt] = useState({ name: '', lengthCm: 80, widthCm: 60, floorStackHeightCm: 120, capKg: 500 });
  useEffect(() => setRt((x) => ({ ...x, name: nextTypeName(rackTypes.map((t) => t.name)) })), [rackTypes]);
  useEffect(() => setPt((x) => ({ ...x, name: `Plate type ${plateTypes.length + 1}` })), [plateTypes]);
  const num = (v: string) => Number(v) || 0;

  return (
    <div className="two-col">
      <div className="card pad">
        <div className="section-title">Rack types</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th className="num">L × D (cm)</th><th className="num">Shelves</th><th className="num">Shelf height</th><th className="num">Shelf limit</th><th className="num">In use</th></tr></thead>
            <tbody>{rackTypes.map((t) => (
              <tr key={t.id}><td><b>{t.name}</b></td><td className="num">{t.lengthCm} × {t.depthCm}</td><td className="num">{t.shelfCount}</td><td className="num">{t.shelfHeightCm} cm</td><td className="num">{t.shelfCapKg} kg</td><td className="num">{t._count?.racks ?? 0}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="section-title" style={{ marginTop: 16 }}>Add rack type</div>
        <div className="form-grid" style={{ ['--cols' as string]: 3 }}>
          <label className="field">Name <input value={rt.name} onChange={(e) => setRt({ ...rt, name: e.target.value })} /></label>
          <label className="field">Length (cm) <input type="number" value={rt.lengthCm} onChange={(e) => setRt({ ...rt, lengthCm: num(e.target.value) })} /></label>
          <label className="field">Depth (cm) <input type="number" value={rt.depthCm} onChange={(e) => setRt({ ...rt, depthCm: num(e.target.value) })} /></label>
          <label className="field">Shelves <input type="number" min={1} max={12} value={rt.shelfCount} onChange={(e) => setRt({ ...rt, shelfCount: num(e.target.value) })} /></label>
          <label className="field">Shelf height (cm) <input type="number" value={rt.shelfHeightCm} onChange={(e) => setRt({ ...rt, shelfHeightCm: num(e.target.value) })} /></label>
          <label className="field">Weight limit per shelf (kg) <input type="number" value={rt.shelfCapKg} onChange={(e) => setRt({ ...rt, shelfCapKg: num(e.target.value) })} /></label>
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={!rt.name} onClick={() => run(() => api.createRackType(rt), `Rack type ${rt.name} added.`)}>Add rack type</button></div>
      </div>

      <div className="card pad">
        <div className="section-title">Plate types</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th className="num">L × W (cm)</th><th className="num">Max load height on floor</th><th className="num">Weight limit</th><th className="num">In use</th></tr></thead>
            <tbody>{plateTypes.map((t) => (
              <tr key={t.id}><td><b>{t.name}</b></td><td className="num">{t.lengthCm} × {t.widthCm}</td><td className="num">{t.floorStackHeightCm ? `${t.floorStackHeightCm} cm` : 'shelf use only'}</td><td className="num">{t.capKg} kg</td><td className="num">{t._count?.plates ?? 0}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="section-title" style={{ marginTop: 16 }}>Add plate type</div>
        <div className="form-grid">
          <label className="field">Name <input value={pt.name} onChange={(e) => setPt({ ...pt, name: e.target.value })} /></label>
          <label className="field">Weight limit (kg) <input type="number" value={pt.capKg} onChange={(e) => setPt({ ...pt, capKg: num(e.target.value) })} /></label>
          <label className="field">Length (cm) <input type="number" value={pt.lengthCm} onChange={(e) => setPt({ ...pt, lengthCm: num(e.target.value) })} /></label>
          <label className="field">Width (cm) <input type="number" value={pt.widthCm} onChange={(e) => setPt({ ...pt, widthCm: num(e.target.value) })} /></label>
          <label className="field">Max load height on floor (cm) <span className="hint">how high goods may be piled on it; 0 = shelf use only</span><input type="number" value={pt.floorStackHeightCm} onChange={(e) => setPt({ ...pt, floorStackHeightCm: num(e.target.value) })} /></label>
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={!pt.name} onClick={() => run(() => api.createPlateType(pt), `Plate type ${pt.name} added.`)}>Add plate type</button></div>
      </div>
    </div>
  );
}

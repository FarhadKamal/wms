import { useEffect, useRef, useState } from 'react';
import { api, ApiError, download } from '../api';
import type { ImportPreview, Product, ProductForm } from '../api';
import { Modal } from '../components/Docs';
import { useWms } from '../wms';

const ACTION: Record<string, [string, string]> = { new: ['good', 'New'], update: ['info', 'Update'], unchanged: ['neutral', 'No change'], error: ['critical', 'Error'] };

/** Product catalogue: everyone searches (incl. alias codes); the Admin (IT) uploads Excel and edits. */
export function ProductsPage() {
  const { can, version, toast, run } = useWms();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Product[]>([]);
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [preview, setPreview] = useState<{ file: File; data: ImportPreview } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => { api.products(q.trim() || undefined).then(setRows).catch(() => setRows([])); }, 200);
    return () => window.clearTimeout(t);
  }, [q, version]);

  const onFile = async (file?: File) => {
    if (!file) return;
    try { setPreview({ file, data: await api.previewImport(file) }); }
    catch (e) { toast(e instanceof ApiError ? e.message : String(e), true); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const dl = (empty: boolean) => download(`/products/export${empty ? '?empty=1' : ''}`, empty ? 'wms-products-template.xlsx' : `wms-products-${new Date().toISOString().slice(0, 10)}.xlsx`)
    .catch((e) => toast(String(e instanceof Error ? e.message : e), true));

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search SKU, name, brand or alias code…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 320 }} aria-label="Search products" />
        <span className="note">{rows.length} product{rows.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => dl(false)}>Export to Excel</button>
        {can.manageProducts && <>
          <button className="btn btn-sm" onClick={() => dl(true)}>Download template</button>
          <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()}>Upload Excel…</button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-sm" onClick={() => setEdit('new')}>+ Add product</button>
        </>}
      </div>
      {can.manageProducts && <p className="note" style={{ marginBottom: 12 }}>Tip: <b>Export to Excel</b>, edit the sheet, and upload it again — existing SKUs are updated, new ones added. You see a preview first; nothing is saved until you confirm.</p>}

      <div className="card table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th className="num">Size (cm)</th><th className="num">Weight</th><th className="num">Reorder</th><th>Alias 1</th><th>Alias 2</th><th>Alias 3</th>{can.manageProducts && <th />}</tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.sku}>
                <td className="mono"><b>{p.sku}</b></td><td>{p.name}<div className="note">{p.brand}</div></td><td>{p.category.name}</td>
                <td className="num mono">{p.lengthCm}×{p.widthCm}×{p.heightCm}</td><td className="num">{p.weightKg} kg</td><td className="num">{p.reorderPoint}</td>
                {p.aliases.map((a, i) => <td key={i} className="mono">{a ?? <span className="note">—</span>}</td>)}
                {can.manageProducts && <td><button className="btn btn-xs" onClick={() => setEdit(p)}>Edit</button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="empty">No products match.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <ProductEditor product={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {preview && (
        <Modal title={`Upload preview — ${preview.file.name}`} onClose={() => setPreview(null)} actions={
          <button className="btn btn-primary" disabled={!!preview.data.summary.error || !(preview.data.summary.new + preview.data.summary.update)}
            onClick={async () => { if (await run(() => api.importProducts(preview.file), (s) => `Imported: ${s.new} new, ${s.update} updated.`)) setPreview(null); }}>
            Confirm import
          </button>
        }>
          <div className="card pad stack" style={{ gap: 12 }}>
            <div className="row">
              <span className="pill good">{preview.data.summary.new} new</span>
              <span className="pill info">{preview.data.summary.update} to update</span>
              <span className="pill neutral">{preview.data.summary.unchanged} unchanged</span>
              <span className={`pill ${preview.data.summary.error ? 'critical' : 'neutral'}`}>{preview.data.summary.error} with errors</span>
            </div>
            {preview.data.summary.error > 0 && <div className="msg err">Fix the rows with errors in the Excel and upload again — nothing is imported while any row has an error.</div>}
            {preview.data.newCategories.length > 0 && <div className="note">New categories will be created: <b>{preview.data.newCategories.join(', ')}</b>.</div>}
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr><th className="num">Row</th><th>SKU</th><th>Result</th><th>Details</th></tr></thead>
                <tbody>
                  {[...preview.data.rows].sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error') || a.row - b.row).map((r) => (
                    <tr key={r.row}>
                      <td className="num">{r.row}</td><td className="mono">{r.sku || '—'}</td>
                      <td><span className={`pill ${ACTION[r.action][0]}`}>{ACTION[r.action][1]}</span></td>
                      <td>
                        {r.errors.map((e) => <div key={e} className="msg err" style={{ margin: 0, minHeight: 0 }}>{e}</div>)}
                        {r.action === 'update' && <div className="note">Changes: {r.changes.join(', ')}</div>}
                        {r.warnings.map((w) => <div key={w} className="note">⚠ {w}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function ProductEditor({ product: p, onClose }: { product: Product | null; onClose: () => void }) {
  const { run, products } = useWms();
  const cats = [...new Set(products.map((x) => x.category.name))];
  const [f, setF] = useState<ProductForm>(p
    ? { name: p.name, category: p.category.name, brand: p.brand, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg, reorderPoint: p.reorderPoint, alias1: p.aliases[0] ?? '', alias2: p.aliases[1] ?? '', alias3: p.aliases[2] ?? '' }
    : { sku: '', name: '', category: cats[0] ?? '', brand: '', lengthCm: 0, widthCm: 0, heightCm: 0, weightKg: 0, reorderPoint: 0, alias1: '', alias2: '', alias3: '' });
  const set = (k: keyof ProductForm, v: string | number) => setF({ ...f, [k]: v });
  const n = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));
  const valid = f.name && f.category && f.brand && f.lengthCm > 0 && f.widthCm > 0 && f.heightCm > 0 && f.weightKg > 0 && (p || f.sku);
  const save = async () => {
    const body = { ...f, alias1: f.alias1 || undefined, alias2: f.alias2 || undefined, alias3: f.alias3 || undefined };
    const r = await run(() => (p ? api.updateProduct(p.sku, body) : api.createProduct(body)), (x) => `${x.sku} saved.`);
    if (r) onClose();
  };
  return (
    <Modal title={p ? `Edit ${p.sku}` : 'Add product'} onClose={onClose} actions={<button className="btn btn-primary" disabled={!valid} onClick={save}>Save</button>}>
      <div className="card pad">
        <div className="form-grid" style={{ ['--cols' as string]: 3 }}>
          <label className="field">SKU <input value={p ? p.sku : f.sku} disabled={!!p} onChange={(e) => set('sku', e.target.value.toUpperCase())} /></label>
          <label className="field" style={{ gridColumn: 'span 2' }}>Name <input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field">Category <input list="cats" value={f.category} onChange={(e) => set('category', e.target.value)} /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="field">Brand <input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></label>
          <label className="field">Reorder level <input type="number" min={0} value={f.reorderPoint} onChange={n('reorderPoint')} /></label>
          <label className="field">Length (cm) <input type="number" min={0} value={f.lengthCm || ''} onChange={n('lengthCm')} /></label>
          <label className="field">Width (cm) <input type="number" min={0} value={f.widthCm || ''} onChange={n('widthCm')} /></label>
          <label className="field">Height (cm) <input type="number" min={0} value={f.heightCm || ''} onChange={n('heightCm')} /></label>
          <label className="field">Weight (kg) <span className="hint">one unit</span><input type="number" min={0} step={0.1} value={f.weightKg || ''} onChange={n('weightKg')} /></label>
          <label className="field">Alias code 1 <span className="hint">optional</span><input value={f.alias1} onChange={(e) => set('alias1', e.target.value.toUpperCase())} /></label>
          <label className="field">Alias code 2 <span className="hint">optional</span><input value={f.alias2} onChange={(e) => set('alias2', e.target.value.toUpperCase())} /></label>
          <label className="field">Alias code 3 <span className="hint">optional</span><input value={f.alias3} onChange={(e) => set('alias3', e.target.value.toUpperCase())} /></label>
        </div>
        <p className="note" style={{ marginTop: 12 }}>Size and weight are of one packed unit — they drive the space and shelf weight checks. Alias codes must be unique across all products.</p>
      </div>
    </Modal>
  );
}

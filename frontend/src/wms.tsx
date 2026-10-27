// App-wide state: current warehouse, its structure, shared master data, toasts and printing.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from './api';
import type { PlateType, Product, RackType, Structure, WarehouseRow } from './api';

interface Wms {
  warehouses: WarehouseRow[];
  wh: string;
  setWh: (code: string) => void;
  structure: Structure | null;
  rackTypes: RackType[];
  plateTypes: PlateType[];
  products: Product[];
  /** Goes up after every change, so pages can refetch their own data. */
  version: number;
  /** Who is working (prefilled into "received by", "dispatched by"…). */
  user: string;
  setUser: (name: string) => void;
  reload: () => Promise<void>;
  toast: (msg: string, isError?: boolean) => void;
  /** Run an API action: toast its success message or its error, then reload. Resolves to the result, or undefined on error. */
  run: <T>(action: () => Promise<T>, okMsg?: string | ((r: T) => string)) => Promise<T | undefined>;
  /** Print just this content (a challan, labels, a bay card). */
  print: (content: ReactNode) => void;
}

const Ctx = createContext<Wms | null>(null);
export const useWms = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWms outside WmsProvider');
  return c;
};

export function WmsProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [wh, setWh] = useState(() => localStorage.getItem('wms.wh') ?? 'CTG');
  const [user, setUserState] = useState(() => localStorage.getItem('wms.user') ?? 'Warehouse Manager');
  const [structure, setStructure] = useState<Structure | null>(null);
  const [rackTypes, setRackTypes] = useState<RackType[]>([]);
  const [plateTypes, setPlateTypes] = useState<PlateType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);
  const [printing, setPrinting] = useState<ReactNode>(null);

  const toast = useCallback((msg: string, isError = false) => {
    setToastMsg({ msg, err: isError });
    window.setTimeout(() => setToastMsg((t) => (t?.msg === msg ? null : t)), 4200);
  }, []);
  const setUser = (name: string) => { setUserState(name); localStorage.setItem('wms.user', name); };

  const reload = useCallback(async () => {
    try {
      const [ws, rt, pt, pr] = await Promise.all([api.warehouses(), api.rackTypes(), api.plateTypes(), api.products()]);
      setWarehouses(ws); setRackTypes(rt); setPlateTypes(pt); setProducts(pr);
      const code = ws.some((w) => w.code === wh) ? wh : ws[0]?.code;
      if (code && code !== wh) setWh(code);
      setStructure(code ? await api.structure(code) : null);
      setVersion((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? `Can't reach the WMS API: ${e.message}` : 'Network error', true);
    }
  }, [wh, toast]);

  useEffect(() => { localStorage.setItem('wms.wh', wh); void reload(); }, [wh, reload]);

  const run = useCallback(async <T,>(action: () => Promise<T>, okMsg?: string | ((r: T) => string)) => {
    try {
      const r = await action();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await reload();
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), true);
      await reload(); // show the saved state again, not the rejected edit
      return undefined;
    }
  }, [reload, toast]);

  // Printing: render the content into #print-root, print, then clear it.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printing]);

  return (
    <Ctx.Provider value={{ warehouses, wh, setWh, structure, rackTypes, plateTypes, products, version, user, setUser, reload, toast, run, print: setPrinting }}>
      {children}
      {toastMsg && <div className={`toast${toastMsg.err ? ' err' : ''}`} role="status">{toastMsg.msg}</div>}
      {printing && createPortal(<div id="print-root">{printing}</div>, document.body)}
    </Ctx.Provider>
  );
}

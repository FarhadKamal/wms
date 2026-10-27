// App-wide state: current warehouse, its structure, the shared types, and toasts.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';
import type { PlateType, RackType, Structure, WarehouseRow } from './api';

interface Wms {
  warehouses: WarehouseRow[];
  wh: string;
  setWh: (code: string) => void;
  structure: Structure | null;
  rackTypes: RackType[];
  plateTypes: PlateType[];
  /** Refetch everything after a change. */
  reload: () => Promise<void>;
  toast: (msg: string, isError?: boolean) => void;
  /** Run an API action: toast its success message or its error, then reload. Returns false on error. */
  run: (action: () => Promise<unknown>, okMsg?: string) => Promise<boolean>;
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
  const [structure, setStructure] = useState<Structure | null>(null);
  const [rackTypes, setRackTypes] = useState<RackType[]>([]);
  const [plateTypes, setPlateTypes] = useState<PlateType[]>([]);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);

  const toast = useCallback((msg: string, isError = false) => {
    setToastMsg({ msg, err: isError });
    window.setTimeout(() => setToastMsg((t) => (t?.msg === msg ? null : t)), 3800);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [ws, rt, pt] = await Promise.all([api.warehouses(), api.rackTypes(), api.plateTypes()]);
      setWarehouses(ws); setRackTypes(rt); setPlateTypes(pt);
      const code = ws.some((w) => w.code === wh) ? wh : ws[0]?.code;
      if (code && code !== wh) setWh(code);
      setStructure(code ? await api.structure(code) : null);
    } catch (e) {
      toast(e instanceof Error ? `Can't reach the WMS API: ${e.message}` : 'Network error', true);
    }
  }, [wh, toast]);

  useEffect(() => { localStorage.setItem('wms.wh', wh); void reload(); }, [wh, reload]);

  const run = useCallback(async (action: () => Promise<unknown>, okMsg?: string) => {
    try {
      await action();
      if (okMsg) toast(okMsg);
      await reload();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), true);
      await reload(); // show the saved state again, not the rejected edit
      return false;
    }
  }, [reload, toast]);

  return (
    <Ctx.Provider value={{ warehouses, wh, setWh, structure, rackTypes, plateTypes, reload, toast, run }}>
      {children}
      {toastMsg && <div className={`toast${toastMsg.err ? ' err' : ''}`} role="status">{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}

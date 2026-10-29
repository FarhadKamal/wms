// Who may do what. Kept deliberately simple: no approval workflows.
//   ADMIN        everything, every warehouse, manages users
//   MANAGER      stock movement + warehouse setup, assigned warehouses only
//   STORE_KEEPER receive, put-away, move, dispatch, assigned warehouses only
//   MANAGEMENT   read-only dashboards and reports, every warehouse

export type Role = 'ADMIN' | 'MANAGER' | 'STORE_KEEPER' | 'MANAGEMENT';

export interface Actor {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  company: 'AZNEO' | 'PNL';
  /** Codes of assigned warehouses (ignored for ADMIN and MANAGEMENT, who see all). */
  warehouses: string[];
}

/** Roles allowed for each kind of change. Reads (GET) are open to every logged-in role. */
export const CAN = {
  moveStock: ['ADMIN', 'MANAGER', 'STORE_KEEPER'],
  setup: ['ADMIN', 'MANAGER'],
  createWarehouse: ['ADMIN'],
  manageUsers: ['ADMIN'],
  manageProducts: ['ADMIN'], // IT uploads the product Excel
} as const satisfies Record<string, readonly Role[]>;

export const seesAllWarehouses = (a: Pick<Actor, 'role'>) => a.role === 'ADMIN' || a.role === 'MANAGEMENT';

export function canAccessWarehouse(a: Pick<Actor, 'role' | 'warehouses'>, whCode: string): boolean {
  return seesAllWarehouses(a) || a.warehouses.includes(whCode);
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocType, EventType, Prisma } from '../generated/prisma/client.js';
import { fitCheck, ProductDims } from '../domain/fit.js';
import { docNumber, RECEIVING_CODE, unitIdFor } from '../domain/layout.js';
import { Candidate, bestQuantity, isValidVin, suggestLocations } from '../domain/putaway.js';
import { Actor } from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Tx, nextSequence } from '../setup/layout-sync.js';
import { DispatchDto, PutAwayDto, ReceiveDto, SuggestDto, TransferDto } from './stock.dto.js';

const TX = { timeout: 60_000, maxWait: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
const DHAKA_OFFSET_MS = 6 * 3600_000; // the warehouses run on Bangladesh time (UTC+6)
const todayLocal = () => new Date(Date.now() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
const startOfTodayLocal = () => new Date(Math.floor((Date.now() + DHAKA_OFFSET_MS) / 86_400_000) * 86_400_000 - DHAKA_OFFSET_MS);
const asDate = (d?: string) => new Date(`${d ?? todayLocal()}T00:00:00Z`);

const PRODUCT_DIMS = { sku: true, name: true, lengthCm: true, widthCm: true, heightCm: true, weightKg: true, stackable: true } as const;
const dims = (p: ProductDims): ProductDims => ({ lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg, stackable: p.stackable });
const EVENT_OF: Record<DocType, EventType> = { RCV: 'RECEIVED', DSP: 'DISPATCHED', TRF: 'MOVED' };

/** Strip the QR prefix a scanner returns ("AZWMS|U|…", "AZWMS|L|CTG|…", "AZWMS|D|…"). */
export const parseScan = (raw: string) => {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^AZWMS\|[ULD]\|(?:[A-Z]{2,4}\|)?(.+)$/);
  return m ? m[1] : s;
};

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  private async warehouse(code: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { code } });
    if (!wh) throw new NotFoundException(`Warehouse ${code} not found`);
    return wh;
  }

  // ---------------------------------------------------------------- shared helpers

  /** Every location of the warehouse with its contents and its shelf's load — the input of the put-away rules. */
  private async candidates(tx: Tx, warehouseId: string): Promise<Candidate[]> {
    // Sequential on purpose: a transaction has one connection, so its queries can't run in parallel.
    const locs = await tx.location.findMany({ where: { warehouseId }, include: { shelf: true } });
    const units = await tx.unit.findMany({ where: { warehouseId, status: { not: 'DISPATCHED' }, locationId: { not: null } }, select: { locationId: true, product: { select: PRODUCT_DIMS } } });
    const shelfOf = new Map(locs.map((l) => [l.id, l.shelfId]));
    const shelfKg = new Map<string, number>();
    const inLoc = new Map<string, typeof units>();
    for (const u of units) {
      inLoc.set(u.locationId!, [...(inLoc.get(u.locationId!) ?? []), u]);
      const sh = shelfOf.get(u.locationId!);
      if (sh) shelfKg.set(sh, (shelfKg.get(sh) ?? 0) + u.product.weightKg);
    }
    return locs.map((l) => ({
      code: l.code, address: l.address, kind: l.kind,
      geom: { kind: l.kind, lengthCm: l.lengthCm, widthCm: l.widthCm, heightCm: l.heightCm, capKg: l.capKg, shelf: l.shelf ? { capKg: l.shelf.capKg, usedKg: shelfKg.get(l.shelf.id) ?? 0 } : null },
      contents: (inLoc.get(l.id) ?? []).map((u) => dims(u.product)),
      skus: [...new Set((inLoc.get(l.id) ?? []).map((u) => u.product.sku))],
    }));
  }

  /** Find a location by its code, address or plate label (as scanned or typed). */
  private async resolveLocation(tx: Tx, warehouseId: string, input: string) {
    const v = parseScan(input);
    const loc = await tx.location.findFirst({ where: { warehouseId, OR: [{ code: v }, { address: v }] }, include: { shelf: true } });
    if (!loc) {
      const holder = await tx.location.findFirst({ where: { warehouseId, boardCode: v, kind: 'PLATE' } });
      throw new NotFoundException(holder ? `${v} holds plates — scan the plate label instead` : `No location ${v} in this warehouse`);
    }
    return loc;
  }

  /** Lock units (and check they all exist in this warehouse) for the rest of the transaction. */
  private async lockUnits(tx: Tx, warehouseId: string, uidsIn: string[]) {
    const uids = [...new Set(uidsIn.map(parseScan))];
    await tx.$queryRaw`SELECT id FROM units WHERE uid = ANY(${uids}) AND "warehouseId" = ${warehouseId}::uuid FOR UPDATE`;
    const units = await tx.unit.findMany({
      where: { uid: { in: uids }, warehouseId },
      include: { product: { select: PRODUCT_DIMS }, location: { select: { id: true, address: true, boardCode: true } } },
    });
    const missing = uids.filter((u) => !units.some((x) => x.uid === u));
    if (missing.length) throw new NotFoundException(`Not in this warehouse: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
    return units;
  }

  /** Lock the target location and its shelf, then check space and weight against what is there now. */
  private async lockAndFit(tx: Tx, loc: { id: string; kind: string; shelfId: string | null; lengthCm: number; widthCm: number; heightCm: number; capKg: number | null; address: string },
    incoming: ProductDims[]) {
    if (loc.kind === 'RECEIVING') throw new ConflictException("That's the Receiving Area");
    await tx.$queryRaw`SELECT id FROM locations WHERE id = ${loc.id}::uuid FOR UPDATE`;
    let shelf: { capKg: number; usedKg: number } | null = null;
    if (loc.shelfId) {
      const [row] = await tx.$queryRaw<Array<{ capKg: number }>>`SELECT "capKg" FROM shelves WHERE id = ${loc.shelfId}::uuid FOR UPDATE`;
      const onShelf = await tx.unit.findMany({ where: { status: { not: 'DISPATCHED' }, location: { shelfId: loc.shelfId } }, select: { product: { select: { weightKg: true } } } });
      shelf = { capKg: row.capKg, usedKg: onShelf.reduce((s, u) => s + u.product.weightKg, 0) };
    }
    const here = await tx.unit.findMany({ where: { locationId: loc.id, status: { not: 'DISPATCHED' } }, select: { product: { select: PRODUCT_DIMS } } });
    const fit = fitCheck(incoming, { kind: loc.kind as 'BAY', lengthCm: loc.lengthCm, widthCm: loc.widthCm, heightCm: loc.heightCm, capKg: loc.capKg, shelf }, { products: here.map((u) => dims(u.product)) });
    if (!fit.ok) throw new ConflictException(`${loc.address}: ${fit.reason}`);
    return fit;
  }

  private async newDocNo(tx: Tx, whCode: string, type: DocType, date: Date) {
    const year = date.getUTCFullYear();
    return docNumber(type, whCode, year, await nextSequence(tx, `DOC:${whCode}:${type}:${year}`));
  }

  private markBoards(tx: Tx, warehouseId: string, codes: Array<string | null | undefined>) {
    const list = [...new Set(codes.filter((c): c is string => !!c))];
    return list.length ? tx.bayBoard.updateMany({ where: { warehouseId, code: { in: list } }, data: { dirty: true } }) : null;
  }

  // ---------------------------------------------------------------- IN

  /** Goods unloaded into the Receiving Area: one challan for the whole delivery, one unit ID per item. */
  async receive(whCode: string, dto: ReceiveDto, actor: Actor) {
    const wh = await this.warehouse(whCode);
    const products = await this.prisma.product.findMany({ where: { sku: { in: dto.lines.map((l) => l.sku) } }, include: { category: true } });
    const seen = new Set<string>();
    const lines = dto.lines.map((l) => {
      const p = products.find((x) => x.sku === l.sku);
      if (!p) throw new BadRequestException(`Unknown product ${l.sku}`);
      if (p.category.idRule !== 'VIN') return { p, qty: l.qty, vins: null as string[] | null };
      const vins = (l.vins ?? []).map((v) => v.trim().toUpperCase()).filter(Boolean);
      if (vins.length !== l.qty) throw new BadRequestException(`${p.name}: ${l.qty} cars but ${vins.length} VINs`);
      for (const v of vins) {
        if (!isValidVin(v)) throw new BadRequestException(`VIN ${v} is not 17 valid characters`);
        if (seen.has(v)) throw new BadRequestException(`VIN ${v} is entered twice`);
        seen.add(v);
      }
      return { p, qty: l.qty, vins };
    });
    if (seen.size) {
      const dup = await this.prisma.unit.findMany({ where: { uid: { in: [...seen] } }, select: { uid: true } });
      if (dup.length) throw new ConflictException(`Already in the system: ${dup.map((d) => d.uid).join(', ')}`);
    }

    const no = await this.prisma.$transaction(async (tx) => {
      const rcv = await tx.location.findUniqueOrThrow({ where: { warehouseId_code: { warehouseId: wh.id, code: RECEIVING_CODE } } });
      const date = asDate(dto.date);
      const doc = await tx.document.create({
        data: { warehouseId: wh.id, no: await this.newDocNo(tx, wh.code, 'RCV', date), type: 'RCV', docDate: date, party: dto.party, reference: dto.reference ?? '', preparedBy: actor.fullName, preparedById: actor.id },
      });
      const rows: Array<{ uid: string; productId: string }> = [];
      for (const l of lines) {
        if (l.vins) l.vins.forEach((uid) => rows.push({ uid, productId: l.p.id }));
        else {
          const last = await nextSequence(tx, `UNIT:${l.p.sku}`, l.qty);
          for (let i = last - l.qty + 1; i <= last; i++) rows.push({ uid: unitIdFor(l.p.sku, i), productId: l.p.id });
        }
      }
      const units = await tx.unit.createManyAndReturn({
        data: rows.map((r) => ({ ...r, warehouseId: wh.id, status: 'STAGING' as const, locationId: rcv.id, receivingDocId: doc.id })),
        select: { id: true },
      });
      await tx.movementEvent.createMany({ data: units.map((u) => ({ unitId: u.id, documentId: doc.id, type: 'RECEIVED' as const, toCode: RECEIVING_CODE, by: actor.fullName, userId: actor.id })) });
      return doc.no;
    }, TX);
    return this.document(no);
  }

  /** Units waiting in the Receiving Area, grouped by challan and product. */
  async pending(whCode: string) {
    const wh = await this.warehouse(whCode);
    const units = await this.prisma.unit.findMany({
      where: { warehouseId: wh.id, status: 'STAGING' },
      orderBy: { uid: 'asc' },
      select: { uid: true, product: { select: { ...PRODUCT_DIMS, category: { select: { idRule: true } } } }, receivingDoc: { select: { no: true, docDate: true } } },
    });
    const groups = new Map<string, { doc: string; docDate: Date; sku: string; product: (typeof units)[number]['product']; uids: string[] }>();
    for (const u of units) {
      const k = `${u.receivingDoc.no}|${u.product.sku}`;
      if (!groups.has(k)) groups.set(k, { doc: u.receivingDoc.no, docDate: u.receivingDoc.docDate, sku: u.product.sku, product: u.product, uids: [] });
      groups.get(k)!.uids.push(u.uid);
    }
    return [...groups.values()];
  }

  /** Where can these units go, and how many of them fit together? */
  async suggest(whCode: string, dto: SuggestDto) {
    const wh = await this.warehouse(whCode);
    const units = await this.prisma.unit.findMany({ where: { warehouseId: wh.id, uid: { in: dto.uids.map(parseScan) }, status: { not: 'DISPATCHED' } }, select: { uid: true, product: { select: PRODUCT_DIMS } } });
    if (!units.length) throw new NotFoundException('None of those units are in this warehouse');
    const cands = await this.prisma.$transaction((tx) => this.candidates(tx, wh.id), TX);
    const first = units[0].product;
    const sameSku = units.every((u) => u.product.sku === first.sku);
    return {
      suggestions: suggestLocations(units.map((u) => dims(u.product)), first.sku, cands, 6, dto.exclude),
      bestQty: sameSku ? bestQuantity(dims(first), units.length, first.sku, cands) : null,
    };
  }

  async putAway(whCode: string, dto: PutAwayDto, actor: Actor) {
    const wh = await this.warehouse(whCode);
    return this.prisma.$transaction(async (tx) => {
      const units = await this.lockUnits(tx, wh.id, dto.uids);
      const notWaiting = units.filter((u) => u.status !== 'STAGING');
      if (notWaiting.length) throw new ConflictException(`Not waiting for put-away: ${notWaiting.map((u) => u.uid).slice(0, 5).join(', ')}`);
      const loc = await this.resolveLocation(tx, wh.id, dto.location);
      const fit = await this.lockAndFit(tx, loc, units.map((u) => dims(u.product)));
      await tx.unit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: { status: 'IN_STOCK', locationId: loc.id } });
      await tx.movementEvent.createMany({ data: units.map((u) => ({ unitId: u.id, documentId: u.receivingDocId, type: 'PUT_AWAY' as const, fromCode: RECEIVING_CODE, toCode: loc.address, by: actor.fullName, userId: actor.id })) });
      await this.markBoards(tx, wh.id, [loc.boardCode]);
      return { placed: units.length, location: loc.address, note: fit.ok ? fit.note : '' };
    }, TX);
  }

  // ---------------------------------------------------------------- MOVE

  async transfer(whCode: string, dto: TransferDto, actor: Actor) {
    const wh = await this.warehouse(whCode);
    const no = await this.prisma.$transaction(async (tx) => {
      const units = await this.lockUnits(tx, wh.id, dto.uids);
      const bad = units.filter((u) => u.status !== 'IN_STOCK');
      if (bad.length) throw new ConflictException(`Only shelved stock can be moved (use Put-away for the Receiving Area): ${bad.map((u) => u.uid).slice(0, 5).join(', ')}`);
      const loc = await this.resolveLocation(tx, wh.id, dto.location);
      const moving = units.filter((u) => u.locationId !== loc.id);
      if (!moving.length) throw new ConflictException(`Already in ${loc.address}`);
      await this.lockAndFit(tx, loc, moving.map((u) => dims(u.product)));
      const date = asDate();
      const doc = await tx.document.create({
        data: { warehouseId: wh.id, no: await this.newDocNo(tx, wh.code, 'TRF', date), type: 'TRF', docDate: date, party: 'Internal move', reference: dto.reason ?? '', preparedBy: actor.fullName, preparedById: actor.id, toCode: loc.address },
      });
      await tx.unit.updateMany({ where: { id: { in: moving.map((u) => u.id) } }, data: { locationId: loc.id } });
      await tx.movementEvent.createMany({ data: moving.map((u) => ({ unitId: u.id, documentId: doc.id, type: 'MOVED' as const, fromCode: u.location?.address ?? null, toCode: loc.address, by: actor.fullName, userId: actor.id })) });
      await this.markBoards(tx, wh.id, [loc.boardCode, ...moving.map((u) => u.location?.boardCode)]);
      return doc.no;
    }, TX);
    return this.document(no);
  }

  // ---------------------------------------------------------------- OUT

  /** One challan per receiver: every scanned unit leaves on it. */
  async dispatch(whCode: string, dto: DispatchDto, actor: Actor) {
    const wh = await this.warehouse(whCode);
    const no = await this.prisma.$transaction(async (tx) => {
      const units = await this.lockUnits(tx, wh.id, dto.uids);
      const gone = units.filter((u) => u.status === 'DISPATCHED');
      if (gone.length) throw new ConflictException(`Already dispatched: ${gone.map((u) => u.uid).slice(0, 5).join(', ')}`);
      const date = asDate(dto.date);
      const doc = await tx.document.create({
        data: { warehouseId: wh.id, no: await this.newDocNo(tx, wh.code, 'DSP', date), type: 'DSP', docDate: date, party: dto.party, reference: dto.destination ?? '', preparedBy: actor.fullName, preparedById: actor.id },
      });
      await tx.unit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: { status: 'DISPATCHED', locationId: null, dispatchDocId: doc.id } });
      await tx.movementEvent.createMany({ data: units.map((u) => ({ unitId: u.id, documentId: doc.id, type: 'DISPATCHED' as const, fromCode: u.location?.address ?? null, by: actor.fullName, userId: actor.id })) });
      await this.markBoards(tx, wh.id, units.map((u) => u.location?.boardCode));
      return doc.no;
    }, TX);
    return this.document(no);
  }

  // ---------------------------------------------------------------- read

  /** A challan / transfer slip with its lines grouped by product. */
  async document(no: string) {
    const doc = await this.prisma.document.findUnique({
      where: { no },
      include: {
        warehouse: { select: { code: true, name: true, address: true } },
        events: { include: { unit: { select: { uid: true, product: { select: { sku: true, name: true, weightKg: true, category: { select: { idRule: true } } } } } } }, orderBy: { id: 'asc' } },
      },
    });
    if (!doc) throw new NotFoundException(`Document ${no} not found`);
    const evs = doc.events.filter((e) => e.type === EVENT_OF[doc.type]);
    const lines = new Map<string, { sku: string; name: string; byVin: boolean; uids: string[]; from: Record<string, number>; kg: number }>();
    for (const e of evs) {
      const p = e.unit.product;
      if (!lines.has(p.sku)) lines.set(p.sku, { sku: p.sku, name: p.name, byVin: p.category.idRule === 'VIN', uids: [], from: {}, kg: 0 });
      const l = lines.get(p.sku)!;
      l.uids.push(e.unit.uid);
      l.kg += p.weightKg;
      if (e.fromCode) l.from[e.fromCode] = (l.from[e.fromCode] ?? 0) + 1;
    }
    const { events: _events, ...rest } = doc;
    return { ...rest, units: evs.length, totalKg: [...lines.values()].reduce((s, l) => s + l.kg, 0), lines: [...lines.values()] };
  }

  async documents(whCode: string, type?: string) {
    const wh = await this.warehouse(whCode);
    const docs = await this.prisma.document.findMany({
      where: { warehouseId: wh.id, ...(type && ['RCV', 'DSP', 'TRF'].includes(type) ? { type: type as DocType } : {}) },
      orderBy: { createdAt: 'desc' }, take: 300,
      select: { no: true, type: true, docDate: true, party: true, reference: true, createdAt: true, events: { select: { type: true, unit: { select: { product: { select: { name: true } } } } } } },
    });
    return docs.map(({ events, ...d }) => {
      const mine = events.filter((e) => e.type === EVENT_OF[d.type]);
      const byName = new Map<string, number>();
      mine.forEach((e) => byName.set(e.unit.product.name, (byName.get(e.unit.product.name) ?? 0) + 1));
      return { ...d, units: mine.length, products: [...byName].map(([name, qty]) => ({ name, qty })) };
    });
  }

  /** Stock per product: on shelf, in receiving, total, number of locations. */
  async stock(whCode: string) {
    const wh = await this.warehouse(whCode);
    const [products, units] = await Promise.all([
      this.prisma.product.findMany({ orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }], include: { category: true } }),
      this.prisma.unit.findMany({ where: { warehouseId: wh.id, status: { not: 'DISPATCHED' } }, select: { productId: true, status: true, locationId: true } }),
    ]);
    return products.map((p) => {
      const mine = units.filter((u) => u.productId === p.id);
      const onShelf = mine.filter((u) => u.status === 'IN_STOCK');
      return {
        sku: p.sku, name: p.name, brand: p.brand, category: p.category.name, idRule: p.category.idRule,
        lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg, reorderPoint: p.reorderPoint,
        onShelf: onShelf.length, inReceiving: mine.length - onShelf.length, total: mine.length,
        locations: new Set(onShelf.map((u) => u.locationId)).size,
      };
    });
  }

  /** Where one product is, location by location. */
  async stockOf(whCode: string, sku: string) {
    const wh = await this.warehouse(whCode);
    const units = await this.prisma.unit.findMany({
      where: { warehouseId: wh.id, status: { not: 'DISPATCHED' }, product: { sku } },
      orderBy: { uid: 'asc' }, select: { uid: true, location: { select: { code: true, address: true, kind: true, boardCode: true } } },
    });
    const at = new Map<string, { address: string; kind: string; boardCode: string | null; uids: string[] }>();
    for (const u of units) {
      const l = u.location!;
      if (!at.has(l.code)) at.set(l.code, { address: l.address, kind: l.kind, boardCode: l.boardCode, uids: [] });
      at.get(l.code)!.uids.push(u.uid);
    }
    return [...at.values()].sort((a, b) => a.address.localeCompare(b.address));
  }

  /** One unit: what, where, and its full history. */
  async unit(uidRaw: string) {
    const uid = parseScan(uidRaw);
    const u = await this.prisma.unit.findUnique({
      where: { uid },
      include: {
        product: { include: { category: true } }, warehouse: { select: { code: true, name: true } },
        location: { select: { code: true, address: true, kind: true, boardCode: true } },
        receivingDoc: { select: { no: true } }, dispatchDoc: { select: { no: true, party: true } },
        events: { orderBy: { at: 'asc' }, include: { document: { select: { no: true, party: true } } } },
      },
    });
    if (!u) throw new NotFoundException(`No unit ${uid}`);
    return { ...u, events: u.events.map((e) => ({ ...e, id: e.id.toString() })) };
  }

  /** Dashboard of one bay board position (or floor cell, or any location/plate inside it). */
  async position(whCode: string, input: string) {
    const wh = await this.warehouse(whCode);
    const v = parseScan(input);
    const direct = await this.prisma.location.findFirst({ where: { warehouseId: wh.id, OR: [{ code: v }, { address: v }] } });
    const board = direct?.boardCode ?? v;
    const locs = await this.prisma.location.findMany({
      where: { warehouseId: wh.id, boardCode: board },
      include: { shelf: true, rack: { select: { name: true } }, block: { select: { name: true } }, plate: { include: { plateType: true } } },
      orderBy: { address: 'asc' },
    });
    if (!locs.length) {
      if (direct) return { board: null, location: direct.address, kind: direct.kind, items: [], qty: 0, kg: 0, plates: [], shelf: null, events: [], description: direct.kind === 'RECEIVING' ? 'Receiving Area' : direct.address };
      throw new NotFoundException(`No location ${v} in this warehouse`);
    }
    const units = await this.prisma.unit.findMany({
      where: { locationId: { in: locs.map((l) => l.id) }, status: { not: 'DISPATCHED' } },
      orderBy: { uid: 'asc' }, select: { uid: true, locationId: true, product: { select: { sku: true, name: true, weightKg: true } } },
    });
    const group = (us: typeof units) => {
      const m = new Map<string, { sku: string; name: string; qty: number; kg: number; uids: string[] }>();
      for (const u of us) {
        const g = m.get(u.product.sku) ?? { sku: u.product.sku, name: u.product.name, qty: 0, kg: 0, uids: [] };
        g.qty++; g.kg += u.product.weightKg; g.uids.push(u.uid);
        m.set(u.product.sku, g);
      }
      return [...m.values()];
    };
    const first = locs[0];
    let shelf = null;
    if (first.shelf) {
      const onShelf = await this.prisma.unit.findMany({ where: { status: { not: 'DISPATCHED' }, location: { shelfId: first.shelf.id } }, select: { product: { select: { weightKg: true, lengthCm: true, widthCm: true, heightCm: true } } } });
      const rack = await this.prisma.rack.findUnique({ where: { id: first.rackId! }, include: { rackType: true } });
      shelf = {
        level: first.shelf.level, span: first.shelf.span, heightCm: first.shelf.heightCm, capKg: first.shelf.capKg,
        usedKg: onShelf.reduce((s, u) => s + u.product.weightKg, 0),
        volumeCm3: rack ? rack.rackType.lengthCm * rack.rackType.depthCm * first.shelf.heightCm : 0,
        usedCm3: onShelf.reduce((s, u) => s + u.product.lengthCm * u.product.widthCm * u.product.heightCm, 0),
      };
    }
    const addresses = locs.map((l) => l.address);
    const events = await this.prisma.movementEvent.findMany({
      where: { OR: [{ toCode: { in: addresses } }, { fromCode: { in: addresses } }], unit: { warehouseId: wh.id } },
      orderBy: { at: 'desc' }, take: 40, include: { document: { select: { no: true } } },
    });
    const bb = await this.prisma.bayBoard.findUnique({ where: { warehouseId_code: { warehouseId: wh.id, code: board } } });
    const parts = [first.block?.name, first.rack?.name, first.shelf ? `Shelf ${first.shelf.level}${first.shelf.span > 1 ? `+${first.shelf.level + 1}` : ''}` : null,
      first.bay ? `Bay ${first.bay}` : null, first.cellRow ? `Row ${first.cellRow}, Col ${first.cellCol} (floor)` : null].filter(Boolean);
    return {
      board, description: parts.join(' · '), heightCm: first.heightCm,
      items: group(units), qty: units.length, kg: units.reduce((s, u) => s + u.product.weightKg, 0),
      plates: locs.filter((l) => l.kind === 'PLATE').map((l) => {
        const us = units.filter((u) => u.locationId === l.id);
        return { label: l.code, address: l.address, type: l.plate?.plateType.name ?? '', capKg: l.capKg, items: group(us), kg: us.reduce((s, u) => s + u.product.weightKg, 0) };
      }),
      shelf, boardDirty: bb?.dirty ?? false, boardUpdatedAt: bb?.lastUpdatedAt ?? null,
      events: events.map((e) => ({ type: e.type, at: e.at, doc: e.document.no, by: e.by, inbound: addresses.includes(e.toCode ?? ''), from: e.fromCode, to: e.toCode })),
    };
  }

  /** What a scanned/typed code is: a unit, a location/plate, or a document. */
  async scan(whCode: string, raw: string) {
    const wh = await this.warehouse(whCode);
    const v = parseScan(raw);
    const unit = await this.prisma.unit.findUnique({ where: { uid: v }, select: { uid: true, warehouse: { select: { code: true } } } });
    if (unit) return { type: 'unit' as const, uid: unit.uid, warehouse: unit.warehouse.code };
    const doc = await this.prisma.document.findUnique({ where: { no: v }, select: { no: true } });
    if (doc) return { type: 'document' as const, no: doc.no };
    const loc = await this.prisma.location.findFirst({ where: { warehouseId: wh.id, OR: [{ code: v }, { address: v }, { boardCode: v }] } });
    if (loc) return { type: 'location' as const, board: loc.boardCode ?? loc.address, kind: loc.kind };
    throw new NotFoundException(`Nothing found for ${v} in ${wh.name}`);
  }

  // ---------------------------------------------------------------- bay boards

  async boards(whCode: string) {
    const wh = await this.warehouse(whCode);
    const dirty = await this.prisma.bayBoard.findMany({ where: { warehouseId: wh.id, dirty: true }, orderBy: { code: 'asc' } });
    const locs = await this.prisma.location.findMany({ where: { warehouseId: wh.id, boardCode: { in: dirty.map((b) => b.code) } }, select: { id: true, boardCode: true, rackId: true } });
    const units = await this.prisma.unit.findMany({ where: { locationId: { in: locs.map((l) => l.id) }, status: { not: 'DISPATCHED' } }, select: { locationId: true, product: { select: { sku: true, name: true, weightKg: true } } } });
    return dirty.map((b) => {
      const ids = new Set(locs.filter((l) => l.boardCode === b.code).map((l) => l.id));
      const mine = units.filter((u) => ids.has(u.locationId!));
      const items = new Map<string, { name: string; qty: number; kg: number }>();
      mine.forEach((u) => { const g = items.get(u.product.sku) ?? { name: u.product.name, qty: 0, kg: 0 }; g.qty++; g.kg += u.product.weightKg; items.set(u.product.sku, g); });
      return { code: b.code, lastUpdatedAt: b.lastUpdatedAt, onRack: locs.some((l) => l.boardCode === b.code && l.rackId), items: [...items.values()], qty: mine.length, kg: mine.reduce((s, u) => s + u.product.weightKg, 0) };
    });
  }

  async markBoardUpdated(whCode: string, code: string) {
    const wh = await this.warehouse(whCode);
    const r = await this.prisma.bayBoard.updateMany({ where: { warehouseId: wh.id, ...(code === '*' ? { dirty: true } : { code }) }, data: { dirty: false, lastUpdatedAt: new Date() } });
    return { updated: r.count };
  }

  // ---------------------------------------------------------------- dashboard

  async dashboard(whCode: string) {
    const wh = await this.warehouse(whCode);
    const since = startOfTodayLocal();
    const [byStatus, received, dispatched, boards, docs, stock] = await Promise.all([
      this.prisma.unit.groupBy({ by: ['status'], where: { warehouseId: wh.id }, _count: true }),
      this.prisma.movementEvent.count({ where: { type: 'RECEIVED', at: { gte: since }, unit: { warehouseId: wh.id } } }),
      this.prisma.movementEvent.count({ where: { type: 'DISPATCHED', at: { gte: since }, unit: { warehouseId: wh.id } } }),
      this.prisma.bayBoard.count({ where: { warehouseId: wh.id, dirty: true } }),
      this.documents(whCode),
      this.stock(whCode),
    ]);
    const count = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
    return {
      inStock: count('IN_STOCK'), staging: count('STAGING'), receivedToday: received, dispatchedToday: dispatched, boardsToUpdate: boards,
      latestDocs: docs.slice(0, 6),
      lowStock: stock.filter((p) => p.total < p.reorderPoint && (p.total > 0 || docs.length > 0)).map((p) => ({ sku: p.sku, name: p.name, total: p.total, reorderPoint: p.reorderPoint })),
    };
  }

  products() {
    return this.prisma.product.findMany({ orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }], include: { category: true } });
  }
}

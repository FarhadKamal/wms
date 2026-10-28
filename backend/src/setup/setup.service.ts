import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Actor, seesAllWarehouses } from '../auth/permissions.js';
import { Prisma } from '../generated/prisma/client.js';
import { changeProblem } from '../domain/change.js';
import { autoLengthCells, cellAreaSqft, cellSideCm, shelvesOf, weightBand } from '../domain/geometry.js';
import {
  StructureIn, firstRackSpot, floorPlateRoom, planLayout, plateLabel, positionPlateRoom, rackPlacementProblem,
} from '../domain/layout.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateBlockDto, CreatePlateTypeDto, CreatePlatesDto, CreateRackDto, CreateRackTypeDto, CreateWarehouseDto,
  PaintCellsDto, UpdateBlockDto, UpdateRackDto, UpdateWarehouseDto,
} from './setup.dto.js';
import { LoadedStructure, Tx, loadStructure, loadUnitsAt, nextSequence, syncLayout } from './layout-sync.js';

const TX = { timeout: 60_000, maxWait: 15_000 };
const BLOCK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every structural change goes through here: load → apply in memory → check it is safe for
   * the stock already placed → write → regenerate shelves/locations/boards. One transaction.
   */
  private change<T>(code: string, mutate: (s: StructureIn, ctx: LoadedStructure) => void, write: (tx: Tx, ctx: LoadedStructure) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const ctx = await loadStructure(tx, code);
      const next = structuredClone(ctx.s);
      mutate(next, ctx);
      const problem = changeProblem(next, await loadUnitsAt(tx, ctx.warehouse.id));
      if (problem) throw new ConflictException(problem);
      const out = await write(tx, ctx);
      await syncLayout(tx, await loadStructure(tx, code));
      return out;
    }, TX).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Stock or plates still use that place — move or remove them first');
      }
      throw e;
    });
  }

  // ---------------------------------------------------------------- warehouses

  /** Only the warehouses this user may see. */
  listWarehouses(u: Actor) {
    return this.prisma.warehouse.findMany({
      where: seesAllWarehouses(u) ? {} : { code: { in: u.warehouses } },
      orderBy: { createdAt: 'asc' },
      select: { code: true, name: true, address: true, landmark: true, areaSqft: true, status: true, _count: { select: { blocks: true, racks: true, plates: true } } },
    });
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    if (await this.prisma.warehouse.findUnique({ where: { code: dto.code } })) throw new ConflictException(`Code ${dto.code} is already used`);
    return this.prisma.$transaction(async (tx) => {
      const wh = await tx.warehouse.create({ data: { ...dto, landmark: dto.landmark ?? '', status: dto.status ?? 'PLANNED' } });
      await syncLayout(tx, await loadStructure(tx, wh.code)); // creates its Receiving Area
      return wh;
    }, TX);
  }

  async updateWarehouse(code: string, dto: UpdateWarehouseDto) {
    const wh = await this.prisma.warehouse.findUnique({ where: { code }, include: { blocks: { select: { areaSqft: true } } } });
    if (!wh) throw new NotFoundException(`Warehouse ${code} not found`);
    const inBlocks = wh.blocks.reduce((s, b) => s + b.areaSqft, 0);
    if (dto.areaSqft != null && dto.areaSqft < inBlocks) {
      throw new ConflictException(`Total area can't be smaller than the blocks inside it (${Math.round(inBlocks)} sq ft)`);
    }
    return this.prisma.warehouse.update({ where: { code }, data: dto });
  }

  // ---------------------------------------------------------------- structure (read)

  async getStructure(code: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { code } });
    if (!wh) throw new NotFoundException(`Warehouse ${code} not found`);
    const ctx = await this.prisma.$transaction((tx) => loadStructure(tx, code), TX);
    const plan = planLayout(ctx.s);
    const placed = await this.prisma.unit.findMany({
      where: { warehouseId: wh.id, status: { not: 'DISPATCHED' }, locationId: { not: null } },
      select: { location: { select: { code: true } }, product: { select: { weightKg: true, lengthCm: true, widthCm: true, heightCm: true } } },
    });
    const locByCode = new Map(plan.locations.map((l) => [l.code, l]));
    const shelfUse = new Map<string, { kg: number; cm3: number }>();
    const locUse = new Map<string, { units: number; kg: number }>();
    for (const u of placed) {
      const l = locByCode.get(u.location!.code);
      if (!l) continue;
      const lu = locUse.get(l.code) ?? { units: 0, kg: 0 };
      locUse.set(l.code, { units: lu.units + 1, kg: lu.kg + u.product.weightKg });
      if (l.rackCode && l.shelfLevel != null) {
        const k = `${l.rackCode}|${l.shelfLevel}`;
        const su = shelfUse.get(k) ?? { kg: 0, cm3: 0 };
        shelfUse.set(k, { kg: su.kg + u.product.weightKg, cm3: su.cm3 + u.product.lengthCm * u.product.widthCm * u.product.heightCm });
      }
    }

    const rackRows = await this.prisma.rack.findMany({ where: { warehouseId: wh.id }, include: { rackType: true } });
    const plateRows = await this.prisma.plate.findMany({ where: { warehouseId: wh.id }, include: { plateType: true } });
    const areaByUse: Record<string, number> = {};
    const blocks = ctx.s.blocks.map((b) => {
      const ca = cellAreaSqft(b);
      for (const row of b.cells) for (const u of row) areaByUse[u] = (areaByUse[u] ?? 0) + ca;
      const storageCells = b.cells.flat().filter((u) => u === 'STORAGE').length;
      const meta = ctx.blockIds.get(b.code);
      return {
        code: b.code, id: meta, areaSqft: b.areaSqft, rows: b.rows, cols: b.cols, clearHeightCm: b.clearHeightCm,
        cellAreaSqft: ca, cellSideCm: cellSideCm(b), storageSqft: storageCells * ca,
        cells: b.cells, names: Object.fromEntries(ctx.areaNames.get(b.code) ?? []),
      };
    });
    const blockMeta = await this.prisma.block.findMany({ where: { warehouseId: wh.id }, select: { code: true, name: true, note: true } });
    const blockNames = new Map(blockMeta.map((b) => [b.code, b]));

    const racks = ctx.s.racks.map((r) => {
      const row = rackRows.find((x) => x.code === r.code)!;
      return {
        code: r.code, name: row.name, blockCode: r.blockCode, rackType: row.rackType,
        startRow: r.startRow, startCol: r.startCol, direction: r.direction, lengthCells: r.lengthCells, bays: r.bays, mergedShelves: r.mergedShelves,
        shelves: shelvesOf(r.type.shelfCount, r.mergedShelves).map((sh) => {
          const p = plan.shelves.find((x) => x.rackCode === r.code && x.level === sh.level)!;
          const use = shelfUse.get(`${r.code}|${sh.level}`) ?? { kg: 0, cm3: 0 };
          return { level: sh.level, span: sh.span, heightCm: p.heightCm, capKg: p.capKg, usedKg: use.kg, volumeCm3: p.volumeCm3, usedCm3: use.cm3, band: weightBand(use.kg, p.capKg) };
        }),
        plates: ctx.s.plates.filter((p) => p.parent.kind === 'POSITION' && p.parent.rackCode === r.code).length,
      };
    });

    const plates = ctx.s.plates.map((p) => {
      const l = locByCode.get(p.label);
      const row = plateRows.find((x) => x.label === p.label)!;
      const use = locUse.get(p.label) ?? { units: 0, kg: 0 };
      return { label: p.label, plateType: { id: row.plateTypeId, name: row.plateType.name }, parent: p.parent, address: l?.address ?? null, units: use.units, usedKg: use.kg, capKg: p.type.capKg };
    });

    const blockArea = ctx.s.blocks.reduce((s, b) => s + b.areaSqft, 0);
    return {
      warehouse: { code: wh.code, name: wh.name, address: wh.address, landmark: wh.landmark, areaSqft: wh.areaSqft, status: wh.status },
      blocks: blocks.map((b) => ({ ...b, name: blockNames.get(b.code)?.name ?? b.code, note: blockNames.get(b.code)?.note ?? '' })),
      racks, plates,
      floorCells: plan.locations.filter((l) => l.kind === 'FLOOR').map((l) => ({ code: l.code, blockCode: l.blockCode, row: l.cellRow, col: l.cellCol, ...(locUse.get(l.code) ?? { units: 0, kg: 0 }) })),
      summary: {
        areaByUse, blockAreaSqft: blockArea, storageSqft: areaByUse.STORAGE ?? 0, outsideBlocksSqft: Math.max(0, wh.areaSqft - blockArea),
        blocks: blocks.length, racks: racks.length, plates: plates.length,
        platesInShelves: plates.filter((p) => p.parent.kind === 'POSITION').length, platesOnFloor: plates.filter((p) => p.parent.kind === 'CELL').length,
        shelvesAtWeightLimit: racks.flatMap((r) => r.shelves.filter((s) => s.band === 'full').map((s) => `${r.code}-S${s.level}`)),
        locations: plan.locations.length,
      },
    };
  }

  // ---------------------------------------------------------------- blocks & grid

  async createBlock(code: string, dto: CreateBlockDto) {
    return this.change(code, (s, ctx) => {
      const used = s.blocks.reduce((sum, b) => sum + b.areaSqft, 0);
      if (used + dto.areaSqft > ctx.warehouse.areaSqft + 1e-6) {
        throw new ConflictException(`Not enough area left (${Math.round(ctx.warehouse.areaSqft - used)} sq ft free)`);
      }
    }, async (tx, ctx) => {
      const letter = BLOCK_LETTERS.find((l) => !ctx.blockIds.has(l));
      if (!letter) throw new BadRequestException('No block letters left');
      const block = await tx.block.create({
        data: { warehouseId: ctx.warehouse.id, code: letter, name: dto.name, areaSqft: dto.areaSqft, rows: dto.rows, cols: dto.cols, clearHeightCm: dto.clearHeightCm ?? 400, note: dto.note ?? '' },
      });
      const cells = [];
      for (let r = 1; r <= dto.rows; r++) for (let c = 1; c <= dto.cols; c++) cells.push({ blockId: block.id, row: r, col: c });
      await tx.gridCell.createMany({ data: cells });
      return block;
    });
  }

  async updateBlock(code: string, blockCode: string, dto: UpdateBlockDto) {
    return this.change(code, (s, ctx) => {
      const b = s.blocks.find((x) => x.code === blockCode);
      if (!b) throw new NotFoundException(`Block ${blockCode} not found`);
      if (dto.areaSqft != null) {
        const others = s.blocks.filter((x) => x !== b).reduce((sum, x) => sum + x.areaSqft, 0);
        if (others + dto.areaSqft > ctx.warehouse.areaSqft + 1e-6) throw new ConflictException('Blocks would exceed the warehouse total area');
        b.areaSqft = dto.areaSqft;
      }
      if (dto.clearHeightCm != null) b.clearHeightCm = dto.clearHeightCm;
      const rows = dto.rows ?? b.rows, cols = dto.cols ?? b.cols;
      b.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => b.cells[r]?.[c] ?? 'STORAGE'));
      b.rows = rows; b.cols = cols;
    }, async (tx, ctx) => {
      const id = ctx.blockIds.get(blockCode)!;
      const old = ctx.s.blocks.find((x) => x.code === blockCode)!;
      const rows = dto.rows ?? old.rows, cols = dto.cols ?? old.cols;
      await tx.gridCell.deleteMany({ where: { blockId: id, OR: [{ row: { gt: rows } }, { col: { gt: cols } }] } });
      const add = [];
      for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) if (r > old.rows || c > old.cols) add.push({ blockId: id, row: r, col: c });
      if (add.length) await tx.gridCell.createMany({ data: add });
      return tx.block.update({ where: { id }, data: dto });
    });
  }

  async paintCells(code: string, blockCode: string, dto: PaintCellsDto) {
    return this.change(code, (s) => {
      const b = s.blocks.find((x) => x.code === blockCode);
      if (!b) throw new NotFoundException(`Block ${blockCode} not found`);
      for (const { row, col } of dto.cells) {
        if (row > b.rows || col > b.cols) throw new BadRequestException(`R${row}C${col} is outside the grid`);
        b.cells[row - 1][col - 1] = dto.use;
      }
    }, async (tx, ctx) => {
      const r = await tx.gridCell.updateMany({
        where: { blockId: ctx.blockIds.get(blockCode)!, OR: dto.cells.map((c) => ({ row: c.row, col: c.col })) },
        data: { use: dto.use, areaName: dto.use === 'STORAGE' ? null : dto.areaName || null },
      });
      return { updated: r.count };
    });
  }

  // ---------------------------------------------------------------- types

  listRackTypes() { return this.prisma.rackType.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { racks: true } } } }); }
  listPlateTypes() { return this.prisma.plateType.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { plates: true } } } }); }

  async createRackType(dto: CreateRackTypeDto) {
    if (await this.prisma.rackType.findUnique({ where: { name: dto.name } })) throw new ConflictException(`${dto.name} already exists`);
    return this.prisma.rackType.create({ data: dto });
  }
  async createPlateType(dto: CreatePlateTypeDto) {
    if (await this.prisma.plateType.findUnique({ where: { name: dto.name } })) throw new ConflictException(`${dto.name} already exists`);
    return this.prisma.plateType.create({ data: dto });
  }

  // ---------------------------------------------------------------- racks

  /** Auto-fill for the "create rack" form: length from the type, first free spot, one bay per cell. */
  async suggestRack(code: string, blockCode: string, rackTypeId: string, direction: 'ROW' | 'COLUMN') {
    const type = await this.prisma.rackType.findUnique({ where: { id: rackTypeId } });
    if (!type) throw new NotFoundException('Rack type not found');
    const ctx = await this.prisma.$transaction((tx) => loadStructure(tx, code), TX);
    const b = ctx.s.blocks.find((x) => x.code === blockCode);
    if (!b) throw new NotFoundException(`Block ${blockCode} not found`);
    const lengthCells = autoLengthCells(type.lengthCm, b);
    const loose = new Set((await this.looseFloorCells(ctx.warehouse.id, blockCode)).map((c) => `${c.row},${c.col}`));
    const spot = firstRackSpot(ctx.s, blockCode, direction, lengthCells, (r, c) => loose.has(`${r},${c}`));
    return { lengthCells, bays: lengthCells, startRow: spot?.[0] ?? null, startCol: spot?.[1] ?? null, cellSideCm: cellSideCm(b), rackLengthCm: type.lengthCm };
  }

  private async looseFloorCells(warehouseId: string, blockCode: string) {
    const rows = await this.prisma.location.findMany({
      where: { warehouseId, kind: 'FLOOR', block: { code: blockCode }, units: { some: {} } },
      select: { cellRow: true, cellCol: true },
    });
    return rows.map((r) => ({ row: r.cellRow!, col: r.cellCol! }));
  }

  async createRack(code: string, dto: CreateRackDto) {
    const type = await this.prisma.rackType.findUnique({ where: { id: dto.rackTypeId } });
    if (!type) throw new NotFoundException('Rack type not found');
    let rackCode = '';
    return this.change(code, (s, ctx) => {
      const b = s.blocks.find((x) => x.code === dto.blockCode);
      if (!b) throw new NotFoundException(`Block ${dto.blockCode} not found`);
      const n = Math.max(0, ...[...ctx.rackIds.keys()].map((c) => Number(c.replace(/\D/g, '')) || 0)) + 1;
      rackCode = `RK${n}`;
      const lengthCells = dto.lengthCells ?? autoLengthCells(type.lengthCm, b);
      const rk = {
        code: rackCode, blockCode: dto.blockCode,
        type: { name: type.name, lengthCm: type.lengthCm, depthCm: type.depthCm, shelfCount: type.shelfCount, shelfHeightCm: type.shelfHeightCm, shelfCapKg: type.shelfCapKg },
        startRow: dto.startRow, startCol: dto.startCol, lengthCells, direction: dto.direction, bays: dto.bays ?? lengthCells, mergedShelves: [],
      };
      const p = rackPlacementProblem(s, rk);
      if (p) throw new ConflictException(p);
      s.racks.push(rk);
    }, async (tx, ctx) => {
      const b = ctx.s.blocks.find((x) => x.code === dto.blockCode)!;
      const lengthCells = dto.lengthCells ?? autoLengthCells(type.lengthCm, b);
      return tx.rack.create({
        data: {
          warehouseId: ctx.warehouse.id, blockId: ctx.blockIds.get(dto.blockCode)!, code: rackCode, name: `Rack ${rackCode.slice(2)}`,
          rackTypeId: type.id, startRow: dto.startRow, startCol: dto.startCol, direction: dto.direction, lengthCells, bays: dto.bays ?? lengthCells,
        },
      });
    });
  }

  async updateRack(code: string, rackCode: string, dto: UpdateRackDto) {
    return this.change(code, (s) => {
      const rk = s.racks.find((r) => r.code === rackCode);
      if (!rk) throw new NotFoundException(`Rack ${rackCode} not found`);
      if (dto.bays != null) rk.bays = dto.bays;
      if (dto.mergedShelves) {
        const merged = [...new Set(dto.mergedShelves)].sort((a, b) => a - b);
        if (merged.some((m, i) => m < 1 || m >= rk.type.shelfCount || (i && merged[i - 1] + 1 === m))) {
          throw new BadRequestException('Each merge joins a shelf with the one above it; merges may not overlap');
        }
        rk.mergedShelves = merged;
      }
    }, (tx, ctx) => tx.rack.update({ where: { id: ctx.rackIds.get(rackCode)! }, data: dto }));
  }

  async deleteRack(code: string, rackCode: string) {
    return this.change(code, (s) => {
      if (!s.racks.some((r) => r.code === rackCode)) throw new NotFoundException(`Rack ${rackCode} not found`);
      s.racks = s.racks.filter((r) => r.code !== rackCode);
    }, async (tx, ctx) => {
      const id = ctx.rackIds.get(rackCode)!;
      // Locations and shelves go first (sync would remove them too, but the rack row can't go while they exist).
      await tx.location.deleteMany({ where: { rackId: id } });
      await tx.shelf.deleteMany({ where: { rackId: id } });
      await tx.rack.delete({ where: { id } });
      return { deleted: rackCode };
    });
  }

  // ---------------------------------------------------------------- plates

  /** Auto-fill for the floor-plate form: first storage cell with room, and how many fit. */
  async suggestFloorPlate(code: string, blockCode: string, plateTypeId: string) {
    const pt = await this.prisma.plateType.findUnique({ where: { id: plateTypeId } });
    if (!pt) throw new NotFoundException('Plate type not found');
    const ctx = await this.prisma.$transaction((tx) => loadStructure(tx, code), TX);
    const b = ctx.s.blocks.find((x) => x.code === blockCode);
    if (!b) throw new NotFoundException(`Block ${blockCode} not found`);
    const loose = new Set((await this.looseFloorCells(ctx.warehouse.id, blockCode)).map((c) => `${c.row},${c.col}`));
    for (let r = 1; r <= b.rows; r++) {
      for (let c = 1; c <= b.cols; c++) {
        if (loose.has(`${r},${c}`)) continue;
        const room = floorPlateRoom(ctx.s, blockCode, r, c, pt);
        if (room.room > 0) return { row: r, col: c, room: room.room, cellAreaSqft: cellAreaSqft(b) };
      }
    }
    return { row: null, col: null, room: 0, reason: `No free Storage cell in this block has room for a ${pt.name}` };
  }

  async createPlates(code: string, dto: CreatePlatesDto) {
    const pt = await this.prisma.plateType.findUnique({ where: { id: dto.plateTypeId } });
    if (!pt) throw new NotFoundException('Plate type not found');
    const onRack = dto.rackCode != null;
    if (onRack ? dto.shelfLevel == null || dto.bay == null : !dto.blockCode || dto.row == null || dto.col == null) {
      throw new BadRequestException('Give either rackCode + shelfLevel + bay, or blockCode + row + col');
    }
    const typeIn = { name: pt.name, lengthCm: pt.lengthCm, widthCm: pt.widthCm, floorStackHeightCm: pt.floorStackHeightCm, capKg: pt.capKg };
    return this.change(code, (s) => {
      const room = onRack
        ? positionPlateRoom(s, dto.rackCode!, dto.shelfLevel!, dto.bay!, typeIn)
        : floorPlateRoom(s, dto.blockCode!, dto.row!, dto.col!, typeIn);
      if (room.room < dto.count) throw new ConflictException(room.room ? `Only ${room.room} more ${pt.name} fit here` : room.reason!);
      for (let i = 0; i < dto.count; i++) {
        s.plates.push({
          label: `~new${String(i).padStart(3, '0')}`, // sorts after real labels, like the real new ones will
          type: typeIn,
          parent: onRack
            ? { kind: 'POSITION', rackCode: dto.rackCode!, shelfLevel: dto.shelfLevel!, bay: dto.bay! }
            : { kind: 'CELL', blockCode: dto.blockCode!, row: dto.row!, col: dto.col! },
        });
      }
    }, async (tx, ctx) => {
      const last = await nextSequence(tx, `PLATE:${ctx.warehouse.code}`, dto.count);
      const labels = Array.from({ length: dto.count }, (_, i) => plateLabel(ctx.warehouse.code, last - dto.count + 1 + i));
      await tx.plate.createMany({
        data: labels.map((label) => ({
          warehouseId: ctx.warehouse.id, label, plateTypeId: pt.id,
          ...(onRack
            ? { rackId: ctx.rackIds.get(dto.rackCode!)!, shelfLevel: dto.shelfLevel!, bay: dto.bay! }
            : { blockId: ctx.blockIds.get(dto.blockCode!)!, cellRow: dto.row!, cellCol: dto.col! }),
        })),
      });
      return { labels };
    });
  }

  async deletePlate(code: string, label: string) {
    return this.change(code, (s) => {
      if (!s.plates.some((p) => p.label === label)) throw new NotFoundException(`Plate ${label} not found`);
      s.plates = s.plates.filter((p) => p.label !== label);
    }, async (tx, ctx) => {
      const id = ctx.plateIds.get(label)!;
      await tx.location.deleteMany({ where: { plateId: id } });
      await tx.plate.delete({ where: { id } });
      return { deleted: label };
    });
  }
}

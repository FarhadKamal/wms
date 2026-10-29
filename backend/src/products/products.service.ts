import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import { COLUMNS, CheckedRow, ExistingProduct, MAX_ROWS, ProductInput, RawRow, checkImport, mapHeaders } from '../domain/products.js';

const INCLUDE = { category: true, aliases: { orderBy: { slot: 'asc' } } } as const;
type Loaded = Awaited<ReturnType<ProductsService['loadAll']>>[number];
const aliasesOf = (p: { aliases: Array<{ slot: number; code: string }> }) =>
  [1, 2, 3].map((s) => p.aliases.find((a) => a.slot === s)?.code ?? null) as ProductInput['aliases'];

/** Excel cell → plain value (exceljs gives rich text, formulas and hyperlinks as objects). */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if (v instanceof Date) return v.toISOString();
  }
  return v;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private loadAll() {
    return this.prisma.product.findMany({ include: INCLUDE, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }] });
  }

  private shape(p: Loaded) {
    const { aliases, ...rest } = p;
    return { ...rest, aliases: aliasesOf(p) };
  }

  /** Search by SKU, name, brand or any alias code. */
  async list(q?: string) {
    const s = q?.trim();
    const where = s
      ? { OR: [
          { sku: { contains: s, mode: 'insensitive' as const } }, { name: { contains: s, mode: 'insensitive' as const } },
          { brand: { contains: s, mode: 'insensitive' as const } }, { aliases: { some: { code: { contains: s.toUpperCase() } } } },
        ] }
      : {};
    const ps = await this.prisma.product.findMany({ where, include: INCLUDE, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }] });
    return ps.map((p) => this.shape(p));
  }

  /** A product by SKU or by one of its alias codes. */
  async find(codeIn: string) {
    const code = codeIn.trim().toUpperCase();
    const p = await this.prisma.product.findFirst({ where: { OR: [{ sku: code }, { aliases: { some: { code } } }] }, include: INCLUDE });
    if (!p) throw new NotFoundException(`No product with SKU or alias ${code}`);
    return this.shape(p);
  }

  // ---------------------------------------------------------------- checking

  private async existing(): Promise<{ products: ExistingProduct[]; categories: string[] }> {
    const [ps, counts, cats] = await Promise.all([
      this.loadAll(),
      this.prisma.unit.groupBy({ by: ['productId'], where: { status: { not: 'DISPATCHED' } }, _count: true }),
      this.prisma.category.findMany({ select: { name: true } }),
    ]);
    return {
      categories: cats.map((c) => c.name),
      products: ps.map((p) => ({
        sku: p.sku, name: p.name, category: p.category.name, brand: p.brand, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm,
        weightKg: p.weightKg, reorderPoint: p.reorderPoint, aliases: aliasesOf(p), unitsInStock: counts.find((c) => c.productId === p.id)?._count ?? 0,
      })),
    };
  }

  /** Read the first sheet of an .xlsx into raw rows. */
  async parse(buf: Buffer): Promise<RawRow[]> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('This is not a valid Excel (.xlsx) file');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('The file has no sheets');
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { headers[col - 1] = String(cellValue(c.value) ?? ''); });
    const { map, missing } = mapHeaders(headers);
    if (missing.length) throw new BadRequestException(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template.`);
    const rows: RawRow[] = [];
    ws.eachRow({ includeEmpty: false }, (r, n) => {
      if (n === 1) return;
      const raw: RawRow = { row: n };
      let any = false;
      map.forEach((key, i) => {
        const v = cellValue(r.getCell(i + 1).value);
        if (v != null && String(v).trim() !== '') any = true;
        (raw as Record<string, unknown>)[key] = v;
      });
      if (any) rows.push(raw);
    });
    if (!rows.length) throw new BadRequestException('The sheet has no product rows');
    if (rows.length > MAX_ROWS) throw new BadRequestException(`At most ${MAX_ROWS} rows per upload (this file has ${rows.length})`);
    return rows;
  }

  async preview(buf: Buffer) {
    const raw = await this.parse(buf);
    const ex = await this.existing();
    const { rows, newCategories } = checkImport(raw, ex.products, ex.categories);
    return { rows, newCategories, summary: summarise(rows) };
  }

  // ---------------------------------------------------------------- saving

  /** Apply an upload: all rows or none. Refused while any row has an error. */
  async import(buf: Buffer) {
    const { rows, newCategories, summary } = await this.preview(buf);
    if (summary.error) throw new BadRequestException(`${summary.error} row${summary.error > 1 ? 's have' : ' has'} errors — fix them and upload again`);
    await this.save(rows.filter((r) => r.action === 'new' || r.action === 'update').map((r) => r.value!), newCategories);
    return summary;
  }

  async create(input: RawRow) { return this.saveOne(input, 'create'); }
  async update(sku: string, input: RawRow) { return this.saveOne({ ...input, sku }, 'update'); }

  private async saveOne(input: RawRow, mode: 'create' | 'update') {
    const ex = await this.existing();
    const exists = ex.products.some((p) => p.sku === String(input.sku ?? '').trim().toUpperCase());
    if (mode === 'create' && exists) throw new ConflictException(`SKU ${String(input.sku).toUpperCase()} already exists`);
    if (mode === 'update' && !exists) throw new NotFoundException(`No product ${input.sku}`);
    const { rows, newCategories } = checkImport([{ ...input, row: 1 }], ex.products, ex.categories);
    if (rows[0].errors.length) throw new BadRequestException(rows[0].errors.join('; '));
    await this.save([rows[0].value!], newCategories);
    return this.find(rows[0].sku);
  }

  private async save(items: ProductInput[], newCategories: string[]) {
    if (!items.length) return;
    await this.prisma.$transaction(async (tx) => {
      for (const name of newCategories) {
        await tx.category.create({ data: { name, code: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), idRule: 'GENERATED' } });
      }
      const cats = await tx.category.findMany();
      const catOf = (name: string) => cats.find((c) => c.name.toLowerCase() === name.toLowerCase())!;
      // Clear the aliases of every product being saved first, so aliases can move between them in one upload.
      const skus = items.map((i) => i.sku);
      await tx.productAlias.deleteMany({ where: { product: { sku: { in: skus } } } });
      for (const i of items) {
        const c = catOf(i.category);
        const data = {
          name: i.name, brand: i.brand, categoryId: c.id, lengthCm: i.lengthCm, widthCm: i.widthCm, heightCm: i.heightCm,
          weightKg: i.weightKg, reorderPoint: i.reorderPoint, stackable: c.idRule !== 'VIN', // vehicles need floor space
        };
        const p = await tx.product.upsert({ where: { sku: i.sku }, create: { sku: i.sku, ...data }, update: data, select: { id: true } });
        const aliases = i.aliases.map((code, k) => (code ? { code, slot: k + 1, productId: p.id } : null)).filter((a) => a !== null);
        if (aliases.length) await tx.productAlias.createMany({ data: aliases });
      }
    }, { timeout: 120_000, maxWait: 15_000 });
  }

  // ---------------------------------------------------------------- Excel out

  /** The template with every current product filled in — download, edit, upload again. */
  async export(empty = false): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Azneo WMS';
    const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A34' } };
    const rows = empty
      ? [{ sku: 'PDR-PQM60', name: 'Pedrollo PQm 60 Peripheral Pump 0.5HP', category: 'Water Pumps', brand: 'Pedrollo', lengthCm: 30, widthCm: 20, heightCm: 25, weightKg: 6, reorderPoint: 15, alias1: 'EXAMPLE-ERP-CODE', alias2: null, alias3: null }]
      : (await this.loadAll()).map((p) => {
          const [alias1, alias2, alias3] = aliasesOf(p);
          return { sku: p.sku, name: p.name, category: p.category.name, brand: p.brand, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg, reorderPoint: p.reorderPoint, alias1, alias2, alias3 };
        });
    rows.forEach((r) => ws.addRow(r));
    const notes = wb.addWorksheet('How to fill');
    notes.columns = [{ width: 18 }, { width: 90 }];
    [
      ['Column', 'Rule'],
      ['SKU', 'Required. 2–40 letters/digits and - _ . /. If the SKU exists, the row UPDATES that product; otherwise a new product is added.'],
      ['Name, Brand', 'Required.'],
      ['Category', 'Required, e.g. Water Pumps, Cars. A new name creates a new category.'],
      ['Length/Width/Height', 'Required, centimetres, packed size of ONE unit (more than 0).'],
      ['Weight (kg)', 'Required, kilograms of ONE unit (more than 0). Used for shelf weight limits.'],
      ['Reorder level', 'Optional whole number (default 0).'],
      ['Alias code 1–3', 'Optional. Each alias must be unique across all products and not equal to another SKU.'],
      ['', 'Upload shows a preview first; nothing is saved until you confirm. Rows with errors block the whole upload.'],
    ].forEach((r, i) => { const row = notes.addRow(r); if (i === 0) row.font = { bold: true }; });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

function summarise(rows: CheckedRow[]) {
  const count = (a: string) => rows.filter((r) => r.action === a).length;
  return { total: rows.length, new: count('new'), update: count('update'), unchanged: count('unchanged'), error: count('error') };
}

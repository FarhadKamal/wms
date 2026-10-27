-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'PLANNED');

-- CreateEnum
CREATE TYPE "CellUse" AS ENUM ('STORAGE', 'PASSAGE', 'OFFICE', 'TOILET', 'SERVICE', 'UNLOAD', 'FORKLIFT');

-- CreateEnum
CREATE TYPE "RackDirection" AS ENUM ('ROW', 'COLUMN');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('RECEIVING', 'BAY', 'SHELF', 'PLATE', 'FLOOR');

-- CreateEnum
CREATE TYPE "IdRule" AS ENUM ('GENERATED', 'VIN');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('STAGING', 'IN_STOCK', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('RCV', 'DSP', 'TRF');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('RECEIVED', 'PUT_AWAY', 'MOVED', 'DISPATCHED');

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT NOT NULL DEFAULT '',
    "areaSqft" DOUBLE PRECISION NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "areaSqft" DOUBLE PRECISION NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "clearHeightCm" INTEGER NOT NULL DEFAULT 400,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grid_cells" (
    "id" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "use" "CellUse" NOT NULL DEFAULT 'STORAGE',
    "areaName" TEXT,

    CONSTRAINT "grid_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lengthCm" DOUBLE PRECISION NOT NULL,
    "depthCm" DOUBLE PRECISION NOT NULL,
    "shelfCount" INTEGER NOT NULL,
    "shelfHeightCm" DOUBLE PRECISION NOT NULL,
    "shelfCapKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rack_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plate_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lengthCm" DOUBLE PRECISION NOT NULL,
    "widthCm" DOUBLE PRECISION NOT NULL,
    "floorStackHeightCm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plate_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "rackTypeId" UUID NOT NULL,
    "startRow" INTEGER NOT NULL,
    "startCol" INTEGER NOT NULL,
    "direction" "RackDirection" NOT NULL DEFAULT 'ROW',
    "lengthCells" INTEGER NOT NULL,
    "bays" INTEGER NOT NULL DEFAULT 0,
    "mergedShelves" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelves" (
    "id" UUID NOT NULL,
    "rackId" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "span" INTEGER NOT NULL DEFAULT 1,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "capKg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plates" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "plateTypeId" UUID NOT NULL,
    "rackId" UUID,
    "shelfLevel" INTEGER,
    "bay" INTEGER,
    "blockId" UUID,
    "cellRow" INTEGER,
    "cellCol" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "blockId" UUID,
    "rackId" UUID,
    "shelfId" UUID,
    "bay" INTEGER,
    "plateId" UUID,
    "cellRow" INTEGER,
    "cellCol" INTEGER,
    "lengthCm" DOUBLE PRECISION NOT NULL,
    "widthCm" DOUBLE PRECISION NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "capKg" DOUBLE PRECISION,
    "boardCode" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bay_boards" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "bay_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idRule" "IdRule" NOT NULL DEFAULT 'GENERATED',

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "lengthCm" DOUBLE PRECISION NOT NULL,
    "widthCm" DOUBLE PRECISION NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "uid" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'STAGING',
    "locationId" UUID,
    "receivingDocId" UUID NOT NULL,
    "dispatchDocId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "no" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "docDate" DATE NOT NULL,
    "party" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "preparedBy" TEXT NOT NULL,
    "toCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movement_events" (
    "id" BIGSERIAL NOT NULL,
    "unitId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "fromCode" TEXT,
    "toCode" TEXT,
    "by" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "key" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_warehouseId_code_key" ON "blocks"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "grid_cells_blockId_row_col_key" ON "grid_cells"("blockId", "row", "col");

-- CreateIndex
CREATE UNIQUE INDEX "rack_types_name_key" ON "rack_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "plate_types_name_key" ON "plate_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "racks_warehouseId_code_key" ON "racks"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shelves_rackId_level_key" ON "shelves"("rackId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "plates_label_key" ON "plates"("label");

-- CreateIndex
CREATE UNIQUE INDEX "locations_plateId_key" ON "locations"("plateId");

-- CreateIndex
CREATE INDEX "locations_warehouseId_address_idx" ON "locations"("warehouseId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "locations_warehouseId_code_key" ON "locations"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "bay_boards_warehouseId_code_key" ON "bay_boards"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "units_uid_key" ON "units"("uid");

-- CreateIndex
CREATE INDEX "units_warehouseId_status_idx" ON "units"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "units_locationId_idx" ON "units"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_no_key" ON "documents"("no");

-- CreateIndex
CREATE INDEX "documents_warehouseId_type_docDate_idx" ON "documents"("warehouseId", "type", "docDate");

-- CreateIndex
CREATE INDEX "movement_events_unitId_at_idx" ON "movement_events"("unitId", "at");

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grid_cells" ADD CONSTRAINT "grid_cells_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_rackTypeId_fkey" FOREIGN KEY ("rackTypeId") REFERENCES "rack_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plates" ADD CONSTRAINT "plates_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plates" ADD CONSTRAINT "plates_plateTypeId_fkey" FOREIGN KEY ("plateTypeId") REFERENCES "plate_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plates" ADD CONSTRAINT "plates_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plates" ADD CONSTRAINT "plates_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "shelves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_plateId_fkey" FOREIGN KEY ("plateId") REFERENCES "plates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bay_boards" ADD CONSTRAINT "bay_boards_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_receivingDocId_fkey" FOREIGN KEY ("receivingDocId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dispatchDocId_fkey" FOREIGN KEY ("dispatchDocId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

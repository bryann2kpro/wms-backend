import { vi, describe, test, expect, beforeEach } from 'vitest';

// ─── Module-level mocks (must be hoisted before any imports) ─────────────────

const FAKE_TX = { __isFakeTx: true };

vi.mock('@/db', () => ({
    db: {
        transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn(FAKE_TX)),
    },
}));

vi.mock('@/util/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('@/composition-root', () => ({
    invoicesRepository: {
        createInvoiceFromDeliveryOrder: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/util/date', () => ({
    isWithinMonthEndWindow: vi.fn().mockReturnValue(false),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ReturnsServiceClass } from './returns.service';
import { OutboundServices } from '../outbound/outbound.services';
import { InventoryMovementType } from '../inventory/inventory-movement/inventory.model';
import { ReturnReason, ReturnStatus, ReturnItemStatus } from './returns.model';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const FAKE_DO = {
    id: 'do-1',
    doNo: 'DO-001',
    purchaseOrderId: 'po-1',
    poNo: 'PO-001',
    status: 'DELIVERED',
    organizationId: 'org-1',
    createdBy: 'user-1',
    updatedBy: 'user-1',
};

const FAKE_DO_ITEMS = [
    { id: 'do-item-1', skuId: 'sku-1', skuCode: 'SKU001', qtyRequired: '10.00' },
    { id: 'do-item-2', skuId: 'sku-2', skuCode: 'SKU002', qtyRequired: '5.00' },
];

const FAKE_RETURN = {
    id: 'ret-1',
    organizationId: 'org-1',
    returnNo: 'RTN-20260611-0001',
    doId: 'do-1',
    doNo: 'DO-001',
    purchaseOrderId: 'po-1',
    poNo: 'PO-001',
    status: ReturnStatus.RECEIVED,
    receivedBy: 'driver-1',
    receivedAt: new Date('2026-06-11T08:00:00Z'),
    completedAt: null,
    notes: null,
    createdAt: new Date('2026-06-11T08:00:00Z'),
    updatedAt: new Date('2026-06-11T08:00:00Z'),
    createdBy: 'driver-1',
    updatedBy: 'driver-1',
};

const FAKE_ATE_ITEM = {
    id: 'ret-item-1',
    returnId: 'ret-1',
    doItemId: 'do-item-1',
    skuId: 'sku-1',
    lotNo: 'LOT-A',
    expiryDate: new Date('2026-07-01T00:00:00Z'),
    qtyReturned: '4.00',
    reason: ReturnReason.ABOUT_TO_EXPIRE,
    conditionNotes: null,
    status: ReturnItemStatus.PENDING,
    qtyPutaway: '0.00',
    assignedRackId: null,
    assignedBy: null,
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'driver-1',
    updatedBy: 'driver-1',
};

const FAKE_DAMAGED_ITEM = {
    ...FAKE_ATE_ITEM,
    id: 'ret-item-2',
    skuId: 'sku-2',
    reason: ReturnReason.DAMAGED,
    qtyReturned: '2.00',
};

const FAKE_NORMAL_RACK = { rackId: 'rack-normal', zoneId: 'zone-general', rackRow: 'A', rackColumn: '1', rackLevel: '1', organizationId: 'org-1' };
const FAKE_DAMAGED_RACK = { rackId: 'rack-damaged', zoneId: 'zone-damaged', rackRow: 'D', rackColumn: '1', rackLevel: '1', organizationId: 'org-1' };
const FAKE_NO_ZONE_RACK = { rackId: 'rack-nozone', zoneId: null, rackRow: 'B', rackColumn: '1', rackLevel: '1', organizationId: 'org-1' };

const FAKE_GENERAL_ZONE = { zoneId: 'zone-general', purpose: 'GENERAL' };
const FAKE_DAMAGED_ZONE = { zoneId: 'zone-damaged', purpose: 'DAMAGED' };

// ─── Repository mocks ─────────────────────────────────────────────────────────

function makeMockReturnsRepo() {
    return {
        generateReturnNo: vi.fn().mockResolvedValue('RTN-20260611-0001'),
        createReturn: vi.fn().mockResolvedValue(FAKE_RETURN),
        createReturnItems: vi.fn().mockImplementation((rows: unknown[]) =>
            Promise.resolve(rows.map((row, i) => ({ ...(row as object), id: `ret-item-${i + 1}` }))),
        ),
        getReturnById: vi.fn().mockResolvedValue(FAKE_RETURN),
        getReturnByDoId: vi.fn().mockResolvedValue(null),
        getReturnItemById: vi.fn().mockResolvedValue(FAKE_ATE_ITEM),
        getReturnItems: vi.fn().mockResolvedValue([]),
        listReturns: vi.fn().mockResolvedValue({ query: [], pagination: {} }),
        updateReturn: vi.fn().mockResolvedValue(FAKE_RETURN),
        updateReturnItem: vi.fn().mockImplementation((_id: string, patch: object) =>
            Promise.resolve({ ...FAKE_ATE_ITEM, ...patch })),
        incrementReturnItemQtyPutaway: vi.fn().mockImplementation((_id: string, qty: number) =>
            Promise.resolve({ ...FAKE_ATE_ITEM, qtyPutaway: qty.toFixed(2) })),
        countUnassignedItems: vi.fn().mockResolvedValue(0),
        getReturnItemDocuments: vi.fn().mockResolvedValue([]),
    };
}

function makeMockDeliveryOrderRepo() {
    return {
        getDeliveryOrderById: vi.fn().mockResolvedValue(FAKE_DO),
        getDeliveryOrderItemsForPo: vi.fn().mockResolvedValue(FAKE_DO_ITEMS),
        updateDeliveryOrder: vi.fn().mockImplementation((_id, data) => Promise.resolve({ ...FAKE_DO, ...data })),
    };
}

function makeMockDocumentsRepo() {
    return {
        insertDocument: vi.fn().mockResolvedValue({}),
    };
}

function makeMockInventoryMovementRepo() {
    return {
        createInventoryMovement: vi.fn().mockResolvedValue([]),
    };
}

function makeMockStockQuantRepo() {
    return {
        getStockQuantBySkuRackAndLot: vi.fn().mockResolvedValue(null),
        createStockQuant: vi.fn().mockResolvedValue({}),
        updateStockQuant: vi.fn().mockResolvedValue({}),
    };
}

function makeMockRacksRepo() {
    return {
        getRackById: vi.fn().mockResolvedValue(FAKE_NORMAL_RACK),
    };
}

function makeMockZonesRepo() {
    return {
        getZoneById: vi.fn().mockImplementation((zoneId: string) => {
            if (zoneId === 'zone-damaged') return Promise.resolve(FAKE_DAMAGED_ZONE);
            if (zoneId === 'zone-general') return Promise.resolve(FAKE_GENERAL_ZONE);
            return Promise.resolve(null);
        }),
    };
}

function makeService(overrides: Partial<{
    returnsRepo: ReturnType<typeof makeMockReturnsRepo>;
    deliveryOrderRepo: ReturnType<typeof makeMockDeliveryOrderRepo>;
    documentsRepo: ReturnType<typeof makeMockDocumentsRepo>;
    inventoryMovementRepo: ReturnType<typeof makeMockInventoryMovementRepo>;
    stockQuantRepo: ReturnType<typeof makeMockStockQuantRepo>;
    racksRepo: ReturnType<typeof makeMockRacksRepo>;
    zonesRepo: ReturnType<typeof makeMockZonesRepo>;
}> = {}) {
    const returnsRepo = overrides.returnsRepo ?? makeMockReturnsRepo();
    const deliveryOrderRepo = overrides.deliveryOrderRepo ?? makeMockDeliveryOrderRepo();
    const documentsRepo = overrides.documentsRepo ?? makeMockDocumentsRepo();
    const inventoryMovementRepo = overrides.inventoryMovementRepo ?? makeMockInventoryMovementRepo();
    const stockQuantRepo = overrides.stockQuantRepo ?? makeMockStockQuantRepo();
    const racksRepo = overrides.racksRepo ?? makeMockRacksRepo();
    const zonesRepo = overrides.zonesRepo ?? makeMockZonesRepo();

    const service = new ReturnsServiceClass(
        returnsRepo as never,
        deliveryOrderRepo as never,
        documentsRepo as never,
        inventoryMovementRepo as never,
        stockQuantRepo as never,
        racksRepo as never,
        zonesRepo as never,
    );

    return {
        service,
        returnsRepo,
        deliveryOrderRepo,
        documentsRepo,
        inventoryMovementRepo,
        stockQuantRepo,
        racksRepo,
        zonesRepo,
    };
}

const VALID_CREATE_DATA = {
    doId: 'do-1',
    items: [
        { skuId: 'sku-1', lotNo: 'LOT-A', qtyReturned: '4', reason: 'ABOUT_TO_EXPIRE' },
        { skuId: 'sku-2', qtyReturned: '2', reason: 'DAMAGED' },
    ],
    userId: 'driver-1',
    organizationId: 'org-1',
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('ReturnsService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── createReturn (standalone) ───────────────────────────────────────────

    describe('createReturn', () => {
        test('rejects when delivery order not found', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue(null);

            await expect(service.createReturn(VALID_CREATE_DATA)).rejects.toThrow('Delivery order not found');
        });

        test('rejects when delivery order is not DELIVERED', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'SHIPPED' });

            await expect(service.createReturn(VALID_CREATE_DATA)).rejects.toThrow(/must be DELIVERED/);
        });

        test('rejects when a return already exists for the DO (duplicate guard)', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnByDoId.mockResolvedValue(FAKE_RETURN);

            await expect(service.createReturn(VALID_CREATE_DATA)).rejects.toThrow(/already exists/);
        });

        test('rejects when no items provided', async () => {
            const { service } = makeService();
            await expect(service.createReturn({ ...VALID_CREATE_DATA, items: [] })).rejects.toThrow(/At least one return line/);
        });

        test('rejects invalid reason', async () => {
            const { service } = makeService();
            await expect(
                service.createReturn({
                    ...VALID_CREATE_DATA,
                    items: [{ skuId: 'sku-1', qtyReturned: '1', reason: 'EXPIRED' }],
                }),
            ).rejects.toThrow(/Invalid return reason/);
        });

        test('rejects SKU not on the delivery order', async () => {
            const { service } = makeService();
            await expect(
                service.createReturn({
                    ...VALID_CREATE_DATA,
                    items: [{ skuId: 'sku-unknown', qtyReturned: '1', reason: 'DAMAGED' }],
                }),
            ).rejects.toThrow(/not on delivery order/);
        });

        test('rejects zero or negative quantities', async () => {
            const { service } = makeService();
            await expect(
                service.createReturn({
                    ...VALID_CREATE_DATA,
                    items: [{ skuId: 'sku-1', qtyReturned: '0', reason: 'DAMAGED' }],
                }),
            ).rejects.toThrow(/positive number/);
        });

        test('rejects quantity over delivered (summed per SKU across lines)', async () => {
            const { service } = makeService();
            await expect(
                service.createReturn({
                    ...VALID_CREATE_DATA,
                    // sku-1 delivered 10: 6 + 5 = 11 > 10
                    items: [
                        { skuId: 'sku-1', qtyReturned: '6', reason: 'DAMAGED' },
                        { skuId: 'sku-1', qtyReturned: '5', reason: 'ABOUT_TO_EXPIRE' },
                    ],
                }),
            ).rejects.toThrow(/exceeds delivered quantity/);
        });

        test('creates header RECEIVED + items PENDING with generated returnNo (no inventory writes)', async () => {
            const { service, returnsRepo, inventoryMovementRepo, stockQuantRepo } = makeService();

            const result = await service.createReturn(VALID_CREATE_DATA);

            expect(returnsRepo.generateReturnNo).toHaveBeenCalledWith(FAKE_TX);
            expect(returnsRepo.createReturn).toHaveBeenCalledWith(
                expect.objectContaining({
                    returnNo: 'RTN-20260611-0001',
                    doId: 'do-1',
                    doNo: 'DO-001',
                    status: ReturnStatus.RECEIVED,
                    receivedBy: 'driver-1',
                }),
                FAKE_TX,
            );
            expect(returnsRepo.createReturnItems).toHaveBeenCalledWith(
                [
                    expect.objectContaining({ skuId: 'sku-1', qtyReturned: '4.00', reason: 'ABOUT_TO_EXPIRE', status: ReturnItemStatus.PENDING, qtyPutaway: '0' }),
                    expect.objectContaining({ skuId: 'sku-2', qtyReturned: '2.00', reason: 'DAMAGED', status: ReturnItemStatus.PENDING }),
                ],
                FAKE_TX,
            );
            // Critical: NO stock writes at capture time
            expect(inventoryMovementRepo.createInventoryMovement).not.toHaveBeenCalled();
            expect(stockQuantRepo.createStockQuant).not.toHaveBeenCalled();
            expect(stockQuantRepo.updateStockQuant).not.toHaveBeenCalled();
            expect(result.returnNo).toBe('RTN-20260611-0001');
        });

        test('inserts a RETURN_PHOTO document per photo, linked to the created item', async () => {
            const { service, documentsRepo } = makeService();

            await service.createReturn({
                ...VALID_CREATE_DATA,
                items: [
                    {
                        skuId: 'sku-1',
                        qtyReturned: '1',
                        reason: 'DAMAGED',
                        photos: [
                            { fileUrl: 'https://s3/p1.jpg', fileName: 'p1.jpg', fileSizeBytes: 1000, mimeType: 'image/jpeg' },
                            { fileUrl: 'https://s3/p2.jpg', fileName: 'p2.jpg', fileSizeBytes: 2000, mimeType: 'image/jpeg' },
                        ],
                    },
                ],
            });

            expect(documentsRepo.insertDocument).toHaveBeenCalledTimes(2);
            expect(documentsRepo.insertDocument).toHaveBeenCalledWith(
                expect.objectContaining({
                    docType: 'RETURN_PHOTO',
                    refType: 'RETURN_ITEM',
                    refId: 'ret-item-1',
                    fileName: 'p1.jpg',
                }),
                FAKE_TX,
            );
        });
    });

    // ─── assignReturnItemToRack ──────────────────────────────────────────────

    describe('assignReturnItemToRack', () => {
        const ASSIGN_BASE = { returnItemId: 'ret-item-1', rackId: 'rack-normal', userId: 'keeper-1', organizationId: 'org-1' };

        test('rejects when return item not found', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue(null);
            await expect(service.assignReturnItemToRack(ASSIGN_BASE)).rejects.toThrow('Return item not found');
        });

        test('rejects when item already ASSIGNED', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue({ ...FAKE_ATE_ITEM, status: ReturnItemStatus.ASSIGNED });
            await expect(service.assignReturnItemToRack(ASSIGN_BASE)).rejects.toThrow(/already ASSIGNED/);
        });

        test('rejects when header is already COMPLETED', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnById.mockResolvedValue({ ...FAKE_RETURN, status: ReturnStatus.COMPLETED });
            await expect(service.assignReturnItemToRack(ASSIGN_BASE)).rejects.toThrow(/already COMPLETED/);
        });

        test('rejects over-assignment beyond remaining quantity', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue({ ...FAKE_ATE_ITEM, qtyReturned: '4.00', qtyPutaway: '3.00' });
            await expect(service.assignReturnItemToRack({ ...ASSIGN_BASE, qty: '2' })).rejects.toThrow(/exceeds remaining/);
        });

        test('rejects ABOUT_TO_EXPIRE putaway to a DAMAGED-zone rack', async () => {
            const { service, racksRepo } = makeService();
            racksRepo.getRackById.mockResolvedValue(FAKE_DAMAGED_RACK);
            await expect(service.assignReturnItemToRack({ ...ASSIGN_BASE, rackId: 'rack-damaged' })).rejects.toThrow(
                /cannot be put away to a DAMAGED zone/,
            );
        });

        test('rejects DAMAGED putaway to a non-DAMAGED-zone rack', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue(FAKE_DAMAGED_ITEM);
            await expect(service.assignReturnItemToRack(ASSIGN_BASE)).rejects.toThrow(/must be put away to a rack in a DAMAGED zone/);
        });

        test('rejects DAMAGED putaway to a rack with no zone', async () => {
            const { service, returnsRepo, racksRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue(FAKE_DAMAGED_ITEM);
            racksRepo.getRackById.mockResolvedValue(FAKE_NO_ZONE_RACK);
            await expect(service.assignReturnItemToRack({ ...ASSIGN_BASE, rackId: 'rack-nozone' })).rejects.toThrow(
                /must be put away to a rack in a DAMAGED zone/,
            );
        });

        test('ABOUT_TO_EXPIRE: creates a new stock_quant when none exists + RETURN_IN movement', async () => {
            const { service, stockQuantRepo, inventoryMovementRepo } = makeService();

            await service.assignReturnItemToRack(ASSIGN_BASE);

            expect(stockQuantRepo.getStockQuantBySkuRackAndLot).toHaveBeenCalledWith('org-1', 'sku-1', 'rack-normal', 'LOT-A', FAKE_TX);
            expect(stockQuantRepo.createStockQuant).toHaveBeenCalledWith(
                expect.objectContaining({
                    skuId: 'sku-1',
                    lotNo: 'LOT-A',
                    expiryDate: FAKE_ATE_ITEM.expiryDate, // original expiry kept -> FEFO picks it first
                    quantity: '4.00',
                    rackId: 'rack-normal',
                }),
                FAKE_TX,
            );
            expect(stockQuantRepo.updateStockQuant).not.toHaveBeenCalled();
            expect(inventoryMovementRepo.createInventoryMovement).toHaveBeenCalledWith(
                [expect.objectContaining({ movementType: InventoryMovementType.RETURN_IN, quantity: '4.00', skuId: 'sku-1' })],
                'keeper-1',
                'org-1',
                FAKE_TX,
            );
        });

        test('ABOUT_TO_EXPIRE: merges into existing stock_quant (sku+rack+lot)', async () => {
            const { service, stockQuantRepo } = makeService();
            stockQuantRepo.getStockQuantBySkuRackAndLot.mockResolvedValue({ id: 'sq-1', quantity: '6.00', description: null });

            await service.assignReturnItemToRack(ASSIGN_BASE);

            expect(stockQuantRepo.updateStockQuant).toHaveBeenCalledWith(
                'org-1',
                'sq-1',
                expect.objectContaining({ quantity: '10.00' }), // 6 + 4
                FAKE_TX,
            );
            expect(stockQuantRepo.createStockQuant).not.toHaveBeenCalled();
        });

        test('ABOUT_TO_EXPIRE: allows rack with no zone', async () => {
            const { service, racksRepo, inventoryMovementRepo } = makeService();
            racksRepo.getRackById.mockResolvedValue(FAKE_NO_ZONE_RACK);

            await service.assignReturnItemToRack({ ...ASSIGN_BASE, rackId: 'rack-nozone' });

            expect(inventoryMovementRepo.createInventoryMovement).toHaveBeenCalled();
        });

        test('DAMAGED: RETURN_DAMAGED movement only, NO stock_quant credit', async () => {
            const { service, returnsRepo, racksRepo, stockQuantRepo, inventoryMovementRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue(FAKE_DAMAGED_ITEM);
            returnsRepo.incrementReturnItemQtyPutaway.mockResolvedValue({ ...FAKE_DAMAGED_ITEM, qtyPutaway: '2.00' });
            racksRepo.getRackById.mockResolvedValue(FAKE_DAMAGED_RACK);

            await service.assignReturnItemToRack({ ...ASSIGN_BASE, returnItemId: 'ret-item-2', rackId: 'rack-damaged' });

            expect(stockQuantRepo.getStockQuantBySkuRackAndLot).not.toHaveBeenCalled();
            expect(stockQuantRepo.createStockQuant).not.toHaveBeenCalled();
            expect(stockQuantRepo.updateStockQuant).not.toHaveBeenCalled();
            expect(inventoryMovementRepo.createInventoryMovement).toHaveBeenCalledWith(
                [expect.objectContaining({ movementType: InventoryMovementType.RETURN_DAMAGED, quantity: '2.00', skuId: 'sku-2', rackId: 'rack-damaged' })],
                'keeper-1',
                'org-1',
                FAKE_TX,
            );
        });

        test('qty defaults to the remaining quantity', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.getReturnItemById.mockResolvedValue({ ...FAKE_ATE_ITEM, qtyReturned: '4.00', qtyPutaway: '1.50' });

            await service.assignReturnItemToRack(ASSIGN_BASE);

            expect(returnsRepo.incrementReturnItemQtyPutaway).toHaveBeenCalledWith('ret-item-1', 2.5, 'keeper-1', FAKE_TX);
        });

        test('partial assignment: accumulates qtyPutaway, item stays PENDING, header untouched', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.incrementReturnItemQtyPutaway.mockResolvedValue({ ...FAKE_ATE_ITEM, qtyPutaway: '1.00' });

            await service.assignReturnItemToRack({ ...ASSIGN_BASE, qty: '1' });

            expect(returnsRepo.incrementReturnItemQtyPutaway).toHaveBeenCalledWith('ret-item-1', 1, 'keeper-1', FAKE_TX);
            // No status flip on partial
            const patch = returnsRepo.updateReturnItem.mock.calls[0][1];
            expect(patch.status).toBeUndefined();
            expect(patch.assignedRackId).toBe('rack-normal');
            expect(returnsRepo.updateReturn).not.toHaveBeenCalled();
        });

        test('full assignment flips item to ASSIGNED', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.incrementReturnItemQtyPutaway.mockResolvedValue({ ...FAKE_ATE_ITEM, qtyPutaway: '4.00' });
            returnsRepo.countUnassignedItems.mockResolvedValue(1); // another item still pending

            await service.assignReturnItemToRack(ASSIGN_BASE);

            expect(returnsRepo.updateReturnItem).toHaveBeenCalledWith(
                'ret-item-1',
                expect.objectContaining({ status: ReturnItemStatus.ASSIGNED }),
                FAKE_TX,
            );
            // Header completes only when ALL items are assigned
            expect(returnsRepo.updateReturn).not.toHaveBeenCalled();
        });

        test('header flips to COMPLETED when the last item is fully assigned', async () => {
            const { service, returnsRepo } = makeService();
            returnsRepo.incrementReturnItemQtyPutaway.mockResolvedValue({ ...FAKE_ATE_ITEM, qtyPutaway: '4.00' });
            returnsRepo.countUnassignedItems.mockResolvedValue(0);

            await service.assignReturnItemToRack(ASSIGN_BASE);

            expect(returnsRepo.updateReturn).toHaveBeenCalledWith(
                'ret-1',
                expect.objectContaining({ status: ReturnStatus.COMPLETED }),
                FAKE_TX,
            );
        });
    });

    // ─── submitDeliveryProof + returns (atomicity) ────────────────────────────

    describe('OutboundServices.submitDeliveryProof with returns', () => {
        const PROOF_DATA = {
            doId: 'do-1',
            fileUrl: 'https://s3/proof.pdf',
            fileName: 'proof.pdf',
            fileSizeBytes: 5000,
            mimeType: 'application/pdf',
            userId: 'driver-1',
        };

        function makeOutboundService(returnsService: { createReturnForDeliveryOrder: ReturnType<typeof vi.fn> }) {
            const deliveryOrderRepo = makeMockDeliveryOrderRepo();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'SHIPPED' });
            const documentsRepo = makeMockDocumentsRepo();
            const service = new OutboundServices(
                deliveryOrderRepo as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                documentsRepo as never,
                undefined,
                returnsService as never,
            );
            return { service, deliveryOrderRepo, documentsRepo };
        }

        test('calls createReturnForDeliveryOrder inside the proof transaction with the same tx', async () => {
            const returnsService = { createReturnForDeliveryOrder: vi.fn().mockResolvedValue(FAKE_RETURN) };
            const { service } = makeOutboundService(returnsService);

            const returns = [{ skuId: 'sku-1', qtyReturned: '2', reason: 'DAMAGED' }];
            await service.submitDeliveryProof({ ...PROOF_DATA, returns });

            expect(returnsService.createReturnForDeliveryOrder).toHaveBeenCalledWith(
                expect.objectContaining({ doId: 'do-1', items: returns, userId: 'driver-1', organizationId: 'org-1' }),
                FAKE_TX,
            );
        });

        test('does not touch returns when no returns provided', async () => {
            const returnsService = { createReturnForDeliveryOrder: vi.fn() };
            const { service } = makeOutboundService(returnsService);

            await service.submitDeliveryProof(PROOF_DATA);

            expect(returnsService.createReturnForDeliveryOrder).not.toHaveBeenCalled();
        });

        test('propagates return-creation failure so the whole proof transaction rolls back', async () => {
            const returnsService = {
                createReturnForDeliveryOrder: vi.fn().mockRejectedValue(new Error('Return quantity for SKU exceeds delivered quantity')),
            };
            const { service } = makeOutboundService(returnsService);

            await expect(
                service.submitDeliveryProof({ ...PROOF_DATA, returns: [{ skuId: 'sku-1', qtyReturned: '999', reason: 'DAMAGED' }] }),
            ).rejects.toThrow(/exceeds delivered quantity/);
        });
    });
});

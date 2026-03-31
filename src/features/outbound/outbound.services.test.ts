import { vi, describe, test, expect, beforeEach } from 'vitest';

// ─── Module-level mocks (must be hoisted before any imports) ─────────────────

vi.mock('@/db', () => ({
    db: {
        transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) =>
            fn({
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([
                                {
                                    rate: '0.00',
                                    minQty: '5.00',
                                    sstRate: '0.0600',
                                },
                            ]),
                        }),
                    }),
                }),
            })
        ),
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

import { OutboundServices } from './outbound.services';
import { InventoryMovementType } from '../inventory/inventory-movement/inventory.model';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const FAKE_PO = {
    id: 'po-1',
    purchaseOrderNo: 'PO-001',
    outletId: 'outlet-1',
    status: 'NEW',
    organizationId: 'org-1',
    scheduledDeliveryDate: new Date('2026-04-01'),
    createdBy: 'user-1',
    updatedBy: 'user-1',
};

const FAKE_DO = {
    id: 'do-1',
    doNo: 'DO-001',
    purchaseOrderId: 'po-1',
    poNo: 'PO-001',
    status: 'NEW',
    isEmergency: false,
    organizationId: 'org-1',
    createdBy: 'user-1',
    updatedBy: 'user-1',
};

const FAKE_OUTLET = {
    id: 'outlet-1',
    outletName: 'Test Outlet',
    regionId: 'region-1',
};

const FAKE_SCHEDULE = {
    scheduleId: 'sched-1',
    regionId: 'region-1',
    dayOfWeek: 2, // Tuesday (ISO: 1=Mon ... 7=Sun)
    cutoffDaysBefore: 1,
    cutoffTime: '18:00:00',
    isActive: true,
    regionName: 'Klang Valley',
    regionCode: 'KV',
    dayName: 'Tuesday',
};

const FAKE_SKU = {
    skuId: 'sku-1',
    skuCode: 'SKU001',
    pickingStrategy: 'FIFO',
};

const FAKE_BALANCE = {
    skuId: 'sku-1',
    onHandQty: '100',
    reservedQty: '10',
};

// ─── Repository mocks ─────────────────────────────────────────────────────────

function makeMockDeliveryOrderRepo() {
    return {
        createDeliveryOrder: vi.fn().mockResolvedValue(FAKE_DO),
        createDeliveryOrderItems: vi.fn().mockResolvedValue([]),
        getDeliveryOrderById: vi.fn().mockResolvedValue(FAKE_DO),
        updateDeliveryOrder: vi.fn().mockImplementation((_id, data) => Promise.resolve({ ...FAKE_DO, ...data })),
        getDeliveryOrderItemsWithDetails: vi.fn().mockResolvedValue({ query: [], total: 0 }),
        getGrnItemsWithAvailableQty: vi.fn().mockResolvedValue([]),
        createDoItemAllocations: vi.fn().mockResolvedValue([]),
        deleteDoItemAllocations: vi.fn().mockResolvedValue(undefined),
        getDoItemAllocationsWithDetails: vi.fn().mockResolvedValue([]),
    };
}

function makeMockSkuRepo() {
    return {
        getSku: vi.fn().mockResolvedValue({ query: [FAKE_SKU] }),
    };
}

function makeMockInventoryBalanceRepo() {
    return {
        getInventoryBalanceBySkuIds: vi.fn().mockResolvedValue([FAKE_BALANCE]),
    };
}

function makeMockDeliveryScheduleRepo() {
    return {
        getSchedulesByRegion: vi.fn().mockResolvedValue([FAKE_SCHEDULE]),
    };
}

function makeMockOutletsRepo() {
    return {
        getOutletById: vi.fn().mockResolvedValue(FAKE_OUTLET),
    };
}

function makeMockPurchaseOrdersRepo() {
    return {
        createPurchaseOrder: vi.fn().mockResolvedValue(FAKE_PO),
        createPurchaseOrderItems: vi.fn().mockResolvedValue([]),
        getPurchaseOrders: vi.fn().mockResolvedValue({ query: [FAKE_PO], total: 1 }),
        updatePurchaseOrder: vi.fn().mockImplementation((_id, data) => Promise.resolve({ ...FAKE_PO, ...data })),
    };
}

function makeMockInventoryMovementRepo() {
    return {
        createInventoryMovement: vi.fn().mockResolvedValue([]),
    };
}

function makeMockDocumentsRepo() {
    return {
        insertDocument: vi.fn().mockResolvedValue({}),
    };
}

function makeService(overrides: Partial<{
    deliveryOrderRepo: ReturnType<typeof makeMockDeliveryOrderRepo>;
    skuRepo: ReturnType<typeof makeMockSkuRepo>;
    inventoryBalanceRepo: ReturnType<typeof makeMockInventoryBalanceRepo>;
    deliveryScheduleRepo: ReturnType<typeof makeMockDeliveryScheduleRepo>;
    outletsRepo: ReturnType<typeof makeMockOutletsRepo>;
    purchaseOrdersRepo: ReturnType<typeof makeMockPurchaseOrdersRepo>;
    inventoryMovementRepo: ReturnType<typeof makeMockInventoryMovementRepo>;
    documentsRepo: ReturnType<typeof makeMockDocumentsRepo>;
}> = {}) {
    const deliveryOrderRepo = overrides.deliveryOrderRepo ?? makeMockDeliveryOrderRepo();
    const skuRepo = overrides.skuRepo ?? makeMockSkuRepo();
    const inventoryBalanceRepo = overrides.inventoryBalanceRepo ?? makeMockInventoryBalanceRepo();
    const deliveryScheduleRepo = overrides.deliveryScheduleRepo ?? makeMockDeliveryScheduleRepo();
    const outletsRepo = overrides.outletsRepo ?? makeMockOutletsRepo();
    const purchaseOrdersRepo = overrides.purchaseOrdersRepo ?? makeMockPurchaseOrdersRepo();
    const inventoryMovementRepo = overrides.inventoryMovementRepo ?? makeMockInventoryMovementRepo();
    const documentsRepo = overrides.documentsRepo ?? makeMockDocumentsRepo();

    const service = new OutboundServices(
        deliveryOrderRepo as never,
        skuRepo as never,
        inventoryBalanceRepo as never,
        deliveryScheduleRepo as never,
        outletsRepo as never,
        purchaseOrdersRepo as never,
        inventoryMovementRepo as never,
        documentsRepo as never,
    );

    return {
        service,
        deliveryOrderRepo,
        skuRepo,
        inventoryBalanceRepo,
        deliveryScheduleRepo,
        outletsRepo,
        purchaseOrdersRepo,
        inventoryMovementRepo,
        documentsRepo,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('OutboundServices', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── computeNextDeliveryDate ─────────────────────────────────────────────

    describe('computeNextDeliveryDate', () => {
        test('returns null when no schedules exist for region', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([]);

            const result = await service.computeNextDeliveryDate('region-1', new Date());
            expect(result).toBeNull();
        });

        test('returns Tuesday delivery when order placed Monday before cutoff', async () => {
            // Tuesday = dayOfWeek 2, cutoff: Monday 18:00
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
            ]);

            // Monday 10:00 — before 18:00 cutoff
            const monday10am = new Date('2026-03-16T10:00:00'); // Monday
            const result = await service.computeNextDeliveryDate('region-1', monday10am);

            expect(result).not.toBeNull();
            expect(result!.deliveryDate.getDay()).toBe(2); // Tuesday
        });

        test('skips to next week when cutoff has already passed', async () => {
            // Tuesday delivery, cutoff Monday 18:00. Order placed Monday 20:00.
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
            ]);

            const monday8pm = new Date('2026-03-16T20:00:00');
            const result = await service.computeNextDeliveryDate('region-1', monday8pm);

            expect(result).not.toBeNull();
            // Should be the NEXT Tuesday (7 days later)
            const tuesdayThisWeek = new Date('2026-03-17');
            expect(result!.deliveryDate.getTime()).toBeGreaterThan(tuesdayThisWeek.getTime());
        });

        test('picks earliest valid date across multiple schedules (Tuesday + Thursday)', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Tuesday' },
                { ...FAKE_SCHEDULE, scheduleId: 'sched-2', dayOfWeek: 4, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Thursday' },
            ]);

            // Monday 10:00 — both Tuesday and Thursday are valid, Tuesday is earlier
            const monday10am = new Date('2026-03-16T10:00:00');
            const result = await service.computeNextDeliveryDate('region-1', monday10am);

            expect(result).not.toBeNull();
            expect(result!.deliveryDate.getDay()).toBe(2); // Tuesday wins
        });

        test('falls through to Thursday when Tuesday cutoff passed', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Tuesday' },
                { ...FAKE_SCHEDULE, scheduleId: 'sched-2', dayOfWeek: 4, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Thursday' },
            ]);

            // Monday 20:00 — Tuesday cutoff has passed, Thursday cutoff not yet
            const monday8pm = new Date('2026-03-16T20:00:00');
            const result = await service.computeNextDeliveryDate('region-1', monday8pm);

            expect(result).not.toBeNull();
            expect(result!.deliveryDate.getDay()).toBe(4); // Thursday
        });
    });

    // ─── computeNextDeliveryDateEmergency ────────────────────────────────────

    describe('computeNextDeliveryDateEmergency', () => {
        test('returns null when no schedules exist', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([]);

            const result = await service.computeNextDeliveryDateEmergency('region-1', new Date());
            expect(result).toBeNull();
        });

        test('returns next delivery day even after cutoff has passed', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
            ]);

            // Monday 20:00 — cutoff passed but emergency ignores it
            const monday8pm = new Date('2026-03-16T20:00:00');
            const result = await service.computeNextDeliveryDateEmergency('region-1', monday8pm);

            expect(result).not.toBeNull();
            expect(result!.deliveryDate.getDay()).toBe(2); // Still this Tuesday
        });

        test('picks earliest next delivery across multiple schedules', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([
                { ...FAKE_SCHEDULE, dayOfWeek: 4, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Thursday' },
                { ...FAKE_SCHEDULE, scheduleId: 'sched-2', dayOfWeek: 2, cutoffDaysBefore: 1, cutoffTime: '18:00:00', dayName: 'Tuesday' },
            ]);

            const monday = new Date('2026-03-16T10:00:00');
            const result = await service.computeNextDeliveryDateEmergency('region-1', monday);

            expect(result!.deliveryDate.getDay()).toBe(2); // Tuesday is sooner
        });
    });

    // ─── createPurchaseOrder ─────────────────────────────────────────────────

    describe('createPurchaseOrder', () => {
        const BASE_INPUT = {
            userId: 'user-1',
            organizationId: 'org-1',
            purchaseOrderNo: 'PO-001',
            outletId: 'outlet-1',
            items: [{ skuCode: 'SKU001', skuId: 'sku-1', qtyRequired: 5 }],
        };

        test('happy path: creates PO, DO, items, and inventory movements', async () => {
            const { service, purchaseOrdersRepo, deliveryOrderRepo, inventoryMovementRepo } = makeService();

            const result = await service.createPurchaseOrder(BASE_INPUT);

            expect(result).toMatchObject({ id: 'po-1' });
            expect(purchaseOrdersRepo.createPurchaseOrder).toHaveBeenCalledOnce();
            expect(purchaseOrdersRepo.createPurchaseOrderItems).toHaveBeenCalledOnce();
            expect(deliveryOrderRepo.createDeliveryOrder).toHaveBeenCalledOnce();
            expect(deliveryOrderRepo.createDeliveryOrderItems).toHaveBeenCalledOnce();
            expect(inventoryMovementRepo.createInventoryMovement).toHaveBeenCalledOnce();
        });

        test('DO number derived from PO number (PO-001 → DO-001)', async () => {
            const { service, deliveryOrderRepo } = makeService();

            await service.createPurchaseOrder(BASE_INPUT);

            expect(deliveryOrderRepo.createDeliveryOrder).toHaveBeenCalledWith(
                expect.objectContaining({ doNo: 'DO-001', poNo: 'PO-001' }),
                expect.anything(),
            );
        });

        test('inventory movement type is RESERVED', async () => {
            const { service, inventoryMovementRepo } = makeService();

            await service.createPurchaseOrder(BASE_INPUT);

            const [movements] = inventoryMovementRepo.createInventoryMovement.mock.calls[0];
            expect(movements[0].movementType).toBe(InventoryMovementType.RESERVED);
        });

        test('throws when userId is missing', async () => {
            const { service } = makeService();
            await expect(
                service.createPurchaseOrder({ ...BASE_INPUT, userId: '' })
            ).rejects.toThrow('User ID is required');
        });

        test('throws when outlet not found', async () => {
            const { service, outletsRepo } = makeService();
            outletsRepo.getOutletById.mockResolvedValue(null);

            await expect(service.createPurchaseOrder(BASE_INPUT)).rejects.toThrow(
                'Outlet not found or has no region assigned'
            );
        });

        test('throws when outlet has no regionId', async () => {
            const { service, outletsRepo } = makeService();
            outletsRepo.getOutletById.mockResolvedValue({ ...FAKE_OUTLET, regionId: null });

            await expect(service.createPurchaseOrder(BASE_INPUT)).rejects.toThrow(
                'Outlet not found or has no region assigned'
            );
        });

        test('throws when no delivery schedule found for region', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            deliveryScheduleRepo.getSchedulesByRegion.mockResolvedValue([]);

            await expect(service.createPurchaseOrder(BASE_INPUT)).rejects.toThrow(
                'No delivery schedules found for region'
            );
        });

        test('throws when SKU code cannot be resolved', async () => {
            const { service, skuRepo } = makeService();
            skuRepo.getSku.mockResolvedValue({ query: [] });

            await expect(
                service.createPurchaseOrder({
                    ...BASE_INPUT,
                    items: [{ skuCode: 'INVALID', qtyRequired: 5 }],
                })
            ).rejects.toThrow('skuCode="INVALID" not found');
        });

        test('throws when insufficient stock', async () => {
            const { service, inventoryBalanceRepo } = makeService();
            // onHand=10, reserved=5, available=5; require 10 → insufficient
            inventoryBalanceRepo.getInventoryBalanceBySkuIds.mockResolvedValue([
                { skuId: 'sku-1', onHandQty: '10', reservedQty: '5' },
            ]);

            await expect(
                service.createPurchaseOrder({ ...BASE_INPUT, items: [{ skuCode: 'SKU001', skuId: 'sku-1', qtyRequired: 10 }] })
            ).rejects.toThrow('Insufficient stock for SKU');
        });

        test('emergency flag calls emergency delivery date computation', async () => {
            const { service, deliveryScheduleRepo } = makeService();
            // Use spy to verify which path is taken
            const spy = vi.spyOn(service, 'computeNextDeliveryDateEmergency');

            await service.createPurchaseOrder({ ...BASE_INPUT, isEmergency: true });

            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // ─── advanceDeliveryOrderStatus ──────────────────────────────────────────

    describe('advanceDeliveryOrderStatus', () => {
        const DATA = { id: 'do-1', userId: 'user-1' };

        test('NEW → PICKING: succeeds without updating PO', async () => {
            const { service, deliveryOrderRepo, purchaseOrdersRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'NEW' });

            const result = await service.advanceDeliveryOrderStatus(DATA);

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'PICKING' }),
                undefined,
                expect.anything(),
            );
            expect(purchaseOrdersRepo.updatePurchaseOrder).not.toHaveBeenCalled();
            expect(result.status).toBe('PICKING');
        });

        test('PICKING → PACKING: succeeds without updating PO', async () => {
            const { service, deliveryOrderRepo, purchaseOrdersRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });

            await service.advanceDeliveryOrderStatus(DATA);

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'PACKING' }),
                undefined,
                expect.anything(),
            );
            expect(purchaseOrdersRepo.updatePurchaseOrder).not.toHaveBeenCalled();
        });

        test('PACKING → SHIPPED: succeeds and updates PO to SHIPPED', async () => {
            const { service, deliveryOrderRepo, purchaseOrdersRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PACKING' });

            await service.advanceDeliveryOrderStatus(DATA);

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'SHIPPED' }),
                undefined,
                expect.anything(),
            );
            expect(purchaseOrdersRepo.updatePurchaseOrder).toHaveBeenCalledWith(
                FAKE_DO.purchaseOrderId,
                expect.objectContaining({ status: 'SHIPPED' }),
                undefined,
                expect.anything(),
            );
        });

        test('SHIPPED status throws — must upload proof of delivery', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'SHIPPED' });

            await expect(service.advanceDeliveryOrderStatus(DATA)).rejects.toThrow(
                'upload proof of delivery'
            );
        });

        test('DELIVERED status throws — already final', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'DELIVERED' });

            await expect(service.advanceDeliveryOrderStatus(DATA)).rejects.toThrow(
                'already DELIVERED'
            );
        });

        test('DO not found throws', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue(null);

            await expect(service.advanceDeliveryOrderStatus(DATA)).rejects.toThrow(
                'Delivery order not found'
            );
        });

        test('CREATED status is treated as NEW for transition', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'CREATED' });

            // Should advance to PICKING (CREATED acts as NEW)
            await expect(service.advanceDeliveryOrderStatus(DATA)).resolves.toBeDefined();
            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'PICKING' }),
                undefined,
                expect.anything(),
            );
        });
    });

    // ─── updateDeliveryOrder ─────────────────────────────────────────────────

    describe('updateDeliveryOrder', () => {
        test('throws on invalid status not in flow', async () => {
            const { service } = makeService();

            await expect(
                service.updateDeliveryOrder('do-1', { status: 'CANCELLED', updatedBy: 'user-1' })
            ).rejects.toThrow('Invalid status');
        });

        test('throws on non-sequential transition (NEW → SHIPPED)', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'NEW' });

            await expect(
                service.updateDeliveryOrder('do-1', { status: 'SHIPPED', updatedBy: 'user-1' })
            ).rejects.toThrow('Invalid transition');
        });

        test('succeeds on valid next step (NEW → PICKING)', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'NEW' });

            await expect(
                service.updateDeliveryOrder('do-1', { status: 'PICKING', updatedBy: 'user-1' })
            ).resolves.toBeDefined();
        });

        test('updates isEmergency without status change', async () => {
            const { service, deliveryOrderRepo } = makeService();

            const result = await service.updateDeliveryOrder('do-1', { isEmergency: true, updatedBy: 'user-1' });

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ isEmergency: true }),
                undefined,
                expect.anything(),
            );
            expect(result).toBeDefined();
        });

        test('CREATED treated as NEW when validating transitions', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'CREATED' });

            // CREATED → PICKING should succeed (CREATED normalised to NEW)
            await expect(
                service.updateDeliveryOrder('do-1', { status: 'PICKING', updatedBy: 'user-1' })
            ).resolves.toBeDefined();
        });
    });

    // ─── allocatePickList ────────────────────────────────────────────────────

    describe('allocatePickList', () => {
        const DATA = { deliveryOrderId: 'do-1', userId: 'user-1' };

        const makeBatch = (overrides: Partial<{
            id: string;
            qty: string;
            allocatedQty: string;
            createdAt: Date;
            expiryDate: Date | null;
            priorityFlag: boolean;
            rackId: string | null;
        }>) => ({
            id: 'grn-item-1',
            grnId: 'grn-1',
            grnNo: 'GRN-001',
            rackId: null,
            expiryDate: null,
            qty: '100',
            allocatedQty: '0',
            priorityFlag: false,
            createdAt: new Date('2024-01-01'),
            ...overrides,
        });

        const makeDoItem = (id: string, skuId: string, qtyRequired: string) => ({
            id,
            doNo: 'DO-001',
            skuId,
            qtyRequired,
            purchaseOrderId: 'po-1',
            purchaseOrderNo: 'PO-001',
        });

        test('returns empty map when DO has no items', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'NEW' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({ query: [], total: 0 });

            const result = await service.allocatePickList(DATA);
            expect(result.size).toBe(0);
        });

        test('advances DO from NEW to PICKING when allocation starts', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'NEW' });

            await service.allocatePickList(DATA);

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'PICKING' }),
                undefined,
                expect.anything(),
            );
        });

        test('does NOT advance status when DO is already PICKING', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });

            await service.allocatePickList(DATA);

            expect(deliveryOrderRepo.updateDeliveryOrder).not.toHaveBeenCalled();
        });

        test('FIFO: allocates from oldest batch first', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '10')],
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [{ ...FAKE_SKU, pickingStrategy: 'FIFO' }] });

            const oldBatch = makeBatch({ id: 'old', qty: '50', allocatedQty: '0', createdAt: new Date('2023-01-01') });
            const newBatch = makeBatch({ id: 'new', qty: '50', allocatedQty: '0', createdAt: new Date('2024-01-01') });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([newBatch, oldBatch]);

            await service.allocatePickList(DATA);

            const [inserts] = deliveryOrderRepo.createDoItemAllocations.mock.calls[0];
            expect(inserts[0].grnItemId).toBe('old'); // oldest first
        });

        test('LIFO: allocates from newest batch first', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '10')],
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [{ ...FAKE_SKU, pickingStrategy: 'LIFO' }] });

            const oldBatch = makeBatch({ id: 'old', qty: '50', allocatedQty: '0', createdAt: new Date('2023-01-01') });
            const newBatch = makeBatch({ id: 'new', qty: '50', allocatedQty: '0', createdAt: new Date('2024-06-01') });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([oldBatch, newBatch]);

            await service.allocatePickList(DATA);

            const [inserts] = deliveryOrderRepo.createDoItemAllocations.mock.calls[0];
            expect(inserts[0].grnItemId).toBe('new'); // newest first
        });

        test('FEFO: allocates batch with earliest expiry first', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '10')],
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [{ ...FAKE_SKU, pickingStrategy: 'FEFO' }] });

            const laterExpiry = makeBatch({ id: 'late', qty: '50', allocatedQty: '0', expiryDate: new Date('2026-12-31') });
            const soonerExpiry = makeBatch({ id: 'soon', qty: '50', allocatedQty: '0', expiryDate: new Date('2026-06-30') });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([laterExpiry, soonerExpiry]);

            await service.allocatePickList(DATA);

            const [inserts] = deliveryOrderRepo.createDoItemAllocations.mock.calls[0];
            expect(inserts[0].grnItemId).toBe('soon'); // earliest expiry first
        });

        test('priority flag: flagged batches go before unflagged (selective flag)', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '10')],
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [{ ...FAKE_SKU, pickingStrategy: 'FIFO' }] });

            // Newer unflagged and older flagged — flagged should win despite being "older" in FIFO
            const unflagged = makeBatch({ id: 'unflagged', qty: '50', allocatedQty: '0', priorityFlag: false, createdAt: new Date('2023-01-01') });
            const flagged = makeBatch({ id: 'flagged', qty: '50', allocatedQty: '0', priorityFlag: true, createdAt: new Date('2024-01-01') });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([unflagged, flagged]);

            await service.allocatePickList(DATA);

            const [inserts] = deliveryOrderRepo.createDoItemAllocations.mock.calls[0];
            expect(inserts[0].grnItemId).toBe('flagged');
        });

        test('greedy allocation spans multiple batches when one is insufficient', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '30')], // need 30
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [{ ...FAKE_SKU, pickingStrategy: 'FIFO' }] });

            const batch1 = makeBatch({ id: 'b1', qty: '20', allocatedQty: '0', createdAt: new Date('2023-01-01') });
            const batch2 = makeBatch({ id: 'b2', qty: '20', allocatedQty: '0', createdAt: new Date('2024-01-01') });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([batch1, batch2]);

            await service.allocatePickList(DATA);

            const [inserts] = deliveryOrderRepo.createDoItemAllocations.mock.calls[0];
            expect(inserts).toHaveLength(2); // spans both batches
            expect(inserts[0]).toMatchObject({ grnItemId: 'b1', qtyAllocated: '20' });
            expect(inserts[1]).toMatchObject({ grnItemId: 'b2', qtyAllocated: '10' });
        });

        test('skips item with no available stock (no throw)', async () => {
            const { service, deliveryOrderRepo, skuRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PICKING' });
            deliveryOrderRepo.getDeliveryOrderItemsWithDetails.mockResolvedValue({
                query: [makeDoItem('item-1', 'sku-1', '10')],
                total: 1,
            });
            skuRepo.getSku.mockResolvedValue({ query: [FAKE_SKU] });
            deliveryOrderRepo.getGrnItemsWithAvailableQty.mockResolvedValue([
                makeBatch({ id: 'b1', qty: '10', allocatedQty: '10' }), // fully allocated
            ]);

            await expect(service.allocatePickList(DATA)).resolves.toBeDefined();
            expect(deliveryOrderRepo.createDoItemAllocations).not.toHaveBeenCalled();
        });
    });

    // ─── submitDeliveryProof ─────────────────────────────────────────────────

    describe('submitDeliveryProof', () => {
        const BASE_PROOF = {
            doId: 'do-1',
            fileUrl: 'https://s3.example.com/pod.pdf',
            fileName: 'pod.pdf',
            fileSizeBytes: 12345,
            mimeType: 'application/pdf',
            userId: 'user-1',
        };

        test('throws if DO is not in SHIPPED status', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'PACKING' });

            await expect(service.submitDeliveryProof(BASE_PROOF)).rejects.toThrow(
                'must be SHIPPED'
            );
        });

        test('throws if DO not found', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue(null);

            await expect(service.submitDeliveryProof(BASE_PROOF)).rejects.toThrow(
                'Delivery order not found'
            );
        });

        test('inserts SIGNED_DO_PROOF document and advances DO to DELIVERED', async () => {
            const { service, deliveryOrderRepo, documentsRepo } = makeService();
            deliveryOrderRepo.getDeliveryOrderById.mockResolvedValue({ ...FAKE_DO, status: 'SHIPPED' });
            deliveryOrderRepo.updateDeliveryOrder.mockResolvedValue({ ...FAKE_DO, status: 'DELIVERED' });

            const result = await service.submitDeliveryProof(BASE_PROOF);

            expect(documentsRepo.insertDocument).toHaveBeenCalledWith(
                expect.objectContaining({
                    docType: 'SIGNED_DO_PROOF',
                    refType: 'DO',
                    refId: 'do-1',
                    fileName: 'pod.pdf',
                }),
            );
            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'DELIVERED' }),
                undefined,
                expect.anything(),
            );
            expect(result.status).toBe('DELIVERED');
        });
    });

    // ─── applyEmergencyDelivery ──────────────────────────────────────────────

    describe('applyEmergencyDelivery', () => {
        test('throws when PO not found', async () => {
            const { service, purchaseOrdersRepo } = makeService();
            purchaseOrdersRepo.getPurchaseOrders.mockResolvedValue({ query: [], total: 0 });

            await expect(service.applyEmergencyDelivery('po-1', 'user-1')).rejects.toThrow(
                'Purchase order not found'
            );
        });

        test('throws when outlet has no region', async () => {
            const { service, outletsRepo } = makeService();
            outletsRepo.getOutletById.mockResolvedValue({ ...FAKE_OUTLET, regionId: null });

            await expect(service.applyEmergencyDelivery('po-1', 'user-1')).rejects.toThrow(
                'Outlet not found or has no region assigned'
            );
        });

        test('updates scheduledDeliveryDate to emergency delivery date', async () => {
            const { service, purchaseOrdersRepo } = makeService();

            await service.applyEmergencyDelivery('po-1', 'user-1');

            expect(purchaseOrdersRepo.updatePurchaseOrder).toHaveBeenCalledWith(
                'po-1',
                expect.objectContaining({ scheduledDeliveryDate: expect.any(Date) }),
            );
        });
    });

    // ─── completeDeliveryOrder ───────────────────────────────────────────────

    describe('completeDeliveryOrder', () => {
        test('updates DO status to COMPLETED', async () => {
            const { service, deliveryOrderRepo } = makeService();
            deliveryOrderRepo.updateDeliveryOrder.mockResolvedValue({ ...FAKE_DO, status: 'COMPLETED' });

            const result = await service.completeDeliveryOrder({ id: 'do-1', userId: 'user-1' });

            expect(deliveryOrderRepo.updateDeliveryOrder).toHaveBeenCalledWith(
                'do-1',
                expect.objectContaining({ status: 'COMPLETED', updatedBy: 'user-1' }),
            );
            expect(result.status).toBe('COMPLETED');
        });
    });
});

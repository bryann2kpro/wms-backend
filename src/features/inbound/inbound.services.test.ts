import { vi, describe, test, expect, beforeEach } from 'vitest';

// ─── Module-level mocks (must be hoisted before any imports) ─────────────────

// db.transaction simply runs the callback with a fake tx and lets thrown errors
// propagate (mirroring a rollback — nothing is committed when the callback throws).
vi.mock('@/db', () => ({
    db: {
        transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
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

// ─── Imports ─────────────────────────────────────────────────────────────────

import { InboundServices, type CreateInboundInput } from './inbound.services';

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PO_NO = 'PO-300';
const SKU_CODE = 'SKU-A';
const SKU_ID = 'sku-a-id';

// ASN with expected 300 for SKU-A (payload lines key by itemid = skuCode).
const ASN_EXPECTED_300 = {
    id: 'asn-1',
    tranid: PO_NO,
    payload: {
        entity: 'SUP-1 Test Supplier',
        lines: [{ itemid: SKU_CODE, quantity: 300, lineuniquekey: 1 }],
    },
};

// ─── Repository mock factories ──────────────────────────────────────────────────

/**
 * @param priorReceived total qty already received for SKU_ID across prior GRNs.
 *        When > 0, a single prior GRN with one item of that qty is returned.
 */
function makeMockGrnsRepo(priorReceived = 0) {
    const priorGrns = priorReceived > 0 ? [{ id: 'grn-prior', poNo: PO_NO }] : [];
    return {
        getGrns: vi.fn().mockResolvedValue({ query: priorGrns }),
        generateGrnNo: vi.fn().mockResolvedValue('GRN-20260614-0001'),
        createGrn: vi.fn().mockResolvedValue({ id: 'grn-new' }),
        _priorReceived: priorReceived,
    };
}

function makeMockGrnItemsRepo(priorReceived = 0) {
    return {
        getGrnItems: vi.fn().mockResolvedValue(
            priorReceived > 0 ? [{ grnId: 'grn-prior', skuId: SKU_ID, qty: String(priorReceived) }] : [],
        ),
        createGrnItems: vi.fn().mockResolvedValue([{ id: 'grn-item-1' }]),
    };
}

function makeMockSkuRepo() {
    return {
        getSku: vi.fn().mockResolvedValue({ query: [{ skuId: SKU_ID, skuCode: SKU_CODE }] }),
        getSkuById: vi.fn().mockResolvedValue({ skuId: SKU_ID }),
        createSku: vi.fn().mockResolvedValue({ skuId: SKU_ID, skuCode: SKU_CODE }),
    };
}

function makeMockEsRepo(asn: unknown) {
    return {
        findByTranid: vi.fn().mockResolvedValue(asn),
        findById: vi.fn().mockResolvedValue(asn),
        markLinked: vi.fn().mockResolvedValue(undefined),
    };
}

function makeNoopRepo(extra: Record<string, unknown> = {}) {
    return extra;
}

type ServiceOverrides = {
    grnsRepo?: ReturnType<typeof makeMockGrnsRepo>;
    grnItemsRepo?: ReturnType<typeof makeMockGrnItemsRepo>;
    skuRepo?: ReturnType<typeof makeMockSkuRepo>;
    esRepo?: ReturnType<typeof makeMockEsRepo>;
};

function makeService(o: ServiceOverrides = {}) {
    const grnsRepo = o.grnsRepo ?? makeMockGrnsRepo();
    const grnItemsRepo = o.grnItemsRepo ?? makeMockGrnItemsRepo();
    const skuRepo = o.skuRepo ?? makeMockSkuRepo();
    const esRepo = o.esRepo ?? makeMockEsRepo(ASN_EXPECTED_300);

    const supplierDeliveriesRepo = makeNoopRepo();
    const supplierDeliveryItemsRepo = makeNoopRepo();
    const inventoryMovementRepo = makeNoopRepo();
    // resolveSupplierId falls back to DEFAULT_SUPPLIER_ID env when no supplierId given.
    const suppliersRepo = makeNoopRepo({
        getSupplierById: vi.fn().mockResolvedValue({ supplierId: 'sup-1' }),
    });
    const stockUnitRepo = makeNoopRepo();

    const service = new InboundServices(
        grnsRepo as never,
        skuRepo as never,
        supplierDeliveriesRepo as never,
        supplierDeliveryItemsRepo as never,
        grnItemsRepo as never,
        inventoryMovementRepo as never,
        suppliersRepo as never,
        stockUnitRepo as never,
        esRepo as never,
    );

    return { service, grnsRepo, grnItemsRepo, skuRepo, esRepo };
}

function baseInput(overrides: Partial<CreateInboundInput> = {}): CreateInboundInput {
    return {
        userId: USER_ID,
        organizationId: ORG_ID,
        grnNo: 'GRN-IN',
        supplierId: 'sup-1',
        poNo: PO_NO,
        items: [{ skuCode: SKU_CODE, qty: '100' }],
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('InboundServices.createInbound — ASN over-receipt enforcement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('throws when incoming + prior received exceeds ASN expected (300 expected, 200 prior, 250 incoming)', async () => {
        const grnsRepo = makeMockGrnsRepo(200);
        const grnItemsRepo = makeMockGrnItemsRepo(200);
        const { service } = makeService({ grnsRepo, grnItemsRepo });

        await expect(
            service.createInbound(baseInput({ items: [{ skuCode: SKU_CODE, qty: '250' }] })),
        ).rejects.toThrow(/Over-receipt blocked for SKU SKU-A/);

        // Ensure the GRN was never created (validation runs before creation -> rollback).
        expect(grnsRepo.createGrn).not.toHaveBeenCalled();
    });

    test('error message includes expected, alreadyReceived, remaining, and incoming', async () => {
        const grnsRepo = makeMockGrnsRepo(200);
        const grnItemsRepo = makeMockGrnItemsRepo(200);
        const { service } = makeService({ grnsRepo, grnItemsRepo });

        await expect(
            service.createInbound(baseInput({ items: [{ skuCode: SKU_CODE, qty: '250' }] })),
        ).rejects.toThrow(/expected 300.*already received 200.*remaining 100.*attempted to receive 250/);
    });

    test('succeeds when incoming fits within remaining (300 expected, 200 prior, 100 incoming)', async () => {
        const grnsRepo = makeMockGrnsRepo(200);
        const grnItemsRepo = makeMockGrnItemsRepo(200);
        const { service } = makeService({ grnsRepo, grnItemsRepo });

        const result = await service.createInbound(
            baseInput({ items: [{ skuCode: SKU_CODE, qty: '100' }] }),
        );

        expect(result).toBe(true);
        expect(grnsRepo.createGrn).toHaveBeenCalledTimes(1);
    });

    test('PO without an ASN skips enforcement entirely (no regression)', async () => {
        const grnsRepo = makeMockGrnsRepo(0);
        const grnItemsRepo = makeMockGrnItemsRepo(0);
        const esRepo = makeMockEsRepo(null); // no ASN for the PO
        const { service } = makeService({ grnsRepo, grnItemsRepo, esRepo });

        // 5000 would massively exceed any plausible expected, but with no ASN it must pass.
        const result = await service.createInbound(
            baseInput({ items: [{ skuCode: SKU_CODE, qty: '5000' }] }),
        );

        expect(result).toBe(true);
        expect(grnsRepo.createGrn).toHaveBeenCalledTimes(1);
        // getGrns must not be queried for prior-received sums when there is no ASN.
        expect(grnsRepo.getGrns).not.toHaveBeenCalled();
    });
});

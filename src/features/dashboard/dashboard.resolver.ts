import { dashboardRepository } from '@/composition-root';
import { logger } from '@/util/logger';

export const resolvers = {
  Query: {
    dashboard: async () => {
      try {
        const [
          grnStats,
          poStats,
          doStats,
          invoiceStats,
          integrationHealth,
          recentGrns,
          recentTransferOrders,
          recentDeliveries,
        ] = await Promise.all([
          dashboardRepository.getGrnStats(),
          dashboardRepository.getPurchaseOrderStats(),
          dashboardRepository.getDeliveryOrderStats(),
          dashboardRepository.getInvoiceStats(),
          dashboardRepository.getIntegrationHealth(),
          dashboardRepository.getRecentGrns(10),
          dashboardRepository.getRecentTransferOrders(10),
          dashboardRepository.getRecentDeliveries(10),
        ]);

        return {
          stats: {
            totalGRNs: grnStats.totalGRNs,
            pendingGRNs: grnStats.pendingGRNs,
            grnsToday: grnStats.grnsToday,
            grnsPendingApproval: grnStats.grnsPendingApproval,
            totalTransfers: poStats.totalTransfers,
            activeTransfers: poStats.activeTransfers,
            tosPulledToday: poStats.tosPulledToday,
            tosLastPullTime: poStats.tosLastPullTime,
            totalDeliveries: doStats.totalDeliveries,
            scheduledDeliveries: doStats.scheduledDeliveries,
            dosByStatus: doStats.dosByStatus,
            shortageDamagePending: 0, // TODO: implement when exceptions tracking is ready
            invoicesIssuedToday: invoiceStats.invoicesIssuedToday,
            invoicesIssuedThisWeek: invoiceStats.invoicesIssuedThisWeek,
            inventoryValue: 0, // TODO: implement inventory valuation
            lowStockItems: 0, // skipped for now
          },
          integrationHealth,
          grns: recentGrns,
          transferOrders: recentTransferOrders,
          deliveries: recentDeliveries,
          pendingProofCount: doStats.pendingProofCount,
        };
      } catch (error) {
        logger.error('❌ [dashboard.resolver] Error fetching dashboard data:', error);
        throw error;
      }
    },
  },
};

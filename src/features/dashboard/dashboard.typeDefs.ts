export const typeDefs = `#graphql
  type DOsByStatus {
    picking: Int!
    ready: Int!
    deliveredPendingProof: Int!
  }

  type DashboardStats {
    totalGRNs: Int!
    pendingGRNs: Int!
    grnsToday: Int!
    grnsPendingApproval: Int!
    totalTransfers: Int!
    activeTransfers: Int!
    tosPulledToday: Int!
    tosLastPullTime: String
    totalDeliveries: Int!
    scheduledDeliveries: Int!
    dosByStatus: DOsByStatus!
    shortageDamagePending: Int!
    invoicesIssuedToday: Int!
    invoicesIssuedThisWeek: Int!
    inventoryValue: Float!
    lowStockItems: Int!
  }

  type IntegrationHealth {
    lastTOPullTime: String!
    lastStockSyncTime: String!
    failedSyncCount: Int!
    stockSyncStatus: String!
  }

  type DashboardGRN {
    id: String!
    grnNumber: String!
    supplier: String!
    status: String!
    createdAt: String!
    totalAmount: Float!
  }

  type DashboardTransferOrder {
    id: String!
    transferOrderNumber: String!
    fromLocation: String!
    toLocation: String!
    status: String!
    createdAt: String!
    itemCount: Int!
  }

  type DashboardDelivery {
    id: String!
    deliveryNumber: String!
    customerName: String!
    status: String!
    scheduledDate: String!
    deliveryDate: String
    totalAmount: Float!
  }

  type Dashboard {
    stats: DashboardStats!
    integrationHealth: IntegrationHealth!
    grns: [DashboardGRN!]!
    transferOrders: [DashboardTransferOrder!]!
    deliveries: [DashboardDelivery!]!
    pendingProofCount: Int!
  }

  extend type Query {
    dashboard: Dashboard @auth
  }
`;

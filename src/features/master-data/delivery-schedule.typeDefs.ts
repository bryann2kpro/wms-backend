/**
 * Delivery Schedule GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Region Delivery Schedule operations.
 * Resolvers are in delivery-schedule.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Delivery Schedule - represents a recurring delivery day for a region
  """
  type DeliverySchedule {
    scheduleId: ID!
    regionId: ID!
    regionName: String!
    regionCode: String!
    dayOfWeek: Int!
    dayName: String!
    cutoffDaysBefore: Int!
    cutoffTime: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Delivery Schedule response
  """
  type DeliverySchedulePaginatedResponse {
    query: [DeliverySchedule!]!
    pagination: Pagination!
  }

  """
  Input for filtering delivery schedules
  """
  input DeliveryScheduleFilterInput {
    scheduleId: ID
    scheduleIds: [ID!]
    regionId: ID
    regionIds: [ID!]
    dayOfWeek: Int
    daysOfWeek: [Int!]
    isActive: Boolean
  }

  """
  Input for creating a new Delivery Schedule
  """
  input CreateDeliveryScheduleInput {
    regionId: ID!
    dayOfWeek: Int!
    cutoffDaysBefore: Int!
    cutoffTime: String!
    isActive: Boolean
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Delivery Schedule
  """
  input UpdateDeliveryScheduleInput {
    dayOfWeek: Int
    cutoffDaysBefore: Int
    cutoffTime: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    """
    Get delivery schedules with optional filtering and pagination.
    Requires authentication.
    """
    deliverySchedules(filter: DeliveryScheduleFilterInput, pageSize: Int, pageNumber: Int): DeliverySchedulePaginatedResponse! @auth
    
    """
    Get a single delivery schedule by ID.
    Requires authentication.
    """
    deliverySchedule(id: ID!): DeliverySchedule @auth
  }

  extend type Mutation {
    """
    Create a new delivery schedule.
    Requires authentication.
    """
    createDeliverySchedule(input: CreateDeliveryScheduleInput!): DeliverySchedule! @auth
    
    """
    Update an existing delivery schedule.
    Requires authentication.
    """
    updateDeliverySchedule(id: ID!, input: UpdateDeliveryScheduleInput!): DeliverySchedule @auth

    """
    Toggle delivery schedule active status.
    Requires authentication.
    """
    toggleDeliveryScheduleActive(id: ID!, isActive: Boolean!, updatedBy: String!): DeliverySchedule @auth

    """
    Delete a delivery schedule.
    Requires authentication.
    """
    deleteDeliverySchedule(id: ID!): Boolean! @auth
  }
`;

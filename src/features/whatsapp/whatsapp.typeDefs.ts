export const typeDefs = `#graphql
  type WhatsAppStatus {
    status: String!
    connectedPhone: String
    lastQr: String
  }

  type WhatsAppSettings {
    settingKey: String!
    toPhones: [String!]!
    updatedAt: String!
  }

  extend type Query {
    whatsAppStatus: WhatsAppStatus! @auth
    whatsAppSettings(settingKey: String!): WhatsAppSettings @auth
  }

  extend type Mutation {
    updateWhatsAppSettings(settingKey: String!, toPhones: [String!]!): WhatsAppSettings! @auth
    resetWhatsAppSession: WhatsAppStatus! @auth
  }
`;


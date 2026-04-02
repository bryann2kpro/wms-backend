export const typeDefs = `#graphql
  type EmailNotificationSettings {
    settingKey: String!
    toEmails: [String!]!
    ccEmails: [String!]!
    updatedAt: String!
  }

  input UpdateEmailNotificationSettingsInput {
    toEmails: [String!]!
    ccEmails: [String!]!
  }

  extend type Query {
    """
    Get email notification settings for a given trigger key (e.g. ADVANCE_NOTICE_RECEIVED)
    """
    emailNotificationSettings(settingKey: String!): EmailNotificationSettings @auth
  }

  extend type Mutation {
    """
    Create or update email notification settings for a given trigger key
    """
    updateEmailNotificationSettings(
      settingKey: String!
      input: UpdateEmailNotificationSettingsInput!
    ): EmailNotificationSettings! @auth
  }
`;

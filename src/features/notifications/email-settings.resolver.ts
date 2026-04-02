import { GraphQLError } from 'graphql';
import { emailSettingsRepository } from '@/composition-root';
import { GraphQLContext } from '@/graphql/context';
import { logger } from '@/util/logger';

export const resolvers = {
  Query: {
    emailNotificationSettings: async (
      _: unknown,
      { settingKey }: { settingKey: string },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const settings = await emailSettingsRepository.getByKey(settingKey);
      if (!settings) return null;

      return {
        settingKey: settings.settingKey,
        toEmails: settings.toEmails,
        ccEmails: settings.ccEmails,
        updatedAt: settings.updatedAt.toISOString(),
      };
    },
  },

  Mutation: {
    updateEmailNotificationSettings: async (
      _: unknown,
      {
        settingKey,
        input,
      }: { settingKey: string; input: { toEmails: string[]; ccEmails: string[] } },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const settings = await emailSettingsRepository.upsert(
        settingKey,
        input.toEmails,
        input.ccEmails ?? [],
      );

      logger.info(
        `✅ [Mutation.updateEmailNotificationSettings] Updated settings key="${settingKey}" by user=${context.user.id}`,
      );

      return {
        settingKey: settings.settingKey,
        toEmails: settings.toEmails,
        ccEmails: settings.ccEmails,
        updatedAt: settings.updatedAt.toISOString(),
      };
    },
  },
};

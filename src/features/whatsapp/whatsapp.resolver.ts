import { GraphQLError } from 'graphql';
import { whatsAppClient, whatsAppSettingsRepository } from '@/composition-root';
import { GraphQLContext } from '@/graphql/context';
import { logger } from '@/util/logger';

export const resolvers = {
  Query: {
    whatsAppStatus: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      return whatsAppClient.getStatus();
    },

    whatsAppSettings: async (
      _: unknown,
      { settingKey }: { settingKey: string },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const settings = await whatsAppSettingsRepository.getByKey(settingKey);
      if (!settings) return null;

      return {
        settingKey: settings.settingKey,
        toPhones: settings.toPhones,
        updatedAt: settings.updatedAt.toISOString(),
      };
    },
  },

  Mutation: {
    updateWhatsAppSettings: async (
      _: unknown,
      { settingKey, toPhones }: { settingKey: string; toPhones: string[] },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const normalized = toPhones
        .map((phone) => phone.trim())
        .filter(Boolean);

      const settings = await whatsAppSettingsRepository.upsert(settingKey, normalized);
      logger.info(
        `✅ [Mutation.updateWhatsAppSettings] Updated settings key="${settingKey}" by user=${context.user.id}`,
      );

      return {
        settingKey: settings.settingKey,
        toPhones: settings.toPhones,
        updatedAt: settings.updatedAt.toISOString(),
      };
    },

    resetWhatsAppSession: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const status = await whatsAppClient.resetSession();
      logger.info(`✅ [Mutation.resetWhatsAppSession] Reset requested by user=${context.user.id}`);
      return status;
    },
  },
};


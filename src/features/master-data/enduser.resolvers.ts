import { endUserRepository } from '@/composition-root';

export const resolvers = {
  Query: {
    endUsers: async (_: unknown, args: {
      filter?: { userName?: string };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter = { userName: args.filter?.userName };
      return endUserRepository.getEndUsers(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });
    },

    endUser: async (_: unknown, { id }: { id: string }) => {
      return endUserRepository.getEndUserById(id);
    },
  },

  Mutation: {
    createEndUser: async (_: unknown, { input }: { input: { userName: string } }) => {
      return endUserRepository.createEndUser({ userName: input.userName });
    },

    updateEndUser: async (_: unknown, { id, input }: { id: string; input: { userName: string } }) => {
      return endUserRepository.updateEndUser(id, { userName: input.userName });
    },

    deleteEndUser: async (_: unknown, { id }: { id: string }) => {
      return endUserRepository.deleteEndUser(id);
    },
  },
};

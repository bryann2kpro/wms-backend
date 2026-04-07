import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { authRepository, jwtController } from '@/composition-root';
import { logger } from '@/util/logger';

export let io: Server;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://210.187.49.109:8001',
      ],
      credentials: true,
    },
    path: '/socket.io',
  });

  // JWT auth middleware — runs before every connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const user = await authRepository.getUserDataByToken(token);
      if (!user) return next(new Error('Unauthorized'));
      const jwtPayload = jwtController.verifyToken(token) as any;
      socket.data.userId = user.id;
      socket.data.organizationId =
        jwtPayload?.organizationId ?? user.primaryOrganizationId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[Socket.IO] Connected: ${socket.id} (user: ${socket.data.userId as string})`);

    // Allow clients to join/leave job rooms (e.g. 'job:<uuid>')
    socket.on('join-room', (room: unknown) => {
      if (typeof room === 'string' && room.startsWith('job:')) {
        socket.join(room);
      }
    });

    socket.on('leave-room', (room: unknown) => {
      if (typeof room === 'string') socket.leave(room);
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket.IO] Disconnected: ${socket.id}`);
    });
  });

  logger.info('[Socket.IO] Server initialized');
  return io;
}

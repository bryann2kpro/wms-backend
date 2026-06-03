import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { authRepository, jwtController, whatsAppClient } from '@/composition-root';
import { logger } from '@/util/logger';

export let io: Server;
const WHATSAPP_SETTINGS_MODULE = 'whatsapp settings';

function normalizeModuleName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

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

      const userRolePermissions = await authRepository.getUserRoleWithPermission(user.id);
      const hasWhatsAppAccess = userRolePermissions.some((permission) => {
        const moduleName = normalizeModuleName(permission.moduleName ?? '');
        const permissionType = (permission.permissionType ?? '').toLowerCase();
        return moduleName === WHATSAPP_SETTINGS_MODULE
          && (permissionType === 'read' || permissionType === 'create');
      });
      socket.data.hasWhatsAppAccess = hasWhatsAppAccess;
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
        return;
      }

      if (room === 'whatsapp-admin') {
        if (!socket.data.hasWhatsAppAccess) {
          logger.warn(`[Socket.IO] Unauthorized whatsapp-admin join attempt by user ${socket.data.userId as string}`);
          return;
        }
        socket.join(room);
      }
    });

    socket.on('leave-room', (room: unknown) => {
      if (typeof room === 'string') socket.leave(room);
    });

    socket.on('whatsapp:request-sync', () => {
      if (!socket.data.hasWhatsAppAccess) return;
      socket.emit('whatsapp:status', whatsAppClient.getStatus());
      const qr = whatsAppClient.getStatus().lastQr;
      if (qr) {
        socket.emit('whatsapp:qr', { qr });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket.IO] Disconnected: ${socket.id}`);
    });
  });

  logger.info('[Socket.IO] Server initialized');
  return io;
}

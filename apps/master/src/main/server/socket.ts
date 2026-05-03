import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { sessionRepo } from './repositories/session.repo';

let io: IOServer | null = null;
const userSockets = new Map<string, Set<string>>();

function trackSocket(userId: string, socketId: string) {
  const socketIds = userSockets.get(userId) ?? new Set<string>();
  socketIds.add(socketId);
  userSockets.set(userId, socketIds);
}

function untrackSocket(userId: string, socketId: string) {
  const socketIds = userSockets.get(userId);
  if (!socketIds) {
    return;
  }

  socketIds.delete(socketId);
  if (socketIds.size === 0) {
    userSockets.delete(userId);
  }
}

export function attachSocket(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? '') as string;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const session = await sessionRepo.findActiveByToken(token);
      if (!session) return next(new Error('UNAUTHORIZED'));
      (socket.data as any).user = session.user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as any).user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    trackSocket(user.id, socket.id);
    if (user.role === 'OWNER' || user.role === 'ADMIN') socket.join('admin');
    if (user.role === 'KITCHEN') socket.join('kitchen');
    if (user.role === 'WAITER') socket.join(`waiter:${user.id}`);
    socket.on('disconnect', () => {
      untrackSocket(user.id, socket.id);
    });
  });

  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function kickUser(
  userId: string,
  payload: { code?: string; message?: string } = {
    code: 'SESSION_EXPIRED',
    message: 'Sessiya tugadi. Iltimos qaytadan kiring.',
  },
) {
  if (!io) {
    return;
  }

  const socketIds = userSockets.get(userId);
  if (!socketIds) {
    return;
  }

  for (const socketId of [...socketIds]) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      continue;
    }
    socket.emit('auth:kicked', payload);
    socket.disconnect(true);
  }

  userSockets.delete(userId);
}

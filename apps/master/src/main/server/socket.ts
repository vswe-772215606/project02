import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { sessionRepo } from './repositories/session.repo';

let io: IOServer | null = null;

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
    if (user.role === 'OWNER' || user.role === 'ADMIN') socket.join('admin');
    if (user.role === 'KITCHEN') socket.join('kitchen');
    if (user.role === 'WAITER') socket.join(`waiter:${user.id}`);
  });

  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

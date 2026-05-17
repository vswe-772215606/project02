import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketToken: string | null = null;
let socketUrl: string | null = null;

export function getSocketClient(): Socket | null {
  return socket;
}

export function hasSocketClientForToken(token: string, masterUrl: string): boolean {
  return socket !== null && socketToken === token && socketUrl === masterUrl;
}

export function connectSocketClient(token: string, masterUrl: string): Socket {
  if (socket && socketToken === token && socketUrl === masterUrl) {
    return socket;
  }

  disconnectSocketClient();

  socket = io(masterUrl, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  socketToken = token;
  socketUrl = masterUrl;

  return socket;
}

export function reconnectSocketClient(): void {
  if (socket && !socket.connected) {
    socket.connect();
  }
}

export function disconnectSocketClient(): void {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
  socketToken = null;
  socketUrl = null;
}

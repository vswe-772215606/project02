import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocketClient() {
  return socket;
}

export function hasSocketClientForToken(token: string) {
  return socket !== null && socketToken === token;
}

export function connectSocketClient(token: string) {
  if (socket && socketToken === token) {
    return socket;
  }

  disconnectSocketClient();

  socket = io('http://localhost:4000', {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  socketToken = token;

  return socket;
}

export function reconnectSocketClient() {
  if (socket && !socket.connected) {
    socket.connect();
  }
}

export function disconnectSocketClient() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
  socketToken = null;
}

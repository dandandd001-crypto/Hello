import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private reconnectCallback: ((socket: Socket) => void) | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io({
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      this.socket.on('reconnect', () => {
        if (this.socket && this.reconnectCallback) {
          this.reconnectCallback(this.socket);
        }
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  onReconnect(callback: (socket: Socket) => void) {
    this.reconnectCallback = callback;
  }
}

export const socketService = new SocketService();

import { Server as SocketIOServer } from 'socket.io';

export class WebSocketManager {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  initialize(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('subscribe:target', (targetId: string) => {
        socket.join(`target:${targetId}`);
        console.log(`Client ${socket.id} subscribed to target ${targetId}`);
      });

      socket.on('unsubscribe:target', (targetId: string) => {
        socket.leave(`target:${targetId}`);
        console.log(`Client ${socket.id} unsubscribed from target ${targetId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  broadcastToTarget(targetId: string, event: string, data: any): void {
    this.io.to(`target:${targetId}`).emit(event, data);
  }
}

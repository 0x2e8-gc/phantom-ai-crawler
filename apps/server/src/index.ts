import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { resolve } from 'path';

import { targetRoutes } from './routes/targets';
import { dnaRoutes } from './routes/dna';
import { greenLightRoutes } from './routes/green-light';
import { mcpRoutes } from './routes/mcp';
import { WebSocketManager } from './websocket/manager';
import { CrawlerEngine } from './crawler/engine';

// Load .env from project root
const envPath = resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });
console.log('[ENV] Loading from:', envPath);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:8081", "http://localhost:8082", "http://127.0.0.1:8082"],
    methods: ["GET", "POST"]
  }
});

export const prisma = new PrismaClient();
// Redis - optional, falls back to memory if not available
// Redis - optional, disabled for now
const memoryStore = new Map();
export const redis = {
  get: async (key: string) => memoryStore.get(key) || null,
  setex: async (key: string, seconds: number, value: string) => { memoryStore.set(key, value); },
  ping: async () => 'PONG',
  quit: async () => {}
} as any;
console.log('[Redis] Using memory fallback');

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:8082',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8081',
      'http://127.0.0.1:8082'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow all in dev mode
    }
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/targets', targetRoutes);
app.use('/api/dna', dnaRoutes);
app.use('/api/green-light', greenLightRoutes);
app.use('/api/mcp', mcpRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      mcp: {
        model: process.env.CLAUDE_MODEL || 'not configured',
        configured: !!process.env.ANTHROPIC_API_KEY
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

// WebSocket setup
const wsManager = new WebSocketManager(io);
wsManager.initialize();

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Phantom AI Server running on port ${PORT}`);
  console.log(`📊 WebSocket available for real-time updates`);
  console.log(`🧠 MCP Integration: Sonnet 4.5+ required`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  await redis.quit();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});







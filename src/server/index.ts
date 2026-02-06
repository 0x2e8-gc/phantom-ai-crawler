import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';

// Load env
dotenv.config({ path: resolve(process.cwd(), '.env') });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

export const prisma = new PrismaClient();

// In-memory store (no Redis required)
const memoryStore = new Map();
export const redis = {
  get: async (key: string) => memoryStore.get(key) || null,
  setex: async (key: string, seconds: number, value: string) => memoryStore.set(key, value),
  ping: async () => 'PONG',
  quit: async () => {}
};

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      mcp: {
        model: process.env.CLAUDE_MODEL || 'not configured',
        configured: !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY?.includes('your-api-key')
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

// Targets API
app.get('/api/targets', async (req, res) => {
  try {
    const targets = await prisma.target.findMany({
      include: {
        _count: { select: { learningEvents: true, requestLogs: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(targets);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/targets', async (req, res) => {
  try {
    const { url, type = 'web' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    
    const target = await prisma.target.create({
      data: {
        url,
        type,
        status: 'discovering',
        greenLightStatus: 'RED',
        trustScore: 0
      }
    });
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/targets/:id', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({
      where: { id: req.params.id },
      include: {
        dnaSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
        learningEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { requestLogs: true } }
      }
    });
    if (!target) return res.status(404).json({ error: 'Not found' });
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DNA API
app.get('/api/dna/:targetId/current', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({
      where: { id: req.params.targetId },
      include: { currentDna: true }
    });
    if (!target?.currentDna) return res.json(null);
    res.json(JSON.parse(target.currentDna.dnaJson));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// MCP API
app.post('/api/mcp/analyze/:targetId', async (req, res) => {
  // Placeholder - MCP analysis would go here
  res.json({
    analysis: 'MCP analysis endpoint ready',
    mock: !process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '4000');
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});




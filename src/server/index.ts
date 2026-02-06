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

// Create DNA snapshot
app.post('/api/targets/:id/dna', async (req, res) => {
  try {
    const { dnaJson, version = '1.0.0', parentId } = req.body;
    
    const snapshot = await prisma.dnaSnapshot.create({
      data: {
        targetId: req.params.id,
        dnaJson: typeof dnaJson === 'string' ? dnaJson : JSON.stringify(dnaJson),
        version,
        parentId,
        isActive: true
      }
    });
    
    // Update target to use this DNA
    await prisma.target.update({
      where: { id: req.params.id },
      data: { currentDnaId: snapshot.id }
    });
    
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Add learning event
app.post('/api/targets/:id/events', async (req, res) => {
  try {
    const { eventType, title, description, trustImpact = 0, challengeSolved } = req.body;
    
    // Get current DNA
    const target = await prisma.target.findUnique({
      where: { id: req.params.id },
      include: { currentDna: true }
    });
    
    const event = await prisma.learningEvent.create({
      data: {
        targetId: req.params.id,
        dnaVersionId: target?.currentDnaId || '00000000-0000-0000-0000-000000000000',
        eventType,
        title,
        description,
        trustImpact,
        challengeSolved,
        mcpModel: process.env.CLAUDE_MODEL || 'claude-4-5-sonnet'
      }
    });
    
    // Update target trust score
    await prisma.target.update({
      where: { id: req.params.id },
      data: {
        trustScore: { increment: trustImpact },
        lastSeen: new Date()
      }
    });
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update target status
app.patch('/api/targets/:id', async (req, res) => {
  try {
    const { status, greenLightStatus, trustScore } = req.body;
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (greenLightStatus) updateData.greenLightStatus = greenLightStatus;
    if (trustScore !== undefined) updateData.trustScore = trustScore;
    
    const target = await prisma.target.update({
      where: { id: req.params.id },
      data: updateData
    });
    
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// MCP Analysis endpoint
app.post('/api/mcp/analyze/:targetId', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({
      where: { id: req.params.targetId }
    });
    
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }
    
    // Simulate MCP analysis
    const analysis = {
      target: target.url,
      cdn: 'Azion',
      securityLevel: 'medium',
      recommendations: [
        'Use Brazilian Portuguese locale',
        'Add realistic referrer headers',
        'Implement request delays of 1-3 seconds'
      ],
      suggestedDNA: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timing: {
          delayMin: 1000,
          delayMax: 3000
        }
      },
      mock: !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY?.includes('test'),
      model: process.env.CLAUDE_MODEL
    };
    
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
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





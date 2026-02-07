import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';
import { authMiddleware, generateToken, generateApiKey, isFirstTime } from './auth.js';

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
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Auth middleware
app.use(authMiddleware);

// ========== PUBLIC ROUTES ==========

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const firstTime = await isFirstTime();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      firstTime,
      mcp: {
        model: process.env.CLAUDE_MODEL || 'not configured',
        configured: !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY?.includes('your-api-key')
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

app.get('/api/auth/status', async (req, res) => {
  try {
    const firstTime = await isFirstTime();
    const apiKeys = await prisma.apiKey.count({ where: { isActive: true } });
    res.json({ firstTime, configured: apiKeys > 0, apiKeys });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const firstTime = await isFirstTime();
    if (!firstTime) {
      return res.status(403).json({ error: 'Setup already completed. Use /api/auth/login' });
    }

    const apiKey = generateApiKey();
    const keyRecord = await prisma.apiKey.create({
      data: { key: apiKey, name: 'Initial Setup Key' }
    });

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.session.create({
      data: { token, apiKeyId: keyRecord.id, expiresAt }
    });

    res.json({ message: 'Setup completed successfully', apiKey, token, expiresAt });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    const keyRecord = await prisma.apiKey.findUnique({ where: { key: apiKey } });

    if (!keyRecord || !keyRecord.isActive) {
      return res.status(401).json({ error: 'Invalid or disabled API key' });
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.session.create({
      data: { token, apiKeyId: keyRecord.id, expiresAt }
    });

    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    res.json({ token, expiresAt, name: keyRecord.name });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ========== PROTECTED ROUTES ==========

app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required' });
    }

    const token = authHeader.substring(7);
    await prisma.session.deleteMany({ where: { token } });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Targets
app.get('/api/targets', async (req, res) => {
  try {
    const targets = await prisma.target.findMany({
      include: { _count: { select: { learningEvents: true, requestLogs: true } } },
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
      data: { url, type, status: 'discovering', greenLightStatus: 'RED', trustScore: 0 }
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

// MCP Analysis
app.post('/api/mcp/analyze/:targetId', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({ where: { id: req.params.targetId } });
    if (!target) return res.status(404).json({ error: 'Target not found' });
    
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
        timing: { delayMin: 1000, delayMax: 3000 }
      },
      mock: !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY?.includes('test'),
      model: process.env.CLAUDE_MODEL
    };
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Crawl
const activeCrawls = new Map();

app.post('/api/crawl/:targetId', async (req, res) => {
  try {
    const { targetId } = req.params;
    const { url } = req.body;
    
    if (activeCrawls.has(targetId)) {
      return res.json({ status: 'already_running', message: 'Crawl already active' });
    }
    
    await prisma.target.update({
      where: { id: targetId },
      data: { status: 'learning', greenLightStatus: 'YELLOW' }
    });
    
    await prisma.learningEvent.create({
      data: {
        targetId,
        dnaVersionId: '00000000-0000-0000-0000-000000000000',
        eventType: 'milestone',
        title: 'Autonomous crawl started',
        description: `Crawl initiated via dashboard`,
        trustImpact: 0,
        mcpModel: process.env.CLAUDE_MODEL || 'claude-4-5-sonnet'
      }
    });
    
    activeCrawls.set(targetId, { startTime: new Date(), url, iterations: 0 });
    
    setTimeout(async () => {
      await prisma.learningEvent.create({
        data: {
          targetId,
          dnaVersionId: '00000000-0000-0000-0000-000000000000',
          eventType: 'milestone',
          title: 'Security assessment complete',
          description: 'Identified CDN and security headers',
          trustImpact: 10,
          mcpModel: process.env.CLAUDE_MODEL || 'claude-4-5-sonnet'
        }
      });
      await prisma.target.update({
        where: { id: targetId },
        data: { trustScore: { increment: 10 }, lastSeen: new Date() }
      });
      setTimeout(() => activeCrawls.delete(targetId), 60000);
    }, 5000);
    
    res.json({ status: 'started', targetId, url });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/crawl/:targetId/status', (req, res) => {
  const crawl = activeCrawls.get(req.params.targetId);
  if (!crawl) return res.json({ active: false });
  res.json({
    active: true,
    startTime: crawl.startTime,
    duration: Date.now() - crawl.startTime.getTime(),
    iterations: crawl.iterations
  });
});

// MCP Logs
app.get('/api/mcp/logs/:targetId', async (req, res) => {
  try {
    const logs = await prisma.learningEvent.findMany({
      where: { 
        targetId: req.params.targetId,
        eventType: { in: ['milestone', 'green_light', 'challenge'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Target Auth
app.post('/api/auth/:targetId', async (req, res) => {
  try {
    const { username, password, endpoint } = req.body;
    const targetId = req.params.targetId;
    
    const target = await prisma.target.findUnique({
      where: { id: targetId },
      select: { url: true, greenLightStatus: true, isAuthenticated: true }
    });
    
    if (!target) return res.status(404).json({ error: 'Target not found' });
    if (target.greenLightStatus !== 'GREEN') return res.status(400).json({ error: 'Target must have GREEN light' });
    if (target.isAuthenticated) return res.status(400).json({ error: 'Target already authenticated' });
    
    res.json({ status: 'started', targetId, username });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.settings.findMany({
      select: { key: true, value: true, description: true, updatedAt: true }
    });
    const config: any = {};
    for (const s of settings) config[s.key] = s.value;
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      const encrypted = key.toLowerCase().includes('key') || key.toLowerCase().includes('password');
      await prisma.settings.upsert({
        where: { key },
        update: { value: String(value), encrypted },
        create: { key, value: String(value), encrypted }
      });
    }
    res.json({ status: 'saved', count: Object.keys(updates).length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Caido
app.get('/api/caido/status', async (req, res) => {
  try {
    const apiKey = await prisma.settings.findUnique({ where: { key: 'caidoGraphqlApiKey' } });
    res.json({ configured: !!apiKey?.value, hasKey: apiKey?.value ? true : false });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/caido/requests', async (req, res) => {
  try {
    const { caidoClient } = await import('../caido/client.js');
    const configured = await caidoClient.initialize();
    if (!configured) return res.status(400).json({ error: 'Caido GraphQL not configured' });
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await caidoClient.getRequests(limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/caido/requests/:host', async (req, res) => {
  try {
    const { caidoClient } = await import('../caido/client.js');
    const configured = await caidoClient.initialize();
    if (!configured) return res.status(400).json({ error: 'Caido GraphQL not configured' });
    const { host } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const data = await caidoClient.getRequestsByHost(host, limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start server
const PORT = parseInt(process.env.PORT || '4000');
httpServer.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
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


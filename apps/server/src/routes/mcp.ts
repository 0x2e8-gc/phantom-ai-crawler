import { Router } from 'express';
import { MCPBridge } from '../mcp/bridge';
import { prisma } from '../index';

const router = Router();
const mcp = new MCPBridge();

// Analyze target with MCP
router.post('/analyze', async (req, res) => {
  try {
    const { targetId } = req.body;
    
    const target = await prisma.target.findUnique({
      where: { id: targetId }
    });
    
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }
    
    const currentDNA = await prisma.dnaSnapshot.findFirst({
      where: { targetId, isActive: true }
    });
    
    const recentRequests = await prisma.requestLog.findMany({
      where: { targetId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    const learningEvents = await prisma.learningEvent.findMany({
      where: { targetId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    const challenges = await prisma.learningEvent.findMany({
      where: { 
        targetId,
        eventType: 'challenge'
      },
      orderBy: { createdAt: 'desc' },
      take: 1
    });
    
    const context = {
      target: {
        id: target.id,
        url: target.url,
        greenLightStatus: target.greenLightStatus,
        trustScore: target.trustScore
      },
      currentDNA: currentDNA?.dnaJson,
      observations: recentRequests.map(r => ({
        type: r.wasBlocked ? 'blocked' : r.challengeDetected ? 'challenge' : 'success',
        summary: `${r.method} ${r.url} → ${r.responseStatus}`,
        timestamp: r.createdAt
      })),
      learningEvents: learningEvents.map(e => ({
        type: e.eventType,
        outcome: e.title
      })),
      currentChallenge: challenges.length > 0 ? {
        type: challenges[0].challengeType,
        difficulty: 'medium',
        attempts: challenges.length
      } : undefined
    };
    
    const analysis = await mcp.analyze(context);
    
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Validate MCP connection
router.get('/health', async (req, res) => {
  try {
    const isValid = await mcp.validateModelVersion();
    res.json({ 
      status: isValid ? 'healthy' : 'unhealthy',
      model: 'claude-4-5-sonnet-2026x',
      minVersion: '4.5.0'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: String(error)
    });
  }
});

export { router as mcpRoutes };

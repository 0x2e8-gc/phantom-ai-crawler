import { Router } from 'express';
import { prisma } from '../index';
import { GreenLightCalculator } from '../green-light/calculator';

const router = Router();
const calculator = new GreenLightCalculator();

// Get current Green Light status
router.get('/:targetId/status', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({
      where: { id: req.params.targetId }
    });
    
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }
    
    const recentRequests = await prisma.requestLog.findMany({
      where: { targetId: req.params.targetId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    
    const currentDNA = await prisma.dnaSnapshot.findFirst({
      where: { targetId: req.params.targetId, isActive: true }
    });
    
    const state = await calculator.calculate(
      req.params.targetId,
      currentDNA?.dnaJson,
      recentRequests
    );
    
    const recommendation = await calculator.getNavigationRecommendation(
      req.params.targetId,
      state
    );
    
    res.json({ state, recommendation });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get Green Light history
router.get('/:targetId/history', async (req, res) => {
  try {
    const history = await prisma.greenLightState.findMany({
      where: { targetId: req.params.targetId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export { router as greenLightRoutes };

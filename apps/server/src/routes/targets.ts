import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// List all targets
router.get('/', async (req, res) => {
  try {
    const targets = await prisma.target.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            learningEvents: true,
            requestLogs: true
          }
        }
      }
    });
    res.json(targets);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get single target
router.get('/:id', async (req, res) => {
  try {
    const target = await prisma.target.findUnique({
      where: { id: req.params.id },
      include: {
        currentDna: true,
        _count: {
          select: {
            learningEvents: true,
            dnaSnapshots: true,
            requestLogs: true
          }
        }
      }
    });
    
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }
    
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create target
router.post('/', async (req, res) => {
  try {
    const { url, type = 'web' } = req.body;
    
    const target = await prisma.target.create({
      data: {
        url,
        type,
        status: 'discovering'
      }
    });
    
    res.status(201).json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update target
router.patch('/:id', async (req, res) => {
  try {
    const target = await prisma.target.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Delete target
router.delete('/:id', async (req, res) => {
  try {
    await prisma.target.delete({
      where: { id: req.params.id }
    });
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get target statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const [events, requests, greenLightHistory] = await Promise.all([
      prisma.learningEvent.findMany({
        where: { targetId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      prisma.requestLog.findMany({
        where: { targetId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.greenLightState.findMany({
        where: { targetId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);
    
    res.json({ events, requests, greenLightHistory });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export { router as targetRoutes };

import { Router } from 'express';
import { prisma } from '../index';
import { DNAMutator } from '../dna/mutator';

const router = Router();
const dnaMutator = new DNAMutator();

// Get current DNA for target
router.get('/:targetId/current', async (req, res) => {
  try {
    const snapshot = await prisma.dnaSnapshot.findFirst({
      where: { 
        targetId: req.params.targetId,
        isActive: true 
      }
    });
    
    if (!snapshot) {
      return res.status(404).json({ error: 'No active DNA found' });
    }
    
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get DNA lineage
router.get('/:targetId/lineage', async (req, res) => {
  try {
    const lineage = await dnaMutator.getDNALineage(req.params.targetId);
    res.json(lineage);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all DNA snapshots for target
router.get('/:targetId/snapshots', async (req, res) => {
  try {
    const snapshots = await prisma.dnaSnapshot.findMany({
      where: { targetId: req.params.targetId },
      orderBy: { createdAt: 'asc' },
      include: {
        events: {
          select: {
            id: true,
            eventType: true,
            title: true,
            createdAt: true
          }
        }
      }
    });
    
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get specific DNA snapshot
router.get('/snapshot/:id', async (req, res) => {
  try {
    const snapshot = await prisma.dnaSnapshot.findUnique({
      where: { id: req.params.id },
      include: {
        events: true,
        parent: true,
        children: true
      }
    });
    
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get browser profiles
router.get('/profiles/list', async (req, res) => {
  try {
    const profiles = dnaMutator.getBrowserProfiles();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export { router as dnaRoutes };

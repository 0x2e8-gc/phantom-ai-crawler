import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../index';

export interface BehavioralDNA {
  version: string;
  identity: {
    userAgent: string;
    viewport: string;
    timezone: string;
    language: string;
    platform: string;
    colorDepth: number;
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  timing: {
    readSpeed: string; // '200-400wpm'
    clickPattern: string; // 'human_like'
    scrollBehavior: string; // 'smooth_with_pauses'
    typingSpeed: string; // '40-80wpm'
    delayRange: [number, number]; // [min, max] in ms
  };
  network: {
    headers: Record<string, string>;
    headerOrder: string[];
    tlsFingerprint: string;
    httpVersion: string;
    acceptEncoding: string;
    ja3Hash?: string;
  };
  interaction: {
    mouseMovement: string; // 'bezier_curves' | 'linear'
    scrollSpeed: string;
    clickPrecision: string;
    readingTime: string; // 'calculate_from_content'
    tabSwitching: boolean;
  };
  capabilities: {
    altchaSolver: boolean;
    captchaSolver: boolean;
    javascriptEnabled: boolean;
    cookiesEnabled: boolean;
    localStorage: boolean;
  };
  temporal: {
    sessionDuration: [number, number]; // min, max in minutes
    timeOfDay: string;
    dayOfWeek: string;
  };
}

export interface MutationResult {
  success: boolean;
  newDNA: BehavioralDNA;
  mutationId: string;
  changes: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}

export class DNAMutator {
  private readonly DEFAULT_DNA: BehavioralDNA = {
    version: '1.0.0',
    identity: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: '1920x1080',
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR,pt;q=0.9,en-US;q=0.8',
      platform: 'Win32',
      colorDepth: 24,
      deviceMemory: 8,
      hardwareConcurrency: 8
    },
    timing: {
      readSpeed: '200-400wpm',
      clickPattern: 'human_like',
      scrollBehavior: 'smooth_with_pauses',
      typingSpeed: '40-80wpm',
      delayRange: [1000, 3000]
    },
    network: {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      },
      headerOrder: [
        'Host',
        'Connection',
        'Upgrade-Insecure-Requests',
        'User-Agent',
        'Accept',
        'Sec-Fetch-Dest',
        'Sec-Fetch-Mode',
        'Sec-Fetch-Site',
        'Sec-Fetch-User',
        'Accept-Language',
        'Accept-Encoding'
      ],
      tlsFingerprint: 'chrome_120',
      httpVersion: '2.0',
      acceptEncoding: 'gzip, deflate, br'
    },
    interaction: {
      mouseMovement: 'bezier_curves',
      scrollSpeed: 'variable_with_acceleration',
      clickPrecision: 'human_like_variance',
      readingTime: 'calculate_from_content',
      tabSwitching: true
    },
    capabilities: {
      altchaSolver: false,
      captchaSolver: false,
      javascriptEnabled: true,
      cookiesEnabled: true,
      localStorage: true
    },
    temporal: {
      sessionDuration: [5, 30],
      timeOfDay: 'match_target_timezone',
      dayOfWeek: 'business_days_mostly'
    }
  };

  async createInitialDNA(targetId: string): Promise<MutationResult> {
    const dna = { ...this.DEFAULT_DNA };
    dna.version = '1.0.0';

    // Save to database
    const snapshot = await prisma.dnaSnapshot.create({
      data: {
        targetId,
        version: dna.version,
        dnaJson: dna,
        isActive: true
      }
    });

    await prisma.learningEvent.create({
      data: {
        targetId,
        dnaVersionId: snapshot.id,
        eventType: 'birth',
        title: 'Crawler Born',
        description: 'Initialized with default Chrome 120 profile',
        trustImpact: 0
      }
    });

    return {
      success: true,
      newDNA: dna,
      mutationId: snapshot.id,
      changes: {
        added: Object.keys(dna),
        removed: [],
        modified: []
      }
    };
  }

  async mutate(
    targetId: string,
    currentDNA: BehavioralDNA,
    mutation: {
      gene: string;
      change: any;
      reason: string;
      confidence: number;
      riskLevel: string;
    }
  ): Promise<MutationResult> {
    // Create new DNA version
    const newDNA = JSON.parse(JSON.stringify(currentDNA));
    const oldValues: any = {};
    const changes = {
      added: [] as string[],
      removed: [] as string[],
      modified: [] as string[]
    };

    // Apply mutation based on gene type
    switch (mutation.gene) {
      case 'identity':
        oldValues.identity = { ...newDNA.identity };
        Object.assign(newDNA.identity, mutation.change);
        changes.modified.push('identity');
        break;

      case 'timing':
        oldValues.timing = { ...newDNA.timing };
        Object.assign(newDNA.timing, mutation.change);
        changes.modified.push('timing');
        break;

      case 'network':
        oldValues.network = { ...newDNA.network };
        Object.assign(newDNA.network, mutation.change);
        changes.modified.push('network');
        break;

      case 'interaction':
        oldValues.interaction = { ...newDNA.interaction };
        Object.assign(newDNA.interaction, mutation.change);
        changes.modified.push('interaction');
        break;

      case 'capabilities':
        oldValues.capabilities = { ...newDNA.capabilities };
        Object.assign(newDNA.capabilities, mutation.change);
        changes.modified.push('capabilities');
        break;

      default:
        throw new Error(`Unknown gene type: ${mutation.gene}`);
    }

    // Increment version
    const versionParts = newDNA.version.split('.');
    versionParts[2] = String(parseInt(versionParts[2]) + 1);
    newDNA.version = versionParts.join('.');

    // Find parent DNA
    const parentSnapshot = await prisma.dnaSnapshot.findFirst({
      where: { targetId, isActive: true }
    });

    // Create new snapshot
    const newSnapshot = await prisma.dnaSnapshot.create({
      data: {
        targetId,
        version: newDNA.version,
        dnaJson: newDNA,
        parentId: parentSnapshot?.id,
        isActive: true
      }
    });

    // Deactivate old snapshot
    if (parentSnapshot) {
      await prisma.dnaSnapshot.update({
        where: { id: parentSnapshot.id },
        data: { isActive: false }
      });
    }

    // Create learning event
    await prisma.learningEvent.create({
      data: {
        targetId,
        dnaVersionId: newSnapshot.id,
        eventType: 'mutation',
        title: `DNA Mutation: ${mutation.gene}`,
        description: mutation.reason,
        mcpInsight: `Confidence: ${mutation.confidence}, Risk: ${mutation.riskLevel}`,
        mcpConfidence: mutation.confidence,
        dnaChanges: changes,
        beforeState: oldValues,
        afterState: mutation.change,
        trustImpact: mutation.riskLevel === 'high' ? -5 : mutation.riskLevel === 'medium' ? 0 : 5
      }
    });

    return {
      success: true,
      newDNA,
      mutationId: newSnapshot.id,
      changes
    };
  }

  async getDNALineage(targetId: string): Promise<any[]> {
    const snapshots = await prisma.dnaSnapshot.findMany({
      where: { targetId },
      orderBy: { createdAt: 'asc' },
      include: {
        events: true
      }
    });

    return snapshots.map(snapshot => ({
      id: snapshot.id,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      isActive: snapshot.isActive,
      parentId: snapshot.parentId,
      events: snapshot.events.length
    }));
  }

  getBrowserProfiles(): Record<string, Partial<BehavioralDNA>> {
    return {
      chrome_desktop: {
        identity: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: '1920x1080',
          platform: 'Win32'
        },
        network: {
          tlsFingerprint: 'chrome_120',
          httpVersion: '2.0'
        }
      },
      firefox_desktop: {
        identity: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
          viewport: '1920x1080',
          platform: 'Win32'
        },
        network: {
          tlsFingerprint: 'firefox_120',
          httpVersion: '2.0'
        }
      },
      safari_macos: {
        identity: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          viewport: '1680x1050',
          platform: 'MacIntel'
        },
        network: {
          tlsFingerprint: 'safari_17',
          httpVersion: '2.0'
        }
      },
      chrome_mobile: {
        identity: {
          userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          viewport: '412x915',
          platform: 'Linux armv8l'
        },
        network: {
          tlsFingerprint: 'chrome_mobile_120',
          httpVersion: '2.0'
        }
      }
    };
  }
}

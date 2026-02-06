import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { prisma, redis } from '../index';
import { MCPBridge } from '../mcp/bridge';
import { DNAMutator, BehavioralDNA } from '../dna/mutator';
import { GreenLightCalculator } from '../green-light/calculator';
import { WebSocketManager } from '../websocket/manager';

export interface CrawlRequest {
  targetId: string;
  url: string;
  mode: 'explore' | 'observe' | 'achieve';
  goal?: string;
  maxDepth?: number;
  duration?: number; // seconds
}

export interface CrawlSession {
  id: string;
  targetId: string;
  status: 'starting' | 'running' | 'paused' | 'completed' | 'failed';
  currentUrl?: string;
  startTime: Date;
  requestsCount: number;
  discoveries: any[];
}

export class CrawlerEngine {
  private browser?: Browser;
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private sessions: Map<string, CrawlSession> = new Map();
  private mcp: MCPBridge;
  private dnaMutator: DNAMutator;
  private greenLightCalc: GreenLightCalculator;
  private wsManager: WebSocketManager;

  constructor(wsManager: WebSocketManager) {
    this.mcp = new MCPBridge();
    this.dnaMutator = new DNAMutator();
    this.greenLightCalc = new GreenLightCalculator();
    this.wsManager = wsManager;
  }

  async initialize(): Promise<void> {
    // Connect to Playwright server or launch local
    const wsEndpoint = process.env.PLAYWRIGHT_SERVER;
    
    if (wsEndpoint) {
      this.browser = await chromium.connect(wsEndpoint);
    } else {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS === 'true',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }

    console.log('✅ Crawler Engine initialized');
  }

  async startCrawl(request: CrawlRequest): Promise<CrawlSession> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: CrawlSession = {
      id: sessionId,
      targetId: request.targetId,
      status: 'starting',
      startTime: new Date(),
      requestsCount: 0,
      discoveries: []
    };

    this.sessions.set(sessionId, session);

    // Get or create target
    let target = await prisma.target.findUnique({
      where: { id: request.targetId }
    });

    if (!target) {
      target = await prisma.target.create({
        data: {
          id: request.targetId,
          url: request.url,
          status: 'discovering'
        }
      });
    }

    // Get or create DNA
    let currentDNA = await this.getCurrentDNA(request.targetId);
    if (!currentDNA) {
      const result = await this.dnaMutator.createInitialDNA(request.targetId);
      currentDNA = result.newDNA;
    }

    // Create browser context with DNA
    const context = await this.createContext(currentDNA);
    this.contexts.set(sessionId, context);

    const page = await context.newPage();
    this.pages.set(sessionId, page);

    // Setup event listeners
    await this.setupPageListeners(page, sessionId, request.targetId);

    // Start crawling
    session.status = 'running';
    this.wsManager.broadcast('crawl:started', { sessionId, targetId: request.targetId });

    // Run crawl loop
    this.runCrawlLoop(sessionId, request, currentDNA).catch(error => {
      console.error('Crawl loop error:', error);
      session.status = 'failed';
      this.wsManager.broadcast('crawl:error', { sessionId, error: String(error) });
    });

    return session;
  }

  private async runCrawlLoop(
    sessionId: string, 
    request: CrawlRequest,
    dna: BehavioralDNA
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const page = this.pages.get(sessionId);
    if (!page) return;

    const maxDuration = (request.duration || 300) * 1000; // Default 5 minutes
    const startTime = Date.now();
    let currentDepth = 0;

    try {
      // Initial navigation
      console.log(`🚀 Navigating to ${request.url}`);
      await page.goto(request.url, { waitUntil: 'networkidle' });

      // Apply human-like behavior
      await this.applyHumanBehavior(page, dna);

      // Main crawl loop
      while (session.status === 'running' && Date.now() - startTime < maxDuration) {
        // Check Green Light status
        const recentRequests = await prisma.requestLog.findMany({
          where: { targetId: request.targetId },
          orderBy: { createdAt: 'desc' },
          take: 20
        });

        const greenLightState = await this.greenLightCalc.calculate(
          request.targetId,
          dna,
          recentRequests
        );

        // Update target status
        await prisma.target.update({
          where: { id: request.targetId },
          data: {
            greenLightStatus: greenLightState.status,
            trustScore: greenLightState.trustScore
          }
        });

        // Broadcast update
        this.wsManager.broadcast('greenlight:update', {
          targetId: request.targetId,
          state: greenLightState
        });

        // Get navigation recommendation
        const navRec = await this.greenLightCalc.getNavigationRecommendation(
          request.targetId,
          greenLightState
        );

        if (!navRec.canNavigate) {
          console.log(`🛑 Navigation blocked for ${request.targetId}. Analyzing...`);
          
          // Consult MCP
          const mcpContext = await this.buildMCPContext(request.targetId, dna, recentRequests);
          const mcpResponse = await this.mcp.analyze(mcpContext);

          // Handle mutations if suggested
          if (mcpResponse.mutations && mcpResponse.mutations.length > 0) {
            for (const mutation of mcpResponse.mutations) {
              const result = await this.dnaMutator.mutate(
                request.targetId,
                dna,
                mutation
              );
              dna = result.newDNA;

              this.wsManager.broadcast('dna:mutated', {
                targetId: request.targetId,
                mutation: result
              });
            }
          }

          // Wait before retry
          await this.delay(dna.timing.delayRange[1] * 2);
          continue;
        }

        // Continue exploration
        await this.explorePage(page, sessionId, request.targetId, dna);

        session.requestsCount++;
        currentDepth++;

        // Check if goal achieved
        if (request.mode === 'achieve' && request.goal) {
          const goalAchieved = await this.checkGoalAchievement(page, request.goal);
          if (goalAchieved) {
            console.log(`🎯 Goal achieved: ${request.goal}`);
            await prisma.learningEvent.create({
              data: {
                targetId: request.targetId,
                dnaVersionId: (await this.getCurrentDNAId(request.targetId))!,
                eventType: 'milestone',
                title: 'Goal Achieved',
                description: `Successfully achieved goal: ${request.goal}`,
                trustImpact: 20
              }
            });
            break;
          }
        }

        // Delay between actions
        const delay = this.randomDelay(dna.timing.delayRange);
        await this.delay(delay);
      }

      session.status = 'completed';
      this.wsManager.broadcast('crawl:completed', { sessionId });

    } catch (error) {
      console.error('Crawl error:', error);
      session.status = 'failed';
      this.wsManager.broadcast('crawl:error', { sessionId, error: String(error) });
    } finally {
      await this.cleanup(sessionId);
    }
  }

  private async createContext(dna: BehavioralDNA): Promise<BrowserContext> {
    if (!this.browser) throw new Error('Browser not initialized');

    const [width, height] = dna.identity.viewport.split('x').map(Number);

    return this.browser.newContext({
      viewport: { width, height },
      userAgent: dna.identity.userAgent,
      locale: dna.identity.language.split(',')[0],
      timezoneId: dna.identity.timezone,
      colorScheme: 'light',
      extraHTTPHeaders: dna.network.headers,
      proxy: process.env.GOST_PROXY ? {
        server: process.env.GOST_PROXY
      } : undefined
    });
  }

  private async setupPageListeners(page: Page, sessionId: string, targetId: string): Promise<void> {
    page.on('request', async (request) => {
      // Log request
      await prisma.requestLog.create({
        data: {
          targetId,
          method: request.method(),
          url: request.url(),
          headers: request.headers() as any
        }
      });
    });

    page.on('response', async (response) => {
      const request = response.request();
      const status = response.status();
      const wasBlocked = status === 403 || status === 429;

      // Update request log
      const lastRequest = await prisma.requestLog.findFirst({
        where: { targetId, url: request.url() },
        orderBy: { createdAt: 'desc' }
      });

      if (lastRequest) {
        await prisma.requestLog.update({
          where: { id: lastRequest.id },
          data: {
            responseStatus: status,
            responseHeaders: response.headers() as any,
            wasBlocked,
            blockReason: wasBlocked ? this.detectBlockReason(response) : null
          }
        });
      }

      // Detect challenges
      if (await this.detectChallenge(response)) {
        await prisma.learningEvent.create({
          data: {
            targetId,
            dnaVersionId: (await this.getCurrentDNAId(targetId))!,
            eventType: 'challenge',
            title: 'Challenge Detected',
            description: `Challenge type detected on ${request.url()}`,
            challengeType: await this.identifyChallengeType(response)
          }
        });
      }
    });
  }

  private async applyHumanBehavior(page: Page, dna: BehavioralDNA): Promise<void> {
    // Random mouse movements
    if (dna.interaction.mouseMovement === 'bezier_curves') {
      await this.humanLikeMouseMove(page);
    }

    // Random scroll
    if (dna.interaction.scrollBehavior === 'smooth_with_pauses') {
      await this.humanLikeScroll(page);
    }
  }

  private async humanLikeMouseMove(page: Page): Promise<void> {
    const width = page.viewportSize()?.width || 1920;
    const height = page.viewportSize()?.height || 1080;

    for (let i = 0; i < 3; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      await page.mouse.move(x, y, { steps: 10 });
      await this.delay(100 + Math.random() * 200);
    }
  }

  private async humanLikeScroll(page: Page): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 300 + Math.random() * 200);
      await this.delay(500 + Math.random() * 1000);
    }
  }

  private async explorePage(page: Page, sessionId: string, targetId: string, dna: BehavioralDNA): Promise<void> {
    // Find clickable elements
    const links = await page.$$('a[href]');
    const buttons = await page.$$('button');

    const actions = [...links.slice(0, 3), ...buttons.slice(0, 2)];
    
    if (actions.length > 0) {
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      // Move to element like human
      const box = await randomAction.boundingBox();
      if (box) {
        await page.mouse.move(
          box.x + box.width / 2 + (Math.random() * 10 - 5),
          box.y + box.height / 2 + (Math.random() * 10 - 5),
          { steps: 5 }
        );
        await this.delay(200 + Math.random() * 300);
        
        // Maybe click
        if (Math.random() > 0.5) {
          await randomAction.click();
          await this.delay(1000 + Math.random() * 2000);
        }
      }
    }
  }

  private async buildMCPContext(
    targetId: string, 
    dna: BehavioralDNA, 
    recentRequests: any[]
  ): Promise<any> {
    const target = await prisma.target.findUnique({ where: { id: targetId } });
    const events = await prisma.learningEvent.findMany({
      where: { targetId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const lastRequest = recentRequests[0];
    const challenges = recentRequests.filter(r => r.challengeDetected);

    return {
      target: {
        id: targetId,
        url: target?.url || '',
        greenLightStatus: target?.greenLightStatus || 'RED',
        trustScore: target?.trustScore || 0
      },
      currentDNA: dna,
      observations: recentRequests.map(r => ({
        type: r.wasBlocked ? 'blocked' : r.challengeDetected ? 'challenge' : 'success',
        summary: `${r.method} ${r.url} → ${r.responseStatus}`,
        timestamp: r.createdAt
      })),
      learningEvents: events.map(e => ({
        type: e.eventType,
        outcome: e.title
      })),
      currentChallenge: challenges.length > 0 ? {
        type: challenges[0].challengeType,
        difficulty: 'medium',
        attempts: challenges.length
      } : undefined,
      lastRequest: lastRequest ? {
        status: lastRequest.responseStatus,
        blocked: lastRequest.wasBlocked,
        timing: lastRequest.timingMs
      } : undefined
    };
  }

  private detectBlockReason(response: any): string | null {
    const status = response.status();
    if (status === 403) return 'forbidden';
    if (status === 429) return 'rate_limited';
    if (status === 503) return 'service_unavailable';
    return null;
  }

  private async detectChallenge(response: any): Promise<boolean> {
    const contentType = response.headers()['content-type'] || '';
    const body = await response.text().catch(() => '');
    
    return body.includes('altcha') || 
           body.includes('captcha') ||
           body.includes('challenge') ||
           contentType.includes('javascript') && body.includes('eval');
  }

  private async identifyChallengeType(response: any): Promise<string> {
    const body = await response.text().catch(() => '');
    
    if (body.includes('altcha')) return 'altcha';
    if (body.includes('recaptcha')) return 'recaptcha';
    if (body.includes('hcaptcha')) return 'hcaptcha';
    if (body.includes('cf-turnstile')) return 'cloudflare_turnstile';
    return 'unknown';
  }

  private async checkGoalAchievement(page: Page, goal: string): Promise<boolean> {
    const url = page.url();
    const content = await page.content();
    
    // Simple goal checking
    if (goal.includes('admin') && url.includes('wp-admin')) return true;
    if (goal.includes('login') && url.includes('login')) return true;
    if (content.toLowerCase().includes(goal.toLowerCase())) return true;
    
    return false;
  }

  private randomDelay(range: [number, number]): number {
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getCurrentDNA(targetId: string): Promise<BehavioralDNA | null> {
    const snapshot = await prisma.dnaSnapshot.findFirst({
      where: { targetId, isActive: true }
    });
    
    return snapshot?.dnaJson as BehavioralDNA || null;
  }

  private async getCurrentDNAId(targetId: string): Promise<string | null> {
    const snapshot = await prisma.dnaSnapshot.findFirst({
      where: { targetId, isActive: true }
    });
    
    return snapshot?.id || null;
  }

  private async cleanup(sessionId: string): Promise<void> {
    const page = this.pages.get(sessionId);
    const context = this.contexts.get(sessionId);

    if (page) {
      await page.close();
      this.pages.delete(sessionId);
    }

    if (context) {
      await context.close();
      this.contexts.delete(sessionId);
    }

    this.sessions.delete(sessionId);
  }

  async pauseCrawl(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'paused';
      this.wsManager.broadcast('crawl:paused', { sessionId });
    }
  }

  async resumeCrawl(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'paused') {
      session.status = 'running';
      this.wsManager.broadcast('crawl:resumed', { sessionId });
    }
  }

  async stopCrawl(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      await this.cleanup(sessionId);
      this.wsManager.broadcast('crawl:stopped', { sessionId });
    }
  }
}

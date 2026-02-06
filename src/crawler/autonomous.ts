import https from 'https';
import http from 'http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { PrismaClient } from '@prisma/client';

// Allow self-signed certs for Caido proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const prisma = new PrismaClient();

// Proxy configuration (GOST SOCKS5 → Caido)
const PROXY_URL = 'socks5://127.0.0.1:1080';

interface CrawlConfig {
  targetId: string;
  url: string;
  maxIterations?: number;
  delayMs?: number;
}

interface CrawlResult {
  success: boolean;
  statusCode?: number;
  headers?: any;
  error?: string;
  hasChallenge?: boolean;
  responseTime: number;
}

class AutonomousCrawler {
  private targetId: string;
  private baseUrl: string;
  private maxIterations: number;
  private delayMs: number;
  private agent: SocksProxyAgent;
  private isRunning: boolean = false;
  private iteration: number = 0;
  private dna: any = {};

  constructor(config: CrawlConfig) {
    this.targetId = config.targetId;
    this.baseUrl = config.url;
    this.maxIterations = config.maxIterations || 100;
    this.delayMs = config.delayMs || 2000;
    this.agent = new SocksProxyAgent(PROXY_URL);
    
    // Initial DNA
    this.dna = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'max-age=0'
      },
      timing: { min: 1000, max: 3000 }
    };
  }

  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    console.log(`[${timestamp}] ${icons[type]} ${message}`);
  }

  private async makeRequest(path: string = '/', customHeaders?: any): Promise<CrawlResult> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const url = new URL(path, this.baseUrl);
      
      // Create agent that accepts self-signed certs
      const agent = new https.Agent({
        rejectUnauthorized: false
      });
      
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        agent: agent, // Use direct agent without SOCKS for now
        headers: {
          'User-Agent': this.dna.userAgent,
          ...this.dna.headers,
          ...customHeaders
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        const responseTime = Date.now() - startTime;
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const hasChallenge = 
            res.statusCode === 403 ||
            res.statusCode === 429 ||  // Rate limited
            data.toLowerCase().includes('challenge') ||
            data.toLowerCase().includes('captcha') ||
            data.toLowerCase().includes('shield') ||  // Generic shield detection
            data.toLowerCase().includes('bot detected');

          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode,
            headers: res.headers,
            hasChallenge,
            responseTime
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          responseTime: Date.now() - startTime
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Timeout',
          responseTime: Date.now() - startTime
        });
      });

      req.end();
    });
  }

  private async recordEvent(type: string, title: string, description: string, trustImpact: number) {
    try {
      // Get or create a DNA snapshot for this target
      let dnaId = '00000000-0000-0000-0000-000000000000';
      const existingDna = await prisma.dnaSnapshot.findFirst({
        where: { targetId: this.targetId },
        orderBy: { createdAt: 'desc' }
      });
      
      if (existingDna) {
        dnaId = existingDna.id;
      }
      
      await prisma.learningEvent.create({
        data: {
          targetId: this.targetId,
          dnaVersionId: dnaId,
          eventType: type,
          title,
          description,
          trustImpact,
          mcpModel: process.env.CLAUDE_MODEL || 'claude-4-5-sonnet'
        }
      });

      await prisma.target.update({
        where: { id: this.targetId },
        data: {
          trustScore: { increment: trustImpact },
          lastSeen: new Date()
        }
      });
    } catch (e) {
      this.log(`Failed to record event: ${e}`, 'error');
    }
  }

  private async updateStatus(status: string, greenLight: string) {
    try {
      await prisma.target.update({
        where: { id: this.targetId },
        data: { status, greenLightStatus: greenLight }
      });
    } catch (e) {
      this.log(`Failed to update status: ${e}`, 'error');
    }
  }

  private async getCurrentTrust(): Promise<number> {
    const target = await prisma.target.findUnique({
      where: { id: this.targetId },
      select: { trustScore: true, greenLightStatus: true }
    });
    return target?.trustScore || 0;
  }

  private randomDelay() {
    const min = this.dna.timing?.min || 1000;
    const max = this.dna.timing?.max || 3000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async start() {
    this.isRunning = true;
    this.log(`🎭 Starting autonomous crawl on ${this.baseUrl}`, 'info');
    this.log(`Using proxy: ${PROXY_URL} → Caido`, 'info');
    
    await this.updateStatus('learning', 'YELLOW');

    while (this.isRunning && this.iteration < this.maxIterations) {
      this.iteration++;
      
      const trust = await this.getCurrentTrust();
      this.log(`Iteration ${this.iteration} | Trust: ${trust}%`, 'info');

      // Check if we achieved GREEN
      if (trust >= 70) {
        this.log('🟢 GREEN LIGHT ACHIEVED!', 'success');
        await this.updateStatus('established', 'GREEN');
        await this.recordEvent('green_light', 'Green Light Established', 
          `Achieved ${trust}% trust score`, 0);
        break;
      }

      // Crawl homepage
      const result = await this.makeRequest('/');
      
      if (result.success) {
        this.log(`Homepage: ${result.statusCode} (${result.responseTime}ms)`, 'success');
        
        // Check for security headers
        const secHeaders = ['x-frame-options', 'content-security-policy', 'strict-transport-security'];
        const found = secHeaders.filter(h => result.headers?.[h]);
        if (found.length > 0) {
          this.log(`Security headers: ${found.join(', ')}`, 'info');
        }

        // Record success
        if (this.iteration === 1) {
          await this.recordEvent('milestone', 'First successful request', 
            `Status ${result.statusCode}, no challenge detected`, 10);
        }

        // Try different paths
        const paths = ['/blog', '/about', '/contact', '/rss', '/feed'];
        for (const path of paths) {
          await new Promise(r => setTimeout(r, this.randomDelay()));
          
          const pathResult = await this.makeRequest(path);
          if (pathResult.success) {
            this.log(`  ${path}: ${pathResult.statusCode}`, 'success');
            await this.recordEvent('discovery', `Discovered ${path}`, 
              `Successfully accessed ${path}`, 5);
          } else if (pathResult.statusCode === 404) {
            this.log(`  ${path}: 404 (not found)`, 'warning');
          } else {
            this.log(`  ${path}: ${pathResult.statusCode || pathResult.error}`, 'warning');
          }
        }

      } else if (result.hasChallenge) {
        this.log(`Challenge detected! Status: ${result.statusCode}`, 'warning');
        await this.recordEvent('challenge', 'Security challenge detected', 
          `Status ${result.statusCode} - adapting DNA`, -5);
        
        // Adapt DNA - increase delays
        this.dna.timing.min += 500;
        this.dna.timing.max += 1000;
        this.log(`Adapting: increased delays to ${this.dna.timing.min}-${this.dna.timing.max}ms`, 'info');
        
      } else {
        this.log(`Request failed: ${result.error || result.statusCode}`, 'error');
      }

      // Wait before next iteration
      const delay = this.randomDelay();
      this.log(`Waiting ${delay}ms...`, 'info');
      await new Promise(r => setTimeout(r, delay));
    }

    this.isRunning = false;
    this.log(`Crawl completed after ${this.iteration} iterations`, 'info');
  }

  stop() {
    this.isRunning = false;
    this.log('Stop signal received', 'warning');
  }
}

// CLI entry point
const targetId = process.argv[2];
const targetUrl = process.argv[3];

if (!targetId || !targetUrl) {
  console.error('Usage: tsx src/crawler/autonomous.ts <targetId> <targetUrl>');
  process.exit(1);
}

const crawler = new AutonomousCrawler({
  targetId,
  url: targetUrl,
  maxIterations: 50,
  delayMs: 2000
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  crawler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  crawler.stop();
  process.exit(0);
});

// Start
crawler.start().catch(console.error);





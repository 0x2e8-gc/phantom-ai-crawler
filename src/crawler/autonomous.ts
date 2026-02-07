import https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { PrismaClient } from '@prisma/client';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const prisma = new PrismaClient();
const PROXY_URL = 'socks5://127.0.0.1:1080';

interface CrawlConfig {
  targetId: string;
  url: string;
  maxIterations?: number;
  delayMs?: number;
  auth?: {
    username: string;
    password: string;
    endpoint?: string;
  };
}

interface CrawlResult {
  success: boolean;
  statusCode?: number;
  headers?: any;
  body?: string;
  error?: string;
  hasChallenge?: boolean;
  responseTime: number;
  cookies?: string[];
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
  private cookies: string[] = [];
  private authConfig?: CrawlConfig['auth'];

  constructor(config: CrawlConfig) {
    this.targetId = config.targetId;
    this.baseUrl = config.url;
    this.maxIterations = config.maxIterations || 100;
    this.delayMs = config.delayMs || 2000;
    this.authConfig = config.auth;
    this.agent = new SocksProxyAgent(PROXY_URL);
    
    this.dna = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/',
        'Connection': 'keep-alive'
      },
      timing: { min: 1000, max: 3000 }
    };
  }

  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const icons = { info: '[i]', success: '[+]', warning: '[!]', error: '[x]' };
    console.log('[' + timestamp + '] ' + icons[type] + ' ' + message);
  }

  private async makeRequest(path: string = '/', method: string = 'GET', postData?: string, customHeaders?: any): Promise<CrawlResult> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const url = new URL(path, this.baseUrl);
      
      const headers: any = {
        'Host': url.hostname,
        'User-Agent': this.dna.userAgent,
        'Cookie': this.cookies.join('; '),
        ...this.dna.headers,
        ...customHeaders
      };

      if (postData) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }
      
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        agent: this.agent,
        headers,
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        const responseTime = Date.now() - startTime;
        
        const setCookies = res.headers['set-cookie'];
        if (setCookies) {
          this.cookies = [...this.cookies, ...setCookies];
        }
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const hasChallenge = 
            res.statusCode === 403 ||
            res.statusCode === 429 ||
            data.toLowerCase().includes('challenge') ||
            data.toLowerCase().includes('captcha');

          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            hasChallenge,
            responseTime,
            cookies: setCookies
          });
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message, responseTime: Date.now() - startTime });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout', responseTime: Date.now() - startTime });
      });

      if (postData) req.write(postData);
      req.end();
    });
  }

  private async authenticate(): Promise<boolean> {
    if (!this.authConfig) return false;
    
    this.log('Attempting authentication...', 'info');
    
    let authEndpoint = this.authConfig.endpoint;
    if (!authEndpoint) {
      const commonPaths = ['/login', '/signin', '/auth'];
      for (const path of commonPaths) {
        const check = await this.makeRequest(path);
        if (check.success && check.body?.toLowerCase().includes('login')) {
          authEndpoint = path;
          this.log('Found login page: ' + path, 'success');
          break;
        }
      }
    }
    
    if (!authEndpoint) {
      this.log('Could not find login endpoint', 'error');
      return false;
    }
    
    const loginData = 'username=' + encodeURIComponent(this.authConfig.username) + '&password=' + encodeURIComponent(this.authConfig.password);
    const result = await this.makeRequest(authEndpoint, 'POST', loginData, { 'Referer': this.baseUrl + authEndpoint });
    
    if (result.success && !result.hasChallenge) {
      this.log('Authentication successful!', 'success');
      
      await prisma.target.update({
        where: { id: this.targetId },
        data: {
          isAuthenticated: true,
          authEndpoint,
          authUsername: this.authConfig.username,
          sessionCookies: JSON.stringify(this.cookies)
        }
      });
      
      await this.recordEvent('milestone', 'Authentication successful', 'Logged in as ' + this.authConfig.username, 15);
      
      return true;
    } else {
      this.log('Authentication failed: ' + (result.statusCode || result.error), 'error');
      return false;
    }
  }

  private async recordEvent(type: string, title: string, description: string, trustImpact: number) {
    try {
      const existingDna = await prisma.dnaSnapshot.findFirst({
        where: { targetId: this.targetId },
        orderBy: { createdAt: 'desc' }
      });
      
      await prisma.learningEvent.create({
        data: {
          targetId: this.targetId,
          dnaVersionId: existingDna?.id || '00000000-0000-0000-0000-000000000000',
          eventType: type,
          title,
          description,
          trustImpact,
          mcpModel: process.env.CLAUDE_MODEL || 'claude-4-5-sonnet'
        }
      });

      await prisma.target.update({
        where: { id: this.targetId },
        data: { trustScore: { increment: trustImpact }, lastSeen: new Date() }
      });
    } catch (e) {
      this.log('Failed to record event: ' + e, 'error');
    }
  }

  private async updateStatus(status: string, greenLight: string) {
    try {
      await prisma.target.update({
        where: { id: this.targetId },
        data: { status, greenLightStatus: greenLight }
      });
    } catch (e) {
      this.log('Failed to update status: ' + e, 'error');
    }
  }

  private async getCurrentTrust(): Promise<number> {
    const target = await prisma.target.findUnique({
      where: { id: this.targetId },
      select: { trustScore: true, isAuthenticated: true }
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
    this.log('Starting autonomous crawl on ' + this.baseUrl, 'info');
    this.log('Proxy chain: Crawler -> GOST (1080) -> Caido (8080) -> Target', 'info');
    
    await this.updateStatus('learning', 'YELLOW');

    while (this.isRunning && this.iteration < this.maxIterations) {
      this.iteration++;
      
      const trust = await this.getCurrentTrust();
      const target = await prisma.target.findUnique({
        where: { id: this.targetId },
        select: { isAuthenticated: true }
      });
      
      this.log('Iteration ' + this.iteration + ' | Trust: ' + trust + '% | Auth: ' + (target?.isAuthenticated ? 'YES' : 'NO'), 'info');

      if (trust >= 70) {
        this.log('GREEN LIGHT ACHIEVED!', 'success');
        await this.updateStatus('established', 'GREEN');
        await this.recordEvent('green_light', 'Green Light Established', 'Achieved ' + trust + '% trust score', 0);
        
        if (this.authConfig && !target?.isAuthenticated) {
          await this.authenticate();
        }
      }

      const result = await this.makeRequest('/');
      
      if (result.success) {
        this.log('Homepage: ' + result.statusCode + ' (' + result.responseTime + 'ms)', 'success');
        
        if (this.iteration === 1) {
          await this.recordEvent('milestone', 'First successful request', 'Status ' + result.statusCode + ', no challenge detected', 10);
        }

        const paths = ['/blog', '/about', '/contact'];
        for (const path of paths) {
          await new Promise(r => setTimeout(r, this.randomDelay()));
          const pathResult = await this.makeRequest(path);
          if (pathResult.success) {
            this.log('  ' + path + ': ' + pathResult.statusCode, 'success');
            await this.recordEvent('discovery', 'Discovered ' + path, 'Successfully accessed ' + path, 5);
          }
        }

      } else if (result.hasChallenge) {
        this.log('Challenge detected! Status: ' + result.statusCode, 'warning');
        await this.recordEvent('challenge', 'Security challenge detected', 'Status ' + result.statusCode + ' - adapting DNA', -5);
        this.dna.timing.min += 500;
        this.dna.timing.max += 1000;
        
      } else {
        this.log('Request failed: ' + (result.error || result.statusCode), 'error');
      }

      const delay = this.randomDelay();
      this.log('Waiting ' + delay + 'ms...', 'info');
      await new Promise(r => setTimeout(r, delay));
    }

    this.isRunning = false;
    this.log('Crawl completed after ' + this.iteration + ' iterations', 'info');
  }

  stop() {
    this.isRunning = false;
    this.log('Stop signal received', 'warning');
  }
}

const targetId = process.argv[2];
const targetUrl = process.argv[3];
const authUsername = process.argv[4];
const authPassword = process.argv[5];

if (!targetId || !targetUrl) {
  console.error('Usage: tsx src/crawler/autonomous.ts <targetId> <targetUrl> [username] [password]');
  process.exit(1);
}

const crawler = new AutonomousCrawler({
  targetId,
  url: targetUrl,
  maxIterations: 50,
  delayMs: 2000,
  auth: authUsername && authPassword ? {
    username: authUsername,
    password: authPassword
  } : undefined
});

process.on('SIGINT', () => { crawler.stop(); process.exit(0); });
process.on('SIGTERM', () => { crawler.stop(); process.exit(0); });

crawler.start().catch(console.error);

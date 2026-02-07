import { prisma } from '../server/index.js';

export interface AppConfig {
  // Caido
  caidoGraphqlApiKey: string;
  caidoProxyHost: string;
  caidoProxyPort: number;
  
  // MCP / Anthropic
  anthropicApiKey: string;
  claudeModel: string;
  
  // Proxy
  proxyEnabled: boolean;
  proxyType: 'socks5' | 'http';
  proxyHost: string;
  proxyPort: number;
  
  // Geral
  backendPort: number;
  uiPort: number;
  requestTimeout: number;
}

const DEFAULT_CONFIG: Partial<AppConfig> = {
  caidoProxyHost: '127.0.0.1',
  caidoProxyPort: 8080,
  claudeModel: 'claude-4-5-sonnet-20250929',
  proxyEnabled: true,
  proxyType: 'socks5',
  proxyHost: '127.0.0.1',
  proxyPort: 1080,
  backendPort: 4000,
  uiPort: 8081,
  requestTimeout: 15000,
};

export class ConfigManager {
  async get(key: keyof AppConfig): Promise<string | null> {
    const setting = await prisma.settings.findUnique({
      where: { key }
    });
    return setting?.value || null;
  }

  async set(key: keyof AppConfig, value: string, encrypted: boolean = false, description?: string): Promise<void> {
    await prisma.settings.upsert({
      where: { key },
      update: { 
        value,
        encrypted,
        description,
        updatedAt: new Date()
      },
      create: {
        key,
        value,
        encrypted,
        description
      }
    });
  }

  async getAll(): Promise<AppConfig> {
    const settings = await prisma.settings.findMany();
    const config = {} as AppConfig;
    
    for (const setting of settings) {
      (config as any)[setting.key] = setting.value;
    }
    
    // Merge with defaults
    return { ...DEFAULT_CONFIG, ...config } as AppConfig;
  }

  async setAll(config: Partial<AppConfig>): Promise<void> {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        const encrypted = key.toLowerCase().includes('key') || key.toLowerCase().includes('password');
        await this.set(key as keyof AppConfig, String(value), encrypted);
      }
    }
  }

  async delete(key: keyof AppConfig): Promise<void> {
    await prisma.settings.delete({
      where: { key }
    });
  }

  async initializeDefaults(): Promise<void> {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      const exists = await this.get(key as keyof AppConfig);
      if (!exists) {
        await this.set(key as keyof AppConfig, String(value));
      }
    }
  }
}

export const configManager = new ConfigManager();


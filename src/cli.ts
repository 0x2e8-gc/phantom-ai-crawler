#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const program = new Command();
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

// Detect if running from global install
const PACKAGE_DIR = join(__dirname, '..');
const isGlobalInstall = PACKAGE_DIR.includes('node_modules/@0x2e8/phantom-ai-crawler') || 
                        PACKAGE_DIR.includes('/usr/local/lib/node_modules');

// Use package dir for global installs, cwd for local
const DATA_DIR = isGlobalInstall ? PACKAGE_DIR : process.cwd();
const ENV_PATH = resolve(DATA_DIR, '.env');
const DB_PATH = resolve(DATA_DIR, 'phantom.db');
const DASHBOARD_DIR = join(PACKAGE_DIR, 'dashboard');

// Auto-setup for global installs
async function ensureSetup() {
  // Create .env if doesn't exist
  if (!existsSync(ENV_PATH)) {
    console.log(chalk.yellow('⚙️  First time setup...\n'));
    const envContent = `DATABASE_URL="file:${DB_PATH}"
ANTHROPIC_API_KEY=your-api-key-here
CLAUDE_MODEL=claude-4-5-sonnet-20250929
PORT=4000
UI_PORT=8081
`;
    writeFileSync(ENV_PATH, envContent);
    console.log(chalk.green('✅ Created .env file'));
  }
  
  // Initialize database if needed
  if (!existsSync(DB_PATH)) {
    console.log(chalk.blue('📦 Initializing database...'));
    try {
      process.chdir(PACKAGE_DIR);
      execSync('npx prisma migrate deploy', { stdio: 'pipe' });
      console.log(chalk.green('✅ Database initialized'));
    } catch (e) {
      console.log(chalk.yellow('⚠️  Database may already be initialized'));
    }
  }
}

// Banner
console.log(chalk.magenta(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  🎭 ${chalk.bold('PHANTOM AI')} - Adaptive Web Crawler v${pkg.version}          ║
║                                                          ║
║  AI-powered behavioral mutation engine                   ║
║  Requires: Claude Sonnet 4.5+                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`));

// Check if setup is needed
function needsSetup(): boolean {
  if (!existsSync(ENV_PATH)) return true;
  const env = readFileSync(ENV_PATH, 'utf8');
  return !env.includes('ANTHROPIC_API_KEY') || env.includes('your-api-key-here');
}

// Start backend
async function startBackend(port: string): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('Starting backend...'));
    
    const backend = spawn('node', [join(__dirname, 'server/index.js')], {
      cwd: DATA_DIR,
      env: { ...process.env, PORT: port },
      detached: false
    });

    backend.stdout?.on('data', (data) => {
      const line = data.toString();
      if (line.includes('running on port')) {
        console.log(chalk.green(`✅ Backend running on port ${port}`));
        resolve(backend);
      }
    });

    setTimeout(() => {
      reject(new Error('Timeout'));
    }, 30000);
  });
}

// Start frontend
async function startFrontend(port: string): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('Starting dashboard...'));
    
    const frontend = spawn('python3', ['-m', 'http.server', port], {
      cwd: DASHBOARD_DIR,
      detached: false
    });

    setTimeout(() => {
      console.log(chalk.green(`✅ Dashboard running on port ${port}`));
      resolve(frontend);
    }, 2000);

    setTimeout(() => {
      reject(new Error('Timeout'));
    }, 10000);
  });
}

// Main start command
program
  .command('start')
  .alias('s')
  .description('Start Phantom AI (backend + dashboard)')
  .option('-p, --port <port>', 'Backend port', '4000')
  .option('-u, --ui-port <port>', 'Dashboard port', '8081')
  .action(async (options) => {
    try {
      // Auto-setup for global installs
      await ensureSetup();

      // Read config
      const env = readFileSync(ENV_PATH, 'utf8');
      const apiPort = options.port || env.match(/PORT=(\d+)/)?.[1] || '4000';
      const uiPort = options.uiPort || env.match(/UI_PORT=(\d+)/)?.[1] || '8081';

      console.log(chalk.blue('\n🚀 Starting Phantom AI...\n'));

      // Start services
      const backend = await startBackend(apiPort);
      const frontend = await startFrontend(uiPort);

      // Print success
      console.log(chalk.green('\n✅ Phantom AI is running!\n'));
      console.log(chalk.white('┌────────────────────────────────────────┐'));
      console.log(chalk.white('│') + chalk.cyan('  🌐 Dashboard: ') + chalk.yellow(`http://localhost:${uiPort}    `) + chalk.white('│'));
      console.log(chalk.white('│') + chalk.cyan('  🔌 API:       ') + chalk.yellow(`http://localhost:${apiPort}    `) + chalk.white('│'));
      console.log(chalk.white('└────────────────────────────────────────┘'));
      console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

      // Handle shutdown
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n🛑 Shutting down...'));
        backend.kill();
        frontend.kill();
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Setup command
program
  .command('setup')
  .description('Run setup wizard')
  .action(async () => {
    await ensureSetup();
    console.log(chalk.green('\n✅ Setup complete! Run "phantom-ai start" to begin.'));
  });

// Status command
program
  .command('status')
  .description('Check Phantom AI status')
  .action(async () => {
    await ensureSetup();
    const env = readFileSync(ENV_PATH, 'utf8');
    const hasKey = !env.includes('your-api-key-here');
    
    console.log(chalk.blue('\n📊 Configuration Status:\n'));
    console.log(chalk.white('  API Key:    '), hasKey ? chalk.green('✓ Configured') : chalk.yellow('⚠️  Using default'));
    console.log(chalk.white('  Database:   '), existsSync(DB_PATH) ? chalk.green('✓ Initialized') : chalk.yellow('Will create on start'));
    console.log(chalk.white('  Install:    '), isGlobalInstall ? chalk.cyan('Global') : chalk.cyan('Local'));
  });

// Default action
if (process.argv.length === 2) {
  program.parse(['node', 'cli', 'start']);
} else {
  program.parse();
}


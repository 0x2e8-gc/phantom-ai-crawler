#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const program = new Command();
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const ENV_PATH = resolve(process.cwd(), '.env');
const DASHBOARD_DIR = join(__dirname, '../dashboard');

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

// Setup wizard
async function setupWizard() {
  console.log(chalk.yellow('⚙️  Initial Setup Required\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: chalk.cyan('🔑 Enter your Anthropic API Key:'),
      validate: (input: string) => {
        if (!input.startsWith('sk-ant-api')) {
          return 'Please enter a valid Anthropic API key (starts with sk-ant-api)';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'model',
      message: chalk.cyan('🧠 Select Claude Model:'),
      choices: [
        { name: 'Claude 4.5 Sonnet (Recommended)', value: 'claude-4-5-sonnet-20250929' },
        { name: 'Claude 4.5 Sonnet Latest', value: 'claude-4-5-sonnet-latest' },
        { name: 'Claude 4 Opus', value: 'claude-4-opus-20251001' }
      ],
      default: 'claude-4-5-sonnet-20250929'
    },
    {
      type: 'input',
      name: 'apiPort',
      message: chalk.cyan('🔌 Backend Port:'),
      default: '4000',
      validate: (input: string) => !isNaN(parseInt(input)) || 'Please enter a valid port number'
    },
    {
      type: 'input',
      name: 'uiPort',
      message: chalk.cyan('🌐 Dashboard Port:'),
      default: '8081',
      validate: (input: string) => !isNaN(parseInt(input)) || 'Please enter a valid port number'
    }
  ]);

  const envContent = `# Phantom AI Configuration
# Generated: ${new Date().toISOString()}

ANTHROPIC_API_KEY="${answers.apiKey}"
CLAUDE_MODEL="${answers.model}"
MCP_MAX_TOKENS=8192
MCP_TEMPERATURE=0.2

PORT=${answers.apiPort}
NODE_ENV=development

NEXT_PUBLIC_API_URL="http://localhost:${answers.apiPort}"
NEXT_PUBLIC_WS_URL="http://localhost:${answers.apiPort}"
UI_PORT=${answers.uiPort}

DATABASE_URL="file:${process.cwd()}/phantom.db"

JWT_SECRET="${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}"
`;

  writeFileSync(ENV_PATH, envContent);
  console.log(chalk.green('\n✅ Configuration saved to .env'));
  
  // Initialize database
  const spinner = ora('Initializing database...').start();
  try {
    execSync('npx prisma migrate deploy', { 
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    spinner.succeed('Database initialized');
  } catch (e) {
    spinner.warn('Database may already be initialized');
  }
  
  return answers;
}

// Start backend
async function startBackend(port: string): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    const spinner = ora('Starting backend...').start();
    
    const backend = spawn('node', [join(__dirname, 'server/index.js')], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: port },
      detached: false
    });

    backend.stdout?.on('data', (data) => {
      const line = data.toString();
      if (line.includes('running on port')) {
        spinner.succeed(chalk.green(`Backend running on port ${port}`));
        resolve(backend);
      }
    });

    backend.stderr?.on('data', (data) => {
      // Ignore common startup warnings
    });

    setTimeout(() => {
      spinner.fail('Backend failed to start');
      reject(new Error('Timeout'));
    }, 30000);
  });
}

// Start frontend with Python (simple and reliable)
async function startFrontend(port: string): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    const spinner = ora('Starting dashboard...').start();
    
    const frontend = spawn('python3', ['-m', 'http.server', port], {
      cwd: DASHBOARD_DIR,
      detached: false
    });

    // Give it a moment to start
    setTimeout(() => {
      spinner.succeed(chalk.green(`Dashboard running on port ${port}`));
      resolve(frontend);
    }, 2000);

    frontend.on('error', (err) => {
      spinner.fail(`Dashboard failed: ${err.message}`);
      reject(err);
    });

    setTimeout(() => {
      spinner.fail('Dashboard failed to start');
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
  .option('--setup', 'Force setup wizard')
  .action(async (options) => {
    try {
      // Setup if needed
      if (options.setup || needsSetup()) {
        await setupWizard();
      }

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
    await setupWizard();
    console.log(chalk.green('\n✅ Setup complete! Run "phantom-ai start" to begin.'));
  });

// Crawl command
program
  .command('crawl [targetId]')
  .description('Start autonomous crawl on a target')
  .option('-u, --url <url>', 'Target URL', 'https://example.com/')
  .option('-i, --iterations <n>', 'Max iterations', '50')
  .action(async (targetId, options) => {
    if (needsSetup()) {
      console.log(chalk.yellow('⚠️  Not configured. Run: phantom-ai setup'));
      return;
    }
    
    if (!targetId) {
      console.log(chalk.yellow('⚠️  Target ID required. Usage: phantom-ai crawl <targetId>'));
      return;
    }
    const id = targetId;
    console.log(chalk.blue(`\n🎭 Starting autonomous crawl on ${options.url}\n`));
    console.log(chalk.gray('Proxy chain: Crawler → GOST (1080) → Caido (8080) → Target\n'));
    
    // Spawn crawler process
    const crawlProcess = spawn('npx', ['tsx', 'src/crawler/autonomous.ts', id, options.url], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
    
    crawlProcess.on('close', (code) => {
      console.log(chalk.blue(`\nCrawl finished with code ${code}`));
    });
  });

// Status command
program
  .command('status')
  .description('Check Phantom AI status')
  .action(async () => {
    if (needsSetup()) {
      console.log(chalk.yellow('⚠️  Not configured. Run: phantom-ai setup'));
      return;
    }
    
    const env = readFileSync(ENV_PATH, 'utf8');
    const model = env.match(/CLAUDE_MODEL="([^"]+)"/)?.[1];
    const hasKey = !env.includes('your-api-key-here');
    
    console.log(chalk.blue('\n📊 Configuration Status:\n'));
    console.log(chalk.white('  API Key:    '), hasKey ? chalk.green('✓ Configured') : chalk.red('✗ Missing'));
    console.log(chalk.white('  Model:      '), chalk.cyan(model || 'Not set'));
    console.log(chalk.white('  Database:   '), existsSync('./phantom.db') ? chalk.green('✓ Initialized') : chalk.yellow('Will create on start'));
  });

// Default action
if (process.argv.length === 2) {
  program.parse(['node', 'cli', 'start']);
} else {
  program.parse();
}





#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageDir = __dirname.replace('/scripts', '').replace('\\scripts', '');
const envPath = path.join(packageDir, '.env');

console.log('🔧 Phantom AI - Post Install Setup');

// Criar .env se não existir
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file...');
  const dbPath = path.join(packageDir, 'phantom.db');
  const envContent = `DATABASE_URL="file:${dbPath}"
ANTHROPIC_API_KEY=your-api-key-here
CLAUDE_MODEL=claude-4-5-sonnet-20250929
PORT=4000
UI_PORT=8081
`;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file');
} else {
  console.log('✅ .env file already exists');
}

// Gerar Prisma Client
console.log('📦 Generating Prisma client...');
try {
  process.chdir(packageDir);
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated');
} catch (error) {
  console.log('⚠️  Prisma generate warning (can be ignored)');
}

console.log('\n✅ Phantom AI is ready!');
console.log('Run: phantom-ai start');


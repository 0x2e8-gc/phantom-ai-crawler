#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { resolve } = require('path');

console.log('🔧 Phantom AI - Post Install Setup\n');

try {
  // Generate Prisma client
  console.log('📦 Generating Prisma client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: resolve(__dirname, '..')
  });
  
  console.log('\n✅ Setup complete!');
  console.log('\nRun: phantom-ai setup  - to configure API key');
  console.log('Run: phantom-ai start  - to start the server\n');
} catch (e) {
  console.error('❌ Setup failed:', e.message);
  process.exit(1);
}


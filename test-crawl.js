#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Target ID
const TARGET_ID = 'd240d6a4-85e8-43b4-9ae9-96b4fc392fc9';
const TARGET_URL = 'https://blog.youcom.com.br/';

console.log('🎭 Phantom AI - Test Crawl\n');
console.log(`Target: ${TARGET_URL}\n`);

// Make request with different headers to test adaptation
function makeRequest(headers, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n📡 Testing: ${label}`);
    
    const options = {
      hostname: 'blog.youcom.com.br',
      port: 443,
      path: '/',
      method: 'GET',
      headers: headers,
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Headers: ${Object.keys(res.headers).join(', ')}`);
      
      // Check for security headers
      const securityHeaders = [
        'x-frame-options',
        'content-security-policy',
        'x-content-type-options',
        'strict-transport-security',
        'x-xss-protection'
      ];
      
      const foundSecurity = securityHeaders.filter(h => res.headers[h]);
      if (foundSecurity.length > 0) {
        console.log(`   🔒 Security headers: ${foundSecurity.join(', ')}`);
      }
      
      // Check for WAF/CDN
      const wafSignatures = ['cf-ray', 'x-cdn', 'server', 'x-protected-by'];
      wafSignatures.forEach(sig => {
        if (res.headers[sig]) {
          console.log(`   🛡️  ${sig}: ${res.headers[sig]}`);
        }
      });
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Check for challenges
        const hasChallenge = data.includes('challenge') || 
                            data.includes('captcha') || 
                            data.includes('shield') ||
                            res.statusCode === 403 ||
                            res.statusCode === 429;
        
        if (hasChallenge) {
          console.log('   ⚠️  Challenge detected!');
        }
        
        resolve({
          status: res.statusCode,
          headers: res.headers,
          hasChallenge,
          size: data.length
        });
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      console.log('   ⏱️  Timeout');
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

// Test different personas
async function runTests() {
  const results = [];
  
  // Test 1: Basic request
  results.push(await makeRequest({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }, 'Standard Browser'));
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: Mobile
  results.push(await makeRequest({
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  }, 'Mobile iPhone'));
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: With referer
  results.push(await makeRequest({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.google.com/',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  }, 'With Referer + Locale'));
  
  console.log('\n📊 Summary:');
  console.log(`Tests run: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.status === 200).length}`);
  console.log(`Challenges: ${results.filter(r => r.hasChallenge).length}`);
  
  // Send results to API
  console.log('\n💾 Sending to Phantom AI API...');
  
  const postData = JSON.stringify({
    targetId: TARGET_ID,
    eventType: 'crawl_test',
    title: 'Initial reconnaissance crawl',
    description: `Tested ${results.length} different request profiles`,
    mcpModel: 'claude-4-5-sonnet-20250929',
    trustImpact: results.some(r => r.status === 200) ? 10 : 0
  });
  
  const req = http.request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/targets/d240d6a4-85e8-43b4-9ae9-96b4fc392fc9',
    method: 'GET'
  }, (res) => {
    console.log(`API Status: ${res.statusCode}`);
    console.log('\n✅ Test complete! Check dashboard at http://localhost:8081');
  });
  
  req.on('error', () => {
    console.log('\n⚠️  Could not update API, but crawl completed');
  });
  
  req.end();
}

runTests().catch(console.error);


/**
 * ShipStation Integration Test Script
 * 
 * Tests the ShipStation REST API endpoint to diagnose connection issues.
 * 
 * Usage:
 *   node test-shipstation.js
 */

import https from 'https';

// Configuration
const BASE_URL = 'wolfwave.shop';
const CONSUMER_KEY = 'ck_7295514f70f1148a607387b2168f82f2c2c69f4343bfd0ba597d8a574f5bbb4d';
const CONSUMER_SECRET = 'cs_73c7dbda4b7fed5115992c7f5edd6f3a8673d51548';

// Test endpoints
const tests = [
  {
    name: 'ShipStation REST API - Orders Endpoint',
    path: '/wp-json/wc-shipstation/v1/orders?modified_after=2026-01-28T08:00:00.000Z&page=1&per_page=100',
    method: 'GET',
    auth: true
  },
  {
    name: 'WooCommerce REST API - Orders Endpoint',
    path: '/wp-json/wc/v3/orders?per_page=10',
    method: 'GET',
    auth: true
  },
  {
    name: 'ShipStation REST API - No Auth (should fail)',
    path: '/wp-json/wc-shipstation/v1/orders?modified_after=2026-01-28T08:00:00.000Z&page=1&per_page=100',
    method: 'GET',
    auth: false
  }
];

function makeRequest(test) {
  return new Promise((resolve, reject) => {
    const auth = test.auth 
      ? Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')
      : null;

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: test.path,
      method: test.method,
      headers: {
        'User-Agent': 'ShipStation-Test/1.0',
        'Accept': 'application/json'
      }
    };

    if (auth) {
      options.headers['Authorization'] = `Basic ${auth}`;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST: ${test.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`URL: https://${BASE_URL}${test.path}`);
    console.log(`Method: ${test.method}`);
    console.log(`Auth: ${test.auth ? 'Yes (Basic Auth)' : 'No'}`);
    console.log(`\nRequest Headers:`);
    console.log(JSON.stringify(options.headers, null, 2));

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`\nResponse Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`\nResponse Headers:`);
        console.log(JSON.stringify(res.headers, null, 2));
        
        console.log(`\nResponse Body:`);
        try {
          const json = JSON.parse(data);
          console.log(JSON.stringify(json, null, 2));
        } catch (e) {
          console.log(data);
        }

        const result = {
          test: test.name,
          status: res.statusCode,
          success: res.statusCode === (test.auth ? 200 : 401),
          headers: res.headers,
          body: data
        };

        if (result.success) {
          console.log(`\n✅ PASS: Got expected status code ${res.statusCode}`);
        } else {
          console.log(`\n❌ FAIL: Expected ${test.auth ? 200 : 401}, got ${res.statusCode}`);
        }

        resolve(result);
      });
    });

    req.on('error', (error) => {
      console.error(`\n❌ ERROR: ${error.message}`);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('ShipStation Integration Test Suite');
  console.log('===================================\n');
  console.log(`Testing against: https://${BASE_URL}`);
  console.log(`Consumer Key: ${CONSUMER_KEY.substring(0, 20)}...`);
  console.log(`Consumer Secret: ${CONSUMER_SECRET.substring(0, 20)}...`);

  const results = [];

  for (const test of tests) {
    try {
      const result = await makeRequest(test);
      results.push(result);
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        test: test.name,
        success: false,
        error: error.message
      });
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('TEST SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! ShipStation integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
  }
}

runTests().catch(console.error);

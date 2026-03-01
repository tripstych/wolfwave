// Simple script to trigger template sync
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/templates/sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer admin-token' // This would need to be a real admin token
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`Response: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();

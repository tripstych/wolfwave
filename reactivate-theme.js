// Reactivate the default theme to trigger template sync
const http = require('http');

const postData = JSON.stringify({
  theme: 'default',
  flushContent: false
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/themes/active',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
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

req.write(postData);
req.end();

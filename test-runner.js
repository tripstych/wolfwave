import { execSync } from 'child_process';

try {
  console.log('Running seed tests...');
  const output = execSync('npx vitest run tests/seed.test.js --reporter=verbose', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log(output);
} catch (error) {
  console.error('Test execution failed:', error.message);
  console.error('stdout:', error.stdout);
  console.error('stderr:', error.stderr);
  process.exit(1);
}

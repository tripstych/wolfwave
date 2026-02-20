import { vi, beforeAll } from 'vitest';
import 'dotenv/config';

// Force test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'webwolf_test';

// Global mocks if needed
beforeAll(() => {
  // Ensure we don't accidentally hit Stripe or other external APIs
  vi.mock('axios');
});

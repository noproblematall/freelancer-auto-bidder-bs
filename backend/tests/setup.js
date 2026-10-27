import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { freelancerHandlers } from './mocks/freelancerApi.js';
import { openaiHandlers } from './mocks/openaiApi.js';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./tests/test.db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex = 64 hex chars
process.env.FREELANCER_REDIRECT_URI = 'http://localhost:3001/api/auth/freelancer/callback';
process.env.FREELANCER_BASE_URL = 'https://www.freelancer.com';
process.env.FREELANCER_API_BASE = 'https://www.freelancer.com/api';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.OPENAI_MODEL = 'gpt-5.4-mini';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests

// Set up MSW server with all handlers
export const server = setupServer(...freelancerHandlers, ...openaiHandlers);

beforeAll(() => {
  // Start MSW server before all tests
  server.listen({ onUnhandledRequest: 'warn' });
});

afterAll(() => {
  // Clean up MSW server after all tests
  server.close();
});

beforeEach(() => {
  // Reset handlers between tests
  server.resetHandlers();
});

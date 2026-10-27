import jwt from 'jsonwebtoken';

/**
 * Generate a test JWT token for authenticated requests
 */
export function generateTestToken(userId, expiresIn = '7d') {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Create authorization header for supertest requests
 */
export function authHeader(userId) {
  const token = generateTestToken(userId);
  return { Authorization: `Bearer ${token}` };
}

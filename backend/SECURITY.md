# Security Documentation

## Overview

This document outlines the security measures implemented in the Auto-Bidder backend API.

## Authentication & Authorization

### JWT Authentication
- **Method**: JSON Web Tokens (JWT) with 7-day expiration
- **Secret**: Stored in environment variable `JWT_SECRET`
- **Flow**:
  1. User logs in with email/password
  2. Server verifies credentials (bcrypt hash comparison)
  3. Server generates JWT with userId claim
  4. Client includes JWT in `Authorization: Bearer <token>` header
  5. Middleware validates JWT on protected routes

### Password Security
- **Hashing**: bcrypt with 10 rounds (configurable via `BCRYPT_ROUNDS`)
- **Storage**: Only hashed passwords stored in database
- **Validation**: Minimum 6 characters (enforced at API level)

## Data Encryption

### Token Encryption at Rest
- **Algorithm**: AES-256-CBC
- **Key**: 256-bit encryption key from environment variable `ENCRYPTION_KEY`
- **IV**: Random 16-byte initialization vector generated per encryption
- **Format**: `IV:encryptedData` (both hex-encoded)
- **Encrypted Data**:
  - Freelancer OAuth access tokens
  - Freelancer OAuth refresh tokens
  - OpenAI API keys

### Key Management
- Encryption keys stored in `.env` file
- **CRITICAL**: `.env` must NEVER be committed to version control
- Production: Use secure secret management (AWS Secrets Manager, HashiCorp Vault, etc.)

## SQL Injection Prevention

- **ORM**: Prisma ORM with fully parameterized queries
- **No Raw SQL**: All database queries use Prisma's type-safe query builder
- **Validation**: Input validation via Joi schemas before database operations

## Input Validation

### Validation Middleware
- **Library**: Joi v17
- **Strategy**: Schema-based validation with strict type checking
- **Error Handling**: Returns 400 with field-level error details
- **Unknown Fields**: Stripped automatically (`stripUnknown: true`)

### Validated Endpoints
- `POST /api/bids` - Bid placement (amount, period, proposal length)
- `POST /api/profiles` - Profile creation (budgets, rate limits, relevance scores)
- `PUT /api/profiles/:id` - Profile updates
- `POST /api/projects/search` - Search query validation

### Validation Rules
- **Bid Amount**: 1 - 1,000,000 (prevents extreme values)
- **Period Days**: 1 - 365
- **Proposal Text**: 50 - 5,000 characters
- **Profile Name**: 1 - 100 characters
- **Min Relevance Score**: 0 - 100
- **Max Bids Per Hour**: 1 - 50
- **Max Bids Per Day**: 1 - 200

## Rate Limiting

### API Rate Limiter (General)
- **Window**: 15 minutes
- **Max Requests**: 100 per IP
- **Response**: 429 Too Many Requests
- **Logging**: Rate limit violations logged with IP, URL, requestId

### Auth Rate Limiter (Login/Register)
- **Window**: 15 minutes
- **Max Requests**: 5 per IP
- **Skip on Success**: Failed attempts only count toward limit
- **Purpose**: Prevent brute force attacks

### Bid Rate Limiter
- **Window**: 1 minute
- **Max Requests**: 10 per IP
- **Purpose**: Prevent API abuse and excessive bid placement

### Business Logic Rate Limits
- **Max Bids Per Hour**: Configurable per profile (default: 5)
- **Max Bids Per Day**: Configurable per profile (default: 20)
- **Enforcement**: Checked before each automated bid placement

## Security Headers

### Helmet Middleware
- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: SAMEORIGIN
- **X-XSS-Protection**: 1; mode=block
- **Strict-Transport-Security**: max-age=31536000 (HTTPS only)
- **CSP**: Disabled for API (frontend handles CSP)

## CORS Policy

- **Allowed Origin**: `http://localhost:8080` (development)
- **Credentials**: Allowed (for cookie-based auth if needed)
- **Production**: Update to production frontend URL

## Error Handling

### Production vs Development
- **Production**: Generic error messages to prevent information leakage
- **Development**: Full error details for debugging

### Error Logging
- **Structured Logging**: Pino with JSON format
- **Context**: Includes requestId, userId, method, URL, stack trace
- **Sensitive Data**: Never log API keys, passwords, or tokens

### Error Classification
- `ValidationError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `RateLimitError` (429)
- `ExternalAPIError` (502)
- `InternalError` (500)

## Environment Variables

### Required Secrets
```
JWT_SECRET=<random-secret-at-least-32-chars>
ENCRYPTION_KEY=<64-character-hex-string>  # 32 bytes
# Freelancer Client ID/Secret are stored per-user (encrypted) via the Settings UI
OPENAI_API_KEY=<from-openai-platform>
```

### Security Configuration
```
LOG_LEVEL=info
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
BCRYPT_ROUNDS=10
NODE_ENV=production
```

## Logging & Monitoring

### Request Tracing
- **Correlation IDs**: UUID v4 generated per request
- **Header**: `X-Request-ID` in response
- **Logging**: All logs include requestId for tracing

### Performance Monitoring
- Slow requests (>1s) logged at WARN level
- All requests logged at DEBUG level with duration

### Sensitive Data Filtering
- Passwords never logged
- API keys never logged
- Encrypted tokens logged as opaque strings

## Deployment Best Practices

### Production Checklist
- [ ] Use PostgreSQL instead of SQLite
- [ ] Set `NODE_ENV=production`
- [ ] Use secure secret management service
- [ ] Enable HTTPS (TLS 1.2+)
- [ ] Update CORS to production frontend URL
- [ ] Set secure, random `JWT_SECRET` (32+ chars)
- [ ] Set secure, random `ENCRYPTION_KEY` (64 hex chars)
- [ ] Review and adjust rate limits for production traffic
- [ ] Enable log aggregation (Datadog, ELK, Loki)
- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Configure firewall rules
- [ ] Enable database connection pooling
- [ ] Use reverse proxy (Nginx, CloudFlare)
- [ ] Implement DDoS protection
- [ ] Regular security audits and dependency updates

### Scaling Considerations
- **Rate Limiting**: Current in-memory store won't work across multiple server instances
  - Solution: Use Redis adapter for `express-rate-limit`
- **Session Storage**: JWT is stateless (good for horizontal scaling)
- **Database**: Migrate to PostgreSQL with connection pooling

## Vulnerability Reporting

If you discover a security vulnerability, please email security@example.com (update with actual contact).

---

Last Updated: 2025-02-13
Auto-Bidder v1.0.0

# Localhost Production Setup

Quick guide for running Auto-Bidder in production mode on localhost (no domain required).

## Architecture

```
┌─────────────────────────────────────┐
│  Browser: http://localhost:8080    │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  Frontend (Nginx) - Port 8080      │
│  - Serves React app                 │
│  - Proxies /api → backend           │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  Backend (Node.js) - Port 3000     │
│  - API endpoints                    │
│  - SQLite database                  │
└─────────────────────────────────────┘
```

## Prerequisites

- Docker Engine 20.10+ and Docker Compose 2.0+
- Node.js 20+ (for generating secrets)
- Valid Freelancer.com OAuth credentials
- Valid OpenAI API key
- **Important:** `ChatGPT prompt.md` file must exist in project root (used for AI proposal generation)

## Setup Steps

### 1. Generate Secrets

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Create Production Environment File

Create `.env.production` in the project root:

```bash
# Copy the example file
cp .env.production.example .env.production
```

Edit `.env.production`:

```env
# JWT Secret (paste generated value from step 1)
JWT_SECRET=<paste-generated-jwt-secret>

# Encryption Key (paste generated value from step 1)
ENCRYPTION_KEY=<paste-generated-encryption-key>

# Freelancer OAuth (Client ID/Secret are configured per-user in the Settings UI)
FREELANCER_REDIRECT_URI=http://localhost:3000/api/auth/freelancer/callback

# OpenAI API Key
OPENAI_API_KEY=sk-<your-openai-api-key>

# CORS (Frontend URL - leave as localhost:8080)
CORS_ORIGIN=http://localhost:8080

# Logging
LOG_LEVEL=info

# Rate Limiting (production values)
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Security
BCRYPT_ROUNDS=12
```

**Important:**
- Set `FREELANCER_REDIRECT_URI` to `http://localhost:3000/api/auth/freelancer/callback`
- Set `CORS_ORIGIN` to `http://localhost:8080`
- In your Freelancer OAuth app settings, add `http://localhost:3000/api/auth/freelancer/callback` as an authorized redirect URI

### 3. Build and Start

```bash
# Build and start all services
docker-compose up -d --build

# This will:
# - Build backend image (~150MB)
# - Build frontend image (~50MB)
# - Create database volume
# - Run database migrations
# - Start both services
```

### 4. Verify Services

```bash
# Check container status
docker-compose ps

# Should show both services as "healthy"
# NAME                    STATUS
# auto-bidder-backend     Up (healthy)
# auto-bidder-frontend    Up (healthy)

# Check backend health
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# Check frontend health
curl http://localhost:8080/health
# Expected: OK
```

### 5. Access Application

Open your browser to: **http://localhost:8080**

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/api
- All API calls from frontend go through Nginx proxy → backend

## Freelancer OAuth Configuration

In your Freelancer OAuth app settings (https://www.freelancer.com/users/settings/):

1. Go to **Developer** → **OAuth Applications**
2. Create or edit your app
3. Set **Redirect URI** to: `http://localhost:3000/api/auth/freelancer/callback`
4. Copy **Client ID** and **Client Secret** to `.env.production`

**Note:** If you're using the sandbox environment, use:
- Sandbox OAuth: https://accounts.freelancer-sandbox.com
- Sandbox API: https://www.freelancer-sandbox.com/api

## Viewing Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100 backend
```

## Stopping/Starting Services

```bash
# Stop all services
docker-compose down

# Start services (without rebuild)
docker-compose up -d

# Restart specific service
docker-compose restart backend
docker-compose restart frontend

# Rebuild and restart
docker-compose up -d --build
```

## Database Management

### Backup Database

```bash
# Create backup with timestamp
docker-compose exec backend sh -c 'cp /app/prisma/prod.db /app/prisma/backup-$(date +%Y%m%d-%H%M%S).db'

# Copy backup to host
docker cp auto-bidder-backend:/app/prisma/backup-20260213-120000.db ./backups/
```

### Restore Database

```bash
# Stop backend
docker-compose stop backend

# Copy backup to container
docker cp ./backups/backup-20260213-120000.db auto-bidder-backend:/app/prisma/prod.db

# Start backend
docker-compose start backend
```

### View Database

```bash
# Install Prisma CLI globally (one-time)
npm install -g prisma

# Access database from host
cd backend
DATABASE_URL="file:./prisma/prod.db" prisma studio
```

Open http://localhost:5555 to view database in browser.

## Troubleshooting

### Container won't start

```bash
# Check logs for errors
docker-compose logs backend
docker-compose logs frontend

# Common issues:
# - Missing environment variables in .env.production
# - Port 3000 or 8080 already in use
# - Database migration failed
```

### Can't access http://localhost:8080

```bash
# Check if frontend container is running
docker-compose ps

# Check Nginx logs
docker-compose logs frontend

# Verify port binding
docker port auto-bidder-frontend
# Should show: 8080/tcp -> 0.0.0.0:8080
```

### API calls failing (404 or CORS errors)

```bash
# Check backend is running
curl http://localhost:3000/health

# Check CORS_ORIGIN is set correctly
docker-compose exec backend printenv CORS_ORIGIN
# Should show: http://localhost:8080

# Check Nginx is proxying correctly
docker-compose logs frontend | grep "proxy"
```

### Database locked errors

```bash
# Only one backend process should access SQLite
# Restart backend to release lock
docker-compose restart backend
```

### Login issues

1. **Check Freelancer OAuth redirect URI** in your app settings matches:
   - `http://localhost:3000/api/auth/freelancer/callback`

2. **Check CORS_ORIGIN** in `.env.production`:
   - Should be `http://localhost:8080`

3. **View browser console** for CORS or network errors

4. **Check backend logs** for OAuth errors:
   ```bash
   docker-compose logs backend | grep -i oauth
   ```

## Updating the Application

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Migrations run automatically on startup
# Check logs to verify
docker-compose logs backend | grep -i migration
```

## Performance Monitoring

```bash
# View resource usage
docker stats auto-bidder-backend auto-bidder-frontend

# Check disk usage
docker system df
docker volume ls

# View database size
docker-compose exec backend du -sh /app/prisma/prod.db
```

## Security Notes

- `.env.production` contains secrets - never commit to git (already in .gitignore)
- Keep Docker images updated: `docker-compose pull`
- Backup database regularly (daily recommended)
- Monitor logs for suspicious activity
- Rate limiting is enabled (100 req/15min for API)
- All tokens encrypted in database with AES-256-CBC

## Network Ports

| Service  | Container Port | Host Port | Access |
|----------|----------------|-----------|--------|
| Frontend | 8080          | 8080      | Public |
| Backend  | 3000          | 3000      | Public (for OAuth callback) |

**Note:** Both ports need to be accessible on localhost for OAuth to work correctly.

## Environment-Specific Settings

The Docker setup uses production settings:

- `NODE_ENV=production`
- Rate limiting enabled (100 req/15min)
- Structured logging (JSON format)
- Bcrypt rounds: 12 (slower but more secure)
- No debug output
- Optimized builds (minified)

To adjust these, edit `docker-compose.yml` environment variables.

## Quick Reference

```bash
# Start production
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop production
docker-compose down

# Backup database
docker cp auto-bidder-backend:/app/prisma/prod.db ./prod.db.backup

# Restart after code changes
docker-compose down && docker-compose up -d --build

# Access running container
docker-compose exec backend sh
docker-compose exec frontend sh

# View environment variables
docker-compose exec backend printenv
```

## Support

For detailed deployment information, see [DEPLOYMENT.md](DEPLOYMENT.md).

For Freelancer.com compliance, see [COMPLIANCE.md](COMPLIANCE.md).

For security best practices, see [backend/SECURITY.md](backend/SECURITY.md).

---

**Access your production instance at:** http://localhost:8080

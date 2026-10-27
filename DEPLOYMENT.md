# Auto-Bidder Deployment Guide

This guide covers deploying Auto-Bidder to production using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Node.js 20+ (for generating secrets)
- Valid Freelancer.com OAuth credentials
- Valid OpenAI API key

## Quick Start

### 1. Generate Secrets

Generate secure random secrets for JWT and encryption:

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure Environment Variables

Create `.env.production` file in the project root:

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill in all required values:

- `JWT_SECRET` - Generated secret for JWT tokens
- `ENCRYPTION_KEY` - Generated key for encrypting OAuth tokens
- `FREELANCER_REDIRECT_URI` - OAuth callback URL (e.g., `https://yourdomain.com/auth/callback`)
- Note: Freelancer Client ID/Secret are stored per-user (encrypted) via the Settings UI, not as env vars
- `OPENAI_API_KEY` - OpenAI API key starting with `sk-`

### 3. Update Frontend API URL

Edit `frontend/src/services/api.js` and update the `baseURL`:

```javascript
const api = axios.create({
  baseURL: 'https://yourdomain.com/api', // Change to your production domain
  headers: { 'Content-Type': 'application/json' },
});
```

Or use environment variables in Vite - create `frontend/.env.production`:

```
VITE_API_URL=https://yourdomain.com/api
```

And update `api.js`:

```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});
```

### 4. Build and Run

Build and start all services:

```bash
docker-compose up -d --build
```

Check service health:

```bash
docker-compose ps
docker-compose logs -f
```

### 5. Verify Deployment

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/health
- Backend should return: `{"status":"ok"}`

## Production Deployment

### Using a Reverse Proxy (Nginx/Traefik)

For production, use a reverse proxy with SSL:

**Nginx Example:**

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Environment-Specific Configuration

Update `docker-compose.yml` for production:

```yaml
services:
  backend:
    environment:
      - BCRYPT_ROUNDS=12  # Higher for production
      - LOG_LEVEL=warn    # Less verbose
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Database Management

### Backup Database

```bash
# Create backup
docker-compose exec backend sh -c 'cp /app/prisma/prod.db /app/prisma/backup-$(date +%Y%m%d-%H%M%S).db'

# Copy backup to host
docker cp auto-bidder-backend:/app/prisma/backup-*.db ./backups/
```

### Restore Database

```bash
# Stop backend
docker-compose stop backend

# Copy backup to container
docker cp ./backups/backup-20260213-120000.db auto-bidder-backend:/app/prisma/prod.db

# Restart backend
docker-compose start backend
```

### Database Migrations

Migrations run automatically on container startup via `prisma migrate deploy`.

To manually run migrations:

```bash
docker-compose exec backend npx prisma migrate deploy
```

## Monitoring and Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Health Checks

```bash
# Check backend health
curl http://localhost:3000/health

# Check frontend health
curl http://localhost:8080/health

# Docker health status
docker-compose ps
```

### Resource Usage

```bash
# Container stats
docker stats auto-bidder-backend auto-bidder-frontend

# Disk usage
docker system df
docker volume ls
```

## Scaling and Performance

### Horizontal Scaling

To run multiple backend instances:

```yaml
services:
  backend:
    deploy:
      replicas: 3
    ports:
      - "3000-3002:3000"
```

**Note:** SQLite doesn't support concurrent writes well. For horizontal scaling, migrate to PostgreSQL or MySQL.

### Optimize Images

Current image sizes (approximate):
- Backend: ~150MB (Alpine-based)
- Frontend: ~50MB (Nginx Alpine)

To further optimize:

```bash
# Remove unused images
docker image prune -a

# Multi-platform builds (optional)
docker buildx build --platform linux/amd64,linux/arm64 -t auto-bidder-backend ./backend
```

## Security Best Practices

### 1. Update CORS Configuration

Edit `backend/src/index.js`:

```javascript
app.use(cors({
  origin: 'https://yourdomain.com', // Production domain
  credentials: true
}));
```

### 2. Enable HTTPS Only

Force HTTPS redirects in your reverse proxy and update cookies:

```javascript
// In backend authentication
res.cookie('token', token, {
  httpOnly: true,
  secure: true, // Enable in production
  sameSite: 'strict'
});
```

### 3. Secrets Management

Never commit `.env.production` to git. Use:
- Docker secrets
- AWS Secrets Manager
- HashiCorp Vault
- Environment variables in CI/CD

### 4. Regular Updates

```bash
# Update base images
docker-compose pull
docker-compose up -d --build

# Update Node dependencies
docker-compose exec backend npm audit fix
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Missing environment variables
# - Database migration failures
# - Port conflicts
```

### Database Locked Errors

SQLite database locked - ensure only one process accesses it:

```bash
# Restart backend
docker-compose restart backend
```

### High Memory Usage

Check scheduler interval and bid volume:

```bash
# View memory usage
docker stats auto-bidder-backend

# Reduce scheduler frequency if needed
# Edit backend/src/services/bidding/scheduler.js
```

### CORS Errors

Update backend CORS origin to match frontend domain:

```javascript
// backend/src/index.js
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true
}));
```

## Maintenance

### Regular Tasks

**Daily:**
- Monitor logs for errors
- Check disk space: `docker system df`

**Weekly:**
- Review bid performance metrics
- Check for security updates: `npm audit`
- Backup database

**Monthly:**
- Rotate logs
- Update dependencies
- Review resource usage
- Prune unused images/volumes

### Updating the Application

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Verify health
docker-compose ps
docker-compose logs -f
```

### Rollback Procedure

```bash
# Stop containers
docker-compose down

# Checkout previous version
git checkout <previous-commit>

# Restore database backup
docker cp ./backups/backup-*.db auto-bidder-backend:/app/prisma/prod.db

# Rebuild and start
docker-compose up -d --build
```

## Cloud Deployment

### AWS ECS/Fargate

1. Push images to ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
   docker tag auto-bidder-backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/auto-bidder-backend:latest
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/auto-bidder-backend:latest
   ```

2. Create ECS task definition with environment variables from Secrets Manager

3. Use EFS for persistent database storage

### DigitalOcean App Platform

1. Connect GitHub repository
2. Set environment variables in dashboard
3. Use managed database (PostgreSQL) instead of SQLite
4. Configure health checks: `/health` endpoint

### Heroku

1. Add `heroku.yml`:
   ```yaml
   build:
     docker:
       web: backend/Dockerfile
   ```

2. Set environment variables:
   ```bash
   heroku config:set JWT_SECRET=...
   heroku config:set ENCRYPTION_KEY=...
   ```

3. Use Heroku Postgres add-on

## Performance Benchmarks

Expected performance (single instance):
- Backend: 100-500 req/s
- Frontend: 1000+ req/s (Nginx)
- Database: 1000+ reads/s, 100+ writes/s (SQLite)

For higher loads, consider:
- PostgreSQL/MySQL for database
- Redis for caching
- Load balancer for multiple backend instances

## Support and Resources

- **Docker Docs:** https://docs.docker.com
- **Docker Compose:** https://docs.docker.com/compose
- **Nginx:** https://nginx.org/en/docs
- **Prisma Deployment:** https://www.prisma.io/docs/guides/deployment

---

**Last Updated:** 2026-02-13

# Auto-Bidder

Automated bidding system for Freelancer.com powered by AI.

## Features

- **Freelancer OAuth Integration**: Secure authentication with Freelancer.com
- **AI-Powered Analysis**: OpenAI integration for project relevance scoring and proposal generation
- **Bidding Profiles**: Create profiles with custom budgets, skills, and targeting criteria
- **Auto-Bidding Scheduler**: Automated bidding based on profiles with configurable rate limits
- **Bid Management**: Track placed bids, view history, retract bids
- **Performance Analytics**: Charts showing bid performance over time
- **Security**: Rate limiting, input validation, encrypted token storage, structured logging

## Tech Stack

**Backend:**
- Node.js + Express
- Prisma ORM with SQLite
- JWT authentication
- Pino structured logging
- OpenAI API integration

**Frontend:**
- React + Vite
- TailwindCSS
- Recharts for analytics
- Axios for API calls

**DevOps:**
- Docker + Docker Compose
- Multi-stage builds
- Nginx for frontend serving
- Health checks and monitoring

## Desktop App Installation

### Mac (Apple Silicon)

1. Download `Growlance-x.x.x-arm64.dmg` from the [Releases](../../releases) page
2. Open the DMG and drag **Growlance** to your Applications folder
3. Run the following command in Terminal:
   ```bash
   xattr -cr /Applications/Growlance.app
   ```
4. Open Growlance from Applications or your Dock

> **Why is step 3 needed?**
> macOS Gatekeeper blocks apps downloaded from the internet that aren't signed with an Apple Developer certificate, showing a "damaged" error. The `xattr -cr` command removes the quarantine flag so the app can launch. This is safe — it only removes the download quarantine attribute and does not modify the app itself.

### Mac (Intel)

Same steps as above, but download `Growlance-x.x.x-x64.dmg` instead.

### Windows

1. Download `Growlance-Setup-x.x.x.exe` from the [Releases](../../releases) page
2. Run the installer
3. If Windows SmartScreen shows an "Unknown publisher" warning, click **More info → Run anyway**

### Linux

1. Download `Growlance-x.x.x.AppImage` from the [Releases](../../releases) page
2. Make it executable and run:
   ```bash
   chmod +x Growlance-*.AppImage
   ./Growlance-*.AppImage
   ```

---

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- npm or yarn
- Freelancer.com OAuth app credentials
- OpenAI API key

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd Auto-bidder
```

2. **Install backend dependencies**

```bash
cd backend
npm install
```

3. **Install frontend dependencies**

```bash
cd ../frontend
npm install
```

4. **Configure environment variables**

Create `backend/.env`:

```bash
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here
FREELANCER_REDIRECT_URI=http://localhost:3001/api/auth/freelancer/callback
# Freelancer Client ID/Secret are configured per-user in the Settings UI
OPENAI_API_KEY=sk-your-openai-api-key
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

5. **Run database migrations**

```bash
cd backend
npx prisma migrate dev
```

6. **Start development servers**

Backend (from `backend/` directory):

```bash
npm run dev
```

Frontend (from `frontend/` directory):

```bash
npm run dev
```

Access the application:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3001

## Production Deployment

### Using Docker Compose (Recommended)

1. **Configure production environment**

```bash
cp .env.production.example .env.production
# Edit .env.production with your production values
```

2. **Build and start services**

```bash
docker-compose up -d --build
```

3. **Verify deployment**

```bash
docker-compose ps
docker-compose logs -f
```

Access:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

### Deployment Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment instructions including:
- Cloud deployment (AWS, DigitalOcean, Heroku)
- Reverse proxy configuration
- Database backups
- Monitoring and logging
- Scaling strategies

## Testing

Backend tests (Vitest):

```bash
cd backend
npm test
npm run test:ui
npm run test:coverage
```

Frontend tests:

```bash
cd frontend
npm test
```

## Project Structure

```
Auto-bidder/
├── backend/
│   ├── src/
│   │   ├── config/           # Environment configuration
│   │   ├── middleware/       # Express middleware (auth, logging, validation)
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   │   ├── bidding/      # Bidding engine and scheduler
│   │   │   ├── freelancer/   # Freelancer API client
│   │   │   └── openai/       # OpenAI integration
│   │   └── utils/            # Utilities (logger, token manager)
│   ├── prisma/               # Database schema and migrations
│   ├── tests/                # Test files
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API services
│   │   └── context/          # React context
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── DEPLOYMENT.md
├── SECURITY.md
├── COMPLIANCE.md
└── README.md
```

## Key Features

### Bidding Profiles

Create profiles with:
- Target budgets (min/max)
- Required/preferred skills
- Rate limits (bids per hour/day)
- Minimum relevance score
- Auto-bidding toggle

### AI Analysis

Each project is analyzed for:
- Relevance score (0-100)
- Budget appropriateness
- Timeline feasibility
- Custom proposal generation

### Scheduler

- Runs every 5 minutes (configurable)
- Processes active profiles
- Respects rate limits
- Deduplicates previously bid projects
- Encrypted token storage

### Security Features

- Helmet security headers
- Rate limiting (API, auth, bids)
- Input validation with Joi
- SQL injection prevention (Prisma ORM)
- AES-256-CBC token encryption
- Structured logging with correlation IDs

## Compliance

See [COMPLIANCE.md](COMPLIANCE.md) for Freelancer.com policy compliance analysis and recommendations.

**Important:** The current implementation requires manual review mode to fully comply with Freelancer.com's Code of Conduct ("only bid on projects I plan to complete"). See COMPLIANCE.md for details.

## API Documentation

### Authentication

- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/freelancer` - Start OAuth flow
- `GET /api/auth/freelancer/callback` - OAuth callback

### Projects

- `GET /api/projects/search` - Search Freelancer projects
- `GET /api/projects/:id` - Get project details
- `POST /api/projects/:id/analyze` - Analyze project with AI

### Bids

- `GET /api/bids` - List user's bids
- `POST /api/bids` - Place a bid
- `PUT /api/bids/:id/retract` - Retract bid
- `GET /api/bids/stats` - Bid statistics
- `GET /api/bids/history` - Historical bid data

### Profiles

- `GET /api/profiles` - List profiles
- `POST /api/profiles` - Create profile
- `PUT /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile

### Scheduler

- `GET /api/scheduler/status` - Scheduler status
- `POST /api/scheduler/run-now` - Trigger immediate run

## Environment Variables

### Backend

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `ENCRYPTION_KEY` | Token encryption key | Yes | - |
| `FREELANCER_REDIRECT_URI` | OAuth callback URL | No | localhost:3001/... |
| `OPENAI_API_KEY` | OpenAI API key | No | - |
| `PORT` | Server port | No | 3001 |
| `LOG_LEVEL` | Logging level | No | info |
| `CORS_ORIGIN` | Frontend URL | No | localhost:8080 |

### Frontend

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API URL | No | /api |

## Development

### Database Migrations

Create a new migration:

```bash
cd backend
npx prisma migrate dev --name migration_name
```

View database:

```bash
npx prisma studio
```

### Logging

Backend uses Pino structured logging:

```javascript
logger.info({ msg: 'Bid placed', projectId, amount, userId });
logger.warn({ msg: 'Rate limit exceeded', ip, url });
logger.error({ err, msg: 'Failed to place bid' });
```

View logs in development (pretty format):

```bash
cd backend
npm run dev
```

### Testing Strategy

- **Unit Tests**: Services, utilities (engine, analyzer, token manager)
- **Integration Tests**: API routes with test database
- **Mocked APIs**: MSW for Freelancer and OpenAI
- **Coverage Goal**: 70%+ for critical services

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

For issues and questions:
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment help
- Review [COMPLIANCE.md](COMPLIANCE.md) for policy compliance
- Check [SECURITY.md](backend/SECURITY.md) for security information

---

**Built with Claude Code** 🤖

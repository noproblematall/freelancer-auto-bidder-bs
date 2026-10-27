# Auto-Bidder: Freelancer.com Automatic Bidding Web App

## Implementation Plan

---

## 1. Project Overview

Build a web application that automatically discovers relevant projects on Freelancer.com, generates tailored bid proposals using OpenAI's GPT API, and places bids via the Freelancer.com API. The app provides a dashboard for configuration, monitoring, and managing the auto-bidding pipeline.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  Dashboard | Settings | Bid History | Project Feed      │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                 Backend (Node.js/Express)                │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐     │
│  │ Auth     │  │ Scheduler │  │ Bid Pipeline     │     │
│  │ Module   │  │ (Cron)    │  │ Engine           │     │
│  └──────────┘  └───────────┘  └──────────────────┘     │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐     │
│  │ Freelancer API   │  │ OpenAI API               │     │
│  │ Client           │  │ Client                   │     │
│  └──────────────────┘  └──────────────────────────┘     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Database (SQLite / PostgreSQL)              │
│  Users | Tokens | Profiles | Projects | Bids | Logs     │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer        | Technology                              |
|------------- |-----------------------------------------|
| Frontend     | React 18+ with Vite, Tailwind CSS, React Router v6 |
| Backend      | Node.js + Express.js                    |
| Database     | SQLite (dev) / PostgreSQL (prod)        |
| ORM          | Prisma                                  |
| Scheduler    | node-cron                               |
| HTTP Client  | Axios                                   |
| Auth         | Freelancer OAuth 2.0 + JWT sessions     |
| AI           | OpenAI GPT-4o / GPT-4o-mini API        |
| Testing      | Vitest (backend), React Testing Library |

---

## 4. Freelancer.com API Reference

### 4.1 Authentication

- **Method**: OAuth 2.0 (Authorization Code Grant)
- **Auth Header (primary)**: `Freelancer-OAuth-V1: <oauth_access_token>` (used by official Python SDK)
- **Auth Header (alternative)**: `Authorization: Bearer <oauth_access_token>` (referenced in some third-party guides)
- **Recommendation**: Use `Freelancer-OAuth-V1` header as it matches the official SDK implementation. Fall back to `Authorization: Bearer` if the former fails.
- **Sandbox URL**: `https://www.freelancer-sandbox.com`
- **Production URL**: `https://www.freelancer.com`
- **Developer Portal**: `https://developers.freelancer.com`
- **Sandbox Dev Config**: `https://www.freelancer-sandbox.com/developer-user-config/`
- **App Registration**: `https://accounts.freelancer-sandbox.com`

#### OAuth 2.0 Flow

1. Register application at the Freelancer developer portal (sandbox: `accounts.freelancer-sandbox.com`)
2. Obtain `client_id` and `client_secret`, select required permission scopes
3. Redirect user to `{base}/oauth/authorise` (note British spelling) with `scope=basic`, `advanced_scopes`, and `prompt=select_account`
4. User reviews permissions and grants access
5. Receive authorization code at `redirect_uri`
6. Exchange code for access token via `{base}/oauth/token`
7. Store `access_token`, `refresh_token`, `expires_in`, `token_type`, `scope`
8. Use refresh token to renew expired access tokens

#### OAuth Endpoints

> **Important**: Freelancer uses British spelling `authorise` (not `authorize`) in the endpoint path.

| Purpose       | Sandbox                                                       | Production                                             |
|---------------|---------------------------------------------------------------|--------------------------------------------------------|
| Authorization | `https://www.freelancer-sandbox.com/oauth/authorise`          | `https://www.freelancer.com/oauth/authorise`           |
| Token         | `https://www.freelancer-sandbox.com/oauth/token`              | `https://www.freelancer.com/oauth/token`               |

Authorization request (redirect user here):
```
GET {authorize_url}?response_type=code
  &client_id=<client_id>
  &redirect_uri=<redirect_uri>
  &scope=basic
  &advanced_scopes=<space-separated numeric scope IDs>
  &prompt=select_account
```

Exchange authorization code for tokens:
```
POST {token_url}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<authorization_code>
&client_id=<client_id>
&client_secret=<client_secret>
&redirect_uri=<redirect_uri>
```

Refresh an expired token:
```
POST {token_url}
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<refresh_token>
&client_id=<client_id>
&client_secret=<client_secret>
```

#### Required Scopes

Freelancer uses a `scope=basic` base scope plus numeric `advanced_scopes` IDs. The official demo app requests `advanced_scopes=1 6` (space-separated).

> **Important**: The exact numeric scope IDs and their meanings are assigned during app registration at the Freelancer developer portal. The IDs below are based on the official demo app and SDK references — verify the full list during registration.

| Scope             | Format                  | Notes                                        |
|-------------------|-------------------------|----------------------------------------------|
| Basic access      | `scope=basic`           | Default scope, always required               |
| Advanced scopes   | `advanced_scopes=1 6`   | Space-separated numeric IDs                  |
| Project create    | `fln:project:create`    | Confirmed string format from PHP OAuth client|

The app registration form on the developer portal lets you select which permissions your app needs (project search, bid placement, user info, messaging, etc.) and assigns the corresponding scope IDs. Request all scopes needed for:
- Searching and viewing projects
- Placing and retracting bids
- Reading user profile and reputation
- Sending and reading messages (optional, for Phase 6)

### 4.2 API Base URLs & Endpoints

**Base URL**: `https://www.freelancer.com/api/`
**Sandbox Base URL**: `https://www.freelancer-sandbox.com/api/`

Full URL construction: `{base_url}/{endpoint}`
Example: `https://www.freelancer.com/api/projects/0.1/projects/search?query=react`

#### Projects API (`projects/0.1/`)

| Operation        | Method | Endpoint                            | Key Parameters                                                                      |
|------------------|--------|-------------------------------------|--------------------------------------------------------------------------------------|
| Search projects  | GET    | `projects/0.1/projects/search`      | `query`, `sort_field`, `or_search_query`, `project_types`, `active_only`, `min_avg_price`, `max_avg_price`, `min_avg_hourly_rate`, `max_avg_hourly_rate`, `jobs[]`, `countries[]`, `languages[]`, `project_details`, `user_details`, `limit`, `offset` |
| Get project      | GET    | `projects/0.1/projects/{id}`        | `project_details`, `user_details`                                                    |
| Get projects     | GET    | `projects/0.1/projects`             | `project_ids[]`, `owner_ids[]`, `limit`, `offset`                                    |
| Place bid        | POST   | `projects/0.1/bids`                 | JSON body: `project_id`, `bidder_id`, `amount`, `period`, `milestone_percentage`, `description` |
| Get bids         | GET    | `projects/0.1/bids`                 | `project_ids[]`, `bid_ids[]`, `limit`, `offset`                                      |
| Award bid        | PUT    | `projects/0.1/bids/{id}`            | Query param: `action=award` (Content-Type: x-www-form-urlencoded)                    |
| Accept bid       | PUT    | `projects/0.1/bids/{id}`            | Query param: `action=accept` (freelancer accepts awarded bid)                        |
| Retract bid      | PUT    | `projects/0.1/bids/{id}`            | Query param: `action=retract` (bidder withdraws)                                     |
| Revoke bid       | PUT    | `projects/0.1/bids/{id}`            | Query param: `action=revoke` (employer cancels award)                                |
| Highlight bid    | PUT    | `projects/0.1/bids/{id}`            | Query param: `action=highlight` (upgrade bid visibility)                             |
| Get jobs/skills  | GET    | `projects/0.1/jobs`                 | `job_ids[]`, `seo_details`, `lang`                                                   |

#### Users API (`users/0.1/`)

| Operation           | Method | Endpoint                      | Key Parameters                          |
|---------------------|--------|-------------------------------|-----------------------------------------|
| Get self            | GET    | `users/0.1/self`              | `user_details`                          |
| Get user            | GET    | `users/0.1/users/{id}`        | `user_details`                          |
| Search freelancers  | GET    | `users/0.1/users/directory`   | `jobs[]`, `countries[]`, `query`, `hourly_rate_min`, `hourly_rate_max`, `limit`, `offset` |
| Get reputations     | GET    | `users/0.1/reputations`       | `user_ids[]`, `job_ids[]`, `role`       |
| Get portfolios      | GET    | `users/0.1/portfolios`        | `user_ids[]`, `limit`, `offset`         |
| Add user jobs       | POST   | `users/0.1/self/jobs`         | `jobs[]`                                |
| Set user jobs       | PUT    | `users/0.1/self/jobs`         | `jobs[]`                                |
| Delete user jobs    | DELETE | `users/0.1/self/jobs`         | `jobs[]`                                |

#### Messages API (`messages/0.1/`)

| Operation          | Method | Endpoint                                    | Key Parameters                               |
|--------------------|--------|---------------------------------------------|----------------------------------------------|
| Create thread      | POST   | `messages/0.1/threads/`                     | `member_ids`, `context_type`, `context`, `message` |
| Post message       | POST   | `messages/0.1/threads/{id}/messages/`       | `message`                                    |
| Post attachment    | POST   | `messages/0.1/threads/{id}/messages/`       | `attachments[]` (file, filename)             |
| Get messages       | GET    | `messages/0.1/messages`                     | `query`, `limit`, `offset`                   |
| Search messages    | GET    | `messages/0.1/messages/search`              | `thread_id`, `query`, `limit`, `offset`      |
| Get threads        | GET    | `messages/0.1/threads`                      | `query`                                      |

#### Milestones API (`projects/0.1/`)

| Operation                | Method | Endpoint                               | Key Parameters                                        |
|--------------------------|--------|----------------------------------------|-------------------------------------------------------|
| Create milestone payment | POST   | `projects/0.1/milestones`              | `project_id`, `bidder_id`, `amount`, `reason`, `description` |
| Get milestones           | GET    | `projects/0.1/milestones`              | `project_ids[]`, `milestone_ids[]`, `limit`, `offset` |
| Get milestone by ID      | GET    | `projects/0.1/milestones/{id}`         |                                                       |
| Release payment          | PUT    | `projects/0.1/milestones/{id}`         | Query param: `action=release`, `amount`               |
| Request release          | PUT    | `projects/0.1/milestones/{id}`         | Query param: `action=request_release`                 |
| Cancel payment           | PUT    | `projects/0.1/milestones/{id}`         | Query param: `action=cancel`                          |
| Create milestone request | POST   | `projects/0.1/milestone_requests`      | `project_id`, `bid_id`, `description`, `amount`       |
| Accept request           | PUT    | `projects/0.1/milestone_requests/{id}` | Query param: `action=accept`                          |
| Reject request           | PUT    | `projects/0.1/milestone_requests/{id}` | Query param: `action=reject`                          |
| Delete request           | DELETE | `projects/0.1/milestone_requests/{id}` |                                                       |

### 4.3 Rate Limiting

- Implement exponential backoff retry logic
- Detect HTTP 429 (Too Many Requests) responses
- Maximum 3 retry attempts per request
- Cache frequently accessed data (jobs list, user profile)

### 4.4 Search Filters (Project Search)

Available filter fields:
- `sort_field` - e.g., `time_updated`, `time_submitted`
- `or_search_query` - Boolean for OR-based search
- `active_only` - Boolean, return only active/open projects (recommended: `true`)
- `project_types` - Filter by project type (fixed, hourly)
- `include_contests` - Include/exclude contests
- `min_avg_price` / `max_avg_price` - Budget range filter
- `min_avg_hourly_rate` / `max_avg_hourly_rate` - Hourly rate range
- `jobs[]` - Filter by skill/job category IDs
- `countries[]` - Filter by country
- `languages[]` - Filter by language
- `from_time` / `to_time` - Time range filter

Response expansion fields (include extra data to avoid extra API calls):
- `project_details` - Include full description, jobs, attachments, qualifications, etc.
- `user_details` - Include owner's profile, avatar, reputation, country, etc.

---

## 5. OpenAI API Integration

### 5.1 Purpose

Use OpenAI's GPT API to:

1. **Analyze project descriptions** - Extract key requirements, technologies, deliverables
2. **Match skills** - Compare project requirements against user's skill profile
3. **Generate bid proposals** - Create personalized, compelling bid descriptions
4. **Estimate pricing** - Suggest competitive bid amounts based on project scope
5. **Score relevance** - Rate how well a project matches the user's profile (0-100)

### 5.2 API Configuration

- **Model**: `gpt-4o-mini` (cost-effective for analysis) or `gpt-4o` (higher quality proposals)
- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Auth**: `Authorization: Bearer <OPENAI_API_KEY>`
- **JSON mode**: Use `response_format: { type: "json_object" }` for the analysis prompt to guarantee valid JSON output
- **Temperature**: `0.3` for analysis (deterministic), `0.7` for proposal generation (creative)
- **Max tokens**: `500` for analysis, `1000` for proposals

### 5.3 Prompt Engineering

#### Project Analysis Prompt (JSON mode enabled)

```
System: You are an expert freelancer assistant that analyzes project postings.
You MUST respond with valid JSON only.

User:
Analyze this project posting and score its relevance to the freelancer's profile.

PROJECT:
- Title: {title}
- Description: {description}
- Budget: {budget_min} - {budget_max} {currency}
- Skills Required: {skills}
- Project Type: {project_type}

FREELANCER PROFILE:
- Skills: {user_skills}
- Experience: {experience_summary}

Respond with this exact JSON structure:
{
  "key_requirements": ["requirement1", "requirement2"],
  "technologies": ["tech1", "tech2"],
  "estimated_hours": <number>,
  "complexity": "low" | "medium" | "high",
  "relevance_score": <0-100, how well the freelancer's skills match>,
  "relevance_reasons": ["reason1", "reason2"],
  "red_flags": ["any concerns about the project"],
  "suggested_bid_amount": <number within budget range>,
  "suggested_timeline_days": <number>
}
```

**API call configuration for analysis:**
```javascript
{
  model: "gpt-4o-mini",
  response_format: { type: "json_object" },
  temperature: 0.3,
  max_tokens: 500,
  messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
}
```

#### Bid Proposal Generation Prompt

The prompt below is loaded from `ChatGPT prompt.md` at startup and stored as the default system prompt. Template variables (`{title}`, `{description}`, etc.) are injected at runtime before each API call.

```
System:
You are a bid-writing assistant for freelancer.com. Follow ALL of the rules
below exactly. Do not deviate from any of them.

User:
Write a bid for me with the provided project title and description so I can
use it to apply for a job on freelancer.com.

PROJECT:
- Title: {title}
- Description: {description}
- Budget: {budget_min} - {budget_max} {currency}
- Required Skills: {required_skills}

RULES:

1. TONE & STYLE
   - Use a tone somewhere between professional and casual — it must NOT feel
     AI-written. Write it as a serious person who genuinely cares about the
     project and the client. Leaning more casual helps with this.
   - Do NOT include any bold text (no ** or __).
   - The entire bid MUST be under 1400 characters.

2. OPENING
   - Start with: "Hello!, I am a US-based full stack developer..."
     (adjust the role label to match the project — frontend developer,
     backend developer, ecommerce developer, etc.)

3. BODY
   - Strongly emphasize that you read the project description carefully.
   - Mention relevant skills and approximately 10 years of experience
     with the relevant technologies.
   - Emphasize the project goal from the description to stand out.

4. EXAMPLES (include 3-4 if applicable)
   - Pick relevant, realistic example websites/apps that are not too famous.
   - Do NOT include user counts.
   - For Shopify projects specifically, use these examples:
       • https://www.tombihn.com
       • https://usabaseballshop.com
       • https://www.foriawellness.com
       • https://nanohearingaids.com
       • https://platinumtherapylights.com
     And mention participation in the Shopify Partners Program since 2016,
     having built many Shopify apps and themes.

5. CLARIFICATION QUESTIONS
   - After the bid, include 2-3 clarification questions.
   - They must be eye-catching, meaningful, and make the client feel you
     are the right fit — potentially driving them to open a chat with you.
   - Start with: "Could you please clarify the following questions to help
     me better understand the project?"

6. SIGN-OFF
   - End with the name "James Zappi".

IMPORTANT: The total output (bid + questions) MUST NOT exceed 1400 characters.
```

**API call configuration for proposal generation:**
```javascript
{
  model: "gpt-4o-mini",  // or user-configured model
  temperature: 0.7,       // creative but consistent
  max_tokens: 1000,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]
}
```

> **Customization**: The prompt template is stored in the `bidding_profiles.proposal_prompt` column (see updated schema below), allowing per-profile overrides. The default is loaded from `ChatGPT prompt.md` when creating a new profile.

---

## 6. Database Schema

### 6.1 Tables

```sql
-- User account and credentials
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  openai_api_key  TEXT,              -- encrypted; user-configurable from Settings UI
  openai_model    TEXT DEFAULT 'gpt-4o-mini',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Freelancer.com OAuth tokens (one active token set per user)
CREATE TABLE freelancer_tokens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,      -- encrypted at rest
  refresh_token   TEXT,               -- encrypted at rest
  token_type      TEXT,
  expires_at      DATETIME NOT NULL,
  scopes          TEXT,               -- space-separated scope list
  freelancer_uid  TEXT,               -- Freelancer.com user ID
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)                     -- one active token per user
);

-- Auto-bidding configuration (multiple profiles per user)
CREATE TABLE bidding_profiles (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  is_active             BOOLEAN DEFAULT false,
  -- Search criteria
  search_keywords       TEXT,          -- comma-separated keywords (e.g., "react,node,api")
  job_ids               TEXT,          -- JSON array of Freelancer job/skill IDs (e.g., [3,17,120])
  min_budget            DECIMAL(10,2),
  max_budget            DECIMAL(10,2),
  project_types         TEXT DEFAULT 'both',  -- "fixed", "hourly", "both"
  countries             TEXT,          -- JSON array of country codes (e.g., ["US","GB"])
  languages             TEXT,          -- JSON array of language codes (e.g., ["en"])
  -- Bidding parameters
  bid_amount_strategy   TEXT DEFAULT 'auto',  -- "fixed", "percentage", "auto" (AI decides)
  fixed_bid_amount      DECIMAL(10,2), -- used when strategy = "fixed"
  bid_percentage        DECIMAL(5,2) CHECK(bid_percentage BETWEEN 0 AND 100),  -- used when strategy = "percentage"
  default_period_days   INTEGER DEFAULT 7,
  milestone_percentage  INTEGER DEFAULT 100 CHECK(milestone_percentage BETWEEN 0 AND 100),
  -- AI settings
  min_relevance_score   INTEGER DEFAULT 70 CHECK(min_relevance_score BETWEEN 0 AND 100),
  proposal_prompt       TEXT,              -- custom OpenAI prompt override; NULL = use default from ChatGPT prompt.md
  -- Rate limiting
  max_bids_per_hour     INTEGER DEFAULT 5,
  max_bids_per_day      INTEGER DEFAULT 20,
  -- User profile context for AI proposal generation
  skills_summary        TEXT,          -- e.g., "Senior full-stack developer, 8 years React/Node"
  experience_summary    TEXT,          -- paragraph describing past work
  portfolio_highlights  TEXT,          -- notable projects/clients to mention in bids
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discovered projects (cached from Freelancer API)
CREATE TABLE projects (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  freelancer_project_id INTEGER UNIQUE NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  budget_min            DECIMAL(10,2),
  budget_max            DECIMAL(10,2),
  currency              TEXT DEFAULT 'USD',
  job_ids               TEXT,          -- JSON array (e.g., [3,17])
  owner_id              INTEGER,       -- Freelancer.com user ID (NOT a local FK)
  bid_count             INTEGER DEFAULT 0,
  time_submitted        DATETIME,
  status                TEXT DEFAULT 'active',  -- "active", "closed", "expired"
  project_type          TEXT,          -- "fixed", "hourly"
  relevance_score       INTEGER,       -- AI-computed 0-100 (NULL if not yet analyzed)
  ai_analysis           TEXT,          -- JSON blob from OpenAI analysis (NULL if not yet analyzed)
  last_checked_at       DATETIME,      -- last time we re-fetched status from Freelancer API
  discovered_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bids placed via the app
CREATE TABLE bids (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id            INTEGER REFERENCES bidding_profiles(id) ON DELETE SET NULL,
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_bid_id     INTEGER,       -- ID returned by Freelancer API after placement (NULL until placed)
  amount                DECIMAL(10,2) NOT NULL,
  period_days           INTEGER NOT NULL,
  milestone_percentage  INTEGER DEFAULT 100,
  proposal_text         TEXT NOT NULL,  -- AI-generated or user-edited proposal
  status                TEXT DEFAULT 'pending',  -- "pending", "placed", "awarded", "rejected", "retracted", "error"
  error_message         TEXT,           -- populated when status = "error"
  placed_at             DATETIME,       -- timestamp when Freelancer API confirmed placement
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity log for auditing and dashboard feed
CREATE TABLE activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,         -- "project_search", "project_analyzed", "bid_placed", "bid_error", "bid_retracted", "token_refreshed"
  details     TEXT,                  -- JSON with context (e.g., {"project_id": 123, "bid_amount": 50})
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for common queries
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_discovered ON projects(discovered_at);
CREATE INDEX idx_bids_user_status ON bids(user_id, status);
CREATE INDEX idx_bids_project ON bids(project_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id, created_at);
```

---

## 7. Backend Implementation

### 7.1 Project Structure

```
backend/
├── src/
│   ├── index.js                    # Express app entry point
│   ├── config/
│   │   ├── env.js                  # Environment variable validation
│   │   └── database.js             # Prisma client setup
│   ├── middleware/
│   │   ├── auth.js                 # JWT authentication middleware
│   │   ├── errorHandler.js         # Global error handler
│   │   └── rateLimiter.js          # API rate limiting
│   ├── routes/
│   │   ├── auth.routes.js          # Login, register, OAuth callback
│   │   ├── profile.routes.js       # Bidding profile CRUD
│   │   ├── projects.routes.js      # Project search and listing
│   │   ├── bids.routes.js          # Bid management
│   │   └── dashboard.routes.js     # Dashboard stats
│   ├── services/
│   │   ├── freelancer/
│   │   │   ├── client.js           # Freelancer API HTTP client
│   │   │   ├── auth.js             # OAuth flow handler
│   │   │   ├── projects.js         # Project search/retrieval
│   │   │   ├── bids.js             # Bid placement/management
│   │   │   ├── users.js            # User profile operations
│   │   │   └── messages.js         # Messaging operations
│   │   ├── openai/
│   │   │   ├── client.js           # OpenAI API client
│   │   │   ├── analyzer.js         # Project analysis
│   │   │   ├── proposalGenerator.js# Bid proposal generation
│   │   │   └── promptLoader.js     # Loads default prompt from ChatGPT prompt.md
│   │   └── bidding/
│   │       ├── engine.js           # Core auto-bidding pipeline
│   │       ├── scheduler.js        # Cron job management
│   │       └── scorer.js           # Project relevance scoring
│   ├── utils/
│   │   ├── logger.js               # Winston/Pino logger
│   │   └── tokenManager.js         # Token refresh logic
│   └── prisma/
│       └── schema.prisma           # Database schema
├── .env.example
├── package.json
└── vitest.config.js
```

### 7.2 Core Modules

#### Freelancer API Client (`services/freelancer/client.js`)

```javascript
// Wrapper around Axios for Freelancer API calls
// - Base URL configuration (sandbox vs production)
// - Automatic Freelancer-OAuth-V1 header injection
// - Token refresh on 401 responses
// - Rate limiting with exponential backoff on 429
// - Request/response logging
```

Key implementation details:
- Auth header: `{ 'Freelancer-OAuth-V1': accessToken }` (matches official SDK; see section 4.1 for fallback)
- Base URL: `https://www.freelancer.com/api/` (production) or `https://www.freelancer-sandbox.com/api/` (sandbox)
- Automatic retry with exponential backoff: 1s → 2s → 4s (max 3 retries on 429/5xx)
- Token auto-refresh: intercept 401 responses, refresh token, replay failed request
- Request logging: log method, endpoint, status code, and duration for debugging

#### Auto-Bidding Engine (`services/bidding/engine.js`)

The core pipeline that runs on a schedule:

```
1. SEARCH   → Query Freelancer API for new projects matching profile criteria
2. FILTER   → Deduplicate against already-seen projects in DB
3. ANALYZE  → Send each new project to OpenAI for analysis & scoring
4. QUALIFY  → Filter projects below minimum relevance score threshold
5. PROMPT   → Resolve prompt: use profile.proposal_prompt if set, else default from ChatGPT prompt.md
6. GENERATE → Inject project data into prompt template, call OpenAI to generate bid proposal
7. VALIDATE → Verify proposal is under 1400 chars; re-generate if too long
8. PRICE    → Calculate bid amount (fixed, percentage, or AI-suggested)
9. PLACE    → Submit bid via Freelancer API
10. LOG     → Record bid in database and activity log
```

#### Scheduler (`services/bidding/scheduler.js`)

```javascript
// Uses node-cron to run the bidding engine at configurable intervals
// Default: every 5 minutes
// Respects max_bids_per_hour and max_bids_per_day limits
// Locks to prevent concurrent runs
// Graceful shutdown handling
```

### 7.3 API Routes

#### Authentication Routes

```
POST   /api/auth/register            # Create local account
POST   /api/auth/login               # Login, returns JWT
GET    /api/auth/freelancer           # Initiate Freelancer OAuth flow
GET    /api/auth/freelancer/callback  # OAuth callback, stores tokens
POST   /api/auth/freelancer/refresh   # Manually refresh FL token
GET    /api/auth/status               # Check auth status for both services
```

#### Bidding Profile Routes

```
GET    /api/profiles                  # List all bidding profiles
POST   /api/profiles                  # Create new profile
GET    /api/profiles/:id              # Get profile details
PUT    /api/profiles/:id              # Update profile
DELETE /api/profiles/:id              # Delete profile
POST   /api/profiles/:id/activate     # Start auto-bidding
POST   /api/profiles/:id/deactivate   # Stop auto-bidding
```

#### Project Routes

```
GET    /api/projects                  # List discovered projects
GET    /api/projects/:id              # Get project with AI analysis
POST   /api/projects/search           # Manual project search
POST   /api/projects/:id/analyze      # Manually trigger AI analysis
```

#### Bid Routes

```
GET    /api/bids                      # List all placed bids
GET    /api/bids/:id                  # Get bid details
POST   /api/bids                      # Manually place a bid
PUT    /api/bids/:id/retract          # Retract a placed bid (calls PUT on Freelancer API)
GET    /api/bids/stats                # Bid statistics
```

#### Dashboard Routes

```
GET    /api/dashboard/stats           # Overall statistics
GET    /api/dashboard/activity        # Recent activity log
GET    /api/dashboard/performance     # Bid success rates
```

---

## 8. Frontend Implementation

### 8.1 Project Structure

```
frontend/
├── src/
│   ├── main.jsx                     # ReactDOM.createRoot entry
│   ├── App.jsx                      # React Router setup, route definitions
│   ├── pages/                       # Route-level page components
│   │   ├── DashboardPage.jsx
│   │   ├── ProfilesPage.jsx
│   │   ├── ProjectsPage.jsx
│   │   ├── BidsPage.jsx
│   │   ├── SettingsPage.jsx
│   │   └── LoginPage.jsx
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   └── Layout.jsx           # Wraps Sidebar + Header + <Outlet />
│   │   ├── Dashboard/
│   │   │   ├── StatsCards.jsx
│   │   │   ├── ActivityFeed.jsx
│   │   │   └── BidChart.jsx
│   │   ├── Profiles/
│   │   │   ├── ProfileList.jsx
│   │   │   ├── ProfileForm.jsx
│   │   │   └── ProfileCard.jsx
│   │   ├── Projects/
│   │   │   ├── ProjectList.jsx
│   │   │   ├── ProjectCard.jsx
│   │   │   └── ProjectDetail.jsx
│   │   ├── Bids/
│   │   │   ├── BidList.jsx
│   │   │   ├── BidCard.jsx
│   │   │   └── BidDetail.jsx
│   │   ├── Settings/
│   │   │   ├── FreelancerAuth.jsx
│   │   │   └── OpenAIConfig.jsx
│   │   └── common/
│   │       ├── Button.jsx
│   │       ├── Modal.jsx
│   │       ├── StatusBadge.jsx
│   │       └── LoadingSpinner.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useProfiles.js
│   │   ├── useProjects.js
│   │   └── useBids.js
│   ├── services/
│   │   └── api.js                   # Axios instance for backend API
│   ├── context/
│   │   └── AuthContext.jsx
│   └── utils/
│       └── formatters.js
├── index.html
├── tailwind.config.js
├── vite.config.js
└── package.json
```

**Routing** (React Router v6):
```
/login              → LoginPage
/                   → DashboardPage (default, requires auth)
/profiles           → ProfilesPage
/projects           → ProjectsPage
/bids               → BidsPage
/settings           → SettingsPage
```

### 8.2 Pages & Features

1. **Dashboard** - Overview stats (total bids, success rate, active profiles), activity feed, bid performance chart
2. **Bidding Profiles** - Create/edit/delete auto-bidding configurations with search keywords, budget ranges, skill filters, bid amount strategies, AI model selection
3. **Project Feed** - Browse discovered projects with relevance scores, AI analysis, manual bid trigger
4. **Bid History** - View all placed bids with status, proposal text, amounts; retract bids
5. **Settings** - Freelancer.com OAuth connection, OpenAI API key input, general preferences

---

## 9. Implementation Phases

### Phase 1: Foundation (Core Setup)

**Goal**: Get the project scaffolded, database ready, and Freelancer OAuth working.

- [ ] Initialize monorepo (`backend/` + `frontend/`)
- [ ] Set up Express.js backend with middleware (CORS, JSON parsing, error handler)
- [ ] Configure Prisma with SQLite and define schema
- [ ] Run database migrations
- [ ] Implement Freelancer OAuth 2.0 flow (authorize, callback, token storage, refresh)
- [ ] Build Freelancer API client with proper auth headers and retry logic
- [ ] Implement `GET /users/0.1/self` to verify token works
- [ ] Set up React + Vite + React Router v6 frontend with Tailwind CSS
- [ ] Build Settings page with Freelancer OAuth "Connect" button
- [ ] Set up environment variables (`.env` file)
- [ ] Copy `ChatGPT prompt.md` into the backend config and build `promptLoader.js` to read it as the default proposal prompt

**Environment Variables**:
```
# Backend
PORT=3001
DATABASE_URL="file:./dev.db"
JWT_SECRET=<random-secret>

# Freelancer.com
FREELANCER_CLIENT_ID=<from-developer-portal>
FREELANCER_CLIENT_SECRET=<from-developer-portal>
FREELANCER_REDIRECT_URI=http://localhost:3001/api/auth/freelancer/callback
FREELANCER_BASE_URL=https://www.freelancer-sandbox.com       # OAuth URLs derived as {BASE_URL}/oauth/authorise and /oauth/token
FREELANCER_API_BASE=https://www.freelancer-sandbox.com/api   # API calls: {API_BASE}/projects/0.1/...

# OpenAI
OPENAI_API_KEY=<your-openai-key>
OPENAI_MODEL=gpt-4o-mini
```

### Phase 2: Project Discovery

**Goal**: Search and retrieve projects from Freelancer.com.

- [ ] Implement project search service (`GET projects/0.1/projects/search`)
- [ ] Support all search filters (keywords, budget range, job IDs, project types, countries)
- [ ] Implement project detail retrieval (`GET projects/0.1/projects/{id}`)
- [ ] Implement jobs/skills listing (`GET projects/0.1/jobs`)
- [ ] Store discovered projects in database with deduplication
- [ ] Build Project Feed page in frontend with filtering and pagination
- [ ] Build Project Detail modal with full description and metadata

### Phase 3: AI Analysis & Proposal Generation

**Goal**: Integrate OpenAI to analyze projects and generate bid proposals.

- [ ] Set up OpenAI API client
- [ ] Build project analyzer (extract requirements, technologies, complexity)
- [ ] Build relevance scorer (compare project to user skills, return 0-100 score)
- [ ] Build bid proposal generator (personalized, compelling proposals)
- [ ] Build bid amount estimator (suggest competitive pricing)
- [ ] Store AI analysis results in projects table
- [ ] Display AI analysis and relevance scores in Project Feed
- [ ] Add "Generate Proposal" button on project detail view
- [ ] Add proposal preview/edit before placing bid

### Phase 4: Bidding System

**Goal**: Place bids manually and automatically.

- [ ] Implement bid placement service (`POST projects/0.1/bids`)
- [ ] Implement bid retrieval (`GET projects/0.1/bids`)
- [ ] Implement bid retraction (`PUT projects/0.1/bids/{id}` with retract action)
- [ ] Build manual bid placement flow (select project → review proposal → place bid)
- [ ] Build Bid History page with status tracking
- [ ] Build bidding profile CRUD (create/edit search criteria, bid parameters, AI settings)
- [ ] Implement auto-bidding engine pipeline (search → filter → analyze → qualify → generate → place)
- [ ] Implement scheduler with node-cron
- [ ] Add rate limiting (max bids per hour/day)
- [ ] Add profile activate/deactivate controls
- [ ] Build activity logging

### Phase 5: Dashboard & Polish

**Goal**: Monitoring, analytics, and production readiness.

- [ ] Build Dashboard with stat cards (total bids, success rate, spend)
- [ ] Build activity feed (recent searches, bids placed, errors)
- [ ] Build bid performance chart (bids over time, awarded vs rejected)
- [ ] Add notification system (bid placed, bid awarded, errors)
- [ ] Add OpenAI API key configuration in Settings
- [ ] Implement token auto-refresh background job
- [ ] Error handling and edge cases (expired tokens, API downtime, insufficient funds)
- [ ] Add request logging and monitoring
- [ ] Security audit (input sanitization, SQL injection prevention, secret handling)
- [ ] Write tests for core services (bidding engine, API clients)

### Phase 6: Advanced Features (Optional)

- [ ] Messaging integration - auto-respond when bid is awarded
- [ ] Bid templates - save and reuse successful proposal patterns
- [ ] Analytics - track which keywords/skills get most awards
- [ ] Bid status polling - periodically re-check placed bids for award/rejection status
- [ ] Project status refresh - periodic job to update cached project statuses (closed/expired)
- [ ] Budget tracking - track spending on bids and earnings
- [ ] Export bid history to CSV
- [ ] Dark mode

---

## 10. Key API Call Examples

> **Response format**: All Freelancer API responses return JSON with a top-level `result` key for successful GET/POST operations. PUT operations for bid actions return a `status` key instead.

### Search Projects

```javascript
const searchProjects = async (client, query, filters) => {
  const params = {
    query: query,
    sort_field: 'time_updated',
    or_search_query: true,
    active_only: true,
    'project_details[]': ['full_description', 'jobs'],  // expand response to include details
    limit: 20,
    offset: 0,
    ...filters
  };

  const response = await client.get('projects/0.1/projects/search', { params });
  // response.data = { status: "success", result: { projects: [...], total_count: N } }
  return response.data.result;
};
```

### Place a Bid (POST with JSON body)

```javascript
const placeBid = async (client, projectId, bidderId, proposal) => {
  const response = await client.post('projects/0.1/bids', {
    project_id: projectId,
    bidder_id: bidderId,
    amount: proposal.amount,
    period: proposal.periodDays,
    milestone_percentage: 100,
    description: proposal.text
  });
  // response.data = { status: "success", result: { id: 123, ... } }
  return response.data.result;
};
```

### Retract a Bid (PUT with query param)

```javascript
const retractBid = async (client, bidId) => {
  const response = await client.put(
    `projects/0.1/bids/${bidId}`,
    null,  // no JSON body
    {
      params: { action: 'retract' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  // response.data = { status: "success" }
  return response.data.status;
};
```

### Get Current User

```javascript
const getSelf = async (client) => {
  const response = await client.get('users/0.1/self');
  // response.data = { status: "success", result: { id: 123, username: "...", ... } }
  return response.data.result;
};
```

---

## 11. Security Considerations

1. **Never expose API keys in frontend** - All API calls go through backend
2. **Encrypt stored tokens** - Freelancer OAuth tokens encrypted at rest
3. **JWT for sessions** - Short-lived JWTs with refresh rotation
4. **Input validation** - Sanitize all user inputs (bid amounts, search queries)
5. **Rate limiting** - Both internal (bid limits) and external (API rate limits)
6. **CORS** - Restrict to frontend origin only
7. **Environment variables** - All secrets in `.env`, never committed
8. **Sandbox first** - Develop and test against `freelancer-sandbox.com` before production

---

## 12. Testing Strategy

| Type        | Tool                    | Coverage                                      |
|-------------|-------------------------|-----------------------------------------------|
| Unit        | Vitest                  | Services, utilities, scoring logic             |
| Integration | Vitest + Supertest      | API routes, database operations                |
| E2E         | Playwright (optional)   | Full user flows (login → configure → bid)     |
| API Mocks   | MSW (Mock Service Worker)| Mock Freelancer & OpenAI APIs during testing  |

---

## 13. Deployment Considerations

- **Backend**: Node.js on any VPS (DigitalOcean, Railway, Render) or Docker container
- **Frontend**: Static build deployed to Vercel, Netlify, or served by Express
- **Database**: PostgreSQL for production (migrate from SQLite)
- **Scheduler**: Runs within the Node.js process (node-cron); for scale, use external job queue (BullMQ + Redis)
- **Monitoring**: PM2 for process management, logging to file or external service

---

## 14. References

- [Freelancer Developer Portal](https://developers.freelancer.com/)
- [Freelancer Python SDK (GitHub)](https://github.com/freelancer/freelancer-sdk-python)
- [Freelancer OAuth Demo App](https://github.com/freelancer/freelancer-oauth-demo-app)
- [Freelancer OAuth2 PHP Client](https://github.com/sydefz/freelancer-oauth2-client)
- [Freelancer API Integration Guide (JS)](https://rollout.com/integration-guides/freelancer/sdk/step-by-step-guide-to-building-a-freelancer-api-integration-in-js)
- [Freelancer API Essentials](https://rollout.com/integration-guides/freelancer/api-essentials)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Freelancer Sandbox Dev Config](https://www.freelancer-sandbox.com/developer-user-config/)

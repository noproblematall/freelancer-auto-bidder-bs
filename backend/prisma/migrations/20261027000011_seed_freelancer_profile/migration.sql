-- Default freelancer profile (AI context) for accounts that have not written one.
-- Snapshot of DEFAULT_FREELANCER_PROFILE from prisma/seed.js; an account with any
-- of the three fields filled in is left untouched.
UPDATE "users" SET
  "skills_summary" = 'Full-stack web developer. Frontend: React, Next.js, Vue, TypeScript, Tailwind, responsive and accessible UI. Backend: Node.js (Express, NestJS), Python (Django, FastAPI), PHP (Laravel), REST and GraphQL APIs, authentication, background jobs. Databases: PostgreSQL, MySQL, MongoDB, Redis. E-commerce: Shopify (themes, Liquid, custom apps), WooCommerce, Stripe and PayPal integrations. CMS: WordPress custom themes and plugins, headless CMS setups. Integrations and automation: third-party APIs, webhooks, data scraping, scheduled jobs, Zapier and Make. DevOps: Docker, AWS, Vercel, CI/CD, monitoring, performance and SEO optimisation.',
  "experience_summary" = 'About 10 years building and maintaining web products for small businesses, agencies, and startups, from first wireframe to production and ongoing support. Typical work: custom web apps and client portals, SaaS dashboards, Shopify and WooCommerce stores, WordPress sites and landing pages, API integrations between tools such as CRMs, payment providers, shipping, and marketing platforms, bug fixing and performance tuning on existing codebases, and migrations of legacy sites to modern stacks. Comfortable taking over code someone else wrote and leaving it better documented than it was found. Works directly with clients: clear written updates, realistic estimates, a short demo at each milestone, and no surprises on scope or cost.',
  "portfolio_highlights" = 'Multi-vendor marketplace on Next.js and Node with Stripe Connect payouts, vendor dashboards, and order tracking.
Shopify Plus store rebuild: custom theme, subscription app integration, and checkout customisation, with page load time roughly halved.
Booking and scheduling platform for a service business: calendar sync, automated email and SMS reminders, admin reporting.
Internal CRM and quoting tool for a B2B company that replaced spreadsheets: role-based access, PDF quotes, accounting software integration.
WordPress to React migration for a content site with thousands of posts, preserving URLs and search rankings.
Real-time operations dashboard pulling several third-party APIs into one view with alerting.'
WHERE "skills_summary" IS NULL AND "experience_summary" IS NULL AND "portfolio_highlights" IS NULL;

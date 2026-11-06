-- Default freelancer profile: the kinds of projects move from portfolio_highlights
-- into experience_summary, and the portfolio ships empty for the owner's real
-- projects. Only accounts still holding the previous default, untouched, are
-- updated; anything the owner edited is left alone.
UPDATE "users" SET
  "experience_summary" = '- About 10 years building web and mobile products for small businesses, agencies and startups, and the last few years adding AI features to them.
- Web: custom apps and client portals, SaaS dashboards, multi-vendor marketplaces with split payouts, booking and scheduling platforms, internal tools and CRMs that replace spreadsheets, real-time operations dashboards, and API integrations with CRMs, payment, shipping and marketing tools.
- E-commerce: Shopify and WooCommerce stores built from scratch or rebuilt, custom themes, subscription and checkout customisation, and performance work that typically halves load times.
- Mobile: cross-platform iOS and Android apps for marketplaces, food delivery with live order tracking, bookings and loyalty programs, from design handoff to store submission and post-launch updates; companion apps for existing web products.
- AI: customer-support assistants with retrieval over help docs and order data, contract and document analysis tools with reviewer UIs, fine-tuned classification models that route and flag content, content and proposal generation tools, recommendation models, and AI agents that automate back-office work.
- Maintenance: bug fixing, performance tuning, security hardening, and migrations of legacy sites (for example WordPress to React) to modern stacks while preserving URLs and search rankings. Comfortable taking over someone else''s code.
- Way of working: clear written updates, realistic estimates, a short demo at each milestone, and no surprises on scope or cost.',
  "portfolio_highlights" = NULL
WHERE "skills_summary" = '- Full-stack web and mobile developer with a strong AI and machine learning background.
- Frontend: React, Next.js, Vue, TypeScript, Tailwind, responsive and accessible UI.
- Backend: Node.js (Express, NestJS), Python (Django, FastAPI), PHP (Laravel), REST and GraphQL APIs, auth, background jobs.
- Mobile: React Native and Expo, Flutter, native iOS (Swift, SwiftUI) and Android (Kotlin), push notifications, offline sync, in-app purchases, App Store and Google Play releases.
- AI and ML: LLM apps with OpenAI, Anthropic and open-source models, RAG pipelines, vector search (pgvector, Pinecone), prompt design, fine-tuning and model training with PyTorch and scikit-learn, chatbots and AI agents, data labeling and evaluation.
- Data: PostgreSQL, MySQL, MongoDB, Redis, ETL pipelines, reporting dashboards.
- E-commerce: Shopify (themes, Liquid, custom apps), WooCommerce, Stripe and PayPal.
- CMS: WordPress themes and plugins, headless CMS.
- Integrations and automation: third-party APIs, webhooks, scraping, scheduled jobs, Zapier, Make, n8n.
- DevOps: Docker, AWS, GCP, Vercel, CI/CD, monitoring, performance and SEO.'
  AND "experience_summary" = '- About 10 years building web products for small businesses, agencies and startups, and the last few years adding AI features to them.
- Web: custom apps and client portals, SaaS dashboards, Shopify and WooCommerce stores, WordPress sites, and API integrations with CRMs, payment, shipping and marketing tools.
- Mobile: cross-platform iOS and Android apps for marketplaces, bookings, delivery tracking and loyalty programs, from design handoff to store submission and post-launch updates; companion apps for existing web products.
- AI: customer-support and sales chatbots trained on company data, document Q&A with retrieval (RAG), content and proposal generation tools, classification and recommendation models, fine-tuning on client datasets, and AI agents that automate back-office work.
- Maintenance: bug fixing, performance tuning, security hardening, and migrations of legacy sites to modern stacks. Comfortable taking over someone else''s code.
- Way of working: clear written updates, realistic estimates, a short demo at each milestone, and no surprises on scope or cost.'
  AND "portfolio_highlights" = '- AI support assistant for an online retailer: RAG over help docs and order data, resolving most routine tickets without a human.
- Contract analysis tool for a law practice: LLM-based extraction and summarisation with a reviewer UI and audit trail.
- Fine-tuned classification model for a marketplace that routes listings to the right category and flags policy issues.
- Food delivery app for iOS and Android (React Native) with live order tracking, push notifications, Stripe payments and a restaurant-side dashboard.
- Multi-vendor marketplace on Next.js and Node with Stripe Connect payouts, vendor dashboards and order tracking.
- Shopify Plus store rebuild: custom theme, subscription app integration and checkout customisation; load time roughly halved.
- Booking and scheduling platform: calendar sync, automated email and SMS reminders, admin reporting.
- Internal CRM and quoting tool replacing spreadsheets: role-based access, PDF quotes, accounting integration.
- Real-time operations dashboard pulling several third-party APIs into one view with alerting.';

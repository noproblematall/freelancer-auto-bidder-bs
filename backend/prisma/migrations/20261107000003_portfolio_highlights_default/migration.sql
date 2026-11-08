-- Default portfolio highlights: the owner's sample sites grouped by skill
-- (see prisma/seed.js). Only accounts with an empty portfolio are filled in;
-- anything the owner wrote is kept.
UPDATE "users" SET "portfolio_highlights" = 'Shopify (Shopify Partner since 2018, themes and apps)
- https://www.tombihn.com
- https://usabaseballshop.com
- https://www.foriawellness.com
- https://nanohearingaids.com
- https://platinumtherapylights.com
- https://www.hotelcollection.com

PHP and Laravel with React, Vue or Angular
- https://alchemy.team
- https://sparktutoring.team
- https://serwish.ge
- https://metrix.ge
- https://hogar.zurich.ar.onmtc.com
- https://movilidad.zurich.ar.onmtc.com'
WHERE "portfolio_highlights" IS NULL OR TRIM("portfolio_highlights") = '';

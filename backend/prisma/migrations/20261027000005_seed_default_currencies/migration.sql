-- Default excluded currencies added to the shared-profile seed. Back-fill accounts
-- that were seeded before this list existed (no currencies excluded yet); accounts
-- that already exclude any currency are left as they are.
UPDATE "users"
SET "shared_profile" = json_set("shared_profile", '$.excludedCurrencies', json('["INR","PKR","BDT","LKR","NPR","IDR","PHP","VND","EGP","NGN","KES","GHS","RUB","UAH"]'))
WHERE "shared_profile" IS NOT NULL
  AND COALESCE(json_array_length(json_extract("shared_profile", '$.excludedCurrencies')), 0) = 0;

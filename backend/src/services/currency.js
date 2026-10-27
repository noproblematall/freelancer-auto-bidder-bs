const axios = require('axios');
const logger = require('../utils/logger');

// USD → other-currency conversion for bid pricing. Profile amounts (fixed bid,
// fixed/default hourly rate) are entered in USD, but projects bid in their own
// currency — without conversion, "$50/hr" silently became £50/hr (~$63) on a
// GBP project.
//
// Rates come from open.er-api.com (free, no API key, ~160 currencies, updated
// daily) and are cached in memory for 12 hours. Failure policy: fall back to
// the unconverted number — that is exactly the pre-conversion behavior, and a
// bid must never be skipped because a rate feed hiccuped.

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let cache = { rates: null, fetchedAt: 0 };

async function getRates() {
  if (cache.rates && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rates;
  const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
  if (data?.result !== 'success' || !data?.rates) {
    throw new Error('rate feed returned no usable data');
  }
  cache = { rates: data.rates, fetchedAt: Date.now() };
  logger.info(`Currency: refreshed USD exchange rates (${Object.keys(data.rates).length} currencies)`);
  return cache.rates;
}

/**
 * Convert a USD amount into `currency`.
 * Returns { amount, rate, converted } — on any failure (unknown currency,
 * feed down) the original amount comes back with converted:false.
 */
async function convertFromUSD(amountUSD, currency) {
  const code = String(currency || 'USD').toUpperCase();
  if (!amountUSD || code === 'USD') return { amount: amountUSD, rate: 1, converted: false };
  try {
    const rates = await getRates();
    const rate = rates[code];
    if (!rate || rate <= 0) {
      logger.warn(`Currency: no exchange rate for ${code} — using the USD number as-is`);
      return { amount: amountUSD, rate: 1, converted: false };
    }
    return { amount: Math.round(amountUSD * rate * 100) / 100, rate, converted: true };
  } catch (err) {
    logger.warn(`Currency: rate fetch failed (${err.message}) — using the USD number as-is`);
    return { amount: amountUSD, rate: 1, converted: false };
  }
}

/**
 * Round a converted hourly rate to a clean, human-readable number.
 * Currency conversion produces awkward values like 71.02 CAD/hr or
 * 37.43 GBP/hr — freelancers rarely bid at rates like that on the web UI,
 * so snap to the nearest 5 for amounts ≥ 5. Amounts below 5 keep integer
 * precision (so a $2/hr rate doesn't round to $0).
 */
function roundHourlyRate(amount) {
  if (!amount || amount <= 0) return amount;
  if (amount < 5) return Math.round(amount);
  return Math.round(amount / 5) * 5;
}

module.exports = { convertFromUSD, roundHourlyRate };

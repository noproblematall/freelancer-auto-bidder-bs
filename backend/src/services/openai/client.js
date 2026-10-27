const axios = require('axios');
const logger = require('../../utils/logger');

const MAX_RETRIES = 2;
const RETRY_DELAYS = [2000, 5000];
const FALLBACK_MODEL = 'gpt-5.4-nano';

// Cheap model for high-volume classification/extraction (project scoring, meeting
// detection) — passed per-call via chat({ model }). Proposal writing uses the
// user's chosen model, where quality actually matters. Override with env if needed.
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4-nano';

// Error codes that indicate a billing/quota problem — not transient, won't resolve on retry.
// In these cases we automatically fall back to the cheapest current model (gpt-5.4-nano).
const BILLING_ERROR_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'account_deactivated',
  'quota_exceeded',
]);

function isBillingError(err) {
  const code = err.response?.data?.error?.code;
  const type = err.response?.data?.error?.type;
  const status = err.response?.status;
  return (
    BILLING_ERROR_CODES.has(code) ||
    type === 'insufficient_quota' ||
    status === 402
  );
}

function createOpenAIClient(apiKey, model = 'gpt-5.4-mini') {
  const client = axios.create({
    baseURL: 'https://api.openai.com/v1',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  async function chatWithModel(activeModel, { messages, temperature = 0.7, max_tokens = 1000, response_format }) {
    // gpt-5.x, o1, o3, o4 reasoning families require `max_completion_tokens`
    // instead of `max_tokens`, and only accept the default temperature (1).
    // Normalise both here so all callers keep passing max_tokens/temperature
    // and don't need to know which model is active.
    const isReasoningModel = /^(gpt-5|o1|o3|o4)/i.test(activeModel);
    const body = { model: activeModel, messages };
    if (isReasoningModel) {
      body.max_completion_tokens = max_tokens;
    } else {
      body.max_tokens = max_tokens;
      body.temperature = temperature;
    }
    if (response_format) body.response_format = response_format;

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const start = Date.now();
        const response = await client.post('/chat/completions', body);
        const duration = Date.now() - start;

        const content = response.data.choices?.[0]?.message?.content || '';
        const usage = response.data.usage || {};
        logger.info(`OpenAI ${activeModel} (${duration}ms) — ${usage.prompt_tokens || '?'}+${usage.completion_tokens || '?'} tokens`);

        return { content, usage, modelUsed: activeModel };
      } catch (err) {
        lastError = err;
        const status = err.response?.status;

        // Billing/quota errors are not retryable — propagate immediately
        if (isBillingError(err)) throw err;

        if (status === 429 || (status && status >= 500)) {
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt];
            logger.warn(`OpenAI ${status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }

        const errorMsg = err.response?.data?.error?.message || err.message;
        logger.error(`OpenAI API error: ${errorMsg}`);
        throw new Error(`OpenAI API error: ${errorMsg}`);
      }
    }
    throw lastError;
  }

  async function chat(options) {
    // Optional per-call model override (e.g. a cheaper model for high-volume
    // project analysis); defaults to the client's configured model.
    const activeModel = options.model || model;
    try {
      return await chatWithModel(activeModel, options);
    } catch (err) {
      // If the active model hit a billing/quota limit and it isn't already the fallback,
      // automatically retry with gpt-5.4-nano (much cheaper — helps survive low-balance periods).
      // The caller receives { modelUsed: 'gpt-5.4-nano' } so it can log the switch clearly.
      if (isBillingError(err) && activeModel !== FALLBACK_MODEL) {
        const reason = err.response?.data?.error?.message || err.message;
        logger.warn(
          `OpenAI quota/billing error on ${activeModel}: "${reason}". ` +
          `Automatically falling back to ${FALLBACK_MODEL} for this request. ` +
          `To restore ${activeModel}, add credits at platform.openai.com/account/billing.`
        );
        return await chatWithModel(FALLBACK_MODEL, options);
      }
      const errorMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`OpenAI API error: ${errorMsg}`);
    }
  }

  return { chat, model };
}

module.exports = { createOpenAIClient, ANALYSIS_MODEL };

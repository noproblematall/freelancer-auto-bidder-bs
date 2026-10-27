const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

function createFreelancerClient(accessToken) {
  const client = axios.create({
    baseURL: env.freelancer.apiBase,
    headers: {
      'Freelancer-OAuth-V1': accessToken,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  client.interceptors.request.use((config) => {
    config._startTime = Date.now();
    logger.debug(`FL API → ${config.method.toUpperCase()} ${config.url}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      const duration = Date.now() - response.config._startTime;
      logger.debug(`FL API ← ${response.status} (${duration}ms)`);
      return response;
    },
    async (error) => {
      const config = error.config;
      const status = error.response?.status;
      const duration = Date.now() - (config._startTime || Date.now());

      logger.warn(`FL API ← ${status || 'NETWORK_ERROR'} (${duration}ms) ${config.url}`);

      // Never retry POST requests — they are not idempotent on Freelancer's API.
      // Retrying a failed POST /bids/ could place a duplicate bid on the same project.
      const isPost = config.method?.toLowerCase() === 'post';
      if (!isPost && (status === 429 || status >= 500) && (!config._retryCount || config._retryCount < MAX_RETRIES)) {
        config._retryCount = (config._retryCount || 0) + 1;
        const delay = RETRY_DELAYS[config._retryCount - 1] || 4000;
        logger.info(`Retrying in ${delay}ms (attempt ${config._retryCount}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return client.request(config);
      }

      throw error;
    }
  );

  return client;
}

module.exports = { createFreelancerClient };

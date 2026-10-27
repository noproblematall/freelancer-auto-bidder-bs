const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

function getAuthorizeUrl(state, { clientId, redirectUri } = {}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri || env.freelancer.redirectUri,
    scope: 'basic',
    advanced_scopes: 'fln:project_manage',
    prompt: 'select_account',
    state,
  });
  return `${env.freelancer.oauthBase}/oauth/authorise?${params.toString()}`;
}

async function exchangeCodeForToken(code, { clientId, clientSecret, redirectUri } = {}) {
  const tokenUrl = `${env.freelancer.oauthBase}/oauth/token`;
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || env.freelancer.redirectUri,
  });

  logger.info(`Exchanging auth code for token at ${tokenUrl}`);
  const response = await axios.post(tokenUrl, data.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
}

async function refreshAccessToken(refreshToken, { clientId, clientSecret } = {}) {
  const tokenUrl = `${env.freelancer.oauthBase}/oauth/token`;
  const data = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  logger.info('Refreshing Freelancer access token');
  const response = await axios.post(tokenUrl, data.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, refreshAccessToken };

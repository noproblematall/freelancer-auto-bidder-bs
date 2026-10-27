const logger = require('../../utils/logger');

async function getSelf(client) {
  const response = await client.get('/users/0.1/self');
  logger.info('Fetched Freelancer user profile');
  return response.data.result;
}

async function getUserById(client, userId) {
  const response = await client.get(`/users/0.1/users/${userId}`);
  return response.data.result;
}

module.exports = { getSelf, getUserById };

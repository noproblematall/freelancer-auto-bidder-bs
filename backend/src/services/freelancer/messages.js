/**
 * Serialize params without percent-encoding bracket keys.
 * Freelancer's PHP API expects literal bracket notation:
 *   threads_details[last_message]=true
 * Axios's default serializer would encode brackets as %5B%5D, which some
 * servers don't accept. This serializer keeps them as-is.
 */
function serializeParams(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) =>
      `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(v)}`
    )
    .join('&');
}

/**
 * Fetch threads updated since a given Unix timestamp (seconds).
 * Uses GET /api/messages/0.1/threads with from_updated_time filter.
 *
 * NOTE: The API uses `limit` (not `count`) to return thread objects.
 *       Using `count` returns only a scalar total, not thread data.
 *       Use `message_details=true` (not threads_details[last_message]) to get messages.
 *       Use `user_details=true` to get a `users` map keyed by user ID in the result.
 *
 * @param {import('axios').AxiosInstance} client - Authenticated Freelancer API client
 * @param {number} fromTimestampSec - Unix timestamp in seconds
 * @param {number} limit - Max threads to return
 * @returns {Promise<{ threads: Array, users: Object }>}
 */
async function getThreadsSince(client, fromTimestampSec, limit = 20) {
  const params = {
    limit,
    from_updated_time: fromTimestampSec,
    message_details: true,   // populates thread.messages[] with message objects
    user_details: true,       // populates result.users map: { [uid]: userObject }
  };

  const response = await client.get('/messages/0.1/threads', {
    params,
    paramsSerializer: serializeParams,
  });

  const result = response.data?.result;
  return {
    threads: result?.threads || [],
    users: result?.users || {},
  };
}

/**
 * Fetch messages from a specific thread.
 *
 * @param {import('axios').AxiosInstance} client
 * @param {number} threadId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getMessagesFromThread(client, threadId, limit = 5) {
  const params = {
    'threads[]': threadId,
    limit,
    user_details: true,
  };

  const response = await client.get('/messages/0.1/messages', {
    params,
    paramsSerializer: serializeParams,
  });

  const result = response.data?.result;
  return result?.messages || [];
}

module.exports = { getThreadsSince, getMessagesFromThread };

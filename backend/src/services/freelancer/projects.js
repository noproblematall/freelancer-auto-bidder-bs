const logger = require('../../utils/logger');

async function searchProjects(client, filters = {}) {
  const params = {
    sort_field: filters.sortField || 'time_updated',
    active_only: true,
    limit: filters.limit || 20,
    offset: filters.offset || 0,
    // Boolean projections (per Freelancer API guide)
    full_description: true,
    job_details: true,
    location_details: true,
    owner_info: true,
    user_details: true,
    users: true,
    // Employer facts for the client score: payment/deposit status and the
    // employer-side reputation (reviews, rating, projects posted/completed).
    user_status: true,
    user_employer_reputation: true,
    user_country_details: true,
  };

  if (filters.query) params.query = filters.query;
  if (filters.projectTypes && filters.projectTypes.length) params['project_types[]'] = filters.projectTypes;
  if (filters.minBudget) params.min_avg_price = filters.minBudget;
  if (filters.maxBudget) params.max_avg_price = filters.maxBudget;
  if (filters.jobIds && filters.jobIds.length) params['jobs[]'] = filters.jobIds;
  if (filters.countries && filters.countries.length) params['countries[]'] = filters.countries;
  if (filters.languages && filters.languages.length) params['languages[]'] = filters.languages;

  const response = await client.get('/projects/0.1/projects/active', { params });
  logger.info(`Searched projects: ${response.data.result.total_count} results`);
  return response.data.result;
}

async function getProjectById(client, projectId) {
  const response = await client.get(`/projects/0.1/projects/${projectId}`, {
    params: {
      'full_description': true,
      'job_details': true,
      'location_details': true,
      'owner_info': true,
      'user_details': true,
    },
  });

  const result = response.data.result;

  // Debug: log location-related fields to verify owner_info works
  logger.info(`[getProjectById #${projectId}] location debug: ${JSON.stringify({
    owner_info_country: result.owner_info?.country ?? null,
    owner_info_city: result.owner_info?.city ?? null,
    location_country: result.location?.country?.code ?? null,
    owner_id: result.owner_id ?? null,
  })}`);

  return result;
}

// Current status of a batch of projects (active | closed | frozen | …) and
// their selected (awarded) bids, used by outcomeSync to tell lost bids from
// pending ones. Freelancer accepts up to ~100 ids per call.
async function getProjectsByIds(client, projectIds) {
  const ids = (projectIds || []).filter(Boolean);
  if (!ids.length) return [];
  const response = await client.get('/projects/0.1/projects/', {
    params: { 'projects[]': ids, selected_bids: true, limit: ids.length },
  });
  return response.data?.result?.projects || [];
}

// A client's posted projects (any status), newest first, with their selected
// (awarded) bids and skills: the client explorer's project history.
async function getProjectsByOwner(client, ownerId, { limit = 40, offset = 0 } = {}) {
  const response = await client.get('/projects/0.1/projects/', {
    params: {
      'owners[]': [ownerId], limit, offset,
      sort_field: 'time_submitted', reverse_sort: false,
      selected_bids: true, job_details: true, full_description: false,
    },
  });
  const result = response.data?.result || {};
  return { projects: result.projects || [], totalCount: result.total_count || null };
}

// One Freelancer user with employer reputation and verifications.
async function getEmployer(client, userId) {
  const response = await client.get('/users/0.1/users/', {
    params: { 'users[]': [userId], employer_reputation: true, status: true, country_details: true, display_info: true, avatar: true, location_details: true },
  });
  const users = response.data?.result?.users || {};
  return users[String(userId)] || null;
}

async function getJobs(client, jobIds = null) {
  const params = { seo_details: false, lang: 'en' };
  if (jobIds && jobIds.length) params['job_ids[]'] = jobIds;

  const response = await client.get('/projects/0.1/jobs', { params });
  return response.data.result;
}

module.exports = { searchProjects, getProjectById, getProjectsByIds, getProjectsByOwner, getEmployer, getJobs };

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

async function getJobs(client, jobIds = null) {
  const params = { seo_details: false, lang: 'en' };
  if (jobIds && jobIds.length) params['job_ids[]'] = jobIds;

  const response = await client.get('/projects/0.1/jobs', { params });
  return response.data.result;
}

module.exports = { searchProjects, getProjectById, getJobs };

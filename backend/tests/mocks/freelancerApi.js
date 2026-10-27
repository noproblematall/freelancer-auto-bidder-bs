import { http, HttpResponse } from 'msw';

const FREELANCER_API_BASE = 'https://www.freelancer.com/api';

export const freelancerHandlers = [
  // Search projects
  http.get(`${FREELANCER_API_BASE}/projects/0.1/projects/search`, () => {
    return HttpResponse.json({
      status: 'success',
      result: {
        projects: [
          {
            id: 123456,
            title: 'Build a React Dashboard',
            description: 'Need a dashboard built with React and Node.js',
            budget: { minimum: 100, maximum: 500 },
            currency: { code: 'USD' },
            jobs: [{ id: 3, name: 'JavaScript' }, { id: 17, name: 'React.js' }],
            owner_id: 999,
            bid_stats: { bid_count: 5 },
            time_submitted: Date.now() / 1000,
            status: 'active',
            type: 'fixed',
          },
        ],
        total_count: 1,
      },
    });
  }),

  // Get project details
  http.get(`${FREELANCER_API_BASE}/projects/0.1/projects/:id`, ({ params }) => {
    return HttpResponse.json({
      status: 'success',
      result: {
        id: parseInt(params.id),
        title: 'Build a React Dashboard',
        description: 'Need a dashboard built with React and Node.js. Must have clean UI and be responsive.',
        budget: { minimum: 100, maximum: 500 },
        currency: { code: 'USD' },
        jobs: [{ id: 3, name: 'JavaScript' }, { id: 17, name: 'React.js' }],
        owner_id: 999,
        bid_stats: { bid_count: 5 },
        time_submitted: Date.now() / 1000,
        status: 'active',
        type: 'fixed',
      },
    });
  }),

  // Place bid
  http.post(`${FREELANCER_API_BASE}/projects/0.1/bids/`, async ({ request }) => {
    const body = await request.json();

    return HttpResponse.json({
      status: 'success',
      result: {
        id: 78910,
        project_id: body.project_id,
        bidder_id: body.bidder_id,
        amount: body.amount,
        period: body.period,
        milestone_percentage: body.milestone_percentage,
        description: body.description,
        time_submitted: Date.now() / 1000,
      },
    });
  }),

  // Retract bid
  http.put(`${FREELANCER_API_BASE}/projects/0.1/bids/:id`, ({ params }) => {
    return HttpResponse.json({
      status: 'success',
    });
  }),

  // Get user self
  http.get(`${FREELANCER_API_BASE}/users/0.1/self`, () => {
    return HttpResponse.json({
      status: 'success',
      result: {
        id: 12345,
        username: 'testuser',
        email: 'test@example.com',
      },
    });
  }),

  // Get jobs/skills
  http.get(`${FREELANCER_API_BASE}/projects/0.1/jobs`, () => {
    return HttpResponse.json({
      status: 'success',
      result: {
        jobs: [
          { id: 3, name: 'JavaScript' },
          { id: 17, name: 'React.js' },
          { id: 120, name: 'Node.js' },
        ],
      },
    });
  }),
];

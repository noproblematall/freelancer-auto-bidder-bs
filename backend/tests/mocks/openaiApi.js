import { http, HttpResponse } from 'msw';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

export const openaiHandlers = [
  // Chat completions endpoint (for analysis and proposal generation)
  http.post(`${OPENAI_API_BASE}/chat/completions`, async ({ request }) => {
    const body = await request.json();
    const isJsonMode = body.response_format?.type === 'json_object';
    const messages = body.messages || [];
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    // Detect if this is an analysis request (JSON mode) or proposal generation
    if (isJsonMode) {
      // Return project analysis
      return HttpResponse.json({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now() / 1000,
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                key_requirements: ['React dashboard', 'Clean UI', 'Responsive design'],
                technologies: ['React', 'Node.js', 'JavaScript'],
                estimated_hours: 40,
                complexity: 'medium',
                relevance_score: 85,
                relevance_reasons: [
                  'Matches React and Node.js expertise',
                  'Budget is within acceptable range',
                  'Project requirements are clear',
                ],
                red_flags: [],
                suggested_bid_amount: 350,
                suggested_timeline_days: 7,
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 150,
          total_tokens: 250,
        },
      });
    } else {
      // Return proposal generation
      return HttpResponse.json({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now() / 1000,
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                'Hello! I am a US-based full stack developer with 10 years of experience building React dashboards. I read your project description carefully and understand you need a clean, responsive dashboard. I have built similar dashboards for clients and can deliver exactly what you need.\n\nCould you please clarify:\n1. What specific data will the dashboard display?\n2. Do you have a design mockup or style guide?\n3. Will this integrate with an existing backend?\n\nJames Zappi',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 120,
          total_tokens: 320,
        },
      });
    }
  }),
];

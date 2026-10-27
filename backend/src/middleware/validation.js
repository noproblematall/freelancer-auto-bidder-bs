const Joi = require('joi');

const schemas = {
  // Manual bid validation
  createBid: Joi.object({
    projectId: Joi.number().integer().positive().required(),
    amount: Joi.number().positive().min(1).max(1000000).required(),
    periodDays: Joi.number().integer().min(1).max(365).required(),
    milestonePercentage: Joi.number().integer().min(0).max(100).default(100),
    proposalText: Joi.string().min(50).max(5000).required(),
  }),

  // Profile creation/update
  createProfile: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    searchKeywords: Joi.string().max(500).allow(null, ''),
    jobIds: Joi.string().allow(null, ''),
    minBudget: Joi.number().min(0).allow(null),
    maxBudget: Joi.number().min(0).allow(null),
    projectTypes: Joi.string().valid('fixed', 'hourly', 'both').default('both'),
    countries: Joi.string().allow(null, ''),
    excludedCountries: Joi.string().allow(null, ''),
    languages: Joi.string().allow(null, ''),
    bidAmountStrategy: Joi.string().valid('fixed', 'percentage', 'auto').default('auto'),
    fixedBidAmount: Joi.number().min(0).allow(null),
    bidPercentage: Joi.number().min(0).max(100).allow(null),
    defaultPeriodDays: Joi.number().integer().min(1).max(365).default(7),
    milestonePercentage: Joi.number().integer().min(0).max(100).default(100),
    minRelevanceScore: Joi.number().integer().min(0).max(100).default(70),
    maxBidsPerHour: Joi.number().integer().min(1).max(1000).default(1000),
    maxBidsPerDay: Joi.number().integer().min(1).max(10000).default(10000),
    proposalPrompt: Joi.string().max(5000).allow(null, ''),
    skillsSummary: Joi.string().max(1000).allow(null, ''),
    experienceSummary: Joi.string().max(2000).allow(null, ''),
    portfolioHighlights: Joi.string().max(2000).allow(null, ''),
  }),

  // Project search
  searchProjects: Joi.object({
    query: Joi.string().max(500).allow(null, ''),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

/**
 * Validation middleware factory
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details, requestId: req.id });
    }

    req.validatedBody = value;
    next();
  };
}

module.exports = { schemas, validate };

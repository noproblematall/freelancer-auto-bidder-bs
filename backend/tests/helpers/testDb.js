import prisma from '../../src/config/database.js';

/**
 * Clear all data from test database tables
 */
export async function clearDatabase() {
  const tables = ['ActivityLog', 'Bid', 'BiddingProfile', 'Project', 'FreelancerToken', 'User'];

  for (const table of tables) {
    await prisma[table.charAt(0).toLowerCase() + table.slice(1)].deleteMany();
  }
}

/**
 * Create a test user
 */
export async function createTestUser(overrides = {}) {
  const bcrypt = await import('bcryptjs');
  const hashedPassword = await bcrypt.hash('password123', 10);

  return await prisma.user.create({
    data: {
      email: overrides.email || 'test@example.com',
      passwordHash: hashedPassword,
      openaiApiKey: overrides.openaiApiKey || null,
      openaiModel: overrides.openaiModel || 'gpt-5.4-mini',
      ...overrides,
    },
  });
}

/**
 * Create a test Freelancer token for a user
 */
export async function createTestFreelancerToken(userId, overrides = {}) {
  const { encrypt } = await import('../../src/utils/tokenManager.js');

  const accessToken = encrypt(overrides.accessToken || 'test-access-token');
  const refreshToken = encrypt(overrides.refreshToken || 'test-refresh-token');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 60); // 60 days from now

  return await prisma.freelancerToken.create({
    data: {
      userId,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresAt: overrides.expiresAt || expiresAt,
      scopes: overrides.scopes || 'basic',
      freelancerUid: overrides.freelancerUid || '12345',
      ...overrides,
    },
  });
}

/**
 * Create a test bidding profile
 */
export async function createTestProfile(userId, overrides = {}) {
  return await prisma.biddingProfile.create({
    data: {
      userId,
      name: overrides.name || 'Test Profile',
      isActive: overrides.isActive !== undefined ? overrides.isActive : false,
      searchKeywords: overrides.searchKeywords || 'react,node',
      jobIds: overrides.jobIds || '[3,17]',
      minBudget: overrides.minBudget || 100,
      maxBudget: overrides.maxBudget || 5000,
      projectTypes: overrides.projectTypes || 'both',
      bidAmountStrategy: overrides.bidAmountStrategy || 'auto',
      defaultPeriodDays: overrides.defaultPeriodDays || 7,
      milestonePercentage: overrides.milestonePercentage || 100,
      minRelevanceScore: overrides.minRelevanceScore || 70,
      maxBidsPerHour: overrides.maxBidsPerHour || 5,
      maxBidsPerDay: overrides.maxBidsPerDay || 20,
      ...overrides,
    },
  });
}

/**
 * Create a test project
 */
export async function createTestProject(overrides = {}) {
  return await prisma.project.create({
    data: {
      freelancerProjectId: overrides.freelancerProjectId || Math.floor(Math.random() * 1000000),
      title: overrides.title || 'Test Project',
      description: overrides.description || 'Test project description',
      budgetMin: overrides.budgetMin || 100,
      budgetMax: overrides.budgetMax || 500,
      currency: overrides.currency || 'USD',
      jobIds: overrides.jobIds || '[3,17]',
      ownerId: overrides.ownerId || 99999,
      bidCount: overrides.bidCount || 5,
      timeSubmitted: overrides.timeSubmitted || new Date(),
      status: overrides.status || 'active',
      projectType: overrides.projectType || 'fixed',
      relevanceScore: overrides.relevanceScore || null,
      aiAnalysis: overrides.aiAnalysis || null,
      ...overrides,
    },
  });
}

/**
 * Create a test bid
 */
export async function createTestBid(userId, projectId, overrides = {}) {
  return await prisma.bid.create({
    data: {
      userId,
      projectId,
      profileId: overrides.profileId || null,
      freelancerBidId: overrides.freelancerBidId || null,
      amount: overrides.amount || 250,
      periodDays: overrides.periodDays || 7,
      milestonePercentage: overrides.milestonePercentage || 100,
      proposalText: overrides.proposalText || 'Test proposal text',
      status: overrides.status || 'pending',
      errorMessage: overrides.errorMessage || null,
      placedAt: overrides.placedAt || null,
      ...overrides,
    },
  });
}

const prisma = require('../config/database');
const { decrypt, isExpired } = require('../utils/tokenManager');
const { createFreelancerClient } = require('../services/freelancer/client');

async function freelancerClientMiddleware(req, res, next) {
  try {
    const tokenRecord = await prisma.freelancerToken.findUnique({
      where: { userId: req.userId },
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Freelancer account not connected' });
    }

    if (isExpired(tokenRecord.expiresAt)) {
      return res.status(401).json({ error: 'Freelancer token expired. Please re-authorize.' });
    }

    const accessToken = decrypt(tokenRecord.accessToken);
    req.flClient = createFreelancerClient(accessToken);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = freelancerClientMiddleware;

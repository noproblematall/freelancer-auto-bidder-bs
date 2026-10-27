/**
 * Utility script to fix invalid milestone percentages in the database
 *
 * Usage: node scripts/fix-milestone-percentages.js
 */

const prisma = require('../src/config/database');

async function fixMilestonePercentages() {
  console.log('Starting milestone percentage fix...\n');

  try {
    // Find all bidding profiles
    const profiles = await prisma.biddingProfile.findMany();
    console.log(`Found ${profiles.length} bidding profiles`);

    let fixedProfiles = 0;
    let fixedBids = 0;

    // Fix profiles
    for (const profile of profiles) {
      const milestone = profile.milestonePercentage;

      // Check if milestone is invalid
      if (typeof milestone !== 'number' || isNaN(milestone) || milestone < 0 || milestone > 100) {
        console.log(`  ❌ Profile "${profile.name}" (id: ${profile.id}) has invalid milestone: ${milestone}`);

        // Update to default 100
        await prisma.biddingProfile.update({
          where: { id: profile.id },
          data: { milestonePercentage: 100 },
        });

        console.log(`  ✅ Fixed to 100`);
        fixedProfiles++;
      }
    }

    // Find all bids with invalid milestone percentages
    const bids = await prisma.bid.findMany({
      include: {
        project: { select: { title: true } },
        profile: { select: { name: true } },
      },
    });
    console.log(`\nFound ${bids.length} bids`);

    for (const bid of bids) {
      const milestone = bid.milestonePercentage;

      // Check if milestone is invalid
      if (typeof milestone !== 'number' || isNaN(milestone) || milestone < 0 || milestone > 100) {
        console.log(`  ❌ Bid #${bid.id} (project: "${bid.project?.title || 'unknown'}") has invalid milestone: ${milestone}`);

        // Update to default 100
        await prisma.bid.update({
          where: { id: bid.id },
          data: { milestonePercentage: 100 },
        });

        console.log(`  ✅ Fixed to 100`);
        fixedBids++;
      }
    }

    console.log(`\n✨ Fix complete!`);
    console.log(`   Profiles fixed: ${fixedProfiles}/${profiles.length}`);
    console.log(`   Bids fixed: ${fixedBids}/${bids.length}`);

  } catch (err) {
    console.error('Error fixing milestone percentages:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixMilestonePercentages();

/**
 * Detects bot filter requirements in project descriptions.
 *
 * Bot filters are phrases that clients require freelancers to include
 * in their proposals to prove they read the project description.
 *
 * Common patterns:
 * - "Include the phrase 'X' in your proposal"
 * - "Start your bid with 'X'"
 * - "Write 'X' at the top of your proposal"
 * - "Begin your proposal with the word 'X'"
 * - "Type 'X' to show you've read this"
 */

const logger = require('./logger');

/**
 * Patterns that indicate a bot filter requirement.
 * Each pattern should have a capturing group for the required phrase.
 */
const BOT_FILTER_PATTERNS = [
  // "Include the phrase 'X'" or "Include the word 'X'"
  /include\s+(?:the\s+)?(?:phrase|word|text)\s+['""]([^'""]+)['""](?:\s+in\s+your\s+(?:proposal|bid|application))?/gi,

  // "Start your bid with 'X'" or "Begin your proposal with 'X'"
  /(?:start|begin)\s+your\s+(?:bid|proposal|application)\s+with\s+(?:the\s+)?(?:phrase|word|text)?\s*['""]([^'""]+)['""]?/gi,

  // "Write 'X' at the top" or "Type 'X' at the beginning"
  /(?:write|type|put)\s+['""]([^'""]+)['"]\s+(?:at\s+the\s+)?(?:top|beginning|start)/gi,

  // "To show you've read this, write 'X'"
  /to\s+(?:show|prove|confirm)\s+(?:you've|you\s+have)\s+read\s+(?:this|the\s+description),?\s+(?:write|include|start\s+with)\s+['""]([^'""]+)['""]?/gi,

  // "Your bid must start with 'X'"
  /your\s+(?:bid|proposal|application)\s+must\s+(?:start|begin)\s+with\s+['""]([^'""]+)['""]?/gi,

  // More lenient: any quoted phrase followed by "proposal" or "bid"
  /['""]([^'""]{3,30})['""]\s+(?:in\s+)?(?:your\s+)?(?:proposal|bid)/gi,
];

/**
 * Detects if a project description contains bot filter requirements.
 * @param {string} description - The project description
 * @returns {{ hasFilter: boolean, requiredPhrase: string | null, fullMatch: string | null }}
 */
function detectBotFilter(description) {
  if (!description || typeof description !== 'string') {
    return { hasFilter: false, requiredPhrase: null, fullMatch: null };
  }

  for (const pattern of BOT_FILTER_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    const match = pattern.exec(description);
    if (match && match[1]) {
      const requiredPhrase = match[1].trim();
      const fullMatch = match[0].trim();

      logger.info(`Bot filter detected: "${requiredPhrase}"`);

      return {
        hasFilter: true,
        requiredPhrase,
        fullMatch,
      };
    }
  }

  return { hasFilter: false, requiredPhrase: null, fullMatch: null };
}

/**
 * Prepends the bot filter phrase to a proposal.
 * @param {string} proposalText - The generated proposal
 * @param {string} requiredPhrase - The phrase required by the bot filter
 * @returns {string} - The proposal with the bot filter phrase prepended
 */
function prependBotFilter(proposalText, requiredPhrase) {
  // Add the required phrase at the very top, followed by a blank line
  return `${requiredPhrase}\n\n${proposalText}`;
}

module.exports = {
  detectBotFilter,
  prependBotFilter,
};

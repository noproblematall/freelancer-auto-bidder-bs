/**
 * Parse a comma-separated chat ID string into an array of trimmed, non-empty strings.
 */
function parseChatIds(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = { parseChatIds };

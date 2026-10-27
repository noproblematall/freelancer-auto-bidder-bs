const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

// Resolve the prompt file path depending on the runtime environment:
//   Electron prod  → shipped as extraResource at process.resourcesPath
//   Docker         → COPY backend/ . puts the app at /app/, so 3 levels up = /app/
//   Dev            → project root is 4 levels up from backend/src/services/openai/
function resolvePromptFile() {
  if (process.env.ELECTRON_MODE === 'true' && process.env.NODE_ENV === 'production') {
    return path.join(process.resourcesPath, 'ChatGPT-prompt.md');
  }
  const threeUp = path.join(__dirname, '../../../ChatGPT-prompt.md');  // Docker
  const fourUp  = path.join(__dirname, '../../../../ChatGPT-prompt.md'); // Dev
  return fs.existsSync(threeUp) ? threeUp : fourUp;
}
const PROMPT_FILE = resolvePromptFile();

let defaultPrompt = null;

function loadDefaultPrompt() {
  if (defaultPrompt) return defaultPrompt;

  try {
    defaultPrompt = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
    logger.info(`Loaded default proposal prompt (${defaultPrompt.length} chars)`);
  } catch (err) {
    logger.warn(`Could not load ChatGPT-prompt.md: ${err.message}`);
    defaultPrompt = '';
  }

  return defaultPrompt;
}

function getProposalPrompt(profilePrompt) {
  return profilePrompt || loadDefaultPrompt();
}

// Pre-load on require
loadDefaultPrompt();

module.exports = { loadDefaultPrompt, getProposalPrompt };

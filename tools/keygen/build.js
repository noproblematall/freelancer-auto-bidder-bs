'use strict'

// Builds the BidPilot Keygen desktop app as a one-click Windows installer:
//   node tools/keygen/build.js
// Output: dist/keygen/BidPilot-Keygen-Setup.exe — keep it private; anyone
// holding it can issue keys. Needs tools/keygen/.secret/private-key.pem
// (init-keypair.js).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const here = __dirname
const root = path.join(here, '..', '..')
const privFile = path.join(here, '.secret', 'private-key.pem')
const generated = path.join(here, 'app', 'private-key.generated.js')

if (!fs.existsSync(privFile)) {
  console.error('Missing private key. Run: node tools/keygen/init-keypair.js')
  process.exit(1)
}

// Bake the private key into the app for the duration of the build
fs.writeFileSync(generated, "'use strict'\nmodule.exports = " + JSON.stringify(fs.readFileSync(privFile, 'utf8')) + '\n')
try {
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  execFileSync(bin, ['--win', '--publish', 'never', '--project', here, '--config', path.join(here, 'electron-builder.yml')], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} finally {
  fs.unlinkSync(generated)
}
console.log('\nBuilt ' + path.join(root, 'dist', 'keygen', 'BidPilot-Keygen-Setup.exe'))

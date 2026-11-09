'use strict'

// One-time: create the Ed25519 keypair for offline license keys.
//   node tools/keygen/init-keypair.js
// Writes tools/keygen/.secret/private-key.pem (git-ignored; back it up, it is
// the only thing that can make keys) and prints the public key to embed in
// electron/license-public-key.js. Refuses to overwrite an existing private key.

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const secretDir = path.join(__dirname, '.secret')
const privFile = path.join(secretDir, 'private-key.pem')
const pubFile = path.join(secretDir, 'public-key.pem')

if (fs.existsSync(privFile)) {
  console.log(`Private key already exists: ${privFile}`)
  console.log('Public key:\n' + fs.readFileSync(pubFile, 'utf8'))
  process.exit(0)
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
fs.mkdirSync(secretDir, { recursive: true })
fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
fs.writeFileSync(pubFile, publicKey.export({ type: 'spki', format: 'pem' }))
console.log(`Private key written: ${privFile}  (keep it secret, back it up)`)
console.log('Public key (embed in electron/license-public-key.js):\n' + fs.readFileSync(pubFile, 'utf8'))

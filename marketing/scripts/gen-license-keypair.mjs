// Generates the Ed25519 keypair for license-token signing. Run once:
//   node scripts/gen-license-keypair.mjs
//
// - Put the PRIVATE value in Vercel env LICENSE_SIGNING_PRIVATE_KEY.
// - Embed the PUBLIC key in the Electron app (it verifies tokens offline).
// Never commit or expose the private key.

import crypto from 'crypto'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const pubPem = publicKey.export({ type: 'spki', format: 'pem' })

console.log('\n================ LICENSE_SIGNING_PRIVATE_KEY ================')
console.log('Set this (base64) as the Vercel env var — keep it secret:\n')
console.log(Buffer.from(privPem).toString('base64'))

console.log('\n================ PUBLIC KEY (embed in the app) =============')
console.log('Paste this PEM into the app as the embedded verification key:\n')
console.log(pubPem)

console.log('================ LICENSE_KEY_ENC_SECRET ====================')
console.log('Set this (base64, 32 bytes) as a Vercel env var — encrypts stored keys:\n')
console.log(crypto.randomBytes(32).toString('base64'))

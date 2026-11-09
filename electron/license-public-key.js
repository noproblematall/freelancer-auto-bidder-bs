'use strict'

// Ed25519 PUBLIC keys used to verify licenses offline. Public keys are not
// secret and are safe to commit.
//
// offline — matches the private key held only by the key generator
//           (tools/keygen/.secret/private-key.pem, created by
//           tools/keygen/init-keypair.js). Verifies the GROWL1 device keys.
// server  — matches LICENSE_SIGNING_PRIVATE_KEY on the old license server
//           (growlance.app). Kept so installs activated there stay licensed.
module.exports = {
  offline: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJnkPJVCOeP/VNiGYQ17JQORGbMP2wGXG/kXrunb0I3E=
-----END PUBLIC KEY-----
`,
  server: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAV0cLPHOocN6+R41naQeC0fB0BOjKy0XEYWAjJyMXufk=
-----END PUBLIC KEY-----
`,
}

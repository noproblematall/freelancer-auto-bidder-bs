'use strict'

// Ed25519 PUBLIC key used to verify license tokens offline. This is NOT secret —
// it's safe to commit. It must match the LICENSE_SIGNING_PRIVATE_KEY set on the
// license server (Vercel).
//
// To set it: run `node marketing/scripts/gen-license-keypair.mjs`, then paste the
// printed "PUBLIC KEY" PEM block below (replacing the placeholder). Until a real
// key is embedded here, the app will treat every install as unlicensed.
module.exports = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAV0cLPHOocN6+R41naQeC0fB0BOjKy0XEYWAjJyMXufk=
-----END PUBLIC KEY-----
`

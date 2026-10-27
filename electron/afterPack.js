'use strict'

/**
 * afterPack hook — fixes the ElectronAsarIntegrity hash in Info.plist.
 *
 * electron-builder computes the asar SHA256 BEFORE running asarUnpack, which
 * modifies the archive. Electron v28+ verifies this hash at startup and silently
 * exits when it doesn't match. This hook re-computes the hash after all
 * packaging steps are complete and patches Info.plist with the correct value.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context

  // Only applies to macOS builds
  if (packager.platform.name !== 'mac') return

  const appPath = path.join(appOutDir, `${packager.appInfo.productName}.app`)
  const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar')
  const plistPath = path.join(appPath, 'Contents', 'Info.plist')

  if (!fs.existsSync(asarPath) || !fs.existsSync(plistPath)) return

  // Compute actual SHA256 of the (post-asarUnpack) asar file
  const asarBuffer = fs.readFileSync(asarPath)
  const actualHash = crypto.createHash('sha256').update(asarBuffer).digest('hex')

  // Read and patch Info.plist (binary plist — use plutil to convert)
  const { execFileSync } = require('child_process')

  // Convert binary plist → xml so we can patch it
  execFileSync('plutil', ['-convert', 'xml1', plistPath])

  let xml = fs.readFileSync(plistPath, 'utf8')

  // Replace the hash value that follows the ElectronAsarIntegrity key
  xml = xml.replace(
    /(<key>Resources\/app\.asar<\/key>\s*<dict>[\s\S]*?<key>hash<\/key>\s*<string>)[^<]*/,
    `$1${actualHash}`
  )

  fs.writeFileSync(plistPath, xml, 'utf8')

  // Convert back to binary plist (required by macOS)
  execFileSync('plutil', ['-convert', 'binary1', plistPath])

  console.log(`[afterPack] Patched ElectronAsarIntegrity hash → ${actualHash}`)
}

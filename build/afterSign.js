const { execSync } = require('child_process');
const path = require('path');

// Runs after electron-builder's sign step (which we skip — no Apple cert),
// but BEFORE the DMG is created. Ad-hoc signing lets Gatekeeper show
// "Open Anyway" on macOS Sequoia instead of a hard block.
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`  • ad-hoc signing  path=${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  console.log('  • ad-hoc signing complete');
};

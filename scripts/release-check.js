const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const distRoot = path.join(root, 'dist', 'mygame-win64');

const requiredSourceFiles = [
  'index.js',
  'package.json',
  'public/index.html',
  'public/client.js',
  'src/bootstrap/app.js',
  'src/network/libzt/runtime.js',
  'src/network/share/endpointService.js',
  'scripts/prepare-distribution.js'
];

const requiredDistFiles = [
  'dist/mygame-win64/launch-product.bat',
  'dist/mygame-win64/app/index.js',
  'dist/mygame-win64/app/public/index.html',
  'dist/mygame-win64/app/public/client.js',
  'dist/mygame-win64/runtime/node.exe'
];

const requiredNativeArtifacts = [
  'build/Release/libztaddon.node',
  'third_party/libzt/winx64/libzt.dll'
];

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function info(message) {
  console.log(`OK: ${message}`);
}

function runNodeTests() {
  const skip = process.env.RELEASE_CHECK_SKIP_TESTS === '1';
  if (skip) {
    warn('Skipping npm test because RELEASE_CHECK_SKIP_TESTS=1');
    return;
  }

  console.log('Running npm test...');
  const result = spawnSync('npm', ['test'], {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) {
    fail('npm test failed');
  }
  info('npm test passed');
}

function checkNodeModules() {
  if (!exists('node_modules')) {
    fail('node_modules missing. Run npm install first.');
  }
  info('node_modules exists');
}

function checkSourceFiles() {
  const missing = requiredSourceFiles.filter((p) => !exists(p));
  if (missing.length > 0) {
    fail(`Missing required source files: ${missing.join(', ')}`);
  }
  info('required source files exist');
}

function checkNativeArtifacts() {
  const skipNative = process.env.RELEASE_CHECK_SKIP_NATIVE === '1';
  if (skipNative) {
    warn('Skipping native artifact checks because RELEASE_CHECK_SKIP_NATIVE=1');
    return;
  }

  const missing = requiredNativeArtifacts.filter((p) => !exists(p));
  if (missing.length > 0) {
    fail(`Missing native artifacts: ${missing.join(', ')}`);
  }
  info('native artifacts exist');
}

function checkDistFiles() {
  const skipDist = process.env.RELEASE_CHECK_SKIP_DIST === '1';
  if (skipDist) {
    warn('Skipping dist checks because RELEASE_CHECK_SKIP_DIST=1');
    return;
  }

  if (!fs.existsSync(distRoot)) {
    fail('dist/mygame-win64 missing. Run npm run dist:prepare first.');
  }
  const missing = requiredDistFiles.filter((p) => !exists(p));
  if (missing.length > 0) {
    fail(`Missing required dist files: ${missing.join(', ')}`);
  }
  info('dist structure and launcher/runtime files exist');
}

function checkDefaultConfig() {
  const libztConfigPath = require.resolve('../src/config/libzt');
  const appConfigPath = require.resolve('../src/config/app');
  delete require.cache[libztConfigPath];
  delete require.cache[appConfigPath];
  const { libztConfig } = require('../src/config/libzt');
  const { appConfig } = require('../src/config/app');

  if (!libztConfig.defaultNetworkId || String(libztConfig.defaultNetworkId).trim() === '') {
    fail('libzt defaultNetworkId is empty');
  }
  if (!appConfig.startMode || String(appConfig.startMode).trim() === '') {
    fail('app startMode is empty');
  }
  info('default configuration looks valid');
}

function main() {
  console.log('== Release Preflight Check ==');
  checkNodeModules();
  checkSourceFiles();
  checkDefaultConfig();
  runNodeTests();
  checkNativeArtifacts();
  checkDistFiles();
  console.log('Release preflight passed.');
}

main();

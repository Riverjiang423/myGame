const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist', 'mygame-win64');
const appDir = path.join(outDir, 'app');
const runtimeDir = path.join(outDir, 'runtime');

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeCopy(srcRelative, dstRelative = srcRelative) {
  const src = path.join(rootDir, srcRelative);
  const dst = path.join(appDir, dstRelative);
  if (!fs.existsSync(src)) {
    return false;
  }
  safeMkdir(path.dirname(dst));
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

function resolveRuntimeSourceDir() {
  const envDir = process.env.NODE_RUNTIME_WIN_X64_DIR
    ? path.resolve(rootDir, process.env.NODE_RUNTIME_WIN_X64_DIR)
    : null;
  if (envDir && fs.existsSync(envDir)) {
    return envDir;
  }

  const defaultDir = path.join(rootDir, 'third_party', 'node', 'winx64');
  if (fs.existsSync(defaultDir)) {
    return defaultDir;
  }
  return null;
}

function prepareRuntime() {
  const sourceDir = resolveRuntimeSourceDir();
  if (!sourceDir) {
    return {
      ok: false,
      reason: 'Node runtime source directory not found',
      sourceDir: null,
      copiedFiles: 0
    };
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  safeMkdir(runtimeDir);
  fs.cpSync(sourceDir, runtimeDir, { recursive: true });

  const nodeExePath = path.join(runtimeDir, 'node.exe');
  if (!fs.existsSync(nodeExePath)) {
    return {
      ok: false,
      reason: 'node.exe missing after runtime copy',
      sourceDir,
      copiedFiles: 0
    };
  }

  return {
    ok: true,
    reason: '',
    sourceDir,
    copiedFiles: 1
  };
}

function writeText(filePath, content) {
  safeMkdir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  safeMkdir(appDir);
  safeMkdir(runtimeDir);

  const copied = [];
  const missing = [];

  const copyList = [
    'index.js',
    'src',
    'public',
    'package.json',
    'package-lock.json',
    'binding.gyp',
    'native',
    'readme.md',
    'start.bat',
    'start-online.bat',
    'start-embedded.bat',
    'setup.bat',
    'online.config.bat',
    'libzt.config.bat',
    'build/distribution/distribution.config.json'
  ];

  copyList.forEach((item) => {
    if (safeCopy(item)) {
      copied.push(item);
    } else {
      missing.push(item);
    }
  });

  if (safeCopy('build/Release/libztaddon.node', 'build/Release/libztaddon.node')) {
    copied.push('build/Release/libztaddon.node');
  } else {
    missing.push('build/Release/libztaddon.node');
  }

  if (safeCopy('third_party/libzt/winx64/libzt.dll', 'third_party/libzt/winx64/libzt.dll')) {
    copied.push('third_party/libzt/winx64/libzt.dll');
  } else {
    missing.push('third_party/libzt/winx64/libzt.dll');
  }

  const runtimePrep = prepareRuntime();
  if (runtimePrep.ok) {
    copied.push('runtime/node.exe');
  } else {
    missing.push('runtime/node.exe');
  }

  const launchBat = [
    '@echo off',
    'setlocal',
    'set "DIST_ROOT=%~dp0"',
    'set "NODE_EXE=%DIST_ROOT%runtime\\node.exe"',
    'if not exist "%NODE_EXE%" (',
    '  echo Node runtime not found: %NODE_EXE%',
    '  echo Please place Windows x64 Node runtime under: runtime\\',
    '  echo Expected file: runtime\\node.exe',
    '  pause',
    '  exit /b 1',
    ')',
    'cd /d "%DIST_ROOT%app"',
    'set APP_DISTRIBUTION_MODE=1',
    'set APP_START_MODE=online-preferred',
    'set AUTO_OPEN_BROWSER=1',
    '"%NODE_EXE%" index.js',
    'endlocal'
  ].join('\r\n');
  writeText(path.join(outDir, 'launch-product.bat'), launchBat);

  const manifest = {
    generatedAt: new Date().toISOString(),
    entry: 'app/index.js',
    runtimeEntry: 'runtime/node.exe',
    distributionRoot: 'dist/mygame-win64',
    runtime: {
      sourceDir: runtimePrep.sourceDir,
      ok: runtimePrep.ok,
      reason: runtimePrep.reason
    },
    copied,
    missing
  };
  writeText(path.join(outDir, 'dist-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const notes = [
    '# Distribution Notes',
    '',
    '## Main Entry',
    '- Runtime entry: `app/index.js`',
    '- Node runtime entry: `runtime/node.exe`',
    '- End-user launcher: `launch-product.bat`',
    '',
    '## Static Assets',
    '- `public/` is copied into `app/public/` and loaded by the HTTP server as-is.',
    '',
    '## Native Addon and DLL',
    '- Node addon expected path: `app/build/Release/libztaddon.node`',
    '- libzt dll expected path: `app/third_party/libzt/winx64/libzt.dll`',
    '',
    '## Known Blockers for Single EXE',
    '- Current runtime loads `.node` addon from filesystem at runtime.',
    '- Current runtime loads `libzt.dll` from filesystem at runtime.',
    '- `pkg`/`nexe` single-file packaging is not considered solved in this step.',
    '',
    '## Portable Node Runtime',
    '- Runtime source priority:',
    '  1) `NODE_RUNTIME_WIN_X64_DIR` (env var)',
    '  2) `third_party/node/winx64`',
    '- Runtime target path: `runtime/node.exe`',
    '',
    '## Next Step',
    '- Validate `launch-product.bat` on clean Windows machine without Node preinstalled.',
    '- Then decide installer or embedded runtime strategy before EXE stage.'
  ].join('\n');
  writeText(path.join(outDir, 'DIST_NOTES.md'), `${notes}\n`);

  console.log(`Distribution prepared at: ${outDir}`);
  console.log(`Copied: ${copied.length}, Missing: ${missing.length}`);
  if (runtimePrep.ok) {
    console.log(`Portable runtime ready: ${path.join('runtime', 'node.exe')}`);
  } else {
    console.warn(`Portable runtime missing: ${runtimePrep.reason}`);
  }
  if (missing.length > 0) {
    console.warn(`Missing artifacts: ${missing.join(', ')}`);
  }
}

main();

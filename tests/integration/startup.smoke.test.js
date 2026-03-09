const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function runNodeScript(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: {
        ...process.env,
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('startup smoke test timed out'));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const integrationEnabled = process.env.RUN_INTEGRATION_SMOKE === '1';
const integrationTest = integrationEnabled ? test : test.skip;

integrationTest('service can start in local mode smoke path', async () => {
  const port = String(43000 + Math.floor(Math.random() * 1000));
  const script = [
    "process.env.APP_START_MODE='local';",
    "process.env.AUTO_OPEN_BROWSER='0';",
    `process.env.PORT='${port}';`,
    "require('./index');",
    'setTimeout(() => process.exit(0), 600);'
  ].join('');

  const result = await runNodeScript(script, { APP_DISTRIBUTION_MODE: '0' });

  assert.equal(result.code, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Server listening on/i);
});

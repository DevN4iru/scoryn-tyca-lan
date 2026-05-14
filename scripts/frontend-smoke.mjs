#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const BASE_URL = 'http://127.0.0.1:3001';
let server = null;

function fail(message) {
  throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed`);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  spawnSync('fuser', ['-k', '3001/tcp'], { stdio: 'ignore' });

  server = spawn('npm', ['start'], {
    detached: true,
    env: {
      ...process.env,
      PORT: '3001',
      HOST: '0.0.0.0',
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }

    await sleep(250);
  }

  fail('Server did not start on 3001');
}

async function stopServer() {
  if (!server) return;

  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}

  await sleep(300);

  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {}

  spawnSync('fuser', ['-k', '3001/tcp'], { stdio: 'ignore' });
}

async function main() {
  console.log('===== FRONTEND SMOKE =====');

  run('npm', ['run', 'build']);

  await startServer();

  const home = await fetch(`${BASE_URL}/`);
  const html = await home.text();

  if (!home.ok) fail(`Home returned HTTP ${home.status}`);
  if (!html.includes('<div id="root"></div>')) fail('Root div missing');
  if (!html.includes('/assets/')) fail('Built assets missing from HTML');

  const jsAsset = html.match(/src="([^"]+\.js)"/)?.[1];
  const cssAsset = html.match(/href="([^"]+\.css)"/)?.[1];

  if (!jsAsset) fail('JS asset not found in HTML');
  if (!cssAsset) fail('CSS asset not found in HTML');

  const js = await fetch(`${BASE_URL}${jsAsset}`);
  const css = await fetch(`${BASE_URL}${cssAsset}`);

  if (!js.ok) fail(`JS asset returned HTTP ${js.status}`);
  if (!css.ok) fail(`CSS asset returned HTTP ${css.status}`);

  const jsText = await js.text();
  const cssText = await css.text();

  if (!jsText.includes('Miss TYCA 2026')) fail('App JS does not contain expected event text');
  if (!cssText.length) fail('CSS asset is empty');

  console.log('PASS: frontend HTML, JS, and CSS assets load correctly.');
}

let code = 0;

try {
  await main();
} catch (error) {
  code = 1;
  console.error(error?.stack || error);
} finally {
  await stopServer();
}

process.exit(code);

#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_URL = 'http://127.0.0.1:3001';
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'event-state.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
const BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scoryn-live-flow-'));

let server = null;
let pass = 0;

function ok(message) {
  pass += 1;
  console.log(`PASS ${pass}: ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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

function backupData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, path.join(BACKUP_DIR, 'event-state.json'));
  if (fs.existsSync(AUDIT_FILE)) fs.copyFileSync(AUDIT_FILE, path.join(BACKUP_DIR, 'audit-log.jsonl'));
}

function removeRuntimeData() {
  if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE, { force: true });
  if (fs.existsSync(AUDIT_FILE)) fs.rmSync(AUDIT_FILE, { force: true });
}

function restoreData() {
  removeRuntimeData();

  const stateBackup = path.join(BACKUP_DIR, 'event-state.json');
  const auditBackup = path.join(BACKUP_DIR, 'audit-log.jsonl');

  if (fs.existsSync(stateBackup)) fs.copyFileSync(stateBackup, STATE_FILE);
  if (fs.existsSync(auditBackup)) fs.copyFileSync(auditBackup, AUDIT_FILE);
}

function killPort() {
  spawnSync('fuser', ['-k', '3001/tcp'], { stdio: 'ignore' });
}

async function startServer() {
  killPort();

  server = spawn('npm', ['start'], {
    cwd: ROOT,
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
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
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

  killPort();
}

async function http(method, route, { token = '', body = undefined } = {}) {
  const headers = {};

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return {
    status: response.status,
    data
  };
}

async function expectStatus(method, route, status, options = {}) {
  const result = await http(method, route, options);

  if (result.status !== status) {
    console.error(result.data);
    fail(`${method} ${route} expected HTTP ${status}, got HTTP ${result.status}`);
  }

  return result.data;
}

async function login(role, pin) {
  const data = await expectStatus('POST', '/api/login', 200, {
    body: { role, pin }
  });

  assert(data.token, `${role} login did not return token`);
  assert(data.role === role, `${role} login returned wrong role`);

  return data;
}

async function main() {
  console.log('===== LIVE-FLOW SMOKE =====');

  backupData();
  removeRuntimeData();

  run('npm', ['run', 'build']);
  ok('build passed');

  await startServer();
  ok('production server started');

  const health = await expectStatus('GET', '/api/health', 200);
  assert(health.ok === true, 'health.ok is not true');
  ok('health endpoint passed');

  const admin = await login('admin', 'admin2026');
  const judge = await login('judge', 'judge1');
  ok('admin and judge login passed');

  const judgeState = await expectStatus('GET', '/api/judge/state', 200, {
    token: judge.token
  });

  const candidate = judgeState.config.candidates.find((item) => item.active !== false);
  const criterion = judgeState.config.rounds.prelim.criteria[0];

  assert(candidate, 'no active candidate found');
  assert(criterion, 'no prelim criterion found');

  const before = await expectStatus('GET', '/api/admin/state', 200, {
    token: admin.token
  });

  const beforeRow = before.prelimResults.find((row) => row.id === candidate.id);
  assert(beforeRow, 'candidate missing before score');

  const score = await expectStatus('POST', '/api/score/prelim', 200, {
    token: judge.token,
    body: {
      candidateId: candidate.id,
      criterionId: criterion.id,
      value: 100
    }
  });

  assert(score.ok === true, 'score save did not return ok true');
  ok('judge score POST passed');

  const after = await expectStatus('GET', '/api/admin/state', 200, {
    token: admin.token
  });

  const afterRow = after.prelimResults.find((row) => row.id === candidate.id);
  assert(afterRow, 'candidate missing after score');

  const expectedWeighted = 100 * (Number(criterion.weight) / 100);

  assert(afterRow.total > beforeRow.total, `admin total did not increase: before=${beforeRow.total}, after=${afterRow.total}`);
  assert(Math.abs(afterRow.breakdown[criterion.id] - expectedWeighted) < 0.001, 'weighted breakdown mismatch');
  assert(afterRow.judgesSubmitted === 1, `expected judgesSubmitted 1, got ${afterRow.judgesSubmitted}`);
  ok('admin state reflected judge score immediately');

  assert(Array.isArray(after.history), 'admin history is not an array');
  assert(after.history.length >= 1, 'admin history did not record score save');
  assert(after.history[0].action === 'initial_save', 'latest history action is not initial_save');
  ok('score history recorded immediately');

  const judgeAfter = await expectStatus('GET', '/api/judge/state', 200, {
    token: judge.token
  });

  const savedValue = judgeAfter.myPrelimScores?.[candidate.id]?.[criterion.id];
  assert(Number(savedValue) === 100, `judge state did not show saved score, got ${savedValue}`);
  ok('judge state reflected saved score immediately');

  console.log(`All ${pass} live-flow checks passed.`);
}

let code = 0;

try {
  await main();
} catch (error) {
  code = 1;
  console.error('\n===== LIVE-FLOW SMOKE FAILED =====');
  console.error(error?.stack || error);
} finally {
  await stopServer();
  restoreData();
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
}

process.exit(code);

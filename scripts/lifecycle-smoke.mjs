#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'event-state.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
const BASE_URL = 'http://127.0.0.1:3001';
const BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scoryn-lifecycle-smoke-'));

let serverProcess = null;
let serverLog = '';
let passed = 0;

function log(title) {
  console.log(`\n===== ${title} =====`);
}

function ok(message) {
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function nearlyEqual(actual, expected, tolerance = 0.001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function readEnvFile() {
  const envPath = path.join(ROOT, '.env');
  const values = {};

  if (!fs.existsSync(envPath)) return values;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    values[key] = value;
  }

  return values;
}

function killPorts() {
  spawnSync('fuser', ['-k', '3001/tcp'], { stdio: 'ignore' });
}

function backupData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STATE_FILE)) {
    fs.copyFileSync(STATE_FILE, path.join(BACKUP_DIR, 'event-state.json'));
  }
  if (fs.existsSync(AUDIT_FILE)) {
    fs.copyFileSync(AUDIT_FILE, path.join(BACKUP_DIR, 'audit-log.jsonl'));
  }
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  serverProcess = spawn('npm', ['start'], {
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

  serverProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    serverLog += text;
    process.stdout.write(text);
  });

  serverProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    serverLog += text;
    process.stderr.write(text);
  });

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      fail(`production server exited early.\n${serverLog}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // wait and retry
    }

    await sleep(250);
  }

  fail(`production server did not become healthy on 3001.\n${serverLog}`);
}

async function stopServer() {
  if (!serverProcess) return;

  try {
    process.kill(-serverProcess.pid, 'SIGTERM');
  } catch {
    // already stopped
  }

  await sleep(500);

  try {
    process.kill(-serverProcess.pid, 'SIGKILL');
  } catch {
    // already stopped
  }

  killPorts();
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
    data,
    text
  };
}

async function expectStatus(method, route, status, options = {}) {
  const result = await http(method, route, options);

  if (result.status !== status) {
    console.error('Unexpected response:', {
      method,
      route,
      expected: status,
      actual: result.status,
      body: result.data
    });
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

function enabledJudges(config) {
  return config.judges.filter((judge) => judge.enabled !== false);
}

function activeCandidates(config) {
  return config.candidates
    .filter((candidate) => candidate.active !== false)
    .sort((a, b) => Number(a.number) - Number(b.number));
}

function criteriaWeightTotal(criteria) {
  return criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
}

function expectedTop3(config) {
  return activeCandidates(config)
    .slice()
    .sort((a, b) => Number(b.number) - Number(a.number))
    .slice(0, 3);
}

function finalRawScore(candidateNumber) {
  return 35 + Number(candidateNumber) * 5;
}

async function fillPrelimScores(judgeToken, config) {
  const candidates = activeCandidates(config);
  const criteria = config.rounds.prelim.criteria;

  for (const candidate of candidates) {
    for (const criterion of criteria) {
      await expectStatus('POST', '/api/score/prelim', 200, {
        token: judgeToken,
        body: {
          candidateId: candidate.id,
          criterionId: criterion.id,
          value: Number(candidate.number)
        }
      });
    }
  }
}

async function fillFinalScores(judgeToken, top3, config) {
  const criteria = config.rounds.final.criteria;

  for (const candidate of top3) {
    for (const criterion of criteria) {
      await expectStatus('POST', '/api/score/final', 200, {
        token: judgeToken,
        body: {
          candidateId: candidate.id,
          criterionId: criterion.id,
          value: finalRawScore(candidate.number)
        }
      });
    }
  }
}

async function main() {
  log('PRE-FLIGHT');

  assert(fs.existsSync(path.join(ROOT, 'package.json')), 'package.json not found. Run from repo root.');
  assert(fs.existsSync(path.join(ROOT, 'api/server.js')), 'api/server.js not found.');
  assert(fs.existsSync(path.join(ROOT, 'src/App.jsx')), 'src/App.jsx not found.');

  backupData();
  ok('Existing runtime data backed up outside the test flow');

  killPorts();

  log('1. BUILD PASSES');
  run('npm', ['run', 'build']);
  ok('npm run build passed');

  log('2. PRODUCTION SERVER STARTS ON 3001');
  removeRuntimeData();
  await startServer();
  const health = await expectStatus('GET', '/api/health', 200);
  assert(health.ok === true, 'health.ok was not true');
  ok('Production server started and /api/health passed');

  const envFile = readEnvFile();
  const adminPin = process.env.ADMIN_PIN || envFile.ADMIN_PIN || 'admin2026';
  const developerPin = process.env.DEVELOPER_PIN || envFile.DEVELOPER_PIN || 'dev2026';

  log('3. ADMIN, DEVELOPER, JUDGE LOGIN WORK');
  const admin = await login('admin', adminPin);
  const developer = await login('developer', developerPin);
  const judge1 = await login('judge', 'judge1');
  ok('Admin, Developer, and Judge login passed');

  log('4. ROLE BOUNDARIES WORK');
  await expectStatus('GET', '/api/admin/state', 200, { token: admin.token });
  await expectStatus('GET', '/api/developer/state', 200, { token: developer.token });
  await expectStatus('GET', '/api/judge/state', 200, { token: judge1.token });

  await expectStatus('GET', '/api/developer/state', 401, { token: admin.token });
  await expectStatus('POST', '/api/developer/config', 401, {
    token: admin.token,
    body: { config: {} }
  });
  await expectStatus('GET', '/api/admin/state', 401, { token: developer.token });
  await expectStatus('GET', '/api/admin/state', 401, { token: judge1.token });
  ok('Role boundaries passed');

  log('5. DEFAULT CONFIG SANITY');
  const developerState = await expectStatus('GET', '/api/developer/state', 200, {
    token: developer.token
  });

  const config = developerState.config;
  const candidates = activeCandidates(config);
  const judges = enabledJudges(config);
  const prelimCriteria = config.rounds.prelim.criteria;
  const finalCriteria = config.rounds.final.criteria;

  assert(candidates.length === 12, `expected 12 active candidates, got ${candidates.length}`);
  assert(judges.length === 8, `expected 8 enabled judges, got ${judges.length}`);
  assert(nearlyEqual(criteriaWeightTotal(prelimCriteria), 100), 'prelim criteria total is not 100%');
  assert(nearlyEqual(criteriaWeightTotal(finalCriteria), 100), 'final criteria total is not 100%');
  ok('Default config has 12 candidates, 8 judges, prelim 100%, final 100%');

  log('6. INVALID SETUP CRITERIA TOTAL REJECTED');
  const invalidWeightConfig = clone(config);
  invalidWeightConfig.rounds.prelim.criteria[0].weight = Number(invalidWeightConfig.rounds.prelim.criteria[0].weight) + 1;

  const badWeight = await expectStatus('POST', '/api/developer/config', 400, {
    token: developer.token,
    body: { config: invalidWeightConfig }
  });

  assert(String(badWeight.error || '').includes('100'), 'invalid criteria total error did not mention 100');
  ok('Invalid criteria total rejected');

  log('7. DUPLICATE JUDGE PIN REJECTED');
  const duplicatePinConfig = clone(config);
  duplicatePinConfig.judges[1].pin = duplicatePinConfig.judges[0].pin;

  const badPin = await expectStatus('POST', '/api/developer/config', 400, {
    token: developer.token,
    body: { config: duplicatePinConfig }
  });

  assert(String(badPin.error || '').toLowerCase().includes('duplicate judge pin'), 'duplicate judge PIN error missing');
  ok('Duplicate judge PIN rejected');

  log('8. FINALS SCORING BEFORE PRELIM COMPLETION RETURNS 423');
  const firstCandidate = candidates[0];
  const firstFinalCriterion = finalCriteria[0];

  const earlyFinal = await expectStatus('POST', '/api/score/final', 423, {
    token: judge1.token,
    body: {
      candidateId: firstCandidate.id,
      criterionId: firstFinalCriterion.id,
      value: 88
    }
  });

  assert(String(earlyFinal.error || '').toLowerCase().includes('finals are locked'), 'final locked error missing');
  ok('Final scoring before prelim completion returns 423');

  log('9. INCOMPLETE PRELIM SUBMIT RETURNS 400');
  const incomplete = await expectStatus('POST', '/api/submit/prelim', 400, {
    token: judge1.token,
    body: {}
  });

  assert(String(incomplete.error || '').toLowerCase().includes('incomplete'), 'incomplete submit error missing');
  ok('Incomplete prelim submit returns 400');

  log('10. FILL ALL 60 PRELIM SCORES FOR JUDGE1, SUBMIT JUDGE1');
  assert(candidates.length * prelimCriteria.length === 60, 'judge1 prelim required field count is not 60');
  await fillPrelimScores(judge1.token, config);
  await expectStatus('POST', '/api/submit/prelim', 200, {
    token: judge1.token,
    body: {}
  });
  ok('Judge1 filled 60 prelim scores and submitted');

  log('11. EDITING JUDGE1 PRELIM AFTER SUBMIT RETURNS LOCKED ERROR');
  const lockedEdit = await expectStatus('POST', '/api/score/prelim', 423, {
    token: judge1.token,
    body: {
      candidateId: candidates[0].id,
      criterionId: prelimCriteria[0].id,
      value: 99
    }
  });

  assert(String(lockedEdit.error || '').toLowerCase().includes('locked'), 'locked edit error missing');
  ok('Editing judge1 prelim after submit returns locked error');

  log('12. FILL AND SUBMIT PRELIM FOR ALL 8 JUDGES');
  const judgeTokens = {
    judge1: judge1.token
  };

  for (let number = 2; number <= 8; number += 1) {
    const judge = await login('judge', `judge${number}`);
    judgeTokens[`judge${number}`] = judge.token;
    await fillPrelimScores(judge.token, config);
    await expectStatus('POST', '/api/submit/prelim', 200, {
      token: judge.token,
      body: {}
    });
  }
  ok('All 8 judges submitted preliminary scores');

  log('13. FINALS OPENS ONLY AFTER 8/8 PRELIM SUBMISSIONS');
  const afterPrelim = await expectStatus('GET', '/api/admin/state', 200, {
    token: admin.token
  });

  assert(afterPrelim.status.prelimSubmittedCount === 8, `expected prelim submitted 8, got ${afterPrelim.status.prelimSubmittedCount}`);
  assert(afterPrelim.status.totalJudges === 8, `expected total judges 8, got ${afterPrelim.status.totalJudges}`);
  assert(afterPrelim.status.finalOpen === true, 'finals did not open after 8/8 prelim submissions');
  ok('Finals opens after 8/8 prelim submissions');

  log('14. TOP 3 IS DETERMINISTIC AND MATHEMATICALLY EXPECTED');
  const expectedPrelimTop3 = expectedTop3(config);
  assert(afterPrelim.top3.length === 3, `expected top3 length 3, got ${afterPrelim.top3.length}`);

  afterPrelim.top3.forEach((row, index) => {
    const expected = expectedPrelimTop3[index];
    assert(row.number === expected.number, `top3 index ${index} expected candidate #${expected.number}, got #${row.number}`);
    assert(nearlyEqual(row.total, expected.number), `candidate #${row.number} prelim total expected ${expected.number}, got ${row.total}`);
  });
  ok('Top 3 deterministic math passed: candidate totals equal candidate numbers');

  log('15. FINAL SCORING REJECTS CANDIDATES OUTSIDE TOP 3');
  const top3Ids = new Set(afterPrelim.top3.map((candidate) => candidate.id));
  const outsideTop3 = candidates.find((candidate) => !top3Ids.has(candidate.id));
  assert(outsideTop3, 'could not find candidate outside Top 3');

  const outsideFinal = await expectStatus('POST', '/api/score/final', 400, {
    token: judge1.token,
    body: {
      candidateId: outsideTop3.id,
      criterionId: firstFinalCriterion.id,
      value: 88
    }
  });

  assert(String(outsideFinal.error || '').toLowerCase().includes('top 3'), 'outside Top 3 rejection error missing');
  ok('Final scoring rejects candidates outside Top 3');

  log('16. FILL AND SUBMIT FINAL SCORES FOR ALL 8 JUDGES');
  for (let number = 1; number <= 8; number += 1) {
    const token = judgeTokens[`judge${number}`];
    await fillFinalScores(token, afterPrelim.top3, config);
    await expectStatus('POST', '/api/submit/final', 200, {
      token,
      body: {}
    });
  }
  ok('All 8 judges filled and submitted final scores');

  log('17. FINAL RESULTS ARE MATHEMATICALLY EXPECTED');
  const afterFinal = await expectStatus('GET', '/api/admin/state', 200, {
    token: admin.token
  });

  assert(afterFinal.status.finalSubmittedCount === 8, `expected finalSubmittedCount 8, got ${afterFinal.status.finalSubmittedCount}`);
  assert(afterFinal.finalResults.length === 3, `expected 3 final results, got ${afterFinal.finalResults.length}`);

  const expectedFinal = afterPrelim.top3
    .map((candidate) => ({
      number: candidate.number,
      total: finalRawScore(candidate.number)
    }))
    .sort((a, b) => b.total - a.total || a.number - b.number);

  afterFinal.finalResults.forEach((row, index) => {
    const expected = expectedFinal[index];
    assert(row.number === expected.number, `final rank ${index + 1} expected candidate #${expected.number}, got #${row.number}`);
    assert(nearlyEqual(row.total, expected.total), `candidate #${row.number} final total expected ${expected.total}, got ${row.total}`);
  });
  ok('Final results deterministic math passed');

  log('18. WINNER DECLARATION WORKS');
  const winnerName = afterFinal.finalResults[0].name;

  const winner = await expectStatus('POST', '/api/admin/winner', 200, {
    token: admin.token,
    body: { name: winnerName }
  });

  assert(winner.ok === true, 'winner declaration did not return ok true');
  assert(winner.winner?.name === winnerName, 'winner name mismatch');

  const afterWinner = await expectStatus('GET', '/api/admin/state', 200, {
    token: admin.token
  });

  assert(afterWinner.winner?.name === winnerName, 'winner did not persist in admin state');
  ok('Winner declaration works');

  log('19. RESET CLEARS SCORES, SUBMISSIONS, HISTORY, WINNER');
  await expectStatus('POST', '/api/developer/reset', 200, {
    token: developer.token,
    body: { phrase: 'RESET TYCA' }
  });

  const afterReset = await expectStatus('GET', '/api/developer/state', 200, {
    token: developer.token
  });

  assert(afterReset.status.scoringStarted === false, 'reset did not clear scoringStarted');
  assert(afterReset.status.prelimSubmittedCount === 0, 'reset did not clear prelim submissions count');
  assert(afterReset.status.finalSubmittedCount === 0, 'reset did not clear final submissions count');
  assert(afterReset.status.finalOpen === false, 'reset did not close finals');
  assert(afterReset.raw.scoreCount.prelim === 0, 'reset did not clear prelim scores');
  assert(afterReset.raw.scoreCount.final === 0, 'reset did not clear final scores');
  assert(Object.keys(afterReset.raw.prelimSubmitted || {}).length === 0, 'reset did not clear prelim submissions map');
  assert(Object.keys(afterReset.raw.finalSubmitted || {}).length === 0, 'reset did not clear final submissions map');
  assert(Array.isArray(afterReset.history) && afterReset.history.length === 0, 'reset did not clear score history');
  assert(afterReset.winner === null, 'reset did not clear winner');
  ok('Reset clears scores, submissions, history, and winner');

  log('20. RUNTIME JSON FILES ARE NOT TRACKED BY GIT');
  const trackedRuntime = runCapture('git', [
    'ls-files',
    '--',
    'data/event-state.json',
    'data/audit-log.jsonl'
  ]);

  assert(trackedRuntime === '', `runtime JSON files are tracked by git:\n${trackedRuntime}`);
  ok('Runtime JSON files are not tracked by git');

  log('LIFECYCLE SMOKE PASSED');
  console.log(`All ${passed} lifecycle checks passed.`);
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error('\n===== LIFECYCLE SMOKE FAILED =====');
  console.error(error?.stack || error?.message || error);
} finally {
  await stopServer();
  restoreData();
  try {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup failure
  }
}

process.exit(exitCode);

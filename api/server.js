import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const dataDir = path.join(__dirname, '..', 'data');
const stateFile = path.join(dataDir, 'event-state.json');
const auditFile = path.join(dataDir, 'audit-log.jsonl');

fs.mkdirSync(dataDir, { recursive: true });

const sessions = new Map();

function now() {
  return new Date().toISOString();
}

function safeId(prefix, index) {
  return `${prefix}_${index}`;
}

function defaultConfig() {
  return {
    eventName: 'Miss TYCA 2026',
    systemName: 'Scoryn',
    subtitle: 'Official LAN tabulation system',
    candidates: Array.from({ length: 12 }, (_, index) => ({
      id: safeId('candidate', index + 1),
      number: index + 1,
      name: `Candidate ${index + 1}`,
      active: true
    })),
    judges: Array.from({ length: 8 }, (_, index) => ({
      id: safeId('judge', index + 1),
      name: `Judge ${index + 1}`,
      pin: `judge${index + 1}`,
      enabled: true
    })),
    rounds: {
      prelim: {
        name: 'Preliminary Round',
        topCount: 3,
        criteria: [
          { id: 'production_number', name: 'Production Number', weight: 10, maxScore: 100 },
          { id: 'fun_wear', name: 'Fun Wear', weight: 15, maxScore: 100 },
          { id: 'preliminary_interview', name: 'Preliminary Interview', weight: 20, maxScore: 100 },
          { id: 'advocacy_interview', name: 'Advocacy Interview', weight: 25, maxScore: 100 },
          { id: 'long_gown', name: 'Long Gown', weight: 30, maxScore: 100 }
        ]
      },
      final: {
        name: 'Final Round',
        criteria: [
          { id: 'beauty_poise', name: 'Beauty and Poise', weight: 60, maxScore: 100 },
          { id: 'wit_answer', name: 'Wit, Intelligence, and Quality of Answer', weight: 40, maxScore: 100 }
        ]
      }
    }
  };
}

function defaultState() {
  return {
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    config: defaultConfig(),
    scores: {
      prelim: {},
      final: {}
    },
    submissions: {
      prelim: {},
      final: {}
    },
    history: [],
    winner: null
  };
}

function readState() {
  if (!fs.existsSync(stateFile)) {
    const state = defaultState();
    writeState(state);
    return state;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return normalizeState(parsed);
  } catch {
    const state = defaultState();
    writeState(state);
    return state;
  }
}

function writeState(state) {
  state.updatedAt = now();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function normalizeState(state) {
  const fallback = defaultState();
  const next = {
    ...fallback,
    ...state,
    config: {
      ...fallback.config,
      ...(state.config || {}),
      rounds: {
        ...fallback.config.rounds,
        ...(state.config?.rounds || {})
      }
    },
    scores: {
      prelim: state.scores?.prelim || {},
      final: state.scores?.final || {}
    },
    submissions: {
      prelim: state.submissions?.prelim || {},
      final: state.submissions?.final || {}
    },
    history: Array.isArray(state.history) ? state.history : [],
    winner: state.winner || null
  };

  next.config.candidates = Array.isArray(next.config.candidates) ? next.config.candidates : fallback.config.candidates;
  next.config.judges = Array.isArray(next.config.judges) ? next.config.judges : fallback.config.judges;
  next.config.rounds.prelim.criteria = Array.isArray(next.config.rounds.prelim.criteria)
    ? next.config.rounds.prelim.criteria
    : fallback.config.rounds.prelim.criteria;
  next.config.rounds.final.criteria = Array.isArray(next.config.rounds.final.criteria)
    ? next.config.rounds.final.criteria
    : fallback.config.rounds.final.criteria;

  return next;
}

function audit(action, meta = {}) {
  const row = {
    time: now(),
    action,
    ...meta
  };

  fs.appendFileSync(auditFile, `${JSON.stringify(row)}\n`);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    ...user,
    createdAt: Date.now()
  });
  return token;
}

function userFromRequest(req) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  return sessions.get(token) || null;
}

function requireRole(role) {
  return (req, res, next) => {
    const user = userFromRequest(req);

    if (!user || user.role !== role) {
      return res.status(401).json({ error: `${role} login required` });
    }

    req.user = user;
    next();
  };
}

function activeCandidates(config) {
  return config.candidates
    .filter((candidate) => candidate.active !== false)
    .sort((a, b) => Number(a.number) - Number(b.number));
}

function enabledJudges(config) {
  return config.judges.filter((judge) => judge.enabled !== false);
}

function scoreKey(judgeId, candidateId, criterionId) {
  return `${judgeId}::${candidateId}::${criterionId}`;
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundWeightTotal(criteria) {
  return criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
}

function validateCriteria(criteria, label) {
  if (!Array.isArray(criteria) || criteria.length < 1) {
    return `${label} must have at least one criterion.`;
  }

  const names = new Set();
  const ids = new Set();

  for (const criterion of criteria) {
    const id = String(criterion.id || '').trim();
    const name = String(criterion.name || '').trim();
    const weight = Number(criterion.weight);
    const maxScore = Number(criterion.maxScore ?? 100);

    if (!id) return `${label} has a criterion without an id.`;
    if (!name) return `${label} has a criterion without a name.`;
    if (ids.has(id)) return `${label} has duplicate criterion id: ${id}`;
    if (names.has(name.toLowerCase())) return `${label} has duplicate criterion name: ${name}`;
    if (!Number.isFinite(weight) || weight < 0) return `${label} criterion "${name}" has invalid weight.`;
    if (!Number.isFinite(maxScore) || maxScore <= 0) return `${label} criterion "${name}" has invalid max score.`;

    ids.add(id);
    names.add(name.toLowerCase());
  }

  const total = roundWeightTotal(criteria);
  if (Math.abs(total - 100) > 0.001) {
    return `${label} weights must equal 100%. Current total: ${total}%.`;
  }

  return null;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') return 'Config is required.';

  const candidates = Array.isArray(config.candidates) ? config.candidates : [];
  const judges = Array.isArray(config.judges) ? config.judges : [];
  const active = candidates.filter((candidate) => candidate.active !== false);
  const enabled = judges.filter((judge) => judge.enabled !== false);

  if (active.length < 3) return 'At least 3 active candidates are required.';
  if (enabled.length < 1) return 'At least 1 enabled judge is required.';

  const candidateNumbers = new Set();
  for (const candidate of candidates) {
    const number = Number(candidate.number);
    if (!Number.isInteger(number) || number < 1) return 'Candidate numbers must be positive whole numbers.';
    if (!String(candidate.name || '').trim()) return 'Every candidate must have a name.';
    if (candidateNumbers.has(number)) return `Duplicate candidate number: ${number}`;
    candidateNumbers.add(number);
  }

  const judgePins = new Set();
  for (const judge of judges) {
    const pin = String(judge.pin || '').trim();
    if (!String(judge.name || '').trim()) return 'Every judge must have a name.';
    if (!pin) return 'Every judge must have a PIN.';
    if (judgePins.has(pin)) return `Duplicate judge PIN: ${pin}`;
    judgePins.add(pin);
  }

  const prelimError = validateCriteria(config.rounds?.prelim?.criteria, 'Preliminary Round');
  if (prelimError) return prelimError;

  const finalError = validateCriteria(config.rounds?.final?.criteria, 'Final Round');
  if (finalError) return finalError;

  return null;
}

function scoringStarted(state) {
  return (
    Object.keys(state.scores.prelim || {}).length > 0 ||
    Object.keys(state.scores.final || {}).length > 0 ||
    Object.keys(state.submissions.prelim || {}).length > 0 ||
    Object.keys(state.submissions.final || {}).length > 0
  );
}

function calculateRoundResults(state, roundKey, candidates, criteria) {
  const scores = state.scores[roundKey] || {};
  const judges = enabledJudges(state.config);

  return candidates.map((candidate) => {
    const breakdown = {};
    let total = 0;
    const submittedJudgeSet = new Set();

    for (const criterion of criteria) {
      let sum = 0;
      let count = 0;

      for (const judge of judges) {
        const value = normalizeScore(scores[scoreKey(judge.id, candidate.id, criterion.id)]);

        if (value !== null) {
          sum += value;
          count += 1;
          submittedJudgeSet.add(judge.id);
        }
      }

      const averageRaw = count > 0 ? sum / count : 0;
      const weighted = averageRaw * (Number(criterion.weight || 0) / 100);

      breakdown[criterion.id] = weighted;
      total += weighted;
    }

    return {
      ...candidate,
      breakdown,
      total,
      judgesSubmitted: submittedJudgeSet.size
    };
  }).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return Number(a.number) - Number(b.number);
  }).map((row, index) => ({
    ...row,
    rank: index + 1
  }));
}

function getTop3(state) {
  const candidates = activeCandidates(state.config);
  const criteria = state.config.rounds.prelim.criteria;
  return calculateRoundResults(state, 'prelim', candidates, criteria).slice(0, state.config.rounds.prelim.topCount || 3);
}

function finalOpen(state) {
  const totalJudges = enabledJudges(state.config).length;
  const submitted = Object.keys(state.submissions.prelim || {}).length;
  return totalJudges > 0 && submitted === totalJudges && getTop3(state).length === 3;
}

function publicStatus(state) {
  const totalJudges = enabledJudges(state.config).length;
  const prelimSubmittedCount = Object.keys(state.submissions.prelim || {}).length;
  const finalSubmittedCount = Object.keys(state.submissions.final || {}).length;

  return {
    scoringStarted: scoringStarted(state),
    totalJudges,
    prelimSubmittedCount,
    finalSubmittedCount,
    finalOpen: finalOpen(state)
  };
}

function buildPublicState(state) {
  const candidates = activeCandidates(state.config);
  const prelimResults = calculateRoundResults(state, 'prelim', candidates, state.config.rounds.prelim.criteria);
  const top3 = prelimResults.slice(0, state.config.rounds.prelim.topCount || 3);
  const finalResults = finalOpen(state)
    ? calculateRoundResults(state, 'final', top3, state.config.rounds.final.criteria)
    : [];

  return {
    config: state.config,
    status: publicStatus(state),
    prelimResults,
    top3,
    finalResults,
    winner: state.winner
  };
}

function buildAdminState(state) {
  return {
    ...buildPublicState(state),
    raw: {
      prelimSubmitted: state.submissions.prelim,
      finalSubmitted: state.submissions.final,
      scoreCount: {
        prelim: Object.keys(state.scores.prelim || {}).length,
        final: Object.keys(state.scores.final || {}).length
      }
    },
    history: state.history.slice(-300).reverse()
  };
}

function getJudgeOrNull(state, judgeId) {
  return state.config.judges.find((judge) => judge.id === judgeId && judge.enabled !== false) || null;
}

function myScoreMatrix(state, roundKey, judgeId) {
  const matrix = {};
  const scores = state.scores[roundKey] || {};

  for (const [key, value] of Object.entries(scores)) {
    const [storedJudgeId, candidateId, criterionId] = key.split('::');

    if (storedJudgeId === judgeId) {
      if (!matrix[candidateId]) matrix[candidateId] = {};
      matrix[candidateId][criterionId] = value;
    }
  }

  return matrix;
}

function requiredScoreCountForJudge(state, roundKey) {
  const candidates = roundKey === 'final' ? getTop3(state) : activeCandidates(state.config);
  const criteria = state.config.rounds[roundKey].criteria;
  return candidates.length * criteria.length;
}

function actualScoreCountForJudge(state, roundKey, judgeId) {
  return Object.keys(state.scores[roundKey] || {}).filter((key) => key.startsWith(`${judgeId}::`)).length;
}

app.get('/api/health', (req, res) => {
  const state = readState();

  res.json({
    ok: true,
    app: 'Scoryn TYCA LAN API',
    eventName: state.config.eventName,
    judges: state.config.judges.length,
    candidates: state.config.candidates.length,
    status: publicStatus(state)
  });
});

app.get('/api/state', (req, res) => {
  res.json(buildPublicState(readState()));
});

app.post('/api/login', (req, res) => {
  const state = readState();
  const role = String(req.body.role || '').trim();
  const pin = String(req.body.pin || '').trim();

  if (role === 'admin') {
    if (pin !== String(process.env.ADMIN_PIN || 'admin2026')) {
      return res.status(401).json({ error: 'Invalid admin PIN' });
    }

    const user = { role: 'admin', name: 'Admin' };
    const token = createSession(user);
    audit('admin_login');

    return res.json({
      token,
      ...user
    });
  }

  if (role === 'developer') {
    if (pin !== String(process.env.DEVELOPER_PIN || 'dev2026')) {
      return res.status(401).json({ error: 'Invalid developer PIN' });
    }

    const user = { role: 'developer', name: 'Developer' };
    const token = createSession(user);
    audit('developer_login');

    return res.json({
      token,
      ...user
    });
  }

  if (role === 'judge') {
    const judge = state.config.judges.find((item) => item.pin === pin && item.enabled !== false);

    if (!judge) {
      return res.status(401).json({ error: 'Invalid judge PIN' });
    }

    const user = {
      role: 'judge',
      judgeId: judge.id,
      name: judge.name
    };

    const token = createSession(user);
    audit('judge_login', { judgeId: judge.id, judgeName: judge.name });

    return res.json({
      token,
      ...user
    });
  }

  return res.status(400).json({ error: 'Invalid role' });
});

app.get('/api/judge/state', requireRole('judge'), (req, res) => {
  const state = readState();
  const judge = getJudgeOrNull(state, req.user.judgeId);

  if (!judge) {
    return res.status(403).json({ error: 'Judge is disabled or no longer exists.' });
  }

  res.json({
    ...buildPublicState(state),
    me: judge,
    myPrelimScores: myScoreMatrix(state, 'prelim', judge.id),
    myFinalScores: myScoreMatrix(state, 'final', judge.id),
    myPrelimSubmittedAt: state.submissions.prelim[judge.id] || null,
    myFinalSubmittedAt: state.submissions.final[judge.id] || null,
    required: {
      prelim: requiredScoreCountForJudge(state, 'prelim'),
      final: finalOpen(state) ? requiredScoreCountForJudge(state, 'final') : 0
    },
    filled: {
      prelim: actualScoreCountForJudge(state, 'prelim', judge.id),
      final: actualScoreCountForJudge(state, 'final', judge.id)
    }
  });
});

app.get('/api/admin/state', requireRole('admin'), (req, res) => {
  res.json(buildAdminState(readState()));
});

app.get('/api/developer/state', requireRole('developer'), (req, res) => {
  res.json(buildAdminState(readState()));
});

app.post('/api/developer/config', requireRole('developer'), (req, res) => {
  const state = readState();

  if (scoringStarted(state)) {
    return res.status(409).json({ error: 'Setup is locked because scoring already started. Reset event first.' });
  }

  const config = req.body.config;
  const error = validateConfig(config);

  if (error) {
    return res.status(400).json({ error });
  }

  state.config = config;
  writeState(state);

  audit('developer_config_saved', {
    candidates: config.candidates.length,
    judges: config.judges.length,
    prelimCriteria: config.rounds.prelim.criteria.length,
    finalCriteria: config.rounds.final.criteria.length
  });

  res.json({
    ok: true,
    config: state.config
  });
});

app.post('/api/developer/reset', requireRole('developer'), (req, res) => {
  if (req.body.phrase !== 'RESET TYCA') {
    return res.status(400).json({ error: 'Reset phrase mismatch.' });
  }

  const state = readState();
  state.scores = { prelim: {}, final: {} };
  state.submissions = { prelim: {}, final: {} };
  state.history = [];
  state.winner = null;
  writeState(state);

  audit('developer_reset_event');

  res.json({ ok: true });
});

app.post('/api/score/:roundKey', requireRole('judge'), (req, res) => {
  const state = readState();
  const roundKey = req.params.roundKey;

  if (!['prelim', 'final'].includes(roundKey)) {
    return res.status(404).json({ error: 'Round not found.' });
  }

  const judge = getJudgeOrNull(state, req.user.judgeId);
  if (!judge) {
    return res.status(403).json({ error: 'Judge is disabled or no longer exists.' });
  }

  if (state.submissions[roundKey]?.[judge.id]) {
    return res.status(423).json({ error: 'Scores are already submitted and locked.' });
  }

  if (roundKey === 'final' && !finalOpen(state)) {
    return res.status(423).json({
      error: `Finals are locked until all Preliminary judges submit. ${publicStatus(state).prelimSubmittedCount}/${publicStatus(state).totalJudges} judges submitted.`
    });
  }

  const { candidateId, criterionId, value } = req.body;
  const criteria = state.config.rounds[roundKey].criteria;
  const criterion = criteria.find((item) => item.id === criterionId);

  if (!criterion) {
    return res.status(400).json({ error: 'Criterion not found.' });
  }

  const allowedCandidates = roundKey === 'final' ? getTop3(state) : activeCandidates(state.config);
  const candidate = allowedCandidates.find((item) => item.id === candidateId);

  if (!candidate) {
    return res.status(400).json({
      error: roundKey === 'final'
        ? 'Final scoring is only allowed for official Top 3 candidates.'
        : 'Candidate not found.'
    });
  }

  const numeric = normalizeScore(value);
  const maxScore = Number(criterion.maxScore ?? 100);

  if (numeric === null || numeric < 0 || numeric > maxScore) {
    return res.status(400).json({ error: `Score must be from 0 to ${maxScore}.` });
  }

  const key = scoreKey(judge.id, candidate.id, criterion.id);
  const oldScore = state.scores[roundKey][key] ?? null;

  state.scores[roundKey][key] = numeric;

  const entry = {
    id: crypto.randomUUID(),
    time: now(),
    round: roundKey,
    judgeId: judge.id,
    judgeName: judge.name,
    candidateId: candidate.id,
    candidateNumber: candidate.number,
    candidateName: candidate.name,
    criterionId: criterion.id,
    criterionName: criterion.name,
    oldScore,
    newScore: numeric,
    action: oldScore === null ? 'initial_save' : 'edited_score'
  };

  state.history.push(entry);
  writeState(state);
  audit('score_saved', entry);

  res.json({ ok: true, score: numeric });
});

app.post('/api/submit/:roundKey', requireRole('judge'), (req, res) => {
  const state = readState();
  const roundKey = req.params.roundKey;

  if (!['prelim', 'final'].includes(roundKey)) {
    return res.status(404).json({ error: 'Round not found.' });
  }

  const judge = getJudgeOrNull(state, req.user.judgeId);
  if (!judge) {
    return res.status(403).json({ error: 'Judge is disabled or no longer exists.' });
  }

  if (roundKey === 'final' && !finalOpen(state)) {
    return res.status(423).json({
      error: `Finals are locked until all Preliminary judges submit. ${publicStatus(state).prelimSubmittedCount}/${publicStatus(state).totalJudges} judges submitted.`
    });
  }

  const required = requiredScoreCountForJudge(state, roundKey);
  const filled = actualScoreCountForJudge(state, roundKey, judge.id);

  if (filled < required) {
    return res.status(400).json({ error: `Incomplete scores. ${filled}/${required} fields filled.` });
  }

  if (!state.submissions[roundKey]) state.submissions[roundKey] = {};
  if (!state.submissions[roundKey][judge.id]) {
    state.submissions[roundKey][judge.id] = now();
  }

  writeState(state);

  audit('judge_submitted', {
    round: roundKey,
    judgeId: judge.id,
    judgeName: judge.name,
    submittedAt: state.submissions[roundKey][judge.id]
  });

  res.json({
    ok: true,
    submittedAt: state.submissions[roundKey][judge.id]
  });
});

app.post('/api/admin/winner', requireRole('admin'), (req, res) => {
  const state = readState();
  const name = String(req.body.name || '').trim();

  if (!name) {
    return res.status(400).json({ error: 'Winner name is required.' });
  }

  state.winner = {
    name,
    declaredAt: now()
  };

  writeState(state);
  audit('winner_declared', state.winner);

  res.json({ ok: true, winner: state.winner });
});

app.delete('/api/admin/winner', requireRole('admin'), (req, res) => {
  const state = readState();
  state.winner = null;
  writeState(state);
  audit('winner_cleared');
  res.json({ ok: true });
});

app.get('/api/audit/routes', requireRole('admin'), (req, res) => {
  res.json({
    routes: [
      'GET /api/health',
      'GET /api/state',
      'POST /api/login',
      'GET /api/judge/state',
      'GET /api/admin/state',
      'GET /api/developer/state',
      'POST /api/developer/config',
      'POST /api/developer/reset',
      'POST /api/score/:roundKey',
      'POST /api/submit/:roundKey',
      'POST /api/admin/winner',
      'DELETE /api/admin/winner',
      'GET /api/audit/routes'
    ],
    stablePattern: [
      'separate admin and judge login',
      'setup/config endpoint',
      'score save validates range',
      'score save blocked after submit',
      'final submit requires all fields',
      'average score per criterion',
      'weighted criterion totals',
      'top 3 gate',
      'finals lock',
      'audit history'
    ]
  });
});

const distPath = path.join(__dirname, '..', 'dist');

app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
    return;
  }

  next();
});

app.listen(PORT, HOST, () => {
  console.log(`Scoryn TYCA LAN API running on http://${HOST}:${PORT}`);
});

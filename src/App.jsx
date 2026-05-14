import React, { useEffect, useState } from 'react';

const TOKEN_KEY = 'scoryn_tyca_token';
const USER_KEY = 'scoryn_tyca_user';

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

function scoreText(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function Header({ user, onLogout }) {
  return (
    <header className="top-card">
      <div className="logo-mark">TYCA</div>
      <div>
        <div className="eyebrow">Official Event System</div>
        <h1>Miss TYCA 2026</h1>
        <strong>powered by Scoryn</strong>
        <p>Scoryn online tabulation for pageants, competitions, and judged events</p>
      </div>
      {user && <button className="ghost-button" onClick={onLogout}>Logout</button>}
    </header>
  );
}

function Login({ onLogin }) {
  const [role, setRole] = useState('judge');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const roleLabel = role === 'admin'
    ? 'Admin PIN'
    : role === 'developer'
      ? 'Developer PIN'
      : 'Judge PIN';

  const enterLabel = role === 'admin'
    ? 'Dashboard'
    : role === 'developer'
      ? 'Event Builder'
      : 'Judge Panel';

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ role, pin })
      });

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page narrow">
      <section className="hero-card">
        <div className="eyebrow">LAN Production System</div>
        <h2>Fast, clean, and reliable pageant tabulation.</h2>
        <p>
          Built for Miss TYCA 2026 with 8 judges, 12 candidates, custom criteria,
          locked submissions, Top 3 finals flow, and live display.
        </p>

        <div className="role-grid">
          <button type="button" className={role === 'judge' ? 'role active' : 'role'} onClick={() => setRole('judge')}>
            <strong>Judge</strong>
            <span>Open Judge Panel</span>
          </button>
          <button type="button" className={role === 'admin' ? 'role active' : 'role'} onClick={() => setRole('admin')}>
            <strong>Admin</strong>
            <span>Live tabulation only</span>
          </button>
          <button type="button" className={role === 'developer' ? 'role active' : 'role'} onClick={() => setRole('developer')}>
            <strong>Developer</strong>
            <span>Open Event Builder</span>
          </button>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>{roleLabel}</label>
          <input value={pin} onChange={(event) => setPin(event.target.value)} autoFocus />
          <button type="submit">Enter {enterLabel}</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="info-strip">
        <strong>Default access</strong>
        <span>Admin: admin2026 · Developer: dev2026 · Judges: judge1 to judge8</span>
      </section>
    </main>
  );
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function DeveloperBuilder({ state, onSaved }) {
  const [draft, setDraft] = useState(() => cloneConfig(state.config));
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraft(cloneConfig(state.config));
  }, [state.config]);

  const locked = Boolean(state.status.scoringStarted);

  function setField(path, value) {
    setDraft((current) => {
      const next = cloneConfig(current);
      let cursor = next;

      for (let index = 0; index < path.length - 1; index += 1) {
        cursor = cursor[path[index]];
      }

      cursor[path[path.length - 1]] = value;
      return next;
    });
  }

  function updateCandidate(id, key, value) {
    setDraft((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) => {
        return candidate.id === id ? { ...candidate, [key]: value } : candidate;
      })
    }));
  }

  function addCandidate() {
    setDraft((current) => ({
      ...current,
      candidates: [
        ...current.candidates,
        {
          id: makeId('candidate'),
          number: current.candidates.length + 1,
          name: `Candidate ${current.candidates.length + 1}`,
          active: true
        }
      ]
    }));
  }

  function removeCandidate(id) {
    setDraft((current) => ({
      ...current,
      candidates: current.candidates.filter((candidate) => candidate.id !== id)
    }));
  }

  function updateJudge(id, key, value) {
    setDraft((current) => ({
      ...current,
      judges: current.judges.map((judge) => {
        return judge.id === id ? { ...judge, [key]: value } : judge;
      })
    }));
  }

  function addJudge() {
    setDraft((current) => ({
      ...current,
      judges: [
        ...current.judges,
        {
          id: makeId('judge'),
          name: `Judge ${current.judges.length + 1}`,
          pin: `judge${current.judges.length + 1}`,
          enabled: true
        }
      ]
    }));
  }

  function removeJudge(id) {
    setDraft((current) => ({
      ...current,
      judges: current.judges.filter((judge) => judge.id !== id)
    }));
  }

  function updateCriterion(roundKey, id, key, value) {
    setDraft((current) => ({
      ...current,
      rounds: {
        ...current.rounds,
        [roundKey]: {
          ...current.rounds[roundKey],
          criteria: current.rounds[roundKey].criteria.map((criterion) => {
            return criterion.id === id ? { ...criterion, [key]: value } : criterion;
          })
        }
      }
    }));
  }

  function addCriterion(roundKey) {
    setDraft((current) => {
      const criteria = current.rounds[roundKey].criteria;

      return {
        ...current,
        rounds: {
          ...current.rounds,
          [roundKey]: {
            ...current.rounds[roundKey],
            criteria: [
              ...criteria,
              {
                id: makeId('criterion'),
                name: `Criterion ${criteria.length + 1}`,
                weight: 0
              }
            ]
          }
        }
      };
    });
  }

  function removeCriterion(roundKey, id) {
    setDraft((current) => ({
      ...current,
      rounds: {
        ...current.rounds,
        [roundKey]: {
          ...current.rounds[roundKey],
          criteria: current.rounds[roundKey].criteria.filter((criterion) => criterion.id !== id)
        }
      }
    }));
  }

  function totalWeight(roundKey) {
    return draft.rounds[roundKey].criteria.reduce((sum, criterion) => {
      return sum + Number(criterion.weight || 0);
    }, 0);
  }

  async function saveSetup() {
    setMessage('');

    try {
      await api('/api/developer/config', {
        method: 'POST',
        body: JSON.stringify({ config: draft })
      });

      setMessage('Setup saved.');
      await onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetEvent() {
    const phrase = prompt('Type RESET TYCA to clear all scores and unlock setup.');

    if (phrase !== 'RESET TYCA') {
      setMessage('Reset cancelled.');
      return;
    }

    try {
      await api('/api/developer/reset', {
        method: 'POST',
        body: JSON.stringify({ phrase })
      });

      setMessage('Event scores reset. Setup is unlocked.');
      await onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <section className="section-card">
      <div className="eyebrow">Event Builder</div>
      <h2>Developer Event Builder</h2>
      <p>
        Configure candidates, judges, PINs, and criteria before scoring starts.
        {locked ? ' Setup is currently locked because scoring already started.' : ' Setup is currently editable.'}
      </p>

      {message && (
        <p className={message.toLowerCase().includes('saved') || message.toLowerCase().includes('reset') ? 'ok' : 'error'}>
          {message}
        </p>
      )}

      <div className="setup-grid">
        <label className="setup-field">
          <span>Event Name</span>
          <input disabled={locked} value={draft.eventName} onChange={(event) => setField(['eventName'], event.target.value)} />
        </label>

        <label className="setup-field">
          <span>System Name</span>
          <input disabled={locked} value={draft.systemName} onChange={(event) => setField(['systemName'], event.target.value)} />
        </label>

        <label className="setup-field wide">
          <span>Subtitle</span>
          <input disabled={locked} value={draft.subtitle} onChange={(event) => setField(['subtitle'], event.target.value)} />
        </label>
      </div>

      <div className="builder-block">
        <div className="builder-head">
          <div>
            <h3>Candidates</h3>
            <p>{draft.candidates.length} total candidates</p>
          </div>
          <button disabled={locked} onClick={addCandidate}>Add Candidate</button>
        </div>

        <div className="builder-list">
          {draft.candidates.map((candidate) => (
            <div className="builder-row" key={candidate.id}>
              <input disabled={locked} value={candidate.number} type="number" onChange={(event) => updateCandidate(candidate.id, 'number', Number(event.target.value))} />
              <input disabled={locked} value={candidate.name} onChange={(event) => updateCandidate(candidate.id, 'name', event.target.value)} />
              <label className="check-line">
                <input disabled={locked} type="checkbox" checked={candidate.active !== false} onChange={(event) => updateCandidate(candidate.id, 'active', event.target.checked)} />
                Active
              </label>
              <button disabled={locked || draft.candidates.length <= 3} onClick={() => removeCandidate(candidate.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="builder-block">
        <div className="builder-head">
          <div>
            <h3>Judges and PINs</h3>
            <p>{draft.judges.length} total judges</p>
          </div>
          <button disabled={locked} onClick={addJudge}>Add Judge</button>
        </div>

        <div className="builder-list">
          {draft.judges.map((judge) => (
            <div className="builder-row" key={judge.id}>
              <input disabled={locked} value={judge.name} onChange={(event) => updateJudge(judge.id, 'name', event.target.value)} />
              <input disabled={locked} value={judge.pin} onChange={(event) => updateJudge(judge.id, 'pin', event.target.value)} />
              <label className="check-line">
                <input disabled={locked} type="checkbox" checked={judge.enabled !== false} onChange={(event) => updateJudge(judge.id, 'enabled', event.target.checked)} />
                Enabled
              </label>
              <button disabled={locked || draft.judges.length <= 1} onClick={() => removeJudge(judge.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      {['prelim', 'final'].map((roundKey) => (
        <div className="builder-block" key={roundKey}>
          <div className="builder-head">
            <div>
              <h3>{draft.rounds[roundKey].name}</h3>
              <p className={Math.abs(totalWeight(roundKey) - 100) < 0.001 ? 'ok' : 'error'}>
                Total weight: {totalWeight(roundKey)}%
              </p>
            </div>
            <button disabled={locked} onClick={() => addCriterion(roundKey)}>Add Criterion</button>
          </div>

          <label className="setup-field">
            <span>Round Name</span>
            <input disabled={locked} value={draft.rounds[roundKey].name} onChange={(event) => setField(['rounds', roundKey, 'name'], event.target.value)} />
          </label>

          <div className="builder-list">
            {draft.rounds[roundKey].criteria.map((criterion) => (
              <div className="builder-row" key={criterion.id}>
                <input disabled={locked} value={criterion.name} onChange={(event) => updateCriterion(roundKey, criterion.id, 'name', event.target.value)} />
                <input disabled={locked} type="number" value={criterion.weight} onChange={(event) => updateCriterion(roundKey, criterion.id, 'weight', Number(event.target.value))} />
                <button disabled={locked || draft.rounds[roundKey].criteria.length <= 1} onClick={() => removeCriterion(roundKey, criterion.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="button-row admin-actions">
        <button disabled={locked} onClick={saveSetup}>Save Setup</button>
        <button className="ghost-button" onClick={resetEvent}>Reset Scores / Unlock</button>
      </div>
    </section>
  );
}



function ResultsTable({ rows, criteria, totalLabel = 'Total' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Candidate</th>
            {criteria.map((criterion) => <th key={criterion.id}>{criterion.name}</th>)}
            <th>{totalLabel}</th>
            <th>Judges</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={criteria.length + 4}>No ranking data yet.</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.id}>
              <td>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}</td>
              <td>#{row.number} {row.name}</td>
              {criteria.map((criterion) => (
                <td key={criterion.id}>{scoreText(row.breakdown?.[criterion.id])}</td>
              ))}
              <td className="score-total">{scoreText(row.total)}</td>
              <td>{row.judgesSubmitted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminDashboard({ user, onLogout }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api('/api/admin/state');
    setState(data);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
    const timer = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);

  if (!state) {
    return (
      <main className="page">
        <Header user={user} onLogout={onLogout} />
        <section className="section-card">Loading admin dashboard...</section>
      </main>
    );
  }

  return (
    <main className="page">
      <Header user={user} onLogout={onLogout} />

      <section className="section-card split">
        <div>
          <div className="eyebrow">Admin Control</div>
          <h2>Live Tabulation</h2>
          <p>
            Preliminary submissions: {state.status.prelimSubmittedCount}/{state.status.totalJudges}.
            Finals open: {state.status.finalOpen ? 'Yes' : 'No'}.
          </p>
          {message && <p className="error">{message}</p>}
        </div>

        <div className="button-row">
          <button onClick={load}>Refresh</button>
          <button onClick={() => window.open('/?tv=top3', '_blank')}>TV Top 3</button>
          <button onClick={() => window.open('/?tv=final', '_blank')}>TV Finals</button>
        </div>
      </section>


      <section className="section-card">
        <div className="eyebrow">Finals Results</div>
        <h2>{state.status.finalOpen ? 'Final Round Ranking' : 'Waiting for Official Top 3'}</h2>
        <ResultsTable rows={state.finalResults} criteria={state.config.rounds.final.criteria} totalLabel="Final Score" />
      </section>

      <section className="section-card">
        <div className="eyebrow">Official Top 3 Finalists</div>
        <div className="leader-grid">
          {state.top3.length ? state.top3.map((candidate, index) => (
            <article key={candidate.id} className="leader-card">
              <span className="pill">Rank {index + 1}</span>
              <h3>#{candidate.number} {candidate.name}</h3>
              <strong>{scoreText(candidate.total)}</strong>
            </article>
          )) : <p>Top 3 will appear after all preliminary judges submit.</p>}
        </div>
      </section>

      <section className="section-card">
        <div className="eyebrow">Preliminary Round Results</div>
        <h2>Preliminary Ranking</h2>
        <ResultsTable rows={state.prelimResults} criteria={state.config.rounds.prelim.criteria} />
      </section>

      <section className="section-card">
        <div className="eyebrow">Judge Submission Status</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Judge</th>
                <th>Enabled</th>
                <th>Preliminary</th>
                <th>Finals</th>
              </tr>
            </thead>
            <tbody>
              {state.config.judges.map((judge) => (
                <tr key={judge.id}>
                  <td>{judge.name}</td>
                  <td>{judge.enabled === false ? 'No' : 'Yes'}</td>
                  <td>{state.raw.prelimSubmitted[judge.id] ? 'Locked' : 'Editing'}</td>
                  <td>{state.raw.finalSubmitted[judge.id] ? 'Locked' : 'Editing'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}


function DeveloperDashboard({ user, onLogout }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api('/api/developer/state');
    setState(data);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
    const timer = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);

  if (!state) {
    return (
      <main className="page">
        <Header user={user} onLogout={onLogout} />
        <section className="section-card">Loading developer event builder...</section>
      </main>
    );
  }

  return (
    <main className="page">
      <Header user={user} onLogout={onLogout} />

      <section className="section-card split">
        <div>
          <div className="eyebrow">Developer Access</div>
          <h2>Event Builder</h2>
          <p>
            Configure event setup separately from the event admin dashboard.
            Admin stays focused on live tabulation, judges stay focused on scoring.
          </p>
          <p>
            Preliminary submissions: {state.status.prelimSubmittedCount}/{state.status.totalJudges}.
            Finals open: {state.status.finalOpen ? 'Yes' : 'No'}.
          </p>
          {message && <p className="error">{message}</p>}
        </div>

        <div className="button-row">
          <button onClick={load}>Refresh</button>
          <button onClick={() => window.open('/?tv=top3', '_blank')}>TV Top 3</button>
          <button onClick={() => window.open('/?tv=final', '_blank')}>TV Finals</button>
        </div>
      </section>

      <DeveloperBuilder state={state} onSaved={load} />
    </main>
  );
}


function ScoreInput({ value, disabled, onSave }) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  return (
    <input
      type="number"
      min="0"
      max="100"
      step="0.01"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onSave(draft)}
      placeholder="0-100"
    />
  );
}

function countFilled(scores, candidates, criteria) {
  let count = 0;

  for (const candidate of candidates) {
    for (const criterion of criteria) {
      const value = scores?.[candidate.id]?.[criterion.id];

      if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
        count += 1;
      }
    }
  }

  return count;
}

function ProgressCard({ done, total }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="progress-card">
      <strong>{percent}%</strong>
      <span>{done} of {total} fields filled</span>
      <div className="bar">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function JudgePanel({ user, onLogout }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api('/api/judge/state');
    setState(data);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
    const timer = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);

  async function saveScore(roundKey, candidateId, criterionId, value) {
    setMessage('');

    try {
      await api(`/api/score/${roundKey}`, {
        method: 'POST',
        body: JSON.stringify({ candidateId, criterionId, value })
      });

      setMessage('Score saved.');
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function submitRound(roundKey) {
    const label = roundKey === 'prelim' ? 'Preliminary Round' : 'Final Round';

    if (!confirm(`Submit and lock your ${label} scores? This cannot be edited after submit.`)) {
      return;
    }

    setMessage('');

    try {
      await api(`/api/submit/${roundKey}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      setMessage(`${label} submitted and locked.`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!state) {
    return (
      <main className="page">
        <Header user={user} onLogout={onLogout} />
        <section className="section-card">Loading judge panel...</section>
      </main>
    );
  }

  const activeCandidates = state.config.candidates.filter((candidate) => candidate.active !== false);
  const prelimCriteria = state.config.rounds.prelim.criteria;
  const finalCriteria = state.config.rounds.final.criteria;

  const prelimDone = countFilled(state.myPrelimScores, activeCandidates, prelimCriteria);
  const prelimTotal = activeCandidates.length * prelimCriteria.length;

  const finalCandidates = state.top3 || [];
  const finalDone = countFilled(state.myFinalScores, finalCandidates, finalCriteria);
  const finalTotal = finalCandidates.length * finalCriteria.length;

  const prelimLocked = Boolean(state.myPrelimSubmittedAt);
  const finalLocked = Boolean(state.myFinalSubmittedAt);

  return (
    <main className="page">
      <Header user={user} onLogout={onLogout} />

      <section className="section-card split">
        <div>
          <div className="eyebrow">Judge Panel</div>
          <h2>{user.name}</h2>
          <p>Input scores from 0 to 100. Scores can be edited until final submit.</p>
          {message && (
            <p className={message.toLowerCase().includes('saved') || message.toLowerCase().includes('submitted') ? 'ok' : 'error'}>
              {message}
            </p>
          )}
        </div>

        <ProgressCard done={prelimDone} total={prelimTotal} />

        <button disabled={prelimLocked} onClick={() => submitRound('prelim')}>
          {prelimLocked ? 'Preliminary Locked' : 'Final Submit Preliminary'}
        </button>
      </section>

      <section className="section-card">
        <div className="eyebrow">{state.config.rounds.prelim.name}</div>
        <h2>Preliminary Score Sheet</h2>

        {activeCandidates.map((candidate) => (
          <article key={candidate.id} className="candidate-card">
            <div className="candidate-head">
              <div>
                <span className="pill">Candidate #{candidate.number}</span>
                <h3>{candidate.name}</h3>
              </div>
            </div>

            <div className="score-grid">
              {prelimCriteria.map((criterion) => (
                <label key={criterion.id} className="score-box">
                  <strong>{criterion.name}</strong>
                  <span>Input / 100 · Counts as {criterion.weight}%</span>
                  <ScoreInput
                    disabled={prelimLocked}
                    value={state.myPrelimScores?.[candidate.id]?.[criterion.id] ?? ''}
                    onSave={(value) => saveScore('prelim', candidate.id, criterion.id, value)}
                  />
                </label>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="section-card split">
        <div>
          <div className="eyebrow">{state.config.rounds.final.name}</div>
          <h2>{state.status.finalOpen ? 'Finals Open · Top 3 Only' : 'Finals Locked'}</h2>
          <p>
            {state.status.finalOpen
              ? 'Score only the official Top 3 finalists.'
              : `Finals opens after all preliminary judges submit. Current submissions: ${state.status.prelimSubmittedCount}/${state.status.totalJudges}.`}
          </p>
        </div>

        {state.status.finalOpen && <ProgressCard done={finalDone} total={finalTotal} />}

        {state.status.finalOpen && (
          <button disabled={finalLocked} onClick={() => submitRound('final')}>
            {finalLocked ? 'Finals Locked' : 'Final Submit Finals'}
          </button>
        )}
      </section>

      {state.status.finalOpen && (
        <section className="section-card">
          <div className="eyebrow">Final Round Score Sheet</div>
          <h2>Official Top 3 Finalists</h2>

          {finalCandidates.map((candidate) => (
            <article key={candidate.id} className="candidate-card">
              <div className="candidate-head">
                <div>
                  <span className="pill">Top 3 · Candidate #{candidate.number}</span>
                  <h3>{candidate.name}</h3>
                </div>
              </div>

              <div className="score-grid final-grid">
                {finalCriteria.map((criterion) => (
                  <label key={criterion.id} className="score-box">
                    <strong>{criterion.name}</strong>
                    <span>Input / 100 · Counts as {criterion.weight}%</span>
                    <ScoreInput
                      disabled={finalLocked}
                      value={state.myFinalScores?.[candidate.id]?.[criterion.id] ?? ''}
                      onSave={(value) => saveScore('final', candidate.id, criterion.id, value)}
                    />
                  </label>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function TvDisplay
({ type }) {
  const [state, setState] = useState(null);

  async function load() {
    const data = await api('/api/state');
    setState(data);
  }

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);

  if (!state) return <main className="tv-page">Loading live display...</main>;

  const rows = type === 'final' ? state.finalResults : state.top3;

  return (
    <main className="tv-page">
      <section className="tv-header">
        <div className="logo-mark">TYCA</div>
        <div>
          <div className="eyebrow">Official Live Display</div>
          <h1>Miss TYCA 2026</h1>
          <p>{type === 'final' ? 'Final Winners' : 'Official Top 3 Finalists'}</p>
        </div>
      </section>

      <section className="tv-results">
        {rows.length ? rows.map((row, index) => (
          <article key={row.id} className={index === 0 ? 'tv-winner' : 'tv-card'}>
            <span>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} Rank {index + 1}</span>
            <h2>#{row.number} {row.name}</h2>
            <strong>{scoreText(row.total)}</strong>
          </article>
        )) : <h2>Waiting for official results...</h2>}
      </section>
    </main>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const tv = params.get('tv');

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  if (tv === 'top3') return <TvDisplay type="top3" />;
  if (tv === 'final') return <TvDisplay type="final" />;

  if (!user) {
    return (
      <>
        <Header />
        <Login onLogin={setUser} />
      </>
    );
  }

  if (user.role === 'admin') return <AdminDashboard user={user} onLogout={logout} />;
  if (user.role === 'developer') return <DeveloperDashboard user={user} onLogout={logout} />;
  return <JudgePanel user={user} onLogout={logout} />;
}

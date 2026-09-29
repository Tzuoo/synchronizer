// Offline B-04 contract prototype. Not imported by the dashboard, extension or API.
// This returns a proposed change set only; it never persists or deletes data.
export function planLedgerSnapshot(previous, snapshot, verification) {
  const keys = ['date', 'site', 'account', 'gameName', 'phaseName', 'clientSite'];
  const matches = (value, scope) => keys.every(key => value?.[key] === scope[key]);
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.rows) ||
      !Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1 ||
      !keys.every(key => typeof snapshot.scope?.[key] === 'string' && snapshot.scope[key].trim()) ||
      typeof snapshot.complete !== 'boolean' ||
      !['success', 'parse-failed'].includes(snapshot.outcome)) throw new Error('Invalid snapshot contract');
  if (!Array.isArray(previous?.rows) || !Number.isSafeInteger(previous.generation)) throw new Error('Invalid previous state');
  if (snapshot.outcome !== 'success' || snapshot.generation <= previous.generation) return { upserts: [], withdrawIds: [] };
  const ids = new Set();
  for (const row of snapshot.rows) {
    if (!matches(row, snapshot.scope) || typeof row.id !== 'string' || !row.id ||
        typeof row.playType !== 'string' || !row.playType.trim() || ids.has(row.id) ||
        !['totalAmount', 'winningAmount'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0) ||
        previous.rows.some(old => old.id === row.id && !matches(old, snapshot.scope))) throw new Error('Invalid snapshot row');
    ids.add(row.id);
  }
  const verified = snapshot.complete && matches(verification?.confirmedCompleteScope, snapshot.scope);
  return {
    upserts: snapshot.rows,
    withdrawIds: verified ? previous.rows.filter(row => matches(row, snapshot.scope) && !ids.has(row.id)).map(row => row.id) : [],
  };
}

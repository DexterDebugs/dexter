/* lib/seed-data.example.js — template for the optional historical seed.
 *
 * Dexter's data-recovery layer can re-seed from a bundled historical snapshot if
 * the local data file AND all backups are ever lost. That snapshot is personal,
 * so it lives in lib/seed-data.js (git-ignored). Copy this file to lib/seed-data.js
 * and fill it with your own history to enable the fallback — or ignore it entirely;
 * without it, Dexter simply starts empty on a fresh machine.
 */
function historicalSeed(base = {}) {
  const ratings = [
    // { week: 0, label: 'Week 0', date: '2026-01-01', values: { 'DSA': 5, 'Core CS': 5, 'System Design': 2, 'Portfolio': 7, 'Communication': 2 } },
  ];
  const dailyLogs = [
    // { date: '2026-01-02', axis: 'DSA', activity: 'LeetCode — 3 problems', minutes: 90, notes: '' },
  ];
  const workouts = [
    // { date: '2026-01-02', title: 'Session 01', exercises: ['Pullups 3x8'], notes: '', effort: 3 },
  ];

  return { ...base, ratings, dailyLogs, workouts };
}

module.exports = { historicalSeed };

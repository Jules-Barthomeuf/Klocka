// Le processus enfant de la passe des scores appris (voir passe-scores.js) : il recalcule, puis s'arrête.
const { rescorerToutesLesVilles } = await import('./score-ville.js');
try {
  await rescorerToutesLesVilles({ journal: (t) => console.log(t) });
  process.exit(0);
} catch (e) {
  console.error('[alx] passe des scores appris :', e?.message || e);
  process.exit(1);
}

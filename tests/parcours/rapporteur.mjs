// Le bilan du parcours, étape par étape : ce qui passe, ce qui casse, ce qui
// est attendu (test.fixme, avec sa raison), et où le parcours s'est arrêté.

const MOTS = { passed: 'PASSE   ', failed: 'CASSE   ', timedOut: 'CASSE   ', interrupted: 'CASSE   ' };

export default class Rapporteur {
  constructor() { this.lignes = []; }

  onTestEnd(test, resultat) {
    const projet = test.parent.project()?.name || '';
    if (!['ordinateur', 'telephone'].includes(projet)) {
      const mot = resultat.status === 'passed' ? 'PASSE   ' : resultat.status === 'skipped' ? 'IGNORÉ  ' : 'CASSE   ';
      this.lignes.push({ projet, titre: test.title, mot, detail: resultat.status === 'passed' || resultat.status === 'skipped' ? '' : premiereLigne(resultat) });
      return;
    }
    const attendue = test.annotations.find((a) => a.type === 'fixme');
    let mot = MOTS[resultat.status] || 'PAS LANCÉE';
    let detail = '';
    if (attendue) { mot = 'ATTENDUE'; detail = attendue.description || ''; }
    else if (resultat.status === 'skipped') mot = 'NON LANCÉE';
    else if (resultat.status !== 'passed') detail = premiereLigne(resultat);
    const mesure = test.annotations.filter((a) => a.type === 'mesure').map((a) => a.description).join(' · ');
    this.lignes.push({ projet, titre: test.title, mot, detail: [mesure, detail].filter(Boolean).join(' · ') });
  }

  onEnd(resultat) {
    const sortie = ['', 'Parcours mandataire, étape par étape'];
    for (const projet of ['', 'ordinateur', 'telephone']) {
      const lignes = this.lignes.filter((l) => l.projet === projet || (projet === '' && !['ordinateur', 'telephone'].includes(l.projet)));
      if (!lignes.length) continue;
      sortie.push('', projet === '' ? '  Préparation et nettoyage' : projet === 'ordinateur' ? '  Ordinateur' : '  Téléphone (390 × 844)');
      for (const l of lignes) sortie.push(`    ${l.mot}  ${l.titre}${l.detail ? `\n                ${l.detail}` : ''}`);
      const casse = lignes.find((l) => l.mot.trim() === 'CASSE');
      if (casse && projet) sortie.push(`    → arrêt à « ${casse.titre} »`);
    }
    const n = (m) => this.lignes.filter((l) => l.mot.trim() === m).length;
    sortie.push('', `  ${n('PASSE')} passent · ${n('CASSE')} cassent · ${n('ATTENDUE')} attendues · ${n('NON LANCÉE')} non lancées · ${Math.round(resultat.duration / 1000)} s`, '');
    console.log(sortie.join('\n'));
  }

  printsToStdio() { return true; }
}

function premiereLigne(r) {
  // eslint-disable-next-line no-control-regex -- on retire les couleurs du terminal
  const m = String(r.error?.message || r.errors?.[0]?.message || '').replace(/\x1b\[[0-9;]*m/g, '');
  return m.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 240);
}

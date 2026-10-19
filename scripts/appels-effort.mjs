// Compare l'effort « low » et « medium » de la lecture finale d'un appel, sur le jeu d'essai (19 oct. 2026).
//   npm run appels:effort            les scénarios à phrases du mode Essai, 2 efforts chacun
//   npm run appels:effort -- 4       seulement les 4 premiers (chaque lecture est un appel au modèle, payant)
// Mesure : le délai, l'issue (contre le scénario quand son nom est une issue, et l'un contre l'autre), le nombre de
// champs relevés, et la part des phrases citées qui se lisent vraiment dans la transcription (une citation inventée
// est le défaut qui compte). Écrit un tableau dans exports-prives/appels/effort.md. Rien n'est écrit dans la base.
import fs from 'node:fs';
import path from 'node:path';

process.env.APPELS_V2 = '1';
const max = Number(process.argv.slice(2).find((x) => /^\d+$/.test(x))) || 99;
const { SCENARIOS_ESSAI } = await import('../src/components/prospection/scenarios-essai.js');
const { lire } = await import('../server/prospection/appel.js');
const R = await import('../server/prospection/regles.js');

const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const agent = { id: 'essai', nom: 'Sophie Essai', agence: 'Agence Essai Commerces', ville: 'Nice', secteurs: ['Nice'], annonces: 0, journal: [], emails: [], telephones: [], tentatives: 0, statut: 'nouveau' };
// Un échantillon qui couvre les cas où l'effort peut compter : date dite, mandat, bien, mail, SMS, nouveau contact, refus.
const CHOIX = ['repondeur', 'pas_de_bien', 'date_dite', 'mandat_a_venir', 'a_un_bien', 'veut_sms', 'nouveau_contact', 'pas_interesse', 'bien_et_mandat', 'veut_mail', 'documents', 'rappelle_bientot', 'residentiel', 'mauvais_numero', 'bien_retenu', 'bien_refuse'];
const scenarios = CHOIX.map((c) => SCENARIOS_ESSAI.find((s) => s.cle === c)).filter((s) => s && (s.phrases || []).length >= 3 && !s.calcul).slice(0, max);

const champsDe = (lu) => ['interlocuteur', 'telephone_direct', 'email_donne', 'date_en_mots', 'prochaine_etape'].filter((k) => (typeof lu[k] === 'object' ? lu[k]?.nom : lu[k])).length
  + ['secteurs', 'mandats', 'biens', 'demandes'].filter((k) => (lu[k] || []).length).length;
const citations = (lu, texte) => {
  const toutes = Object.values(lu.citations || {}).map((c) => String(c || '').trim()).filter(Boolean);
  const t = ` ${norm(texte)} `;
  const ok = toutes.filter((c) => { const m = norm(c).split(' ').filter((x) => x.length > 2); return m.length && m.filter((x) => t.includes(` ${x} `)).length / m.length >= 0.8; }).length;
  return { n: toutes.length, ok };
};

const lignes = [];
for (const s of scenarios) {
  const texte = s.phrases.join('\n');
  const res = {};
  for (const effort of ['low', 'medium']) {
    process.env.APPEL_EFFORT_FINAL = effort;
    const t0 = Date.now();
    try {
      const lu = await lire(agent, texte, { par: 'jules.b@klocka.immo', maintenant: new Date(), final: true });
      res[effort] = { ms: Date.now() - t0, issue: lu.issue, champs: champsDe(lu), cit: citations(lu, texte), parce: !!lu.parce_que?.issue, effort_reel: lu.lecture_v2?.effort };
    } catch (e) { res[effort] = { erreur: String(e?.message || e).slice(0, 100) }; }
  }
  lignes.push({ cle: s.cle, attendue: R.ISSUES[s.cle] ? s.cle : null, res });
  console.log(s.cle, JSON.stringify(res));
}

const ok = (l) => (l.res.low?.issue && l.res.medium?.issue);
const moy = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
const bonnes = (e) => lignes.filter((l) => l.attendue && l.res[e]?.issue === l.attendue).length;
const avecAttendue = lignes.filter((l) => l.attendue).length;
const o = ['# Effort low contre medium, lecture finale', '', `Jeu d'essai : ${lignes.length} scénarios à phrases (mode Essai), ${avecAttendue} dont le nom est une issue.`, '',
  '| Scénario | Issue low | Issue medium | Délai low | Délai medium | Champs low/medium | Citations lues low | Citations lues medium |', '| --- | --- | --- | ---: | ---: | --- | --- | --- |',
  ...lignes.map((l) => `| ${l.cle} | ${l.res.low?.issue || l.res.low?.erreur} | ${l.res.medium?.issue || l.res.medium?.erreur} | ${l.res.low?.ms ?? ''} ms | ${l.res.medium?.ms ?? ''} ms | ${l.res.low?.champs ?? ''} / ${l.res.medium?.champs ?? ''} | ${l.res.low?.cit ? `${l.res.low.cit.ok}/${l.res.low.cit.n}` : ''} | ${l.res.medium?.cit ? `${l.res.medium.cit.ok}/${l.res.medium.cit.n}` : ''} |`), '',
  `- Issue conforme au nom du scénario : low ${bonnes('low')}/${avecAttendue}, medium ${bonnes('medium')}/${avecAttendue}.`,
  `- Les deux efforts donnent la même issue : ${lignes.filter((l) => ok(l) && l.res.low.issue === l.res.medium.issue).length}/${lignes.length}.`,
  `- Délai moyen : low ${moy(lignes.map((l) => l.res.low?.ms).filter(Boolean))} ms, medium ${moy(lignes.map((l) => l.res.medium?.ms).filter(Boolean))} ms.`,
  `- Citations réellement lues dans la transcription : low ${lignes.reduce((t, l) => t + (l.res.low?.cit?.ok || 0), 0)}/${lignes.reduce((t, l) => t + (l.res.low?.cit?.n || 0), 0)}, medium ${lignes.reduce((t, l) => t + (l.res.medium?.cit?.ok || 0), 0)}/${lignes.reduce((t, l) => t + (l.res.medium?.cit?.n || 0), 0)}.`];
fs.mkdirSync(path.resolve(import.meta.dirname, '..', 'exports-prives', 'appels'), { recursive: true });
fs.writeFileSync(path.resolve(import.meta.dirname, '..', 'exports-prives', 'appels', 'effort.md'), o.join('\n'));
console.log(o.slice(-4).join('\n'));

// L'export des derniers appels réels, à commenter à la main (19 oct. 2026, suite de l'audit de l'après-appel).
//   npm run appels:exporter                 les 20 derniers appels réels AVEC transcription
//   npm run appels:exporter -- 30           les 30 derniers
//   npm run appels:exporter -- 20 --tous    aussi ceux dont la transcription n'a pas été gardée (avant le 13 oct. 2026)
// Pour chaque appel : la transcription, la fiche de l'agent, ce que Haka a proposé et pourquoi, ce que l'analyste en a
// fait (journal des corrections, si APPELS_V2 était allumé), puis « Ce que j'aurais fait » et « Pourquoi ».
// Lecture seule. La sortie va dans exports-prives/appels/ : ce dossier est ignoré par git, il contient des noms et des
// numéros réels. Sur Render, à lancer dans le shell du service (la base est sur le disque du service).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const n = Number(args.find((x) => /^\d+$/.test(x))) || 20;
const tous = args.includes('--tous');
const { Records } = await import('../server/db.js');
const R = await import('../server/prospection/regles.js');

const cut = (t, max = 400) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };
const reel = (x) => !x.faux && !x.essai && x.etat !== 'abandonne' && x.etat !== 'remplace';
const transcription = (x) => String(x.transcription_gardee || x.transcription || '').trim();

const appels = Records.list('AppelAgent').filter((x) => reel(x) && (tous || transcription(x))).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, n);
const journalDe = (id) => Records.list('CorrectionAppel').filter((x) => x.appel_id === id).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;
const sans = Records.list('AppelAgent').filter((x) => reel(x) && !transcription(x)).length;

const o = [];
o.push('# Échantillon des derniers appels', '');
o.push(`Export du ${new Date().toISOString().slice(0, 16).replace('T', ' ')}, base : ${process.env.KLOCKA_DATA_DIR || 'server/data'}.`, '');
o.push(`**${appels.length} appel(s)** ${tous ? '(avec ou sans transcription)' : 'avec transcription'}. ${sans} appel(s) réel(s) n'ont pas de transcription gardée${tous ? '' : ' (relancer avec --tous pour les voir)'}.`, '');
o.push('À savoir : la fiche de l\'agent est celle d\'aujourd\'hui, son journal coupé aux échanges antérieurs à l\'appel (le prompt en reçoit les 6 plus récents) ; le statut et les relances sont d\'aujourd\'hui.', '');
for (const [i, a] of appels.entries()) {
  const f = Records.get('AgentImmo', a.agent_id);
  const ag = a.agence_id ? Records.get('AgenceProspect', a.agence_id) : null;
  const j = journalDe(a.id);
  o.push('---', '', `## ${i + 1}. ${a.agent || '(sans nom)'}${ag?.nom && ag.nom !== a.agent ? ` · ${ag.nom}` : ''} · ${String(a.le).slice(0, 16).replace('T', ' ')}`, '');
  o.push(`- Par : ${a.par || '?'} · ${a.rappel_entrant ? 'rappel entrant' : a.source || 'source inconnue'}${a.sens ? ` (${a.sens})` : ''} · Durée : ${a.duree_s ? `${a.duree_s} s` : 'inconnue'}`);
  o.push(`- Issue : ${a.issue}${a.issue_deduite ? ' (déduite par Haka)' : ''} · État : ${a.etat} · Appel \`${a.id}\``);
  if (a.lecture_v2) o.push(`- Lecture : version 2, compétence v${a.lecture_v2.competence_version ?? 'aucune'}, effort ${a.lecture_v2.effort}${a.lecture_v2.relance_refusee ? `, relance conseillée refusée (${a.lecture_v2.relance_refusee})` : ''}`);
  o.push('', '### Transcription', '');
  if (transcription(a)) o.push('```', transcription(a), '```', '');
  else o.push('_Non conservée._', '', `- Résumé gardé : ${cut(a.resume) || '—'}`, `- Ce qui s'est passé : ${cut(a.passe) || '—'}`, ...Object.entries(a.citations || {}).filter(([, v]) => v).map(([k, v]) => `- Phrase citée (${k}) : « ${cut(v, 300)} »`), '');
  o.push('### Fiche de l\'agent (aujourd\'hui)', '');
  if (!f) o.push('_Introuvable._', '');
  else {
    const avant = (f.journal || []).filter((x) => String(x.le) < String(a.le)).slice(0, 6);
    o.push(`- ${f.nom || '—'}${f.agence ? ` · ${f.agence}` : ''}${f.ville ? ` · ${f.ville}` : ''}`, `- Statut : ${R.STATUTS[f.statut] || f.statut || '—'} · Tentatives : ${f.tentatives ?? 0} · Dernier contact : ${f.dernier_contact_le ? String(f.dernier_contact_le).slice(0, 10) : '—'}`, `- Secteurs : ${(f.secteurs || []).join(', ') || '—'} · Annonces Equimmox : ${f.annonces || 0}`, `- Prochaine relance : ${f.prochaine ? `${f.prochaine.le} (${cut(f.prochaine.quoi, 120)})` : '—'}`, `- Journal avant l'appel (${avant.length}) :`, ...(avant.length ? avant.map((x) => `  - ${String(x.le).slice(0, 10)} ${x.type} : ${cut(x.texte, 200)}`) : ['  - aucun échange']), '');
  }
  o.push('### Ce que Haka a proposé', '');
  const props = a.propositions || [];
  if (!props.length) o.push('_Aucune proposition gardée._', '');
  else o.push(...props.map((p) => `- ${p.cache ? '(en coulisse) ' : ''}**${p.type}** : ${cut(p.titre, 220)} (${p.toujours ? 'toujours' : p.coche === false ? 'décochée d\'office' : 'cochée d\'office'})${p.parce_que ? `\n  - Parce que : ${cut(p.parce_que, 300)}` : ''}`), '');
  o.push('### Ce que l\'analyste en a fait', '');
  if (j) {
    o.push(`- Journal des corrections : ${j.corrige ? 'corrigé' : 'accepté tel quel'}${j.issue?.changee ? ` · issue changée (${j.issue.proposee} → ${j.issue.finale})` : ''}`);
    for (const x of j.actions || []) if (x.decision !== 'gardee') o.push(`  - ${x.type} : ${x.decision}${x.raison ? ` (raison : ${x.raison})` : ''}`);
    if (j.relance?.changee) o.push(`  - Relance : ${j.relance.proposee} → ${j.relance.choisie}${j.relance.raison ? ` (raison : ${j.relance.raison})` : ''}`);
    if (j.mail?.modifie) o.push(`  - Mail modifié${j.mail.raison ? ` (raison : ${j.mail.raison})` : ''}`, `    - proposé : ${cut(j.mail.propose.corps, 300)}`, `    - envoyé : ${cut(j.mail.envoye?.corps, 300)}`);
    if (j.passe?.corrigee) o.push(`  - « Ce qui s'est passé » : « ${cut(j.passe.origine, 200)} » → « ${cut(j.passe.corrigee, 200)} »`);
    for (const c of j.champs || []) o.push(`  - Champ ${c.cle} : ${c.avant ?? '—'} → ${c.apres}`);
  } else {
    const v = a.validation_ui; const m = a.mesure_ak;
    o.push(`- ${v ? `Validé : ${v.etapes} étape(s), retirées : ${(v.retirees || []).join(', ') || 'aucune'}, ajoutées : ${(v.ajoutees || []).join(', ') || 'aucune'}` : 'Pas de suivi de validation.'}${m ? ` · corrigé : ${m.corrige ? 'oui' : 'non'}` : ''} (pas de journal complet : appel antérieur à APPELS_V2)`);
  }
  o.push('', 'Ce que j\'aurais fait :', '', '', 'Pourquoi :', '', '');
}
const dossier = path.resolve(import.meta.dirname, '..', 'exports-prives', 'appels');
fs.mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'echantillon.md');
fs.writeFileSync(sortie, o.join('\n'));
console.log(`${appels.length} appel(s) écrits dans ${path.relative(process.cwd(), sortie)} (dossier ignoré par git).`);

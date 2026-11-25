// Le contrôle complet de Monday contre Twenty avant de couper Monday (25 nov. 2026, Jules : « va voir dans Monday, fais
// un check up complet pour vérifier que tout est bon de ton côté »).
//   node scripts/crm/verifier-monday-twenty.mjs <export>            compare, n'écrit rien
//   node scripts/crm/verifier-monday-twenty.mjs <export> --ecrire   corrige ce qui est sûr
// <export> : un export complet de Monday (scripts/crm/export-monday.mjs, exports-prives/monday-<date>).
// Pour chacun des 21 tableaux migrés, chaque fiche Monday est retrouvée dans Twenty : par son id Monday, sinon par son
// mail, son téléphone ou son nom (une fiche créée dans Twenty sans id Monday). Sûr, donc corrigé avec --ecrire :
//  - une fiche Monday absente de Twenty est créée (dans son groupe) ;
//  - une fiche retrouvée sans id Monday reçoit le sien ;
//  - une case vide dans Twenty que Monday remplit est remplie ;
//  - un message du fil Monday absent des notes de la fiche devient une note.
// Jamais : écraser une valeur de Twenty qui diffère (l'écart est listé), ni supprimer quoi que ce soit.
// Le bilan va dans <export>/verification-twenty.json.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { twentyConfigure, objetsTwenty, lister, creer, modifier, noter, requeteTwenty } from '../../server/twenty.js';
import { enregistrementDe } from '../../server/crm/correspondance.js';
import { texteDe } from '../../server/crm/monday-sur-twenty.js';
import { fuiteDeTest } from '../../server/crm/sauvegarde-monday.js';

if (!twentyConfigure()) { console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env'); process.exit(1); }
const args = process.argv.slice(2);
const ECRIRE = args.includes('--ecrire');
const dossier = path.resolve(args.find((x) => !x.startsWith('--')) || '');
if (!fs.existsSync(path.join(dossier, 'schema.json'))) { console.error('usage : <dossier d’export Monday> [--ecrire]'); process.exit(1); }

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cleNom = (s) => sansAccents(s).replace(/^pro\s*-\s*/, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const cleMail = (s) => (String(s || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/) || [])[0] || null;
const cleTel = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };
const plat = (s) => sansAccents(s).replace(/[^a-z0-9]/g, '');
const majuscule = (s) => s[0].toUpperCase() + s.slice(1);

/** Pure : deux textes du même champ disent-ils la même chose ? */
function pareil(type, a, b) {
  if (type === 'PHONES') return cleTel(a) === cleTel(b);
  if (type === 'EMAILS') return cleMail(a) === cleMail(b);
  if (type === 'NUMBER') return Number(a) === Number(b);
  if (type === 'ADDRESS') return plat(a).startsWith(plat(b)) || plat(b).startsWith(plat(a));
  if (type === 'MULTI_SELECT') return plat(String(a).split(',').sort().join()) === plat(String(b).split(',').sort().join());
  return plat(a) === plat(b);
}

// Les fiches que les tests ont écrites dans le vrai Monday (6-25 nov. 2026) : écartées, voir server/crm/sauvegarde-monday.js.

// La version du 6 nov. 2026 (le jour de la bascule) départage un écart : si seul Monday a changé depuis, c'est une mise à
// jour faite dans Monday après la bascule, reprise ; si seul Twenty a changé, Twenty est gardé ; les deux : à trancher.
// Jamais sur les tableaux K Partners (les tests y écrivaient) ni sur une fiche « (test) ».
const BASE = 'exports-prives/monday-final-2026-11-06';
const baseDe = (o) => {
  const f = fs.existsSync(BASE) ? fs.readdirSync(BASE).find((x) => x.startsWith(`${o.mondayTableau}-`)) : null;
  return f ? new Map(JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8')).map((x) => [String(x.id), x.colonnes || {}])) : new Map();
};

const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const metas = await objetsTwenty();
const bilan = { export: path.basename(dossier), le: new Date().toISOString(), ecrit: ECRIRE, tableaux: [] };

for (const o of objets) {
  const f = path.join(dossier, 'tableaux', `${o.mondayTableau}.json`);
  const tous = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).elements || [] : [];
  const elements = tous.filter((e) => !fuiteDeTest(e));
  const fil = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).mises_a_jour || [] : [];
  const meta = metas.find((x) => x.nameSingular === o.nameSingular);
  if (!meta) { bilan.tableaux.push({ objet: o.labelPlural, erreur: 'absent de Twenty' }); continue; }
  const parNom = new Map((meta.fields || []).map((x) => [x.name, x]));
  const champs = o.champs.filter((c) => parNom.has(c.name)).map((c) => ({ ...c, type: parNom.get(c.name).type, options: parNom.get(c.name).options }));
  const fMail = champs.find((c) => c.type === 'EMAILS')?.name;
  const fTel = champs.find((c) => c.type === 'PHONES')?.name;
  const groupeChamp = parNom.get('groupe');
  const twenty = (await lister(o.namePlural)).filter((r) => !r.deletedAt);
  const base = baseDe(o);
  const parMonday = new Map(twenty.filter((r) => r.mondayId).map((r) => [String(r.mondayId), r]));
  // La corbeille de Twenty : une fiche supprimée exprès depuis la bascule n'est pas recréée depuis Monday.
  let corbeille = new Set();
  try { corbeille = new Set((await lister(o.namePlural, { filtre: 'deletedAt[is]:NOT_NULL', champs: 'id,mondayId,name' })).map((r) => (r.mondayId ? `id:${r.mondayId}` : `nom:${cleNom(r.name)}`))); } catch { /* sans corbeille lisible, rien de plus */ }
  // Sans id Monday, ou avec l'id d'une fiche Monday qui n'existe plus (recréée dans Monday sous un autre id).
  const idsMonday = new Set(tous.map((e) => String(e.id)));
  const sansId = twenty.filter((r) => !r.mondayId || !idsMonday.has(String(r.mondayId)));
  const telDe = (r) => (fTel ? cleTel(`${r[fTel]?.primaryPhoneCallingCode || ''}${r[fTel]?.primaryPhoneNumber || ''}`) : null);
  const t = { objet: o.labelPlural, fuites_tests: tous.length - elements.length, monday: elements.length, twenty: twenty.length, retrouves: 0, lies: [], crees: [], completes: 0, cases: 0, ecarts: [], notes_ajoutees: 0, notes_manquantes: 0, refus: [] };

  const retrouves = [];
  for (const e of elements) {
    let r = parMonday.get(String(e.id));
    let lie = false;
    if (!r) {
      const enr = enregistrementDe(e, champs);
      const m = fMail ? cleMail(enr[fMail]?.primaryEmail) : null;
      const p = fTel ? cleTel(`${enr[fTel]?.primaryPhoneCallingCode || ''}${enr[fTel]?.primaryPhoneNumber || ''}`) : null;
      const n = cleNom(e.name);
      r = sansId.find((x) => (m && fMail && cleMail(x[fMail]?.primaryEmail) === m) || (p && telDe(x) === p) || (n && cleNom(x.name) === n)) || null;
      if (r) { lie = true; sansId.splice(sansId.indexOf(r), 1); }
    }
    if (!r && (corbeille.has(`id:${e.id}`) || corbeille.has(`nom:${cleNom(e.name)}`))) { (t.supprimees_twenty ||= []).push(e.name); continue; }
    if (!r) {
      // Absente de Twenty : créée, dans le groupe Twenty du même nom que son groupe Monday.
      const enr = enregistrementDe(e, champs);
      const g = (groupeChamp?.options || []).find((op) => plat(op.label) === plat(e.group?.title));
      if (g) enr.groupe = g.value;
      t.crees.push(`${e.name} (${e.group?.title || 'sans groupe'})`);
      if (ECRIRE) {
        try { const x = await creer(o.namePlural, enr); retrouves.push({ e, r: { ...enr, id: x.id } }); } catch (err) { t.refus.push(`${e.name} : ${err.message.slice(0, 160)}`); }
      }
      continue;
    }
    t.retrouves += 1;
    if (lie) {
      t.lies.push(e.name);
      if (ECRIRE) await modifier(o.namePlural, r.id, { mondayId: String(e.id), ...(r.mondayCreeLe ? {} : { mondayCreeLe: e.created_at || null }) }).catch((err) => t.refus.push(`${e.name} (id Monday) : ${err.message.slice(0, 160)}`));
    }
    // Les cases : vide dans Twenty et remplie dans Monday → remplie ; deux valeurs différentes → listées.
    const enr = enregistrementDe(e, champs);
    const aPoser = {};
    const aReprendre = {};
    for (const c of champs) {
      if (!c.mondayColonne || !(c.name in enr)) continue;
      const mo = texteDe(c.type, enr[c.name], c.options);
      const tw = texteDe(c.type, r[c.name], c.options);
      if (!String(mo).trim()) continue;
      // « Avis de valeur » posé par défaut sur 1 660 prospects K Partners à la création de la colonne (jamais touchés
      // depuis le 11 oct.) : pas une étape réelle, pas reprise.
      if (o.nameSingular.startsWith('kp') && c.name === 'statutContact') continue;
      if (!String(tw).trim()) aPoser[c.name] = enr[c.name];
      else if (!pareil(c.type, tw, mo)) {
        const b = base.get(String(e.id))?.[c.mondayColonne];
        const auto = !o.nameSingular.startsWith('kp') && !/\(test\)/i.test(e.name) && b != null;
        const sens = !auto ? 'a_trancher' : pareil(c.type, tw, b) ? 'monday_seul' : pareil(c.type, mo, b) ? 'twenty_seul' : 'a_trancher';
        t.ecarts.push({ fiche: e.name, champ: c.label, twenty: String(tw).slice(0, 120), monday: String(mo).slice(0, 120), le_6_nov: b == null ? null : String(b).slice(0, 120), sens });
        if (sens === 'monday_seul') aReprendre[c.name] = enr[c.name];
      }
    }
    if (Object.keys(aPoser).length) {
      t.completes += 1;
      t.cases += Object.keys(aPoser).length;
      (t.cases_detail ||= []).push({ fiche: e.name, champs: Object.keys(aPoser) });
      if (ECRIRE) await modifier(o.namePlural, r.id, aPoser).catch((err) => t.refus.push(`${e.name} (cases) : ${err.message.slice(0, 160)}`));
    }
    if (Object.keys(aReprendre).length) {
      t.repris = (t.repris || 0) + Object.keys(aReprendre).length;
      if (ECRIRE) await modifier(o.namePlural, r.id, aReprendre).catch((err) => t.refus.push(`${e.name} (reprise) : ${err.message.slice(0, 160)}`));
    }
    retrouves.push({ e, r });
  }

  // Le fil : chaque message Monday doit être une note de la fiche (même texte), sinon il le devient.
  const cible = `target${majuscule(o.nameSingular)}Id`;
  const parElement = new Map();
  for (const u of fil) parElement.set(String(u.item_id), [...(parElement.get(String(u.item_id)) || []), u]);
  for (const { e, r } of retrouves) {
    const messages = (parElement.get(String(e.id)) || []).filter((u) => String(u.text_body || '').trim());
    if (!messages.length || !r.id) continue;
    let notes = [];
    try {
      notes = ((await requeteTwenty('GET', `/noteTargets?limit=200&depth=1&filter=${encodeURIComponent(`${cible}[eq]:${r.id}`)}`))?.data?.noteTargets || []).map((x) => x.note).filter((n) => n && !n.deletedAt);
    } catch (err) { t.refus.push(`${e.name} (notes) : ${err.message.slice(0, 120)}`); continue; }
    const textes = notes.map((n) => plat(`${n.title || ''} ${n.bodyV2?.markdown || ''}`));
    for (const u of messages) {
      const debut = plat(u.text_body).slice(0, 80);
      if (!debut || textes.some((x) => x.includes(debut))) continue;
      t.notes_manquantes += 1;
      if (!ECRIRE) continue;
      const reponses = (u.replies || []).map((x) => `\n\n**${x.creator?.name || '?'}**, ${String(x.created_at).slice(0, 10)} :\n${x.text_body || ''}`).join('');
      try { await noter(cible, r.id, `Monday · ${u.creator?.name || '?'} · ${String(u.created_at).slice(0, 10)}`, `${u.text_body || ''}${reponses}`); t.notes_ajoutees += 1; } catch (err) { t.refus.push(`${e.name} (note) : ${err.message.slice(0, 120)}`); }
    }
  }
  // Les fiches de Twenty qu'aucune fiche Monday n'explique : nées dans Twenty (normal depuis le 6 nov.), listées pour mémoire.
  t.seulement_twenty = sansId.length;
  bilan.tableaux.push(t);
  console.log(`${o.labelPlural.padEnd(30)} Monday ${String(t.monday).padStart(5)}${t.fuites_tests ? ` (+${t.fuites_tests} fuites de tests écartées)` : ''} · Twenty ${String(t.twenty).padStart(5)} · retrouvées ${t.retrouves} (dont ${t.lies.length} sans id) · à créer ${t.crees.length}${t.supprimees_twenty ? ` (+${t.supprimees_twenty.length} supprimées dans Twenty, laissées)` : ''} · cases vides ${t.cases} (${t.completes} fiches) · écarts ${t.ecarts.length} (Monday plus récent ${t.ecarts.filter((x) => x.sens === 'monday_seul').length}, Twenty plus récent ${t.ecarts.filter((x) => x.sens === 'twenty_seul').length}, à trancher ${t.ecarts.filter((x) => x.sens === 'a_trancher').length}) · messages manquants ${t.notes_manquantes}${ECRIRE ? ` · notes ajoutées ${t.notes_ajoutees}` : ''}${t.refus.length ? ` · REFUS ${t.refus.length}` : ''}`);
}
fs.writeFileSync(path.join(dossier, 'verification-twenty.json'), JSON.stringify(bilan, null, 2));
console.log(`\nBilan : ${path.join(dossier, 'verification-twenty.json')}`);

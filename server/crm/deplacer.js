// Déplacer des fiches d'un tableau Twenty à un autre (28 oct. 2026, Jules : « les mettre dans d'autres vues »), comme
// « Déplacer vers un tableau » de Monday. Chaque tableau a un champ « Déplacer vers » (scripts/crm/deplacer-twenty.mjs) :
// on le remplit sur une fiche, ou sur plusieurs lignes cochées par « Déplacer / modifier ». Twenty prévient Klocka par
// webhook (POST /api/crm/webhook, signé), et Klocka déplace.
// Twenty ne sait pas changer l'objet d'une fiche : on la recrée dans le tableau d'arrivée, on y rattache ses notes,
// tâches et fichiers, puis l'ancienne part dans « Fiches supprimées » (restaurable). Les champs passent quand le tableau
// d'arrivée a le même (même nom ou même libellé, même type) ; ce qui ne passe pas est écrit dans une note sur la nouvelle
// fiche, rien ne se perd. Chaque lot déplacé laisse une ligne dans l'objet « Déplacements ».
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { objetsTwenty, lire, creer, modifier, supprimer, lister, filtre, noter, lienFiche } from '../twenty.js';
import { valeurOption } from './correspondance.js';

// Jamais recopiés : l'identité de la fiche, sa trace, et les liens (rattachés à part ou propres à l'objet de départ).
const SYSTEME = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector', 'deplacerVers']);
const LIENS = new Set(['RELATION', 'MORPH_RELATION', 'TS_VECTOR', 'ACTOR', 'POSITION']);

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const vide = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => vide(x)));

/** Le texte lisible d'une valeur Twenty, pour la note des champs non repris. */
export function lisible(v) {
  if (vide(v)) return '';
  if (Array.isArray(v)) return v.map(lisible).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    if (v.primaryEmail != null) return [v.primaryEmail, ...(v.additionalEmails || [])].filter(Boolean).join(', ');
    if (v.primaryPhoneNumber != null) return `${v.primaryPhoneCallingCode || ''} ${v.primaryPhoneNumber}`.trim();
    if (v.primaryLinkUrl != null) return v.primaryLinkUrl;
    if (v.amountMicros != null) return `${Number(v.amountMicros) / 1e6} ${v.currencyCode || ''}`.trim();
    if (v.markdown != null) return v.markdown;
    return Object.values(v).map(lisible).filter(Boolean).join(' ');
  }
  return String(v);
}

/**
 * Pure : ce qui passe d'une fiche du tableau de départ au tableau d'arrivée.
 * Un champ d'arrivée de même nom et même type, sinon de même libellé et même type ; un choix (SELECT) seulement si
 * l'option existe à l'arrivée ; un texte d'arrivée reçoit la valeur lisible d'un champ simple.
 * Rend { valeurs, nonRepris: [{ label, texte }] }.
 */
export function planDeplacement(fiche, champsDepart, champsArrivee) {
  const arrivee = champsArrivee.filter((f) => !SYSTEME.has(f.name) && !LIENS.has(f.type) && f.isActive !== false);
  const parNom = new Map(arrivee.map((f) => [f.name, f]));
  const parLabel = new Map(arrivee.map((f) => [sansAccents(f.label), f]));
  const valeurs = {};
  const nonRepris = [];
  for (const f of champsDepart) {
    if (SYSTEME.has(f.name) || LIENS.has(f.type)) continue;
    const v = fiche[f.name];
    if (vide(v)) continue;
    const cible = [parNom.get(f.name), parLabel.get(sansAccents(f.label))].find((c) => c && !(c.name in valeurs) && (c.type === f.type || c.type === 'TEXT'));
    let ok = false;
    if (cible && cible.type === f.type) {
      if (f.type === 'SELECT') ok = (cible.options || []).some((o) => o.value === v);
      else if (f.type === 'MULTI_SELECT') ok = v.every((x) => (cible.options || []).some((o) => o.value === x));
      else ok = true;
      if (ok) valeurs[cible.name] = v;
    } else if (cible?.type === 'TEXT' && ['NUMBER', 'DATE', 'DATE_TIME', 'SELECT', 'BOOLEAN', 'RATING'].includes(f.type)) {
      const libelle = f.type === 'SELECT' ? (f.options || []).find((o) => o.value === v)?.label || v : v;
      valeurs[cible.name] = String(libelle);
      ok = true;
    }
    if (!ok) {
      const libelle = f.type === 'SELECT' ? (f.options || []).find((o) => o.value === v)?.label || v : f.type === 'MULTI_SELECT' ? v.map((x) => (f.options || []).find((o) => o.value === x)?.label || x) : v;
      const texte = lisible(libelle);
      if (texte) nonRepris.push({ label: f.label, texte });
    }
  }
  return { valeurs, nonRepris };
}

/**
 * La signature d'un webhook Twenty : HMAC-SHA256 du secret sur « horodatage:corps JSON ». Refusée sans secret configuré
 * (24 caractères au moins) ou au-delà de 10 minutes.
 */
export function signatureValide(corps, horodatage, signature, maintenant = Date.now()) {
  const secret = String(process.env.CRM_DEPLACER_SECRET || '');
  const sig = String(signature || '');
  if (secret.length < 24 || !/^[0-9a-f]{64}$/.test(sig) || !(Math.abs(maintenant - Number(horodatage)) < 10 * 60_000)) return false;
  const attendue = crypto.createHmac('sha256', secret).update(`${horodatage}:${JSON.stringify(corps)}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendue));
}

let schema = null;
const objetsCrm = () => (schema ||= JSON.parse(fs.readFileSync(path.resolve('crm/schema.json'), 'utf8')).objets);
/** L'objet désigné par la valeur d'option du choix « Vers » (le libellé du tableau en majuscules). */
export const objetPourOption = (option) => objetsCrm().find((o) => valeurOption(o.labelPlural) === option) || null;

const majuscule = (s) => s[0].toUpperCase() + s.slice(1);
const cibleDe = (singulier) => `target${majuscule(singulier)}Id`;

/** Déplace les fiches ; rend { deplacees: [{ nom, lien }], erreurs }. */
export async function deplacer({ objet, vers, fiches }) {
  const depart = objetsCrm().find((o) => o.nameSingular === objet);
  const arrivee = objetPourOption(vers);
  if (!depart) throw new Error(`Tableau de départ inconnu : ${objet}`);
  if (!arrivee) throw new Error(`Tableau d'arrivée inconnu : ${vers}`);
  if (arrivee.nameSingular === depart.nameSingular) return { deplacees: [], erreurs: [], memeTableau: true };
  const meta = await objetsTwenty();
  const mDepart = meta.find((m) => m.nameSingular === depart.nameSingular);
  const mArrivee = meta.find((m) => m.nameSingular === arrivee.nameSingular);
  const deplacees = [];
  const erreurs = [];
  for (const { id } of (Array.isArray(fiches) ? fiches : []).filter((f) => f?.id)) {
    try {
      const fiche = await lire(depart.namePlural, id);
      if (!fiche || fiche.deletedAt) continue;
      const { valeurs, nonRepris } = planDeplacement(fiche, mDepart.fields || [], mArrivee.fields || []);
      const nouvelle = await creer(arrivee.namePlural, valeurs);
      // Les notes, tâches et fichiers suivent la fiche.
      for (const lien of ['noteTargets', 'taskTargets', 'attachments']) {
        for (const l of await lister(lien, { filtre: filtre({ [cibleDe(depart.nameSingular)]: id }), champs: 'id' })) {
          await modifier(lien, l.id, { [cibleDe(arrivee.nameSingular)]: nouvelle.id, [cibleDe(depart.nameSingular)]: null });
        }
      }
      const jour = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
      const texte = [`Déplacée depuis « ${depart.labelPlural} » le ${jour}.`, ...(nonRepris.length ? ['', `Champs de « ${depart.labelPlural} » sans équivalent ici :`, ...nonRepris.map((x) => `- **${x.label}** : ${x.texte}`)] : [])].join('\n');
      await noter(cibleDe(arrivee.nameSingular), nouvelle.id, `Déplacée depuis ${depart.labelPlural}`, texte);
      await supprimer(depart.namePlural, id);
      deplacees.push({ nom: fiche.name || '(sans nom)', lien: lienFiche(arrivee.nameSingular, nouvelle.id), nonRepris: nonRepris.length });
    } catch (e) {
      erreurs.push({ id, erreur: String(e.message || e).slice(0, 300) });
    }
  }
  try {
    await creer('deplacements', {
      name: `${deplacees.length} fiche(s) : ${depart.labelPlural} → ${arrivee.labelPlural}`,
      depuis: depart.labelPlural,
      vers,
      fiches: deplacees.length,
      detail: [...deplacees.map((d) => `${d.nom} : ${d.lien}${d.nonRepris ? ` (${d.nonRepris} champ(s) en note)` : ''}`), ...erreurs.map((e) => `ERREUR ${e.id} : ${e.erreur}`)].join('\n').slice(0, 20000),
    });
  } catch (e) {
    console.error('[crm] journal du déplacement :', e.message);
  }
  console.log(`[crm] déplacement ${depart.labelPlural} → ${arrivee.labelPlural} : ${deplacees.length} fiche(s)${erreurs.length ? `, ${erreurs.length} erreur(s)` : ''}`);
  return { deplacees, erreurs };
}

// Les événements d'une modification en lot arrivent un par un : on les regroupe 3 s par (tableau, destination) pour un
// seul déplacement et une seule ligne de journal, et les lots passent l'un après l'autre.
const enAttente = new Map();
const vus = new Set();
let file = Promise.resolve();

/** Un événement « <objet>.updated » de Twenty. Rend true s'il demande un déplacement. */
export function recevoirEvenement(ev, { delai = 3000 } = {}) {
  const objet = ev?.objectMetadata?.nameSingular;
  const r = ev?.record || {};
  const vers = r.deplacerVers;
  if (!objet || !r.id || !vers || r.deletedAt || !String(ev.eventName || '').endsWith('.updated')) return false;
  if (vus.has(r.id)) return false;
  vus.add(r.id);
  const cle = `${objet}|${vers}`;
  if (!enAttente.has(cle)) {
    enAttente.set(cle, new Set());
    setTimeout(() => {
      const ids = [...enAttente.get(cle)];
      enAttente.delete(cle);
      file = file.then(() => deplacer({ objet, vers, fiches: ids.map((id) => ({ id })) }))
        .catch((e) => console.error('[crm] déplacement :', e.message))
        .finally(() => setTimeout(() => ids.forEach((id) => vus.delete(id)), 60_000).unref?.());
    }, delai).unref?.();
  }
  enAttente.get(cle).add(r.id);
  return true;
}

// La vacance locative d'un dossier (29 oct. 2026, Jules : « je veux aussi savoir la vacance locative avec l'outil
// vacance locative ») : l'outil Vacance (server/outils/vacance-taux.js), lancé sur l'adresse du lot, autour (rayon
// par défaut de l'outil) et sur la rue entière. Seulement à la demande : la vérification Google Maps des locaux que
// le registre dit vides se paie au local. Le résultat est gardé sur le lot (`lots[0].vacance`).
import { Records } from '../db.js';
import { adresseDuLot } from './comparaison-marche.js';

const resume = (r) => (r?.ok && r.statut === 200 ? {
  taux: r.taux?.taux ?? null, vacants: r.taux?.vacants ?? 0, occupes: r.taux?.occupes ?? 0, incertains: r.taux?.incertains ?? 0,
  locaux: r.taux?.locaux ?? 0, fiable: !!r.taux?.fiable, rayon_m: r.zone?.rayon_m ?? null, recense_le: r.recense_le || null,
} : null);

/**
 * Mesure la vacance autour du lot et sur sa rue. Rend { etat: 'chargement' } tant que la commune se recense (la
 * première fois, quelques minutes : on redemande), { etat: 'pret', vacance } sinon, ou { ok: false, error }.
 */
export async function mesurerVacance(dealId, { outil = null, adresse = null } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, statut: 404, error: 'Dossier introuvable' };
  const entree = deal.lots?.[0];
  // L'adresse telle qu'elle a été donnée : « 12 rue Foch Lorient », sans virgule ni code postal, est rangée tout entière
  // dans la ville ; la Base Adresse Nationale la comprend quand même (30 oct. 2026, Jules : la lecture du marché passait,
  // la vacance disait « pas d'adresse »).
  const a = entree?.lot?.adresse?.valeur;
  const texte = adresseDuLot(entree) || (a && typeof a === 'object' ? [a.rue, a.code_postal, a.ville].filter(Boolean).join(' ').trim() : String(a || '').trim()) || null;
  if (!texte) return { ok: false, statut: 400, error: "Le lot n'a pas d'adresse : la vacance se mesure autour d'une adresse." };
  const A = adresse || (await import('../adresse-ban.js'));
  const lieu = await A.resoudreAdresse(texte);
  if (!lieu?.lat || !lieu?.code_insee) return { ok: false, statut: 404, error: `Adresse introuvable dans la Base Adresse Nationale : « ${texte} ».` };
  const T = outil || (await import('../outils/vacance-taux.js'));
  const [zone, rue] = await Promise.all([
    T.tauxDeVacance({ lat: lieu.lat, lon: lieu.lon, commune: lieu.code_insee }),
    lieu.rue ? T.tauxDeLaRue({ voie: lieu.rue, commune: lieu.code_insee }) : Promise.resolve(null),
  ]);
  if (zone?.statut === 202 || rue?.statut === 202) return { ok: true, etat: 'chargement' };
  if (!zone?.ok && !rue?.ok) return { ok: false, statut: zone?.statut || 502, error: zone?.error || rue?.error || "L'outil Vacance n'a pas répondu." };
  const vacance = {
    adresse: lieu.label, rue: lieu.rue || null, commune: lieu.ville || null,
    zone: resume(zone), sur_la_rue: resume(rue),
    erreur_zone: zone?.ok ? null : zone?.error || null, erreur_rue: rue && !rue.ok ? rue.error || null : null,
    le: new Date().toISOString(),
  };
  const frais = Records.findBy('Deal', 'deal_id', dealId);
  const lots = [...(frais.lots || [])];
  lots[0] = { ...(lots[0] || { lot: {} }), vacance };
  Records.update('Deal', frais.id, { lots });
  return { ok: true, etat: 'pret', vacance };
}

/**
 * La vacance mesurée en même temps que la lecture du marché (30 oct. 2026, Jules : « ça doit faire en même temps »),
 * en tâche de fond : la commune qui se recense est redemandée toutes les 20 secondes, dix minutes au plus. Pendant ce
 * temps, `lots[0].vacance_en_cours` dit à l'écran que la mesure tourne.
 */
export function mesurerVacanceEnFond(dealId, { attente = 20000, essais = 30, mesurer = mesurerVacance } = {}) {
  const marquer = (v) => {
    const d = Records.findBy('Deal', 'deal_id', dealId);
    if (!d?.lots?.length) return;
    const lots = [...d.lots];
    lots[0] = { ...lots[0], vacance_en_cours: v };
    Records.update('Deal', d.id, { lots });
  };
  marquer(new Date().toISOString());
  let n = 0;
  const tour = async () => {
    try {
      const r = await mesurer(dealId);
      if (r.ok && r.etat === 'chargement' && ++n < essais) { setTimeout(tour, attente); return; }
      if (!r.ok) console.warn(`[vacance] ${dealId} : ${r.error}`);
    } catch (e) {
      console.warn(`[vacance] ${dealId} : ${e?.message || e}`);
    }
    marquer(null);
  };
  tour();
}

// La page Modèles de l'administration (26 oct. 2026, Jules) : les modèles de documents de chaque marque, Klocka et
// K Partners, remplis avec un exemple. La lettre d'intention a ses routes dans offres.js ; ici, l'avis de valeur.

import { ok, wrap, currentUser } from '../contexte.js';
import { Records } from '../db.js';

/**
 * L'avis d'exemple : le dernier avis rédigé d'un compte de test (des données d'essai, pas celles d'un client),
 * sinon le dernier avis rédigé à la valeur plausible, sinon l'avis qui se construit pendant les questions.
 */
export async function avisExemple() {
  const plausible = (e) => e.avis && Number(e.avis.chiffres?.valeur) > 0 && Number(e.avis.chiffres?.valeur) < 50_000_000;
  const recents = Records.list('EstimationMandataire').filter(plausible)
    .sort((a, b) => String(b.prete_le || b.cree_le || '').localeCompare(String(a.prete_le || a.cree_le || '')));
  const test = recents.find((e) => /test|exemple|stress/i.test(String(e.mandataire_email || '')));
  const choisi = test || recents[0];
  if (choisi) return { avis: choisi.avis, source: test ? 'test' : 'dernier' };
  const { avisProvisoire } = await import('../mandataire-avis.js');
  const avis = avisProvisoire({ questionnaire: { type_bien: 'murs_commerce', occupe: true, adresse: '24 rue de la République, 69002 Lyon', demandeur: 'SCI Les Exemples', surface_utile: 85, loyer_annuel_hc: 24000, locataire: 'Boulangerie Exemple' } }, { nom: 'Camille Exemple', qualite: 'agent commercial' });
  return { avis: { ...avis, bien: { ...avis.bien, rue: '24 rue de la République', ville: 'Lyon' }, chiffres: { ...avis.chiffres, valeur: 420000, bas: 395000, haut: 445000, rendement: 5.7 } }, source: 'exemple' };
}

/** Monte les routes de la page Modèles. */
export function monterModeles(app) {
  app.get('/api/admin/modeles/avis', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    ok(res, await avisExemple());
  }));
}

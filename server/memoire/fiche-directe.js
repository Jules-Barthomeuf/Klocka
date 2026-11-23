// Une fiche reçue hors d'une boîte mail (22 nov. 2026, Jules : « que pour n'importe quel type de documents ça marche
// parfaitement ») : un document envoyé au numéro WhatsApp de Klocka par quelqu'un de l'équipe. Lue comme un transfert à
// sourcing@ (haka/competences/transfert.js, fichesEnMemoire) : un bien par fiche du document, en Mémoire, sans dossier.
// Chaque bien garde `envoi_id` et `par` : le compte des fiches reçues (deal/fiches-stats.js) en fait un envoi, au nom de
// la personne qui l'a envoyé. La même pièce envoyée deux fois n'est lue qu'une fois.

import { Records } from '../db.js';
import { ENTITE, bienDepuisLot, ecrireFiche, hashDe } from './memoire.js';
import { estTableur } from '../deal/lire-bureautique.js';

/**
 * @returns {Promise<{ n: number, deja: boolean, noms: string[], annonce: number|null, tableur: boolean }>}
 */
export async function ficheEnMemoire({ buffer, nom, mime = null, par, origine = 'whatsapp', envoiId, legende = '', extraire = null }) {
  const hash = hashDe(buffer);
  const dejaLus = Records.filter(ENTITE, { hash_piece: hash });
  if (dejaLus.length) return { n: 0, deja: true, noms: dejaLus.map((b) => b.adresse?.rue || b.ville).filter(Boolean), annonce: null, tableur: false };
  const lire = extraire || (await import('../deal/extraire-faits.js')).extraireFaits;
  const faits = await lire({ buffer, filename: nom, mimetype: mime || undefined }, { par });
  const lots = (faits.lots || []).length ? faits.lots : [null];
  let fiche = null;
  const noms = [];
  let n = 0;
  for (const lot of lots) {
    const bien = bienDepuisLot(lot, faits.agent || {}, { recu_le: new Date().toISOString(), hash_piece: hash, origine, statut: 'memoire' });
    if (!bien.cle_adresse && !bien.prix && !bien.loyer_annuel) continue;
    fiche = fiche || ecrireFiche(buffer, nom, mime);
    Records.create(ENTITE, { ...bien, fiche, par: String(par || '').toLowerCase() || null, envoi_id: envoiId, objet_mail: String(legende || nom || '').slice(0, 200), fiche_annonce: faits.biens_annonces ?? null, fiche_tableur: faits.source === 'tableur' || estTableur(nom, mime), maj_le: new Date().toISOString() }, par || null);
    noms.push([bien.adresse?.rue, bien.ville].filter(Boolean).join(', '));
    n += 1;
  }
  return { n, deja: false, noms: noms.filter(Boolean), annonce: faits.biens_annonces ?? null, tableur: faits.source === 'tableur' || estTableur(nom, mime) };
}

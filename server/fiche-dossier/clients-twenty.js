// Les fiches des clients remplies une fois depuis Twenty (19 nov. 2026, Jules : « fais cette opération une fois pour
// remplir la fiche de chaque client, très rapidement, pas besoin d'un truc super détaillé ») : quelques phrases tirées
// des champs du tableau Clients, sans IA. Une fiche que les notes ont déjà résumée n'est pas touchée.
// Lancer : node --env-file=.env server/fiche-dossier/clients-twenty.js

import { Records } from '../db.js';
import { montant } from '../montants.js';

const STATUT = {
  ABANDONNE: 'Abandonné', PROJET_SIGNE: 'Projet signé', COMPROMIS: 'Au compromis', NEGOCIATION: 'En négociation', INTERET: 'Intéressé',
  MANDAT_SIGNE: 'Mandat signé', DEF_STRATEGIE: 'Stratégie à définir', STAND_BY: 'En stand-by', FINANCEMENT: 'En financement', RECHERCHE: 'En recherche',
};
const OBJECTIF = { PATRIMONIALE: 'patrimonial', CASHFLOW: 'cashflow', AUTO_FINANCE: 'autofinancement', EQUILIBRE: 'équilibre' };
const SOURCE = { PDZ: 'PDZ', LINKEDIN: 'LinkedIn', WEBI: 'le webinaire', MDI: 'MDI', PARRAIN: 'un parrain', GROUPE_FB: 'le groupe Facebook', MAIL: 'mail', CHRIS: 'Chris', INSTAGRAM: 'Instagram', LA_MARTINGALE: 'La Martingale' };

const propre = (s) => String(s || '').replace(/\s*\/\/\s*/g, ' ; ').replace(/\s+/g, ' ').trim().replace(/[\s;.,-]+$/, '');
const phrase = (s) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : '');
const vide = (s) => !s || /^(ras|rien|-|n\/a)$/i.test(String(s).trim());

/** Le résumé d'un client de Twenty : où il en est, ses moyens, ce qu'il cherche, d'où il vient. */
export function resumeClient(c) {
  const morceaux = [];
  const statut = STATUT[c.statutClient] || null;
  const mandat = c.mandatSigne === 'OUI' || c.mandatSigne === 'MANDAT_SIGNE' ? 'mandat signé' : c.mandatSigne === 'NON' ? 'sans mandat signé' : null;
  morceaux.push(phrase([statut, statut === 'Mandat signé' ? null : mandat].filter(Boolean).join(', ')));
  const moyens = [
    c.budget ? `budget ${montant(c.budget)}` : null,
    c.fondPropre ? `fonds propres ${montant(c.fondPropre)}` : null,
    c.revenu ? `revenus ${montant(c.revenu)} par an` : null,
  ].filter(Boolean);
  morceaux.push(phrase(moyens.join(', ')));
  const objectif = OBJECTIF[c.objectif];
  const lieu = propre(c.lieuDeRecherche);
  morceaux.push(phrase([lieu ? `cherche : ${lieu}` : null, objectif ? `objectif ${objectif}` : null].filter(Boolean).join(', ')));
  const ville = c.localisation?.addressCity;
  const fonction = propre(c.fonction);
  morceaux.push(phrase([fonction && !vide(fonction) ? fonction : null, ville ? `vit à ${ville}` : null].filter(Boolean).join(', ')));
  if (!vide(c.patrimoine) && propre(c.patrimoine) !== fonction) morceaux.push(phrase(`patrimoine : ${propre(c.patrimoine)}`));
  if (!vide(c.information)) morceaux.push(phrase(propre(c.information)));
  if (!vide(c.remarque)) morceaux.push(phrase(`à noter : ${propre(c.remarque)}`));
  const source = SOURCE[c.source];
  const suivi = propre(c.personnes);
  morceaux.push(phrase([source ? `venu par ${source}` : null, suivi ? `suivi par ${suivi}` : null].filter(Boolean).join(', ')));
  return morceaux.filter(Boolean).join(' ') || null;
}

/** Une fiche par client de Twenty, son résumé posé si la fiche n'en a pas encore. */
// Sans date de mise à jour : reprise de Twenty, la fiche n'a pas encore été travaillée et ne passe pas pour récente.
export function remplirClients(clients) {
  const compte = { creees: 0, remplies: 0, gardees: 0 };
  for (const c of clients) {
    const cle = `twenty:clients:${c.id}`;
    const nom = c.name || 'Client';
    const resume = resumeClient(c);
    const f = Records.findBy('FicheDossier', 'cle', cle);
    if (!f) {
      Records.create('FicheDossier', { cle, genre: 'client', nom, etape: null, resume, blocage: null, liees: [], maj_le: null, maj_par: null, source: 'twenty' });
      compte.creees += 1;
    } else if (!f.resume) {
      Records.update('FicheDossier', f.id, { resume });
      compte.remplies += 1;
    } else compte.gardees += 1;
  }
  return compte;
}

async function lireClients() {
  const { requeteTwenty } = await import('../twenty.js');
  const tous = [];
  let apres = null;
  for (;;) {
    const r = await requeteTwenty('GET', `/clientsListe?limit=60&depth=0${apres ? `&starting_after=${apres}` : ''}`);
    const l = r?.data?.clientsListe || [];
    tous.push(...l);
    if (!r?.pageInfo?.hasNextPage || !l.length) break;
    apres = r.pageInfo.endCursor;
  }
  return tous;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const clients = await lireClients();
  console.log(`${clients.length} clients lus dans Twenty`, remplirClients(clients));
}

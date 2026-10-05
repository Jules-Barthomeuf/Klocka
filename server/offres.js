// Les offres : chaque lettre d'intention d'achat (LOI) rédigée par l'équipe,
// gardée pour l'historique de la page Offres et pour être relue, retouchée,
// téléchargée en Word ou en PDF. Le texte vient de ak/loi.js (le modèle de la
// maison) ; ici, seulement ce qu'on a dit de chaque lettre : ses champs, les
// paragraphes retouchés à la main, le dossier d'où elle vient.

import { Records } from './db.js';

export const ENTITE = 'LettreIntention';
const maintenant = () => new Date().toISOString();

/** Ce que la liste montre d'une lettre. Pure. */
export function resume(l) {
  const c = l.champs || {};
  return {
    id: l.id,
    adresse: c.adresse_bien || null,
    acquereur: [c.acquereur_nom, c.acquereur_societe].filter(Boolean).join(' · ') || null,
    vendeur: c.vendeur_societe || null,
    prix: c.prix ?? null,
    modele: l.modele || null,
    deal_id: l.deal_id || null,
    projet_id: l.projet_id || null,
    conversation_id: l.conversation_id || null,
    cree_par: l.cree_par || null,
    cree_le: l.cree_le || null,
    maj_le: l.maj_le || l.cree_le || null,
  };
}

/** La lettre et son texte, bloc par bloc, pour l'éditeur. */
export async function lireLettre(id) {
  const l = Records.get(ENTITE, id);
  if (!l) return null;
  const { blocs, parties, cadre, manquants, MODELES } = await import('./ak/loi.js');
  const version = (modele) => { const brut = { ...(l.champs || {}), textes: l.textes || {}, modele }; return { blocs: blocs(brut), parties: parties(brut), cadre: cadre(brut) }; };
  return {
    lettre: { ...resume(l), champs: l.champs || {}, textes: l.textes || {} },
    ...version(l.modele || 'classique'),
    // Tant que le modèle n'est pas choisi, la page montre les deux versions côte à côte.
    ...(l.modele ? {} : { versions: Object.fromEntries(MODELES.map((m) => [m, version(m)])) }),
    manquants: manquants(l.champs || {}),
  };
}

export function listerLettres() {
  return Records.list(ENTITE).map(resume).sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')));
}

export function creerLettre({ champs, origines = {}, deal_id = null, projet_id = null, user = null }) {
  return Records.create(ENTITE, { champs, origines, textes: {}, deal_id, projet_id, cree_par: user?.email || null, cree_le: maintenant(), maj_le: maintenant() });
}

/**
 * Une retouche : des champs (le prix, l'acquéreur), ou le texte d'un
 * paragraphe. Un paragraphe remis à vide reprend le texte du modèle.
 */
export function modifierLettre(id, { champs = null, textes = null, modele = undefined, origines = null, conversation_id = undefined } = {}) {
  const l = Records.get(ENTITE, id);
  if (!l) return { ok: false, error: 'LOI introuvable.' };
  if (modele !== undefined && modele !== null && !['classique', 'menthe'].includes(modele)) return { ok: false, error: 'Modèle inconnu.' };
  const propres = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== 'textes'));
  const nouveauxChamps = champs ? { ...(l.champs || {}), ...propres(champs) } : l.champs;
  // Sans origine dite (l'éditeur de la page), un champ qui change a été saisi à la main.
  const nouvellesOrigines = origines || { ...(l.origines || {}), ...Object.fromEntries(Object.keys(propres(champs)).filter((k) => String(champs[k]) !== String(l.champs?.[k])).map((k) => [k, 'main'])) };
  let nouveauxTextes = l.textes || {};
  if (textes) {
    nouveauxTextes = { ...nouveauxTextes };
    for (const [cle, t] of Object.entries(textes)) {
      if (t == null || !String(t).trim()) delete nouveauxTextes[cle];
      else nouveauxTextes[cle] = String(t);
    }
  }
  return { ok: true, lettre: Records.update(ENTITE, id, { champs: nouveauxChamps, origines: nouvellesOrigines, textes: nouveauxTextes, ...(modele !== undefined ? { modele } : {}), ...(conversation_id ? { conversation_id: String(conversation_id).slice(0, 80) } : {}),
    // Relier la lettre à sa conversation ne la remonte pas dans la liste.
    ...(champs || textes || modele !== undefined ? { maj_le: maintenant() } : {}) }) };
}

export function supprimerLettre(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: 'LOI introuvable.' };
  Records.delete(ENTITE, id);
  return { ok: true };
}

/** Le fichier à télécharger : Word (à retoucher) ou PDF (à envoyer). */
export async function fichierDe(id, format = 'pdf') {
  const l = Records.get(ENTITE, id);
  if (!l) return null;
  const { pdf, docx } = await import('./ak/loi.js');
  const brut = { ...(l.champs || {}), textes: l.textes || {}, modele: l.modele || 'classique' };
  const contenu = format === 'docx' ? await docx(brut) : await pdf(brut);
  const base = `LOI ${String(l.champs?.adresse_bien || 'local').replace(/[^\p{L}\p{N} .,-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
  return { contenu, nom: `${base}.${format === 'docx' ? 'docx' : 'pdf'}`, type: format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' };
}

/** Ce que le chat de la page Offres sait de la lettre ouverte, pour la retoucher. */
export async function contexteLettre(id) {
  const d = await lireLettre(id);
  if (!d) return null;
  const c = d.lettre.champs;
  const champs = Object.entries(c).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join(' ; ');
  const paragraphes = d.blocs.filter((b) => b.type === 'p').map((b) => `${b.cle} : ${String(b.texte).replace(/\*\*/g, '').slice(0, 90)}${b.retouche ? ' (retouché)' : ''}`).join('\n');
  return `La LOI ouverte à droite : loi_id=${id}.\nSes champs : ${champs}\nSes paragraphes (clé : début) :\n${paragraphes}`;
}

// Les sources d'une lettre : d'où vient chacun de ses champs. Le dossier
// (la fiche ou le mail reçu, avec la phrase relevée), le projet, ce qui a été
// dit au chat, ce qui a été saisi dans la lettre, et les valeurs du modèle.
// Une lettre d'avant les origines : un champ égal à celui du projet ou du
// dossier en vient, le reste a été dit au chat.

const LIBELLES = {
  acquereur_nom: "L'acquéreur", acquereur_societe: "La société de l'acquéreur", acquereur_adresse: "L'adresse de l'acquéreur",
  vendeur_societe: 'Le vendeur', vendeur_representant: 'Le représentant du vendeur', vendeur_adresse: "L'adresse du vendeur",
  adresse_bien: 'Le bien', surface_m2: 'La surface', locataire: 'Le locataire', fin_bail: 'La fin du bail',
  prix: 'Le prix', apport: "L'apport", duree_ans: 'La durée du crédit', taux: 'Le taux', lieu: 'Le lieu de signature',
  validite: "La validité de l'offre", limite_documents: 'La remise des documents', fin_exclusivite: "La fin de l'exclusivité",
};
// Le champ de la lettre, et celui du lot relevé dans le dossier.
const DU_LOT = { adresse_bien: 'adresse', surface_m2: 'surface_m2', locataire: 'locataire_nom', fin_bail: 'bail_echeance', prix: 'prix_fai' };
const DEFAUTS = ['lieu', 'duree_ans', 'taux', 'validite', 'limite_documents', 'fin_exclusivite'];

function valeurLisible(cle, v) {
  if (v == null || v === '') return '';
  if (['prix', 'apport'].includes(cle)) return `${Math.round(Number(v)).toLocaleString('fr-FR')} €`;
  if (cle === 'surface_m2') return `${v} m²`;
  if (cle === 'taux') return `${v} %`;
  if (cle === 'duree_ans') return `${v} ans`;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  return String(v);
}

/** Les sources, groupées par origine, pour la fenêtre « Sources » de la page Offres. */
export async function sourcesDe(id) {
  const l = Records.get(ENTITE, id);
  if (!l) return null;
  const { champsDepuisDeal, champsDepuisProjet } = await import('./ak/loi.js');
  const champs = l.champs || {};
  const projet = l.projet_id ? Records.get('Project', l.projet_id) : null;
  const deal = l.deal_id ? Records.findBy('Deal', 'deal_id', l.deal_id) : null;
  const duProjet = projet ? champsDepuisProjet(projet) : {};
  const duDossier = deal ? champsDepuisDeal(deal) : {};
  const egal = (a, b) => a != null && b != null && String(a) === String(b);
  const origine = (cle) => l.origines?.[cle]
    || (egal(champs[cle], duProjet[cle]) ? 'projet' : egal(champs[cle], duDossier[cle]) ? 'dossier' : 'chat');
  const groupes = { dossier: [], projet: [], chat: [], main: [] };
  for (const [cle, v] of Object.entries(champs)) {
    if (v == null || v === '' || !LIBELLES[cle]) continue;
    const o = origine(cle);
    const ligne = { cle, libelle: LIBELLES[cle], valeur: valeurLisible(cle, v) };
    if (o === 'dossier') ligne.citation = deal?.lots?.[0]?.lot?.[DU_LOT[cle]]?.citation || null;
    (groupes[o] || groupes.chat).push(ligne);
  }
  const { completer } = await import('./ak/loi.js');
  const c = completer(champs);
  const defauts = DEFAUTS.filter((k) => champs[k] == null || champs[k] === '').map((cle) => ({ cle, libelle: LIBELLES[cle], valeur: valeurLisible(cle, c[cle]) }));
  const src = deal?.source || {};
  const sources = [];
  if (groupes.dossier.length) {
    sources.push({
      id: 'dossier', type: 'dossier',
      titre: src.nom_fichier || (src.type === 'texte' ? 'Le message reçu' : 'La fiche du dossier'),
      detail: 'Relevé dans le dossier',
      champs: groupes.dossier,
      document: { nom: src.nom_fichier || null, url: src.url || null, texte: src.texte_source ? String(src.texte_source).slice(0, 40000) : null },
      lien: `/Dossiers?deal_id=${deal.deal_id}`,
    });
  }
  if (groupes.projet.length) sources.push({ id: 'projet', type: 'projet', titre: projet.titre || projet.adresse_complete || 'Le projet', detail: 'La fiche du projet', champs: groupes.projet, lien: `/Projet?id=${projet.id}` });
  if (groupes.chat.length) sources.push({ id: 'chat', type: 'chat', titre: 'Votre demande', detail: 'Dit dans le chat', champs: groupes.chat });
  if (groupes.main.length) sources.push({ id: 'main', type: 'main', titre: 'La lettre', detail: 'Saisi dans la lettre', champs: groupes.main });
  if (defauts.length) sources.push({ id: 'modele', type: 'modele', titre: 'Le modèle de la maison', detail: 'Valeurs par défaut', champs: defauts });
  return sources;
}

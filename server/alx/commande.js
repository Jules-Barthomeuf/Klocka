// Le chat d'ALX sur une ville : une phrase, un geste.
//
// « Prospecte la rue Meynadier », « ajoute le boulevard Carnot », « regarde
// si Maison Peirano vaut le coup », « ouvre la rue d'Antibes ». Le modèle
// ne fait que traduire la phrase en une action parmi cinq, avec le nom de
// la rue ou du commerce ; tout le reste est fait par le code qui sert déjà
// aux boutons de l'écran : classer une rue, la parcourir, créer une cible,
// lire son propriétaire. Sans modèle, quelques tournures simples suffisent.
//
// La réponse dit ce qui a été fait et où l'écran doit aller : la rue à ouvrir
// à droite de la carte, ou la fiche du commerce.

import { Records } from '../db.js';
import { invokeLLM, llmEnabled } from '../llm.js';
import { cleRue } from './commerces.js';
import { classerRue, creerCible, reclasser } from './index.js';
import { parcourirRue } from './parcours.js';

const ACTIONS = ['prospecter_rue', 'ouvrir_rue', 'prospecter_commerce', 'ouvrir_commerce', 'inconnu'];

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    rue: { type: ['string', 'null'], description: 'Le nom de la rue tel que l\'équipe l\'a écrit, avec son type (rue, boulevard, avenue, place…)' },
    enseigne: { type: ['string', 'null'], description: 'Le nom du commerce, si la phrase en désigne un' },
    adresse: { type: ['string', 'null'], description: 'L\'adresse avec son numéro, si elle est dans la phrase' },
    activite: { type: ['string', 'null'] },
    reponse: { type: 'string', description: 'Une phrase courte pour l\'équipe, quand l\'action est inconnue' },
  },
  required: ['action', 'reponse'],
};

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** La rue de la ville qui ressemble au nom donné : exacte, puis contenue. Pure. */
export function trouverRue(rues, nom) {
  const k = cleRue(nom);
  if (!k) return null;
  const exacte = rues.find((r) => cleRue(r.nom) === k);
  if (exacte) return exacte;
  const n = normaliser(nom).replace(/^(rue|boulevard|bd|avenue|av|place|cours|quai|chemin|allee|impasse|traverse|promenade|square)\s+(de la |de l |du |des |de |d )?/, '');
  if (n.length < 3) return null;
  return rues.find((r) => normaliser(r.nom).includes(n)) || null;
}

/** Le commerce déjà connu qui ressemble au nom donné. Pure. */
export function trouverCommerce(cibles, nom) {
  const n = normaliser(nom);
  if (n.length < 3) return null;
  return cibles.find((c) => normaliser(c.enseigne) === n) || cibles.find((c) => normaliser(c.enseigne).includes(n) || n.includes(normaliser(c.enseigne) || '§')) || null;
}

const TYPES_DE_VOIE = 'rue|boulevard|bd|avenue|av|place|cours|quai|chemin|allée|allee|impasse|traverse|promenade|square';

/** Sans modèle : les tournures les plus simples. Pure. */
export function interpreterSansModele(texte, { rues = [], cibles = [] } = {}) {
  const t = String(texte || '').trim();
  const veutProspecter = /prospect|lance|analys|cherche|regarde|ajoute/i.test(t);
  // Un numéro devant la voie : c'est un commerce à une adresse, pas une rue.
  const numero = t.match(new RegExp(`(\\d+\\s*(?:bis|ter)?\\s+(?:${TYPES_DE_VOIE})\\s+[^,.;]+)`, 'i'));
  const voie = numero ? null : t.match(new RegExp(`((?:${TYPES_DE_VOIE})\\s+[^,.;]+)`, 'i'));
  if (voie) {
    const rue = voie[1].trim();
    return { action: veutProspecter ? 'prospecter_rue' : 'ouvrir_rue', rue, reponse: '' };
  }
  const enseigne = (numero ? t.replace(numero[1], '').replace(/\s*(au|à|,)\s*$/i, '') : t).replace(/^(prospecte[rz]?|ajoute[rz]?|regarde[rz]?|ouvre[rz]?|analyse[rz]?|cherche[rz]?)\s+(si\s+)?(le\s+commerce\s+|la\s+boutique\s+|le\s+magasin\s+)?/i, '').replace(/\s+(vaut le coup|est bien|c'est bien|pour voir.*|stp|s'il te plaît)\.?$/i, '').trim();
  if (enseigne) {
    const connu = trouverCommerce(cibles, enseigne);
    return { action: connu && !veutProspecter ? 'ouvrir_commerce' : 'prospecter_commerce', enseigne, adresse: numero ? numero[1] : null, reponse: '' };
  }
  return { action: 'inconnu', reponse: 'Dites-moi une rue (« prospecte la rue Meynadier ») ou un commerce (« regarde Maison Peirano »).' };
}

/** La phrase traduite en action, par le modèle quand il est là. */
export async function interpreter(texte, { ville, rues = [], cibles = [] } = {}) {
  if (!llmEnabled) return interpreterSansModele(texte, { rues, cibles });
  const prompt = `Tu traduis une phrase de l'équipe de Klocka, sur l'écran de prospection de la ville de ${ville.nom}, en une action.

Actions possibles :
- prospecter_rue : lancer la lecture de tous les commerces d'une rue (mots comme prospecte, lance, analyse, ajoute, cherche les commerces de…). Donne « rue ».
- ouvrir_rue : seulement montrer une rue, sans rien lancer (ouvre, montre, va sur…). Donne « rue ».
- prospecter_commerce : analyser un commerce précis pour savoir si ses murs valent le coup (regarde, prospecte, analyse, ajoute + un nom d'enseigne ou une adresse). Donne « enseigne », et « adresse » si elle est écrite.
- ouvrir_commerce : montrer la fiche d'un commerce déjà analysé, sans relire (ouvre, montre + un nom d'enseigne).
- inconnu : rien de tout ça ; écris alors dans « reponse » ce que tu peux faire, en une phrase.

Les rues classées dans la ville (pour reconnaître un nom mal écrit, garde alors le nom exact de la liste) :
${rues.slice(0, 400).map((r) => r.nom).join(' · ')}

Les commerces déjà analysés :
${cibles.slice(0, 300).map((c) => c.enseigne).filter(Boolean).join(' · ') || 'aucun'}

Phrase : « ${String(texte).trim()} »`;
  const r = await invokeLLM({ prompt, response_json_schema: SCHEMA });
  const action = ACTIONS.includes(r?.action) ? r.action : 'inconnu';
  return { action, rue: r?.rue || null, enseigne: r?.enseigne || null, adresse: r?.adresse || null, activite: r?.activite || null, reponse: r?.reponse || '' };
}

/**
 * Une rue que la ville n'a pas : la Base Adresse Nationale la confirme, Data-B
 * donne son loyer, et elle entre dans la liste avec sa classe.
 */
async function ajouterRue(ville, nom, user) {
  const { rueOfficielle, emplacementParLoyer } = await import('./rues.js');
  const off = await rueOfficielle(nom, ville.nom, ville.code_insee || null);
  if (!off?.nom) return { ok: false, error: `La Base Adresse Nationale ne trouve pas « ${nom} » à ${ville.nom}.` };
  const { joliNomDeRue } = await import('./commerces.js');
  const propre = joliNomDeRue(off.nom);
  let loyer = null;
  try {
    const { valeurLocative } = await import('../data-b.js');
    const vl = await valeurLocative(`${propre}, ${off.code_postal || ville.code_postal || ''} ${ville.nom}`.trim(), { user });
    loyer = vl.ok ? vl.resultat?.rue || vl.resultat?.quartier || null : null;
  } catch {
    loyer = null;
  }
  const e = emplacementParLoyer(loyer, 0);
  const classe = e.classe || 2;
  const r = await classerRue(ville.id, { nom: propre, classe, motif: `ajoutée depuis le chat · ${e.motif}`, user });
  if (!r.ok) return r;
  // Ce qu'on sait déjà de la rue : son loyer, son point, pour la carte et la fiche.
  const rues = (r.ville.rues || []).map((x) => (x.nom === propre ? { ...x, loyer: loyer ? [loyer.basse, loyer.haute] : null, loyer_source: loyer ? 'Data-B' : null, code_postal: off.code_postal || null, centre: { lat: off.lat, lon: off.lon }, commerces: x.commerces ?? 0 } : x));
  Records.update('Ville', ville.id, { rues });
  return { ok: true, nom: propre, classe };
}

/** Lit tout ce qu'ALX sait lire sur une cible fraîche : propriétaire, événements, mutation, loyer, classement. */
async function analyserCible(id, user) {
  const enrichir = await import('./enrichir.js');
  let c = Records.get('Cible', id);
  const erreurs = [];
  try {
    c = (await enrichir.trouverProprietaire(id, { user })).cible;
  } catch (e) {
    erreurs.push(`propriétaire : ${e.message}`);
  }
  if (c?.proprietaire?.siren) {
    try {
      c = (await enrichir.lireEvenements(id, { user })).cible;
    } catch (e) {
      erreurs.push(`BODACC : ${e.message}`);
    }
  }
  try {
    c = (await enrichir.lireMutation(id, { user })).cible;
  } catch (e) {
    erreurs.push(`DVF : ${e.message}`);
  }
  try {
    c = (await enrichir.lireLoyer(id, { user })).cible;
  } catch (e) {
    erreurs.push(`loyer : ${e.message}`);
  }
  try {
    c = (await enrichir.lireDevanture(id, { user })).cible;
  } catch {
    // Street View est un plus, pas une condition.
  }
  c = reclasser(id) || c;
  return { cible: c, erreurs };
}

/**
 * Exécute une phrase sur une ville. Rend ce qui a été fait, et où aller :
 * `ouvrir` vaut « rues » (avec `rue` à choisir) ou « fiche » (avec `cible_id`).
 */
export async function executerCommande(villeId, texte, { user = null } = {}) {
  const ville = Records.get('Ville', villeId);
  if (!ville) return { ok: false, error: 'Ville introuvable.' };
  const phrase = String(texte || '').trim();
  if (!phrase) return { ok: false, error: 'Dites quelque chose.' };
  const rues = [...(ville.rues || []), ...(ville.rues_ecartees || [])];
  const cibles = Records.filter('Cible', { ville_id: villeId });
  const i = await interpreter(phrase, { ville, rues, cibles });

  if (i.action === 'prospecter_rue' || i.action === 'ouvrir_rue') {
    if (!i.rue) return { ok: true, action: i.action, reponse: 'Quelle rue ? Donnez son nom avec son type : « rue Meynadier », « boulevard Carnot ».' };
    let rue = trouverRue(rues, i.rue);
    let ajoutee = false;
    if (!rue) {
      const a = await ajouterRue(ville, i.rue, user);
      if (!a.ok) return { ok: true, action: i.action, reponse: a.error };
      rue = { nom: a.nom, classe: a.classe };
      ajoutee = true;
    } else if (!(ville.rues || []).some((r) => r.nom === rue.nom)) {
      // Une rue écartée qu'on demande : elle reprend sa place, en 2.
      const r = await classerRue(villeId, { nom: rue.nom, classe: 2, motif: 'reprise depuis le chat', user });
      if (!r.ok) return { ok: true, action: i.action, reponse: r.error };
      ajoutee = true;
    }
    if (i.action === 'ouvrir_rue') return { ok: true, action: i.action, ouvrir: 'rues', rue: rue.nom, reponse: `${rue.nom}${ajoutee ? ', ajoutée à la liste' : ''}.` };
    const p = parcourirRue(villeId, rue.nom, { user, rediger: false });
    if (!p.ok) return { ok: true, action: i.action, ouvrir: 'rues', rue: rue.nom, reponse: p.error };
    return { ok: true, action: i.action, ouvrir: 'rues', rue: rue.nom, reponse: `ALX prospecte ${rue.nom}${ajoutee ? ', ajoutée à la liste' : ''} : les commerces arrivent dans l'onglet Commerces.` };
  }

  if (i.action === 'ouvrir_commerce' || i.action === 'prospecter_commerce') {
    const connu = i.enseigne ? trouverCommerce(cibles, i.enseigne) : null;
    if (i.action === 'ouvrir_commerce') {
      if (!connu) return { ok: true, action: i.action, reponse: `Aucun commerce analysé ne s'appelle « ${i.enseigne || '?' } ». Dites « prospecte ${i.enseigne || 'son nom'} » pour l'analyser.` };
      return { ok: true, action: i.action, ouvrir: 'fiche', cible_id: connu.id, reponse: `${connu.enseigne || connu.adresse}.` };
    }
    let id = connu?.id || null;
    let cree = null;
    if (!id) {
      let lieu = i.adresse ? { adresse: i.adresse, enseigne: i.enseigne || null, activite: i.activite || null } : null;
      if (!lieu) {
        if (!i.enseigne) return { ok: true, action: i.action, reponse: 'Quel commerce ? Donnez son enseigne, ou son adresse avec le numéro.' };
        try {
          const { chercherCommerce, placesConfigure } = await import('./places.js');
          lieu = placesConfigure() ? await chercherCommerce(i.enseigne, ville.nom) : null;
        } catch (e) {
          return { ok: true, action: i.action, reponse: `Maps n'a pas répondu (${e.message}). Donnez l'adresse avec le numéro.` };
        }
        if (!lieu) return { ok: true, action: i.action, reponse: `Maps ne trouve pas « ${i.enseigne} » à ${ville.nom}. Donnez l'adresse avec le numéro.` };
      }
      const rueDuLieu = trouverRue(rues, lieu.adresse.replace(/^\d+\s*(bis|ter)?\s*/i, ''));
      const r = creerCible({ ville_id: villeId, adresse: lieu.adresse, enseigne: lieu.enseigne || i.enseigne || null, activite: lieu.activite || null, rue: rueDuLieu?.nom || null, place_id: lieu.place_id || null, lat: lieu.lat ?? null, lon: lieu.lon ?? null, source: lieu.place_id ? 'Google Maps' : 'chat', user });
      if (!r.ok) return { ok: true, action: i.action, reponse: r.error };
      id = r.cible.id;
      cree = r.cible;
    }
    const { cible, erreurs } = await analyserCible(id, user);
    const proprio = cible?.proprietaire?.nom ? `propriétaire ${cible.proprietaire.nom}` : cible?.foncier ? 'plusieurs propriétaires, à départager' : 'propriétaire introuvable';
    return { ok: true, action: i.action, ouvrir: 'fiche', cible_id: id, reponse: `${cible?.enseigne || cree?.adresse || 'Le commerce'} : ${proprio}, pile « ${cible?.pile || '?'} ».${erreurs.length ? ` (${erreurs.join(' ; ')})` : ''}` };
  }

  return { ok: true, action: 'inconnu', reponse: i.reponse || 'Dites-moi une rue à prospecter ou un commerce à regarder.' };
}

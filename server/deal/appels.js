// La note d'appel : ce qu'on dit en raccrochant devient la fiche de l'agent.
//
// « J'ai eu Marc Dupont de chez Orpi, un local à Lyon 3e à 400 000 €, il
// m'envoie les documents d'ici jeudi. » Le modèle en tire qui, quoi, pour
// quand ; la fiche Monday de l'agent reçoit le prénom, la date de l'appel, le
// résumé dans « Remarques » et la prochaine relance dans sa case ; et si un
// bien est décrit, le dossier s'ouvre comme avant. Ensuite, le tableau de
// bord lit les relances dans Monday : voilà tout ce qui attend, avec le résumé.

import { Records } from '../db.js';

const SCHEMA = {
  type: 'object',
  properties: {
    prenom: { type: 'string', description: "prénom de l'interlocuteur, chaîne vide si inconnu" },
    nom: { type: 'string', description: "nom de famille, chaîne vide si inconnu" },
    entreprise: { type: 'string', description: "agence ou société (Orpi, Century 21, un syndic…), chaîne vide sinon" },
    email: { type: 'string', description: 'adresse mail si dite, sinon chaîne vide' },
    telephone: { type: 'string', description: 'numéro si dit, sinon chaîne vide' },
    ville: { type: 'string', description: "ville de l'agent ou du bien, si dite" },
    resume: { type: 'string', description: "ce qui a été dit, en deux à quatre lignes factuelles : le bien, les chiffres, ce qui est convenu, ce qui manque" },
    prochaine_relance: { type: 'string', description: "date YYYY-MM-DD à laquelle relancer ou attendre quelque chose (« d'ici jeudi » = ce jeudi ; « fin de mois » = dernier jour du mois ; rien de dit = chaîne vide)" },
    bien: {
      type: 'object',
      description: "le bien décrit, si un bien précis est décrit ; sinon toutes les valeurs vides",
      properties: {
        nom: { type: 'string', description: 'nom de dossier, ex. « Local commercial — Lyon 3e », chaîne vide si aucun bien' },
        ville: { type: 'string' },
        rue: { type: 'string' },
        prix: { type: 'number', description: 'prix FAI en euros, 0 si inconnu' },
        surface: { type: 'number', description: 'm², 0 si inconnue' },
        loyer: { type: 'number', description: 'loyer annuel HT HC en euros, 0 si inconnu' },
        activite: { type: 'string', description: 'activité du locataire' },
        documents_promis: { type: 'boolean', description: "l'agent a promis d'envoyer des documents" },
      },
    },
  },
  required: ['prenom', 'nom', 'resume'],
};

const vide = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const nombre = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) : null);
const dateValide = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

/** Ce que le modèle lit dans la note. */
export async function extraireAppel(texte, { par } = {}) {
  const { invokeLLM } = await import('../llm.js');
  const { mesurer } = await import('../llm-couts.js');
  const aujourdhui = new Date();
  const jour = aujourdhui.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { resultat } = await mesurer({ operation: "note d'appel", par: par?.email || null }, () =>
    invokeLLM({
      prompt: `Nous sommes le ${jour} (${aujourdhui.toISOString().slice(0, 10)}). Voici une note dictée par un conseiller Klocka (investissement en murs commerciaux) en raccrochant d'un appel. Relève l'interlocuteur, ce qui a été dit, la date de la prochaine relance (calcule-la depuis aujourd'hui : « jeudi » = le prochain jeudi, « dans une semaine », « fin de mois »…), et le bien s'il y en a un. Ne devine rien : un chiffre non dit vaut 0, un champ non dit vaut chaîne vide. Les montants en « k » sont des milliers d'euros.

--- NOTE ---
${String(texte || '').slice(0, 12000)}
--- FIN ---`,
      response_json_schema: SCHEMA,
    })
  );
  const c = resultat || {};
  const b = c.bien || {};
  const bien = vide(b.nom)
    ? {
        nom: vide(b.nom), ville: vide(b.ville), rue: vide(b.rue), prix: nombre(b.prix), surface: nombre(b.surface),
        loyer: nombre(b.loyer), activite: vide(b.activite), documents_promis: b.documents_promis !== false,
      }
    : null;
  return {
    prenom: vide(c.prenom), nom: vide(c.nom), entreprise: vide(c.entreprise),
    email: vide(c.email)?.toLowerCase() || null, telephone: vide(c.telephone), ville: vide(c.ville),
    resume: vide(c.resume) || String(texte || '').trim().slice(0, 600),
    prochaine_relance: dateValide(c.prochaine_relance),
    bien,
  };
}

/** La note, d'un bout à l'autre : la fiche de l'agent, le dossier s'il y a un bien. */
export async function traiterNoteAppel(texte, { user } = {}) {
  const note = await extraireAppel(texte, { par: user });
  const fait = [];
  const rates = [];

  let agent = null;
  try {
    const { noterAppelAgent } = await import('./monday-sync.js');
    agent = await noterAppelAgent({
      prenom: note.prenom, nom: note.nom, email: note.email, telephone: note.telephone, ville: note.ville,
      entreprise: note.entreprise, remarque: note.resume, relance: note.prochaine_relance, par: user,
    });
    if (agent?.id) {
      fait.push(`${agent.cree ? 'fiche agent créée' : 'fiche agent mise à jour'} : ${agent.nom}`);
      if (agent.entreprise_ignoree) rates.push(`Entreprise « ${agent.entreprise_ignoree} » inconnue du tableau : à choisir dans Monday`);
    } else if (agent?.ignore) rates.push(`Monday : ${agent.raison}`);
  } catch (e) {
    rates.push(`Monday : ${e?.message || e}`);
  }

  let dossier = null;
  if (note.bien) {
    try {
      const { executerOutil } = await import('../assistant-commande.js');
      const r = await executerOutil(
        {
          name: 'creer_dossier',
          input: {
            nom: note.bien.nom, ville: note.bien.ville, rue: note.bien.rue, prix: note.bien.prix, surface: note.bien.surface,
            loyer: note.bien.loyer, activite: note.bien.activite,
            agent_nom: [note.prenom, note.nom].filter(Boolean).join(' ') || undefined,
            agent_email: note.email || undefined, agent_telephone: note.telephone || undefined, agence: note.entreprise || undefined,
            documents_promis: note.bien.documents_promis, promis_pour: note.prochaine_relance || undefined,
          },
        },
        user
      );
      if (r?.deal_id) {
        dossier = { deal_id: r.deal_id, titre: r.titre, lien: r.lien };
        fait.push(`dossier ouvert : ${r.titre}`);
        for (const f of r.fait || []) if (!/promesse/.test(f)) fait.push(f);
        for (const f of r.rates || []) rates.push(f);
      }
    } catch (e) {
      rates.push(`Dossier : ${e?.message || e}`);
    }
  }

  const qui = [note.prenom, note.nom].filter(Boolean).join(' ') || 'votre interlocuteur';
  const relance = note.prochaine_relance
    ? `Relance notée pour le ${new Date(`${note.prochaine_relance}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`
    : "Pas de date de relance dans la note : j'ai laissé la case vide.";
  const texteReponse = [
    `Noté pour ${qui}${note.entreprise ? ` (${note.entreprise})` : ''}.`,
    note.resume,
    relance,
    ...fait.map((f) => `• ${f}`),
    ...rates.map((r) => `⚠ ${r}`),
  ].join('\n');

  Records.create('AssistantAction', {
    type: 'note_appel', par: user?.email || null, le: new Date().toISOString(), texte: String(texte || '').slice(0, 4000),
    note, agent_item_id: agent?.id || null, deal_id: dossier?.deal_id || null,
  });

  return {
    ok: !!(agent?.id || dossier),
    texte: texteReponse,
    note,
    agent: agent?.id ? { id: agent.id, nom: agent.nom, url: `https://klocka-company.monday.com/boards/${process.env.MONDAY_BOARD_AGENTS}/pulses/${agent.id}` } : null,
    dossier,
    fait,
    rates,
  };
}

/** Les relances, groupées pour l'écran : en retard, aujourd'hui, cette semaine, plus tard. */
export async function relancesEnAttente({ pour = null } = {}) {
  const { relancesAgents } = await import('./monday-sync.js');
  const toutes = await relancesAgents({ pour });
  const miennes = toutes.filter((r) => r.spoc);
  const orphelines = toutes.filter((r) => !r.spoc);
  return {
    en_retard: miennes.filter((r) => r.dans < 0),
    aujourdhui: miennes.filter((r) => r.dans === 0),
    cette_semaine: miennes.filter((r) => r.dans > 0 && r.dans <= 7),
    plus_tard: miennes.filter((r) => r.dans > 7),
    sans_responsable: orphelines,
    total: toutes.length,
  };
}

// L'appel d'un propriétaire, depuis une liste : le mandataire enregistre son
// appel (ou le raconte), la plateforme le transcrit, en retient l'issue et
// met la fiche à jour — exactement le geste de la Prospection côté admin,
// mais sur une fiche propriétaire de murs.

import { Records } from './db.js';

const PARIS = 'Europe/Paris';

/** Lit l'appel (audio ou récit) et applique ce qu'il en ressort à la fiche. */
export async function lireAppelProprietaire(ficheId, { audio = null, recit = null, sans_reponse = false }, user) {
  const { proprietaireSien, noterSansReponse, noterResultat, LIBELLES_STATUT } = await import('./mandataire-espace.js');
  const p = proprietaireSien(ficheId, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };

  if (sans_reponse) {
    const r = noterSansReponse(p.id, user);
    if (!r.ok) return r;
    return { ok: true, sans_reponse: true, titre: r.titre, pour: r.pour, tentatives: r.tentatives, passe_a_recontacter: r.passe_a_recontacter };
  }

  let transcription = null;
  if (audio) {
    const { transcrire } = await import('./prospection/appel.js');
    try { transcription = await transcrire(audio); } catch (e) {
      return { ok: false, error: `Transcription impossible : ${e?.message || e}. Racontez l'appel en une phrase à la place.` };
    }
  }
  const texte = String(recit || transcription || '').trim();
  if (!texte) return { ok: false, error: "Rien à lire : enregistrez l'appel ou racontez-le." };

  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS });
  const { resultat: lu } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({
    prompt:
      `Un mandataire immobilier vient d'appeler ${p.nom || 'le propriétaire'} au sujet des murs de ${p.commerce || 'son commerce'}${p.ville ? ` à ${p.ville}` : ''}. Voici ce qui s'est dit (transcription ou récit) :\n\n« ${texte.slice(0, 8000)} »\n\nNous sommes le ${aujourdhui}. Réponds en JSON :\n- statut : l'issue de l'appel. en_discussion (intéressé, à continuer), rdv_pris (un rendez-vous est convenu), pas_vendeur (il ne vendra pas), a_recontacter (plus tard, dans des mois), contacte (joint mais rien de conclu).\n- rappel_dans_jours : si un rappel est convenu (« rappelez-moi dans 6 mois » : 180), sinon null.\n- rdv_quand : si un rendez-vous est pris, sa date-heure AAAA-MM-JJTHH:MM (heure de Paris), sinon null.\n- note : l'essentiel de l'appel en une ou deux phrases, pour la fiche.`,
    response_json_schema: {
      type: 'object',
      properties: {
        statut: { type: 'string', enum: ['en_discussion', 'rdv_pris', 'pas_vendeur', 'a_recontacter', 'contacte'] },
        rappel_dans_jours: { type: ['number', 'null'] },
        rdv_quand: { type: ['string', 'null'] },
        note: { type: 'string' },
      },
      required: ['statut', 'note'],
    },
  }));
  if (!lu || typeof lu !== 'object') return { ok: false, error: "L'appel n'a pas pu être lu : réessayez, ou notez l'issue à la main." };

  const faits = [];
  let rdv = null;
  if (lu.rdv_quand) {
    const { executerOutilMandataire } = await import('./mandataire.js');
    const r = await executerOutilMandataire({ name: 'noter_rdv', input: { qui: [p.nom, p.commerce].filter(Boolean).join(' '), avec: p.nom || p.commerce, quand: lu.rdv_quand, lieu: p.commerce || null } }, user);
    if (r.ok) { rdv = { titre: r.titre, pour: r.pour, rappel_id: r.rappel_id }; faits.push(`${r.titre} · ${r.pour}`); }
  }
  // Le statut (et la note) sur la fiche ; le RDV l'a déjà passée rdv_pris le cas échéant.
  const statut = lu.rdv_quand ? 'rdv_pris' : lu.statut;
  const r = noterResultat(p.id, { statut, texte: lu.note, rappel_dans_jours: lu.rdv_quand ? null : lu.rappel_dans_jours || null }, user);
  if (!r.ok) return r;
  faits.unshift(`Statut : ${LIBELLES_STATUT[statut] || statut}`);
  if (r.rappel_id) faits.push(`Rappel posé dans ${Math.round(lu.rappel_dans_jours)} jours`);

  return {
    ok: true,
    transcription: transcription || null,
    note: lu.note,
    statut,
    statut_mot: LIBELLES_STATUT[statut] || statut,
    rappel: r.rappel_id ? { id: r.rappel_id, dans_jours: Math.round(lu.rappel_dans_jours) } : null,
    rdv,
    faits,
    proprietaire: Records.get('ProprietaireMandataire', p.id),
  };
}

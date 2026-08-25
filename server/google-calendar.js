// Calendrier d'équipe.
//
// Un agenda Google secondaire, créé par l'application et partagé avec l'équipe :
// les échéances des dossiers (relances prévues, rendez-vous) y apparaissent pour
// tout le monde, sans que personne ne les recopie.
//
// Portée `calendar.app.created` : l'application ne voit QUE les agendas qu'elle
// a créés — jamais les agendas personnels des admins. C'est le pendant de
// drive.file côté Calendar. Un échec calendrier n'est jamais bloquant.

import { Records, Meta } from './db.js';
import { storedAccount, accessTokenFor } from './google-oauth.js';
import { statutDe } from './deal/lifecycle.js';

const API = 'https://www.googleapis.com/calendar/v3';
const NOM_AGENDA = 'Klocka — Dossiers';
// L'identifiant de l'agenda est stable : on le garde pour ne pas en créer un
// second à chaque synchronisation.
const CLE_META = 'calendrier_equipe_id';

function compteAgenda(email) {
  const account = storedAccount(email);
  if (!account) throw new Error(`Compte Google non connecté : ${email}`);
  if (!account.peut_agenda) {
    throw new Error(
      `Le compte ${account.email} n'a pas autorisé l'agenda. Reconnectez-le depuis le dashboard (GOOGLE_CALENDAR doit être actif).`
    );
  }
  return account;
}

async function calFetch(token, chemin, options = {}) {
  const resp = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `Calendar a répondu ${resp.status}`);
  return data;
}

/** Retrouve l'agenda d'équipe, ou le crée. */
export async function assurerCalendrier(compteEmail) {
  const account = compteAgenda(compteEmail);
  const token = await accessTokenFor(account);

  const connu = Meta.get(CLE_META);
  if (connu) {
    try {
      const agenda = await calFetch(token, `/calendars/${encodeURIComponent(connu)}`);
      return { id: agenda.id, nom: agenda.summary, cree: false };
    } catch {
      // Agenda supprimé côté Google : on en recrée un.
      Meta.set(CLE_META, '');
    }
  }

  const agenda = await calFetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: NOM_AGENDA,
      description: "Échéances des dossiers Klocka. Alimenté automatiquement — les modifications faites ici ne remontent pas dans l'application.",
      timeZone: 'Europe/Paris',
    }),
  });
  Meta.set(CLE_META, agenda.id);
  return { id: agenda.id, nom: agenda.summary, cree: true };
}

/**
 * Partage l'agenda avec des adresses de l'équipe, en écriture.
 * Le partage peut être refusé selon la portée accordée : l'échec est rendu,
 * jamais avalé — il se rattrape en un clic depuis Google Agenda.
 */
export async function partagerCalendrier(compteEmail, emails = []) {
  const account = compteAgenda(compteEmail);
  const token = await accessTokenFor(account);
  const { id } = await assurerCalendrier(compteEmail);

  const partages = [];
  const erreurs = [];
  for (const email of emails.filter(Boolean)) {
    try {
      await calFetch(token, `/calendars/${encodeURIComponent(id)}/acl`, {
        method: 'POST',
        body: JSON.stringify({ role: 'writer', scope: { type: 'user', value: email } }),
      });
      partages.push(email);
    } catch (e) {
      erreurs.push(`${email} : ${e?.message || e}`);
    }
  }
  return { calendrier_id: id, partages, erreurs };
}

const jourSeul = (iso) => new Date(iso).toISOString().slice(0, 10);

/**
 * Pose ou met à jour un événement d'une journée, identifié par sa clé métier.
 * La clé (dossier + nature) évite les doublons à chaque synchronisation.
 */
async function poserEvenement(token, calendrierId, { cle, titre, description, date }) {
  const existants = await calFetch(
    token,
    `/calendars/${encodeURIComponent(calendrierId)}/events?privateExtendedProperty=${encodeURIComponent(`klocka=${cle}`)}&showDeleted=false&maxResults=1`
  );
  const corps = {
    summary: titre,
    description,
    start: { date: jourSeul(date) },
    end: { date: jourSeul(date) },
    extendedProperties: { private: { klocka: cle } },
  };

  const existant = existants.items?.[0];
  if (existant) {
    // Rien n'a bougé : on évite l'écriture inutile.
    if (existant.summary === titre && existant.start?.date === corps.start.date) return 'inchange';
    await calFetch(token, `/calendars/${encodeURIComponent(calendrierId)}/events/${existant.id}`, {
      method: 'PATCH',
      body: JSON.stringify(corps),
    });
    return 'maj';
  }

  await calFetch(token, `/calendars/${encodeURIComponent(calendrierId)}/events`, {
    method: 'POST',
    body: JSON.stringify(corps),
  });
  return 'cree';
}

/**
 * Reporte dans l'agenda les échéances des dossiers ouverts : aujourd'hui, les
 * relances prévues. Idempotent — on peut la relancer sans créer de doublon.
 */
export async function synchroniserEcheances(compteEmail, appUrl = '') {
  const account = compteAgenda(compteEmail);
  const token = await accessTokenFor(account);
  const { id, cree } = await assurerCalendrier(compteEmail);

  const deals = Records.list('Deal').filter(
    (d) => !d.archived && !d.test && d.relance_prevue_le && statutDe(d) === 'documents_demandes'
  );

  let crees = 0;
  let majs = 0;
  const erreurs = [];
  for (const deal of deals) {
    const titre = `Relance — ${deal.nom || deal.lots?.[0]?.synthese?.titre || deal.deal_id}`;
    try {
      const r = await poserEvenement(token, id, {
        cle: `relance:${deal.deal_id}`,
        titre,
        description: [
          `Documents demandés à ${deal.contact_agent_email || "l'agent"}, sans réponse.`,
          appUrl ? `Dossier : ${appUrl}/Analyse?deal_id=${deal.deal_id}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        date: deal.relance_prevue_le,
      });
      if (r === 'cree') crees += 1;
      if (r === 'maj') majs += 1;
    } catch (e) {
      erreurs.push(`${titre} : ${e?.message || e}`);
    }
  }

  return { calendrier_id: id, calendrier_cree: cree, echeances: deals.length, crees, majs, erreurs };
}

/** Adresse publique de l'agenda, à ouvrir dans Google Agenda. */
export function lienCalendrier() {
  const id = Meta.get(CLE_META);
  return id ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(id)}` : null;
}

export const calendrierConfigure = () => !!Meta.get(CLE_META);

// La pop-up « Record de l'équipe » (22 nov. 2026, Jules : « uniquement pour les admins, une seule fois par semaine à la
// première connexion, le lundi »). Elle fête qui tient le record de fiches reçues en une semaine (recordAnalyste,
// prospection/fiches-par-analyste.js). Montrée à un admin à sa première ouverture de la semaine (le lundi, ou le
// premier jour où il vient), puis plus jusqu'au lundi suivant ; « vue » est notée sur son compte, pour tous ses appareils.
//
// Pur : testé sans base.

/** Pure : le lundi de la semaine de `maintenant`, à l'heure de Paris (« 2026-11-16 »). */
export function semaineDe(maintenant = new Date()) {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Pure : la pop-up est-elle à montrer à cette personne cette semaine ? */
export function aMontrer(user, maintenant = new Date()) {
  return user?.role === 'admin' && user.record_vu_semaine !== semaineDe(maintenant);
}

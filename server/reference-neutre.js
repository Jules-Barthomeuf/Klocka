// Les références des clients vues d'un mandataire (31 oct. 2026, Jules, PLAN.md 0.2) : « Client n°12 », jamais des
// initiales. Ce qui a été gardé avant ce jour (préparations de rendez-vous, trouvailles de l'agent) porte encore des
// initiales : à la lecture, elles deviennent « Client compatible ». Pur, sans base : lu par les fiches comme par l'agent.

/** Pure : la forme d'une référence de client vue d'un mandataire. */
export const REFERENCE_NEUTRE = /^Client n°\d+$/;

/** Pure : une référence enregistrée avant le 31 oct. 2026 (des initiales) ne ressort plus : « Client compatible ». */
export const referenceNeutre = (r) => (REFERENCE_NEUTRE.test(String(r || '')) ? r : 'Client compatible');

/** Pure : la préparation d'un rendez-vous gardée sur la fiche, ses clients compatibles sans les anciennes initiales. */
export function preparationNeutre(prep) {
  if (!prep) return prep;
  const cc = prep.clients_compatibles;
  return {
    ...prep,
    ...(Array.isArray(prep.clients) ? { clients: prep.clients.map((t) => { const [ref, ...reste] = String(t).split(' · '); return [referenceNeutre(ref), ...reste].join(' · '); }) } : {}),
    ...(cc?.liste ? { clients_compatibles: { ...cc, liste: cc.liste.map((x) => ({ ...x, reference: referenceNeutre(x.reference) })) } } : {}),
  };
}

// Haka n'écrit qu'à l'équipe (2 nov. 2026, Jules : « il n'a pas le droit d'envoyer des mails à d'autres emails que
// ceux finissant par @klocka.immo »). Le verrou est ici, devant chaque envoi de Haka : un agent, un client, un
// vendeur ne reçoivent jamais un mail de l'Assistant. Ce que Haka aurait écrit dehors devient un rappel.

const KLOCKA = /^[^@\s]+@klocka\.immo$/i;

/** Pure : les adresses d'un champ « à » (virgules, points-virgules, « Nom <adresse> »). */
export const adressesDe = (a) => String(a || '').split(/[,;]/).map((x) => (x.match(/<([^>]+)>/)?.[1] || x).trim().toLowerCase()).filter(Boolean);

/** Pure : vrai seulement si chaque adresse finit par @klocka.immo. */
export function adresseKlocka(a) {
  const l = adressesDe(a);
  return l.length > 0 && l.every((x) => KLOCKA.test(x));
}

/** Lève une erreur dès qu'une adresse sort de @klocka.immo : rien ne part. */
export function verifierDestinataire(a) {
  if (!adresseKlocka(a)) throw new Error(`L'Assistant n'écrit qu'aux adresses @klocka.immo : rien n'est parti vers ${adressesDe(a).join(', ') || 'un destinataire vide'}.`);
}

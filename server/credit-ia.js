// Plus de crédit chez Anthropic (16 oct. 2026, Jules : « à la place de ce message, mets : Désolé je n'ai plus
// de crédits ! :( »). L'API répond 400 « Your credit balance is too low… » ; la personne qui parle à AK ne lit
// pas ce JSON, elle lit une phrase.

export const MESSAGE_SANS_CREDIT = "Désolé je n'ai plus de crédits ! :(";

/** Pure : l'erreur vient-elle d'un compte Anthropic sans crédit ? */
export const estSansCredit = (e) => /credit balance is too low/i.test(String(e?.message ?? e ?? ''));

/** Pure : le texte à montrer pour une erreur : la phrase de Jules si c'est le crédit, sinon le message tel quel. */
export const messagePourLaPersonne = (e) => (estSansCredit(e) ? MESSAGE_SANS_CREDIT : String(e?.message || e));

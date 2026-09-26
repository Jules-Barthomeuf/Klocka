// Les messages internes de la prospection, que l'assistant dépose dans le
// chat privé de la personne concernée : la proposition après un appel, le
// « nouveau dossier de Sophie, préanalyse prête », le récapitulatif du
// vendredi. Ils restent dans l'équipe. Aucun message ne part jamais vers un
// agent sans un clic : ceux-là passent par « À envoyer ».
//
// La file est vidée par la veille d'AK (server/ak/veille.js), là où vit la
// connexion à Google Chat.

import { Meta, Records } from '../db.js';

const CLE = 'prospection.a_dire';
const lire = () => { try { return JSON.parse(Meta.get(CLE) || '[]'); } catch { return []; } };

export function direEnPrive(email, texte, { appel_id = null } = {}) {
  if (!email || !texte) return;
  const file = lire();
  file.push({ pour: String(email).toLowerCase(), texte: String(texte).slice(0, 3800), le: new Date().toISOString(), appel_id });
  Meta.set(CLE, JSON.stringify(file.slice(-50)));
}

/** Vide la file dans le chat. Un message plus vieux d'un jour n'a plus de sens : il est jeté. */
export async function deposer({ assurerPrive, envoyer }) {
  const file = lire();
  if (!file.length) return 0;
  Meta.set(CLE, '[]');
  const { priveDe } = await import('../ak/fiches.js');
  let n = 0;
  for (const m of file) {
    if (Date.now() - Date.parse(m.le) > 86400000) continue;
    try {
      const espace = await priveDe(m.pour, { assurerPrive });
      if (espace) {
        await envoyer(espace, m.texte);
        // La réponse « 1 2 3 » dans ce privé retrouvera l'appel.
        if (m.appel_id && Records.get('AppelAgent', m.appel_id)) Records.update('AppelAgent', m.appel_id, { espace, dit_le: new Date().toISOString() });
        n += 1;
      }
    } catch (e) { console.warn(`[prospection] message pour ${m.pour} non déposé : ${e?.message || e}`); }
  }
  return n;
}

// Une réponse qui arrive par morceaux : une ligne JSON par événement
// (« etape », puis « resultat » ou « erreur »). La compression retiendrait
// les lignes jusqu'à la fin ; `flush` les pousse une à une.

import { messagePourLaPersonne } from './credit-ia.js';

export function ouvrirFlux(res) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  const ecrire = (o) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(o)}\n`);
    res.flush?.();
  };
  return {
    etape: (texte) => { if (texte) ecrire({ etape: String(texte) }); },
    // Une action déjà faite (rappel créé, fiche posée) : envoyée au moment où
    // elle est faite, pour qu'un Stop n'efface pas ce qui est acquis.
    action: (a) => { if (a) ecrire({ action: a }); },
    // Le texte du modèle au fil de l'eau (12 oct. 2026) : un morceau, et le tour de la boucle où il est écrit.
    texte: (morceau, tour = 0) => { if (morceau) ecrire({ texte: String(morceau), tour }); },
    fin: (resultat) => { ecrire({ resultat }); res.end(); },
    // Plus de crédit chez Anthropic : une phrase, pas le JSON de l'API (16 oct. 2026, Jules).
    erreur: (e) => { ecrire({ erreur: e ? messagePourLaPersonne(e) : 'Erreur' }); res.end(); },
  };
}

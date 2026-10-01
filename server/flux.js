// Une réponse qui arrive par morceaux : une ligne JSON par événement
// (« etape », puis « resultat » ou « erreur »). La compression retiendrait
// les lignes jusqu'à la fin ; `flush` les pousse une à une.

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
    fin: (resultat) => { ecrire({ resultat }); res.end(); },
    erreur: (e) => { ecrire({ erreur: String(e?.message || e || 'Erreur') }); res.end(); },
  };
}

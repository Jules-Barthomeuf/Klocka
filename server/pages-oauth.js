// Les deux petites pages HTML qui closent un aller-retour OAuth avec Google.
//
// Elles vivent hors de index.js parce que les routes de connexion et celles du
// rattachement d'une boîte mail en ont besoin toutes les deux, et qu'elles
// habitent désormais deux fichiers différents.

// Small HTML page used to report the outcome of the OAuth round-trip.
// Canal de dialogue entre la fenêtre surgissante de connexion et la page qui
// l'a ouverte : elle garde ainsi son brouillon de mail intact.
const CANAL_POPUP = 'klocka-google';
const RETOUR_POPUP = '__popup__';

const echapper = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function authResultPage(res, { ok, title, detail }) {
  const color = ok ? '#2A9D8F' : '#e76f51';
  res.status(ok ? 200 : 400).send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="max-width:520px;padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:12px">${ok ? '✓' : '!'}</div>
    <h1 style="color:${color};font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 24px">${detail}</p>
    <a href="/Dashboard" id="retour" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px">Retour au dashboard</a>
  </div>
  <script>
    // Ouverte en fenêtre surgissante : prévenir la page appelante et proposer
    // de fermer plutôt que de naviguer.
    if (window.opener) {
      window.opener.postMessage(
        { type: ${JSON.stringify(CANAL_POPUP)}, ok: false, error: ${JSON.stringify(String(detail || title))} },
        window.location.origin
      );
      var b = document.getElementById('retour');
      b.textContent = 'Fermer cette fenêtre';
      b.href = '#';
      b.onclick = function (e) { e.preventDefault(); window.close(); };
    }
  </script>
</body></html>`);
}

// Fin de parcours en fenêtre surgissante : on prévient la page appelante que
// la boîte est connectée, puis on se referme.
function popupConnectePage(res, { email }) {
  res.send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Boîte connectée</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="text-align:center">
    <div style="font-size:40px;margin-bottom:12px">✓</div>
    <p style="color:#9ca3af;font-size:14px">${echapper(email)} connectée. Cette fenêtre se referme…</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        { type: ${JSON.stringify(CANAL_POPUP)}, ok: true, email: ${JSON.stringify(email)} },
        window.location.origin
      );
    }
    setTimeout(function () { window.close(); }, 600);
  </script>
</body></html>`);
}

export { CANAL_POPUP, RETOUR_POPUP, echapper, authResultPage, popupConnectePage };

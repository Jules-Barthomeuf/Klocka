import React, { useEffect, useState } from "react";
import { LettreImprimee } from "@/components/offres/EditeurLoi";

// La page d'impression de la lettre d'intention (29 oct. 2026, Jules : le PDF doit être le document de l'écran) :
// ouverte par le navigateur du serveur, jamais par une personne. La lettre en lecture, avec son design ; quand les
// polices sont là, la page le dit (window.__impressionPrete) et le serveur imprime en A4.

export default function ImpressionLoi() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
    fetch(`/api/loi-impression/${encodeURIComponent(jeton)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || `réponse ${r.status}`); return j; })
      .then(setData)
      .catch((e) => { window.__impressionErreur = e?.message || "erreur"; });
  }, []);
  useEffect(() => {
    if (!data) return undefined;
    let fini = false;
    (async () => {
      await document.fonts?.ready;
      await new Promise((ok) => setTimeout(ok, 400));
      if (!fini) window.__impressionPrete = true;
    })();
    return () => { fini = true; };
  }, [data]);
  if (!data) return null;
  return <LettreImprimee d={data} />;
}

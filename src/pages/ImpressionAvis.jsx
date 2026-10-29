import React, { useEffect, useState } from "react";
import { PagesAvisImprimees } from "@/components/mandataire/EditeurAvis";

// La page d'impression de l'avis de valeur (27 oct. 2026, l'avis joint au mail du propriétaire) : ouverte par le
// navigateur du serveur, jamais par une personne. Les pages de l'éditeur, en lecture ; quand les polices et les images
// sont là, la page le dit (window.__impressionPrete) et le serveur imprime en A4.

const attendreImages = () => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; }))));

export default function ImpressionAvis() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
    fetch(`/api/avis-impression/${encodeURIComponent(jeton)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || `réponse ${r.status}`); return j; })
      .then(setData)
      .catch((e) => { window.__impressionErreur = e?.message || "erreur"; });
  }, []);
  useEffect(() => {
    if (!data) return;
    let fini = false;
    (async () => {
      await document.fonts?.ready;
      await attendreImages();
      await new Promise((ok) => setTimeout(ok, 400));
      if (!fini) window.__impressionPrete = true;
    })();
    return () => { fini = true; };
  }, [data]);
  if (!data) return null;
  return (
    <div style={{ background: "white" }}>
      <PagesAvisImprimees avis={data.avis} estimationId={data.id} />
    </div>
  );
}

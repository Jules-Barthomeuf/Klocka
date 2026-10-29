import React, { useEffect, useState } from "react";
import { PageTeaser } from "@/components/mandataire/Teaser";

// La page d'impression du teaser (28 oct. 2026) : ouverte par le navigateur du serveur, jamais par une personne. Quand
// les polices et la photo sont là, la page le dit (window.__impressionPrete) et le serveur imprime en A4.

const CLASSES = { murs_loues: "Murs loués", murs_libres: "Murs libres", fonds: "Fonds de commerce", droit_au_bail: "Droit au bail", bureaux: "Bureaux", local_activite: "Local d'activité", entrepot: "Entrepôt logistique" };
const attendreImages = () => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; }))));

export default function ImpressionTeaser() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
    fetch(`/api/teaser-impression/${encodeURIComponent(jeton)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || `réponse ${r.status}`); return j; })
      .then(setData)
      .catch((e) => { window.__impressionErreur = e?.message || "erreur"; });
  }, []);
  useEffect(() => {
    if (!data) return undefined;
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
  return <PageTeaser t={data.teaser} signataire={data.signataire} classe={CLASSES[data.teaser.classe] || ""} />;
}

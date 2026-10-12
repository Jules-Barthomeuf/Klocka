import React, { useEffect, useState } from "react";
import Deck from "@/components/presentations/Deck";

// La page d'impression de la présentation bancaire (12 oct. 2026) : ouverte
// par le navigateur du serveur, jamais par une personne. Chaque diapositive
// visible sur une page de 1280 × 720, posée par le même Deck que l'éditeur,
// en lecture et figée. Quand les polices et les images sont là, la page le
// dit (window.__impressionPrete) et le serveur imprime.

const attendreImages = () => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; }))));

export default function ImpressionPresentation() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
    fetch(`/api/presentations-impression/${encodeURIComponent(jeton)}`)
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
  const visibles = data.diapos.filter((d) => !d.masquee);
  return (
    <div className="k-impression-presentation">
      <style>{"@page { size: 1280px 720px; margin: 0; } html, body { margin: 0; padding: 0; background: #000; width: 1280px; overflow: hidden; } #root, #root > * { width: 1280px !important; min-width: 0 !important; overflow: hidden; } .k-impression-page { width: 1280px; height: 720px; overflow: hidden; break-after: page; page-break-after: always; } .k-impression-page:last-child { break-after: auto; page-break-after: auto; }"}</style>
      {visibles.map((d) => (
        <div key={d.id} className="k-impression-page">
          <Deck diapos={data.diapos} courante={d.id} onCourante={() => {}} mode="lecture" relief={0} impression />
        </div>
      ))}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import FondHalo from "@/components/projet/FondHalo";

// La page publique d'un formulaire de lead magnet ou de webinaire (8 nov. 2026, Jules). La case de consentement n'est
// jamais cochée d'avance : c'est elle qui autorise à écrire ensuite. Le champ « site » est invisible : seul un robot le remplit.

const API = "/api/emailing/public/f";
const champ = "h-11 w-full rounded-[10px] border border-trait bg-surface px-3 text-[15px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";

export default function Formulaire() {
  const slug = new URLSearchParams(window.location.search).get("f") || "";
  const [f, setF] = useState(undefined);
  const [v, setV] = useState({ prenom: "", email: "", consentement: false, site: "" });
  const [erreur, setErreur] = useState("");
  const [merci, setMerci] = useState("");
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    fetch(`${API}/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).then(setF).catch(() => setF(null));
  }, [slug]);
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const r = await fetch(`${API}/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || "Une erreur est survenue. Réessayez."); return; }
      if (j.redirection) window.location.assign(j.redirection);
      else setMerci(j.message || "C'est fait, merci.");
    } catch {
      setErreur("Connexion impossible. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10 mx-auto max-w-[460px] px-4 pb-24 pt-14 max-md:pt-8">
        <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
        {f === undefined ? null : f === null ? <p className="m-0 text-center text-[15px] text-ardoise">Ce formulaire n'est plus ouvert.</p> : merci ? <p className="m-0 text-center text-[18px] text-encre">{merci}</p> : (
          <>
            <h1 className="m-0 text-center text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.2] tracking-[-0.02em] text-encre">{f.titre}</h1>
            {f.sous_titre && <p className="m-0 mt-3 text-center text-[15px] leading-[1.6] text-ardoise">{f.sous_titre}</p>}
            {f.webinaire && <p className="m-0 mt-3 text-center text-[15px] text-craie">{new Date(f.webinaire.date).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</p>}
            <form onSubmit={envoyer} className="mt-8 grid gap-3">
              <input aria-label="Prénom" placeholder="Prénom" autoComplete="given-name" className={champ} value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} />
              <input aria-label="Adresse mail" type="email" required placeholder="Adresse mail" autoComplete="email" className={champ} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0" value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })} />
              <label className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-craie"><input type="checkbox" className="mt-0.5" checked={v.consentement} onChange={(e) => setV({ ...v, consentement: e.target.checked })} /><span>{f.consentement}</span></label>
              {erreur && <p className="m-0 text-[13.5px] text-alerte">{erreur}</p>}
              <button type="submit" disabled={envoi} className="h-11 rounded-[10px] bg-menthe text-[15px] font-medium text-sur-menthe disabled:opacity-50">{f.bouton || "Envoyer"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

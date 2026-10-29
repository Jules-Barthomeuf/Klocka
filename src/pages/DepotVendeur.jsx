import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";
import LogoKP from "@/components/mandataire/LogoKP";
import Loader from "@/components/ui/Loader";

// L'espace de dépôt du vendeur (27 oct. 2026, Jules : « un lien pour accéder à une data room et permettant au vendeur de
// déposer tout ce qu'il a »). Public, ouvert par son jeton seul, sans compte : le bien, son conseiller, les pièces
// attendues et celles déjà reçues ; chaque fichier se range d'après son nom, ou dans la pièce choisie. Le vendeur ne
// voit jamais les points relevés sur les pièces (server/dossier-vente.js).

const API = "/api/depot-vendeur";

async function appeler(methode, chemin, corps) {
  const r = await fetch(`${API}/${chemin}`, { method: methode, body: corps });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Le serveur n'a pas répondu.");
  return j;
}

export default function DepotVendeur() {
  const jeton = new URLSearchParams(window.location.search).get("jeton") || "";
  const [v, setV] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const [message, setMessage] = useState(null);
  const tout = useRef(null);
  const lire = useCallback(() => appeler("GET", encodeURIComponent(jeton)).then(setV).catch((e) => setErreur(e.message)), [jeton]);
  useEffect(() => { lire(); }, [lire]);

  const deposer = async (fichiers, categorie = null) => {
    if (!fichiers.length) return;
    setEnvoi(categorie || "tout");
    setMessage(null);
    try {
      const corps = new FormData();
      fichiers.forEach((f) => corps.append("fichiers", f));
      if (categorie) corps.append("categorie", categorie);
      const r = await appeler("POST", encodeURIComponent(jeton), corps);
      setMessage(`Merci : ${r.rangees.length > 1 ? `${r.rangees.length} documents reçus` : "document reçu"}. Votre conseiller est prévenu.`);
      await lire();
    } catch (e) {
      setMessage(e.message);
    } finally { setEnvoi(null); }
  };

  if (erreur) return <Cadre><p className="m-0 text-[15px] leading-[1.6] text-craie">{erreur}</p></Cadre>;
  if (!v) return <Cadre><Loader taille="sm" titre="Vos documents" sousTitre="Un instant" /></Cadre>;
  const attendues = v.pieces.filter((p) => p.cle !== "autres");
  const reste = attendues.filter((p) => p.requise && !p.recue).length;
  return (
    <Cadre>
      <p className="m-0 text-[13px] text-ardoise">Les documents de votre bien</p>
      <h1 className="m-0 mt-1 text-[24px] font-normal leading-[1.25] tracking-[-0.01em] text-encre">{v.bien}</h1>
      <p className="m-0 mt-3 text-[14.5px] leading-[1.6] text-craie">
        Déposez ici les documents de la vente, en photo ou en PDF. Chaque document se range tout seul ; {v.conseiller.nom} est prévenu à chaque envoi.
        {reste ? ` Il manque encore ${reste} document${reste > 1 ? "s" : ""} indispensable${reste > 1 ? "s" : ""}.` : " Tous les documents indispensables sont reçus : merci."}
      </p>
      <input ref={tout} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; deposer(l); }} />
      <button type="button" onClick={() => tout.current?.click()} disabled={!!envoi}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[15px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
        {envoi === "tout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Déposer des documents
      </button>
      {message && <p className="m-0 mt-3 text-[14px] text-menthe" role="status">{message}</p>}
      <ul className="m-0 mt-6 list-none overflow-hidden rounded-[14px] border border-trait p-0">
        {attendues.map((p) => <Ligne key={p.cle} p={p} occupe={envoi === p.cle} onFichiers={(l) => deposer(l, p.cle)} />)}
      </ul>
      {v.pieces.find((p) => p.cle === "autres")?.fichiers.length > 0 && (
        <p className="m-0 mt-3 text-[13px] text-ardoise">Autres documents reçus : {v.pieces.find((p) => p.cle === "autres").fichiers.join(", ")}</p>
      )}
      <p className="m-0 mt-6 text-[13px] leading-[1.6] text-ardoise">
        Une question ? {v.conseiller.nom}{v.conseiller.telephone ? `, ${v.conseiller.telephone}` : ""}{v.conseiller.email ? `, ${v.conseiller.email}` : ""}.
      </p>
    </Cadre>
  );
}

function Ligne({ p, occupe, onFichiers }) {
  const ref = useRef(null);
  return (
    <li className="flex items-center gap-3 border-b border-trait px-4 py-3 last:border-b-0">
      <span className={`grid h-4 w-4 flex-none place-items-center rounded-full ${p.recue ? "bg-menthe" : "border border-bord-vif"}`}>{p.recue && <Check className="h-2.5 w-2.5 text-sur-menthe" />}</span>
      <span className="min-w-0 flex-1">
        <span className="text-[14.5px] text-encre">{p.mot}</span>
        {!p.requise && <span className="text-[13px] text-ardoise"> · si vous l'avez</span>}
        {p.fichiers.length > 0 && <span className="block truncate text-[12.5px] text-ardoise">{p.fichiers.join(", ")}</span>}
      </span>
      <input ref={ref} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; onFichiers(l); }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={occupe} className="flex-none text-[13.5px] text-menthe hover:underline disabled:opacity-60" style={{ background: "transparent" }}>
        {occupe ? <Loader2 className="h-4 w-4 animate-spin" /> : p.recue ? "Ajouter" : "Déposer"}
      </button>
    </li>
  );
}

function Cadre({ children }) {
  return (
    <div className="min-h-[100dvh] bg-fond px-4 pb-16 pt-8">
      <div className="mx-auto w-full max-w-[640px]">
        <LogoKP fond="theme" className="text-[26px]" />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

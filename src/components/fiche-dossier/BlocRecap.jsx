import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Le récap de la semaine dans le chat (27 nov. 2026, Jules : « il structure, il dit c'est bon pour vous ? ; ensuite on
// choisit juste à qui on veut l'envoyer, plusieurs personnes en même temps ; la personne voit son récap dès qu'elle
// ouvre la page, le lundi de la semaine d'après »). La carte montre le récap mis en forme ; « C'est bon » ouvre le choix
// des personnes ; une correction se dit dans la saisie, le récap se refait. Rien ne part sans « Envoyer ».

const lundiLisible = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "lundi");
const prenoms = (l) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`);

/** Le récap lui-même : titre, puis ses parties et leurs points. Aussi lu par la fenêtre du lundi. */
export function TexteRecap({ recap }) {
  return (
    <div>
      <p className="m-0 text-[16px] text-encre">{recap.titre}</p>
      {(recap.parties || []).map((p) => (
        <div key={p.titre} className="mt-4">
          <p className="m-0 text-[12.5px] uppercase tracking-[.12em] text-ardoise">{p.titre}</p>
          <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
            {p.points.map((x) => (
              <li key={x} className="flex gap-2.5 text-[14.5px] leading-[1.55] text-craie">
                <span aria-hidden className="mt-[9px] h-1 w-1 flex-none rounded-full bg-ardoise" />
                <span className="min-w-0">{x}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * `etape` : « relire » (C'est bon ?), « destinataires » (à qui), « envoye ».
 * `actif` : seule la dernière carte du fil se manipule ; les précédentes restent lisibles.
 */
export default function BlocRecap({ donnees, actif = true, onEtape, onEnvoye }) {
  const { recap, etape = "relire", envoi = null } = donnees || {};
  const personnes = useQuery({ queryKey: ["recap-destinataires"], queryFn: () => base44.request("GET", "/api/recap-semaine/destinataires"), enabled: etape === "destinataires", staleTime: 300_000 });
  const [choisis, setChoisis] = useState(() => new Set());
  const [envoi_, setEnvoi] = useState({ enCours: false, erreur: null });
  if (!recap) return null;
  const basculer = (email) => setChoisis((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const envoyer = async () => {
    setEnvoi({ enCours: true, erreur: null });
    try {
      const r = await base44.request("POST", "/api/recap-semaine", { body: { recap, texte: donnees.texte || "", destinataires: [...choisis] } });
      setEnvoi({ enCours: false, erreur: null });
      onEnvoye?.(r);
    } catch (e) {
      setEnvoi({ enCours: false, erreur: e?.message || "Le récap n'est pas parti." });
    }
  };
  const liste = personnes.data?.personnes || [];
  return (
    <div className="k-verre-plein rounded-[16px] px-5 py-4">
      <TexteRecap recap={recap} />
      {actif && etape === "relire" && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-trait pt-4">
          <p className="m-0 mr-auto text-[13.5px] text-craie">C'est bon pour vous ? Sinon, dites ce qu'il faut changer.</p>
          <button type="button" onClick={() => onEtape?.("destinataires")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">
            <Check className="h-4 w-4" />C'est bon
          </button>
        </div>
      )}
      {actif && etape === "destinataires" && (
        <div className="mt-5 border-t border-trait pt-4">
          <p className="m-0 text-[13.5px] text-craie">À qui l'envoyer ? Ils le verront en ouvrant Klocka, lundi prochain.</p>
          {personnes.isLoading ? <p className="m-0 mt-3 text-[13px] text-brume">L'équipe arrive…</p> : (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Destinataires">
              {liste.map((p) => {
                const oui = choisis.has(p.email);
                return (
                  <button key={p.email} type="button" onClick={() => basculer(p.email)} aria-pressed={oui}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition-colors ${oui ? "border-menthe/60 text-menthe" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
                    style={{ background: oui ? "rgb(var(--k-menthe-rgb) / 0.1)" : "transparent" }}>
                    {oui && <Check className="h-3.5 w-3.5" />}{p.prenom}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {envoi_.erreur && <p className="m-0 text-[13px] text-alerte">{envoi_.erreur}</p>}
            <button type="button" onClick={() => onEtape?.("relire")} className="ml-auto text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Revenir au récap</button>
            <button type="button" onClick={envoyer} disabled={!choisis.size || envoi_.enCours}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              {envoi_.enCours && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer{choisis.size ? ` à ${choisis.size}` : ""}
            </button>
          </div>
        </div>
      )}
      {etape === "envoye" && envoi && (
        <p className="m-0 mt-5 flex items-center gap-2 border-t border-trait pt-4 text-[13.5px] text-craie">
          <Check className="h-4 w-4 flex-none text-menthe" />
          Envoyé à {prenoms(envoi.destinataires.map((d) => d.prenom))} : {envoi.destinataires.length > 1 ? "ils le verront" : "il le verra"} en ouvrant Klocka, {lundiLisible(envoi.visible_des)}.
        </p>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";

// Qui voit quoi dans Twenty CRM (1er nov. 2026, Jules). Les rôles en colonnes, les tableaux de la barre de gauche de
// Twenty en lignes, dossier par dossier ; chaque case dit ce que le rôle en fait, et se change d'ici. Une ligne dépliée
// montre les champs du tableau : un champ coché est caché à ce rôle (il ne le lit ni ne l'écrit). Admin et Member se
// lisent seulement ; donner un rôle à une personne se fait dans Twenty (la clé API n'en a pas le droit).

const API = "/api/admin/crm/acces";
const NIVEAUX = [["plein", "Plein accès"], ["lecture", "Lecture"], ["ferme", "Fermé"]];
const TEINTE = { plein: "text-encre", lecture: "text-craie", ferme: "text-brume" };

function Niveau({ valeur, reglable, occupe, onChoisir }) {
  if (!reglable) return <span className={`text-[13px] ${TEINTE[valeur]}`}>{NIVEAUX.find(([k]) => k === valeur)?.[1]}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <select value={valeur} disabled={occupe} onChange={(e) => onChoisir(e.target.value)} aria-label="Accès"
        className={`h-8 rounded-[9px] border border-bord-doux bg-fond px-2 text-[13px] outline-none focus:border-bord-vif ${TEINTE[valeur]}`}>
        {NIVEAUX.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
      </select>
      {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin text-ardoise" />}
    </span>
  );
}

function LigneTableau({ o, roles, onNiveau, onChamp, occupe }) {
  const [ouvert, setOuvert] = useState(false);
  const caches = o.champs.filter((c) => roles.some((r) => c.caches[r.id])).length;
  return (
    <>
      <tr className="border-b border-trait last:border-b-0">
        <td className="py-2.5 pl-4 pr-3">
          <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className="inline-flex items-center gap-2 text-left text-[14px] text-encre" style={{ background: "transparent" }}>
            <ChevronDown className={`h-3.5 w-3.5 flex-none text-ardoise transition-transform ${ouvert ? "" : "-rotate-90"}`} />
            {o.nom}
            {caches > 0 && <span className="text-[12px] text-ardoise">{caches} champ{caches > 1 ? "s" : ""} caché{caches > 1 ? "s" : ""}</span>}
          </button>
        </td>
        {roles.map((r) => (
          <td key={r.id} className="px-3 py-2.5">
            <Niveau valeur={o.acces[r.id]} reglable={r.reglable} occupe={occupe === `${r.id}:${o.id}`} onChoisir={(n) => onNiveau(r, o, n)} />
          </td>
        ))}
      </tr>
      {ouvert && o.champs.map((c) => (
        <tr key={c.id} className="border-b border-trait bg-surface/40 last:border-b-0">
          <td className="py-1.5 pl-11 pr-3 text-[13px] text-craie">{c.nom}</td>
          {roles.map((r) => (
            <td key={r.id} className="px-3 py-1.5">
              {r.reglable ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ardoise">
                  <input type="checkbox" checked={!!c.caches[r.id]} disabled={occupe === `${r.id}:${c.id}`} onChange={(e) => onChamp(r, o, c, e.target.checked)} className="h-3.5 w-3.5 accent-[rgb(var(--k-menthe-rgb))]" />
                  Caché
                </label>
              ) : <span className="text-[12.5px] text-brume">{c.caches[r.id] ? "Caché" : "Visible"}</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function AdminAccesCrm() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["crm-acces"], queryFn: () => base44.request("GET", API) });
  const [occupe, setOccupe] = useState(null);
  const changer = useMutation({
    mutationFn: ({ cle, chemin, corps }) => { setOccupe(cle); return base44.request("POST", `${API}/${chemin}`, { body: corps }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-acces"] }),
    onError: (e) => toast.error(e?.message || "Twenty a refusé le changement"),
    onSettled: () => setOccupe(null),
  });
  const onNiveau = (r, o, niveau) => changer.mutate({ cle: `${r.id}:${o.id}`, chemin: "niveau", corps: { role_id: r.id, objet_id: o.id, niveau } });
  const onChamp = (r, o, c, cache) => changer.mutate({ cle: `${r.id}:${c.id}`, chemin: "champ", corps: { role_id: r.id, objet_id: o.id, champ_id: c.id, cache } });

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden px-5 py-6 text-encre md:px-10 md:py-9">
      <div className="mx-auto max-w-[1200px]">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Accès CRM</h1>
          <p className="m-0 max-w-[64ch] text-[14px] text-ardoise">Qui voit quoi dans Twenty CRM. Chaque rôle en colonne, chaque tableau de la barre de gauche en ligne ; dépliez un tableau pour cacher un champ à un rôle. Un changement s&apos;applique tout de suite dans Twenty.</p>
        </header>

        {isLoading && <div className="mt-10"><Chargement /></div>}
        {error && <p className="mt-10 text-center text-[14px] text-brume">{error.message}</p>}
        {data && (
          <>
            <section className="mt-8 k-verre p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">QUI A QUEL RÔLE</p>
                <a href={data.reglages_membres} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-menthe hover:underline">
                  Donner un rôle, dans Twenty <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                {data.roles.map((r) => (
                  <div key={r.id} className="min-w-0">
                    <p className="m-0 text-[14px] text-encre">{r.nom}</p>
                    <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">{r.membres.length ? r.membres.map((m) => m.nom || m.email).join(", ") : "Personne"}</p>
                  </div>
                ))}
              </div>
              {data.roles.some((r) => r.nom === "Member" && r.membres.length) && (
                <p className="m-0 mt-4 text-[13px] text-ambre">« Member » voit tout le CRM, Klocka et K Partners compris. Donnez à ces personnes « Équipe Klocka » (ou « Admin ») dans Twenty.</p>
              )}
            </section>

            <div className="mt-6 overflow-x-auto k-verre">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-trait text-[12px] tracking-[0.08em] text-brume">
                    <th className="py-3 pl-4 pr-3 font-normal">TABLEAU</th>
                    {data.roles.map((r) => <th key={r.id} className="px-3 py-3 font-normal">{r.nom.toUpperCase()}{!r.reglable && <span className="block text-[11px] normal-case tracking-normal text-brume">se règle dans Twenty</span>}</th>)}
                  </tr>
                </thead>
                {data.dossiers.map((d) => (
                  <tbody key={d.id || "hors"}>
                    <tr className="border-b border-trait bg-surface/60"><td colSpan={data.roles.length + 1} className="py-2 pl-4 text-[12px] tracking-[0.12em] text-ardoise">{d.nom.toUpperCase()}</td></tr>
                    {d.objets.map((o) => <LigneTableau key={`${d.id}-${o.id}`} o={o} roles={data.roles} onNiveau={onNiveau} onChamp={onChamp} occupe={occupe} />)}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="m-0 mt-3 text-[12.5px] text-brume">Un tableau rangé dans deux dossiers est le même tableau : le changer à un endroit le change partout. Tasks et Notes sont communs à tous les rôles qui les lisent.</p>
          </>
        )}
      </div>
    </div>
  );
}

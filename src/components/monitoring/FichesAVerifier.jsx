import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { Cadre } from "@/components/monitoring/GraphesAppels";

// Vérifier le compte des fiches (22-23 nov. 2026, Jules : « quand quelqu'un envoie, la fiche rentre dans la Mémoire et je
// vais pouvoir dire : ce mail c'était deux fiches, ça corrige ; on pourra mesurer l'amélioration au fil du temps, et
// déjà les chiffres sont vrais »). Chaque envoi de la période attend un geste : « Juste », un nombre corrigé, ou « Pas
// une fiche ». Ceux dont le compte est douteux passent devant (le document annonce un autre nombre, pas encore lu, une
// liste). En haut, la justesse du compte automatique, semaine par semaine. En bas, des fiches reçues ailleurs, ajoutées
// à la main. Le calcul : server/deal/fiches-stats.js et server/deal/justesse-compte.js.

const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
const champ = "h-8 rounded-[8px] border border-bord bg-transparent px-2 text-[12.5px] text-encre outline-none focus:border-bord-vif";
const bouton = "h-8 shrink-0 rounded-full border border-bord-doux px-3 text-[12.5px] transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50";
const nFiches = (n) => `${n} fiche${n > 1 ? "s" : ""}`;
const MAX = 8;

/** La justesse du compte automatique : la part des envois vérifiés que la machine avait bien comptés, et ses semaines. */
function Justesse({ j }) {
  if (!j?.verifies) return <p className="m-0 mb-3 text-[12.5px] text-brume">Aucun envoi vérifié encore : la justesse du compte automatique se mesurera au fil des gestes.</p>;
  const semaines = j.semaines.slice(-6);
  return (
    <div className="mb-3 flex flex-col gap-2 border-b border-bord pb-3">
      <p className="m-0 text-[12.5px] leading-[1.45] text-ardoise">
        <span className="text-[18px] tabular-nums text-encre">{j.taux}{" "}%</span> des envois vérifiés étaient bien comptés ({j.justes} sur {j.verifies}) ; la machine avait vu {nFiches(j.fiches_auto)} pour {j.fiches_vraies} vraies.
      </p>
      {semaines.length > 1 && (
        <div className="flex gap-1.5" aria-label="Justesse par semaine">
          {semaines.map((s) => (
            <div key={s.semaine} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`Semaine du ${jourCourt(`${s.semaine}T12:00:00Z`)} : ${s.justes} sur ${s.verifies}`}>
              <span className="text-[12.5px] tabular-nums text-encre">{s.taux}{" "}%</span>
              <span className="text-[12.5px] tabular-nums text-brume">{jourCourt(`${s.semaine}T12:00:00Z`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FichesAVerifier({ fiches = [], justesse = null, equipe = [], moi = "" }) {
  const queryClient = useQueryClient();
  const [toutes, setToutes] = useState(false);
  const [tout, setTout] = useState(false);
  const corriger = useMutation({
    mutationFn: ({ id, ...corps }) => base44.request("POST", `/api/monitoring/fiches-analystes/${encodeURIComponent(id)}`, { body: corps }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fiches-analystes"] }),
    onError: (e) => toast.error(e?.message || "Correction refusée"),
  });
  // Des fiches reçues ailleurs (au téléphone, en main propre, dans un groupe) : ajoutées à la main (23 nov. 2026).
  const [ajout, setAjout] = useState({ nombre: 1, analyste: moi, titre: "", le: new Date().toISOString().slice(0, 10) });
  const ajouter = useMutation({
    mutationFn: () => base44.request("POST", "/api/monitoring/fiches-manuelles", { body: ajout }),
    onSuccess: () => { setAjout((a) => ({ ...a, nombre: 1, titre: "" })); toast.success("Fiches ajoutées"); queryClient.invalidateQueries({ queryKey: ["fiches-analystes"] }); },
    onError: (e) => toast.error(e?.message || "Ajout refusé"),
  });

  // À vérifier : pas encore de geste ; les douteuses d'abord, puis les plus anciennes.
  const aVerifier = fiches.filter((f) => !f.verifiee)
    .sort((a, b) => Number(!(a.a_verifier || a.liste)) - Number(!(b.a_verifier || b.liste)) || String(a.le).localeCompare(String(b.le)));
  const lignes = tout ? fiches : aVerifier;
  const vues = toutes ? lignes : lignes.slice(0, MAX);
  const total = fiches.reduce((n, f) => n + (f.ecartee ? 0 : f.biens), 0);

  return (
    <Cadre titre="Vérifier le compte"
      aide={tout ? `${nFiches(total)} en ${fiches.length} envoi${fiches.length > 1 ? "s" : ""} sur la période.` : aVerifier.length ? `${aVerifier.length} envoi${aVerifier.length > 1 ? "s" : ""} à vérifier : « Juste », ou le vrai nombre de fiches.` : "Tous les envois de la période sont vérifiés."}
      droite={fiches.length ? <button type="button" onClick={() => { setTout(!tout); setToutes(false); }} className="p-0 text-[12.5px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>{tout ? "À vérifier" : "Tous les envois"}</button> : null}>
      <Justesse j={justesse} />
      <ul className="m-0 flex list-none flex-col p-0">
        {vues.map((f) => {
          const n = f.liste || f.biens;
          const note = f.liste ? `Une liste de ${f.liste} biens, comptée à part : elle ne fait pas le record.` : f.a_verifier || null;
          return (
            <li key={f.id} className={`flex flex-col gap-1.5 border-b border-trait py-2.5 last:border-b-0 ${f.ecartee ? "opacity-50" : ""}`}>
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[13.5px] text-encre" title={f.titre}>{f.titre}</span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-brume">{jourCourt(f.le)}</span>
              </div>
              <p className="m-0 text-[12.5px] leading-[1.45] text-ardoise">
                {[f.prenom, f.agent].filter(Boolean).join(" · ") || "Sans analyste"}
                {f.verifiee ? <span className="text-brume"> · vérifiée{f.auto != null && f.auto !== f.biens ? `, la machine disait ${f.auto}` : ""}</span> : null}
              </p>
              {note && !f.verifiee && <p className="m-0 text-[12.5px] leading-[1.45] text-craie">{note}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Nombre de fiches" value={n} disabled={f.ecartee || corriger.isPending} onChange={(e) => corriger.mutate({ id: f.id, biens: Number(e.target.value) })} className={champ}>
                  {Array.from({ length: Math.max(11, n + 1) }, (_, i) => <option key={i} value={i}>{nFiches(i)}</option>)}
                </select>
                {!f.verifiee && !f.ecartee && (
                  <button type="button" disabled={corriger.isPending} onClick={() => corriger.mutate({ id: f.id, valide: true })} className={`${bouton} text-encre`} style={{ background: "transparent" }}>Juste</button>
                )}
                <button type="button" disabled={corriger.isPending} onClick={() => corriger.mutate({ id: f.id, pas_fiche: !f.ecartee })} className={`${bouton} text-craie`} style={{ background: "transparent" }}>
                  {f.ecartee ? "Remettre" : "Pas une fiche"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {lignes.length > MAX && (
        <button type="button" onClick={() => setToutes(!toutes)} className="mt-2 p-0 text-[13.5px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>
          {toutes ? "Voir moins" : `Voir les ${lignes.length}`}
        </button>
      )}
      <form className="mt-3 flex flex-col gap-2 border-t border-bord pt-3" onSubmit={(e) => { e.preventDefault(); ajouter.mutate(); }}>
        <p className="m-0 text-[12.5px] text-ardoise">Des fiches reçues ailleurs, dans aucun envoi :</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Nombre de fiches ajoutées" value={ajout.nombre} onChange={(e) => setAjout({ ...ajout, nombre: Number(e.target.value) })} className={champ}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((i) => <option key={i} value={i}>{nFiches(i)}</option>)}
          </select>
          <select aria-label="Reviennent à" value={ajout.analyste} onChange={(e) => setAjout({ ...ajout, analyste: e.target.value })} className={champ}>
            <option value="">Personne</option>
            {equipe.map((a) => <option key={a.email} value={a.email}>{a.prenom}</option>)}
          </select>
          <input type="date" aria-label="Reçues le" value={ajout.le} onChange={(e) => setAjout({ ...ajout, le: e.target.value })} className={champ} />
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="D'où elles viennent" placeholder="D'où elles viennent (facultatif)" value={ajout.titre} onChange={(e) => setAjout({ ...ajout, titre: e.target.value })} className={`${champ} min-w-0 flex-1`} />
          <button type="submit" disabled={ajouter.isPending} className={`${bouton} text-encre`} style={{ background: "transparent" }}>Ajouter</button>
        </div>
      </form>
    </Cadre>
  );
}

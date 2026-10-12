import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { useDictee } from "@/lib/dictee";
import { JL } from "@/design/jetons";
import { dateCourte, req } from "./commun";

// Off-market, mode Simple : le score « Zone » et le jugement d'un point
// (spec de Jules du 11 oct. 2026), pour l'équipe Klocka seulement. Un clic
// (Intéressant, Pas intéressant, À revoir), puis pourquoi, librement, au
// clavier ou à la voix : pas de cases à cocher (Jules, 11 oct.). L'IA en tire
// les raisons côté serveur.

const VERDICTS = [["interessant", "Intéressant"], ["pas_interessant", "Pas intéressant"]];
const MOTS = { interessant: "intéressant", pas_interessant: "pas intéressant", a_revoir: "à revoir" };

/** Les scores Zone d'une ville : { points: { id → { score_zone, raisons_zone, version_zone, jugement_zone } }, seuil_faible, modele }. */
export function useZone(villeId, actif) {
  const q = useQuery({ queryKey: ["off-market", "simple", "zone", villeId], queryFn: () => req("GET", `/simple/villes/${villeId}/zone`), enabled: !!villeId && !!actif, staleTime: 60_000 });
  return { actif: !!actif && !!q.data, points: q.data?.points || {}, seuil: q.data?.seuil_faible ?? 40, modele: q.data?.modele || null };
}

/** Pure : le dessin d'un point : la couleur reste celle du propriétaire, le score Zone règle l'opacité, un point jugé a un contour. */
export function dessinAvecZone(dessin, z) {
  if (!z) return dessin;
  const score = z.score_zone;
  const opacite = score == null ? dessin.opacite : Math.max(0.18, Math.min(1, 0.18 + (score / 100) * 0.82)) * (dessin.opacite >= 0.9 ? 1 : 0.7);
  const contour = z.jugement_zone?.verdict === "interessant" ? JL.menthe : z.jugement_zone?.verdict === "pas_interessant" ? JL.ardoise : null;
  return { ...dessin, opacite, ...(contour ? { contour } : {}) };
}

/** Le bloc du jugement dans la fiche d'un point. */
export function BlocZone({ id, zone, onJuge, rangAJuger = null, onPasser = null }) {
  const qc = useQueryClient();
  const z = zone?.points?.[id] || null;
  const [verdict, setVerdict] = useState(null);
  const [texte, setTexte] = useState("");
  const base = useRef("");
  const { supporte, ecoute, demarrer, arreter, finalisation } = useDictee({ onTexte: (t) => setTexte([base.current, t].filter(Boolean).join(base.current ? " " : "")) });
  useEffect(() => { setVerdict(null); setTexte(""); }, [id]);
  const dicter = () => { if (ecoute) { arreter(); return; } base.current = texte.trim(); demarrer(); };
  const juger = useMutation({
    mutationFn: () => req("POST", `/simple/commerces/${id}/zone/jugement`, { verdict, commentaire: texte.trim(), score_affiche: z?.score_zone ?? null, model_version: z?.version_zone ?? null }),
    onSuccess: () => { toast.success(`Jugé ${MOTS[verdict]}`); qc.invalidateQueries({ queryKey: ["off-market", "simple", "zone"] }); onJuge?.(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const noter = useMutation({
    mutationFn: () => req("POST", `/simple/commerces/${id}/zone/rue`, {}),
    onSuccess: (r) => { toast.success(`Rue notée ${r.revue_rue.note}/10 : ${r.revue_rue.pourquoi}`); qc.invalidateQueries({ queryKey: ["off-market", "simple", "zone"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  if (!zone?.actif) return null;
  const pret = verdict && !ecoute && !finalisation && !juger.isPending && (verdict === "a_revoir" || texte.trim().length >= 3);
  const j = z?.jugement_zone;
  return (
    <div className="mt-3 rounded-[12px] border border-bord-doux bg-surface/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[14px] text-encre">Zone : {z?.score_zone != null ? <span className="tabular-nums">{z.score_zone}/100</span> : <span className="text-brume">non calculée</span>}</span>
        <span className="text-[11.5px] text-brume">{rangAJuger ? `À juger · ${rangAJuger}` : zone.modele ? `version ${zone.modele.version}${zone.modele.type === "regles" ? " (règles)" : ""}` : null}</span>
      </div>
      {z?.raisons_zone?.length > 0 && (
        <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-craie">
          {z.raisons_zone.map((r) => <li key={r.cle}><span className={r.sens === "plus" ? "text-menthe" : "text-ardoise"}>{r.sens === "plus" ? "+" : "−"}</span> {r.texte}</li>)}
        </ul>
      )}
      {j && <p className="m-0 mt-2 text-[12.5px] text-ardoise">Jugé {MOTS[j.verdict]} le {dateCourte(j.le)}{j.par ? ` par ${j.par.split("@")[0]}` : ""}{j.commentaire ? ` : « ${j.commentaire} »` : ""}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {VERDICTS.map(([v, mot]) => (
          <button key={v} type="button" onClick={() => setVerdict(verdict === v ? null : v)} aria-pressed={verdict === v}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-[13.5px] transition-colors ${verdict === v ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-craie hover:border-menthe hover:text-encre"}`}
            style={verdict === v ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
        <button type="button" onClick={() => setVerdict(verdict === "a_revoir" ? null : "a_revoir")} aria-pressed={verdict === "a_revoir"}
          className={`p-0 text-[12.5px] underline-offset-4 hover:underline ${verdict === "a_revoir" ? "text-encre underline" : "text-brume hover:text-encre"}`} style={{ background: "transparent" }}>À revoir</button>
        <span className="flex-1" />
        {onPasser && <button type="button" onClick={onPasser} className="p-0 text-[12.5px] text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Passer</button>}
        <button type="button" onClick={() => noter.mutate()} disabled={noter.isPending} title="L'IA regarde la rue sur Street View et la note de 0 à 10, d'après vos jugements" className="inline-flex items-center gap-1.5 p-0 text-[12.5px] text-brume underline-offset-4 hover:text-encre hover:underline disabled:opacity-50" style={{ background: "transparent" }}>{noter.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Noter la rue</button>
      </div>
      {verdict && (
        <div className={`mt-3 flex flex-col rounded-[12px] border bg-transparent transition-colors ${ecoute ? "border-menthe/60" : "border-bord-doux focus-within:border-bord-vif"}`}>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} autoFocus aria-label="Pourquoi"
            placeholder={verdict === "a_revoir" ? "Une note, si besoin" : "Pourquoi ? Dites-le librement : « bien, mais mal placé, rien d'autre dans la rue »"}
            className="resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume" />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            {supporte ? (
              <button type="button" onClick={dicter} aria-label={ecoute ? "Arrêter la dictée" : "Dicter"} title={ecoute ? "Arrêter la dictée" : "Dicter le pourquoi"}
                className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${ecoute ? "bg-menthe text-sur-menthe" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={ecoute ? undefined : { background: "transparent" }}>
                {ecoute ? <Square className="h-3 w-3" fill="currentColor" /> : finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </button>
            ) : <span />}
            <button type="button" disabled={!pret} onClick={() => juger.mutate()}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe transition-opacity hover:bg-menthe-survol disabled:opacity-40">
              {juger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** La file « À juger » : les points où le score hésite, un peu de points faibles au hasard, puis le reste. */
export function useFileAJuger(villeId) {
  const [file, setFile] = useState(null);
  const [rang, setRang] = useState(0);
  useEffect(() => { setFile(null); setRang(0); }, [villeId]);
  const demarrer = useMutation({
    mutationFn: () => req("GET", `/simple/villes/${villeId}/zone/a-juger`),
    onSuccess: (r) => { setFile(r.points || []); setRang(0); if (!r.points?.length) toast.info("Tous les points de la ville sont jugés"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const courant = file?.[rang] || null;
  return {
    enCours: !!file?.length && rang < file.length,
    courant,
    libelle: file?.length ? `${Math.min(rang + 1, file.length)} sur ${file.length}` : null,
    demarrer: () => demarrer.mutate(),
    charge: demarrer.isPending,
    suivant: () => setRang((r) => r + 1),
    arreter: () => { setFile(null); setRang(0); },
  };
}

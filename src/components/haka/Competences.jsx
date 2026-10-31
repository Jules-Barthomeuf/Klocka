import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import FicheCompetence from "@/components/haka/FicheCompetence";
import { jour, NOMS_DECLENCHEURS, statutDe } from "@/components/haka/competences-outils";

// Paramètres › Compétences (17 oct. 2026, Jules seul). Deux niveaux, d'après la spec du jour : la
// liste (statut, version, déclencheurs, usage, rejets et coût sur 30 jours), puis la fiche d'une
// compétence en quatre onglets (Définition, Tests, Exécutions, Historique).

const euros = (x) => `${Number(x || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const FILTRES = [["actives", "Actives"], ["desactivees", "Désactivées"], ["brouillons", "Brouillons"], ["toutes", "Toutes"]];

const TEINTE = { active: "bg-menthe", desactivee: "bg-bord-vif", brouillon: "bg-ambre" };

function NouvelleCompetence({ onCree, onFermer }) {
  const [nom, setNom] = useState("");
  const [texte, setTexte] = useState("");
  const qc = useQueryClient();
  const fin = (r) => { qc.invalidateQueries({ queryKey: ["haka-competences"] }); if (r?.avertissement) toast.error(r.avertissement); else toast.success("Brouillon créé : rien n'est publié"); onCree(r.competence.cle); };
  const vide = useMutation({ mutationFn: () => base44.request("POST", "/api/haka/competences", { body: { nom, resume: texte.trim().slice(0, 300) } }), onSuccess: fin, onError: (e) => toast.error(e?.message || "Impossible") });
  const avecHaka = useMutation({ mutationFn: () => base44.request("POST", "/api/haka/competences/depuis-exemple", { body: { nom, texte } }), onSuccess: fin, onError: (e) => toast.error(e?.message || "Impossible") });
  const occupe = vide.isPending || avecHaka.isPending;
  return (
    <div className="rounded-[16px] border border-trait bg-rail p-5">
      <p className="m-0 text-[15px] text-encre">Nouvelle compétence</p>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Donnez-lui un nom. Puis décrivez votre méthode, ou collez un livrable de référence (une ancienne fiche deal bien faite) : Assistant KPartners propose un brouillon complet, en-tête et recette. Rien n'est publié.</p>
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom, par exemple « Refus courtois »" className="mt-4 h-10 w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} placeholder="Votre méthode en quelques phrases, ou un exemple collé ici" className="mt-3 w-full resize-y rounded-[10px] border border-trait bg-surface px-3 py-2.5 text-[14px] leading-[1.55] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!nom.trim() || !texte.trim() || occupe} onClick={() => avecHaka.mutate()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
          {avecHaka.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Écrire avec l'Assistant KPartners
        </button>
        <button type="button" disabled={!nom.trim() || occupe} onClick={() => vide.mutate()} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Brouillon vide</button>
        <button type="button" onClick={onFermer} className="h-9 rounded-full px-3 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
      </div>
    </div>
  );
}

export default function Competences() {
  const q = useQuery({ queryKey: ["haka-competences", "toutes"], queryFn: () => base44.request("GET", "/api/haka/competences"), retry: false });
  const [cle, setCle] = useState(null);
  const [filtre, setFiltre] = useState("actives");
  const [nouvelle, setNouvelle] = useState(false);
  const liste = q.data?.competences || [];
  const ouverte = liste.find((c) => c.cle === cle) || null;
  if (q.isLoading) return <Chargement taille="grand" />;
  if (q.isError) return <p className="m-0 py-8 text-[14px] text-ardoise">Les compétences ne sont pas lisibles ici : {q.error?.message || "erreur"}.</p>;
  if (ouverte) return <FicheCompetence key={ouverte.cle} c={ouverte} donnees={q.data} onRetour={() => setCle(null)} />;

  const vues = liste.filter((c) => {
    const s = statutDe(c).cle;
    return filtre === "toutes" || (filtre === "actives" && s === "active") || (filtre === "desactivees" && s === "desactivee") || (filtre === "brouillons" && (s === "brouillon" || c.brouillon));
  });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTRES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setFiltre(k)} aria-pressed={filtre === k}
              className={`h-8 rounded-full border px-3.5 text-[13px] transition-colors ${filtre === k ? "border-menthe/60 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`} style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <button type="button" onClick={() => setNouvelle((n) => !n)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol"><Plus className="h-3.5 w-3.5" />Nouvelle compétence</button>
      </div>
      {nouvelle && <NouvelleCompetence onCree={(k) => { setNouvelle(false); setFiltre("toutes"); setCle(k); }} onFermer={() => setNouvelle(false)} />}
      {!vues.length ? (
        <p className="m-0 py-10 text-center text-[14px] text-brume">Aucune compétence dans cette vue.</p>
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-trait">
          <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-trait text-[11px] uppercase tracking-[.14em] text-brume">
                {["Compétence", "Statut", "Version", "Déclencheurs", "Usage 30 j", "Rejets 30 j", "Coût moyen"].map((t) => <th key={t} className="px-4 py-3 font-normal">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {vues.map((c) => {
                const st = statutDe(c);
                return (
                  <tr key={c.cle} onClick={() => setCle(c.cle)} className="cursor-pointer border-b border-trait transition-colors last:border-b-0 hover:bg-encre/[0.03]">
                    <td className="max-w-[340px] px-4 py-3.5"><p className="m-0 text-[14.5px] text-encre">{c.nom}</p><p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{c.resume || "Pas de description"}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-craie"><span className={`mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle ${TEINTE[st.cle]}`} />{st.mot}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-craie">{Number(c.version) ? <>v{c.version}<span className="text-brume"> · {jour(c.publiee_le)}</span></> : "—"}</td>
                    <td className="px-4 py-3.5"><span className="flex flex-wrap gap-1">{[...new Set((c.declencheurs || []).map((d) => NOMS_DECLENCHEURS[d] || d))].map((d) => <span key={d} className="rounded-full border border-trait px-2 py-0.5 text-[11.5px] text-ardoise">{d}</span>)}</span></td>
                    <td className="px-4 py-3.5 tabular-nums text-craie">{c.stats?.executions || 0}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-craie">{c.stats?.rejets || 0}{c.stats?.rejets ? <span className="text-brume"> · {c.stats.part_rejets} %</span> : null}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-craie">{c.stats?.executions ? euros(c.stats.cout_moyen_eur) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

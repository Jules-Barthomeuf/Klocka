import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Cases } from "@/components/mandataire/elements";
import Chargement from "@/components/ui/Chargement";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Bulle, useCouleurs } from "@/components/monitoring/GraphesAppels";

// Le Tableau de bord de la Prospection (15 nov. 2026, Jules : « on arrive dessus, on voit combien on a fait d'appels,
// à combien de pourcents une ville est faite ; si on sort beaucoup de dossiers à Bordeaux ce mois-ci, ça nous propose
// Bordeaux »). Quatre blocs : la ville proposée (un bouton vers les appels), les appels, l'avancement des villes, les
// dossiers et projets du mois par ville ; l'équipe sur sept jours en dernier. Les chiffres : server/prospection/tableau-de-bord.js.

const ETIQUETTE = "m-0 mb-2.5 text-[11px] uppercase tracking-[.16em] text-brume";
const BOUTON = "inline-flex h-9 flex-none items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50";
const nombre = (n) => (n || 0).toLocaleString("fr-FR");
const pl = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

function Bloc({ titre, children, droite = null }) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={ETIQUETTE}>{titre}</h2>
        {droite}
      </div>
      {children}
    </section>
  );
}

function VilleProposee({ proposee, onAppeler }) {
  const queryClient = useQueryClient();
  // Une ville qui sort des dossiers sans liste : l'agent IA y cherche les agences, puis on y appelle.
  const chercher = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/agent-ia/lancer", { body: { ville: proposee.ville } }),
    onSuccess: (r) => {
      toast.success(`L'agent cherche les agences de ${r.liste?.ville || proposee.ville}`, { description: "Elles arrivent dans Appels au fil de l'eau." });
      queryClient.invalidateQueries({ queryKey: ["agent-ia-listes"] });
      queryClient.invalidateQueries({ queryKey: ["prospection-tableau-de-bord"] });
    },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  if (!proposee) {
    return (
      <div className="k-verre flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <p className="m-0 text-[15px] text-craie">Aucune ville à proposer : lancez l'agent sur une ville depuis Appels.</p>
        <button type="button" onClick={() => onAppeler(null)} className={BOUTON}><Phone className="h-4 w-4" />Appels</button>
      </div>
    );
  }
  return (
    <div className="k-verre flex flex-wrap items-center justify-between gap-4 px-5 py-5">
      <div className="min-w-0">
        <p className={ETIQUETTE}>Ville proposée</p>
        <p className="m-0 text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">{proposee.ville}</p>
        <p className="m-0 mt-1 text-[13.5px] text-ardoise">{proposee.raison}</p>
      </div>
      {proposee.liste_id
        ? <button type="button" onClick={() => onAppeler(proposee.liste_id)} className={BOUTON}><Phone className="h-4 w-4" />Appeler à {proposee.ville}</button>
        : <button type="button" onClick={() => chercher.mutate()} disabled={chercher.isPending} className={BOUTON}>{chercher.isPending ? "Lancement…" : `Chercher les agences de ${proposee.ville}`}</button>}
    </div>
  );
}

function Avancement({ villes, onAppeler }) {
  if (!villes.length) return <p className="m-0 py-6 text-[14px] text-brume">Aucune liste d'agences encore.</p>;
  return (
    <div className="flex flex-col">
      {villes.map((v) => (
        <button key={v.id} type="button" onClick={() => onAppeler(v.id)} title={`Appeler à ${v.ville}`}
          className="group grid min-h-[48px] grid-cols-[minmax(0,1fr)_minmax(80px,180px)_auto] items-center gap-4 border-b border-trait px-1 py-1.5 text-left transition-colors last:border-b-0 hover:bg-relief max-md:grid-cols-[minmax(0,1fr)_auto]" style={{ background: "transparent" }}>
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-encre">{v.ville}</span>
            <span className="block truncate text-[12.5px] text-ardoise">
              {nombre(v.appelees)} / {pl(v.agences, "agence", "agences")}{v.interessees ? ` · ${pl(v.interessees, "intéressée", "intéressées")}` : ""}{v.a_rappeler ? ` · ${nombre(v.a_rappeler)} à rappeler` : ""}
            </span>
          </span>
          <span className="h-[5px] overflow-hidden rounded-full bg-encre/[0.12] max-md:hidden"><span className="block h-full bg-menthe" style={{ width: `${v.fait_pourcent}%` }} /></span>
          <span className="flex items-center gap-2 text-[15px] tabular-nums text-encre">{v.fait_pourcent} %<ArrowRight className="h-3.5 w-3.5 text-ardoise opacity-0 transition-opacity group-hover:opacity-100" /></span>
        </button>
      ))}
    </div>
  );
}

// Les dossiers et projets du mois en anneau (15 nov. 2026, Jules : « un camembert, un rond : 25 % Bordeaux, une autre
// partie une autre ville »). Une part par ville, le total au centre ; la légende dit la ville et sa part. Les teintes de
// `jetons.graphique` dans l'ordre, la couleur suit la ville (ordre alphabétique), jamais son rang ; au-delà de sept
// villes, le reste en « Autres villes ». L'infobulle donne le détail et les noms.
const MAX_PARTS = 7;
function SortiesDuMois({ sorties }) {
  const c = useCouleurs();
  const [survol, setSurvol] = React.useState(null);
  if (!sorties.length) return <p className="m-0 py-6 text-[14px] text-brume">Aucun dossier ni projet depuis le 1er du mois.</p>;
  const total = sorties.reduce((n, s) => n + s.total, 0);
  const gardees = sorties.slice(0, MAX_PARTS);
  const reste = sorties.slice(MAX_PARTS);
  const teinte = new Map([...gardees].sort((a, b) => a.ville.localeCompare(b.ville, "fr")).map((s, i) => [s.ville, c.series[i]]));
  const parts = [
    ...gardees.map((s) => ({ ...s, couleur: teinte.get(s.ville) })),
    ...(reste.length ? [{ ville: "Autres villes", total: reste.reduce((n, s) => n + s.total, 0), dossiers: reste.reduce((n, s) => n + s.dossiers, 0), projets: reste.reduce((n, s) => n + s.projets, 0), noms: [], couleur: c.brume }] : []),
  ].map((s) => ({ ...s, part: Math.round((s.total / total) * 100) }));
  const detail = (s) => [s.dossiers ? pl(s.dossiers, "dossier", "dossiers") : null, s.projets ? pl(s.projets, "projet", "projets") : null].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-6 py-3 max-sm:flex-col max-sm:items-stretch">
      <div className="relative mx-auto h-[190px] w-[190px] flex-none" role="img" aria-label={`Dossiers et projets par ville : ${parts.map((s) => `${s.ville} ${s.part} %`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={parts} dataKey="total" nameKey="ville" innerRadius={62} outerRadius={90} paddingAngle={parts.length > 1 ? 2 : 0} cornerRadius={4} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}
              onMouseEnter={(_, i) => setSurvol(i)} onMouseLeave={() => setSurvol(null)}>
              {parts.map((s, i) => <Cell key={s.ville} fill={s.couleur} fillOpacity={survol == null || survol === i ? 1 : 0.35} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => active && payload?.length ? (() => { const s = payload[0].payload; return <Bulle titre={s.ville} lignes={[{ nom: "Part", valeur: `${s.part} %`, couleur: s.couleur }, s.dossiers ? { nom: "Dossiers", valeur: s.dossiers } : null, s.projets ? { nom: "Projets", valeur: s.projets } : null]} />; })() : null} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-normal leading-none tabular-nums text-encre">{nombre(total)}</span>
          <span className="mt-1 text-[12.5px] text-ardoise">{total > 1 ? "sortis" : "sorti"}</span>
        </div>
      </div>
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-col p-0">
        {parts.map((s, i) => (
          <li key={s.ville} onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)}
            className={`flex min-h-[40px] items-center justify-between gap-3 border-b border-trait px-1 last:border-b-0 transition-opacity ${survol == null || survol === i ? "" : "opacity-50"}`}>
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.couleur }} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-encre">{s.ville}</span>
                <span className="block truncate text-[12.5px] text-ardoise">{detail(s)}</span>
              </span>
            </span>
            <span className="flex-none text-[15px] tabular-nums text-encre">{s.part} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TableauDeBordProspection({ onAppeler }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["prospection-tableau-de-bord"],
    queryFn: () => base44.request("GET", "/api/prospection/tableau-de-bord"),
    refetchInterval: 120_000,
  });
  if (isLoading) return <Chargement taille="grand" />;
  if (error) return <p className="py-12 text-center text-[14px] text-alerte">Le tableau de bord n'a pas pu se charger : {error.message || "erreur"}.</p>;
  const a = data.appels;
  const mois = new Date(data.mois.depuis).toLocaleDateString("fr-FR", { month: "long" });
  return (
    <div className="flex w-full flex-col gap-8 pb-16">
      <VilleProposee proposee={data.proposee} onAppeler={onAppeler} />

      <Bloc titre="Appels">
        <Cases colonnes={3} items={[
          [nombre(a.jour.appels), `aujourd'hui · ${pl(a.jour.aboutis, "abouti", "aboutis")}`],
          [nombre(a.semaine.appels), `7 jours · ${pl(a.semaine.aboutis, "abouti", "aboutis")}`],
          [nombre(a.mois.appels), `30 jours · ${pl(a.mois.aboutis, "abouti", "aboutis")} · ${pl(a.mois.biens, "bien", "biens")}`],
        ]} />
      </Bloc>

      <div className="grid gap-8 lg:grid-cols-2">
        <Bloc titre="Avancement des villes">
          <div className="k-verre px-4 py-1"><Avancement villes={data.villes} onAppeler={onAppeler} /></div>
        </Bloc>
        <Bloc titre={`Dossiers et projets de ${mois}`}>
          <div className="k-verre px-4 py-1"><SortiesDuMois sorties={data.mois.sorties} /></div>
        </Bloc>
      </div>

      {data.par_personne.length > 0 && (
        <Bloc titre="L'équipe, sur 7 jours" droite={<Link to="/SuiviAppels" className="text-[12.5px] text-ardoise hover:text-encre">Le détail dans Suivi</Link>}>
          <div className="k-verre px-4 py-1">
            {data.par_personne.map((p) => (
              <div key={p.email} className="flex min-h-[44px] items-center justify-between gap-4 border-b border-trait px-1 last:border-b-0">
                <span className="truncate text-[15px] text-encre">{p.prenom}</span>
                <span className="flex-none text-[13.5px] tabular-nums text-craie">{pl(p.appels, "appel", "appels")} · {pl(p.aboutis, "abouti", "aboutis")}{p.biens ? ` · ${pl(p.biens, "bien", "biens")}` : ""}</span>
              </div>
            ))}
          </div>
        </Bloc>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";
import ConnexionExterne from "@/components/preanalyse/ConnexionExterne";

// Alex — l'agent qui fait la recherche de marché à votre place.
//
// Alex ne « fait plus les quatre services » : il pose trois questions au
// marché — les loyers commerciaux, les cessions de fonds, le résidentiel — et
// chaque question a sa liste de sources, essayées dans l'ordre. Si Equimmox
// tombe, Data-B répond à sa place et la question reste couverte.
//
// L'écran suit donc le serveur de bout en bout : c'est lui qui dit à quelle
// question Alex en est, ET quelle source il interroge — la liste étant
// configurable, l'écran ne peut plus la tenir en dur. Les étapes ci-dessous
// ne servent qu'aux premières secondes, avant la première réponse du serveur.

const ETAPES_INITIALES = [
  {
    court: "Equimmox — les loyers observés",
    ligne: "Je passe sur Equimmox",
    legende: "Les baux comparables à cinq cents mètres, à surface équivalente. Cela prend une minute.",
  },
  {
    court: "Data-B — les cessions de fonds",
    ligne: "Je relève les cessions de fonds",
    legende: "Ce qui s'est vendu autour du bien, à quel prix, pour quelles activités.",
  },
  {
    court: "Le Figaro — le résidentiel",
    ligne: "Je finis par Le Figaro Immobilier",
    legende: "Le prix et le loyer d'un appartement, au quartier puis à la commune.",
  },
];

export default function AlexMarche({ dossier, lot, apercu = false, onRefresh }) {
  const [etape, setEtape] = useState(null);
  const [etapes, setEtapes] = useState(ETAPES_INITIALES);
  const [enCours, setEnCours] = useState(false);
  const suivi = useRef(null);
  const bilan = useRef(null);
  const queryClient = useQueryClient();
  useEffect(() => () => clearTimeout(suivi.current), []);

  const arreter = () => { clearTimeout(suivi.current); setEnCours(false); setEtape(null); };

  const recevoir = (t) => {
    // Les étapes viennent du serveur dès qu'il les connaît : elles disent la
    // source réellement interrogée, repli compris.
    if (t.etapes?.length) setEtapes(t.etapes);
    setEtape(t.etape ?? 0);
    if (t.etat === "en_cours") {
      suivi.current = setTimeout(() => interroger(t.cle), 2500);
      return;
    }
    // Fini : l'écran va au bout, puis rend la main dans `finir`.
    bilan.current = t;
    setEtape((t.etapes?.length || etapes.length));
  };
  const echouer = (e) => {
    arreter();
    toast.error(e?.message || "Alex n'a pas pu chercher");
  };
  const interroger = (cle) => {
    base44.request("GET", `/api/marche/alex/etat?cle=${encodeURIComponent(cle)}`).then(recevoir).catch(echouer);
  };

  const lancer = useMutation({
    mutationFn: ({ forcer = false } = {}) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot?.index ?? 0}/marche/alex`, { body: { forcer } }),
    onSuccess: recevoir,
    onError: echouer,
  });

  // L'écran est allé au bout : on pose le bilan et on rend la main.
  const finir = () => {
    const t = bilan.current;
    bilan.current = null;
    arreter();
    onRefresh?.();
    // Le panneau de traçabilité relit le journal du serveur.
    queryClient.invalidateQueries({ queryKey: ["marche-journal", dossier?.deal_id] });
    if (!t) return;
    // Seule une recherche qui n'a jamais pu démarrer est une erreur : pas
    // d'adresse, pas de lot. Une source à terre, elle, n'arrête rien.
    if (t.erreur) { toast.error(t.erreur); return; }

    const couvertes = Object.values(t.besoins || {}).filter((b) => b.servi_par).length;
    const total = Object.keys(t.besoins || {}).length || etapes.length;
    // Un mur — compte refusé, plan insuffisant — se dit à part : lui ne se
    // réparera pas tout seul.
    for (const n of t.notifications || []) {
      toast.error(`${n.service} : ${n.message}`, { duration: 15000 });
    }
    if (t.complet) {
      toast.success(`Alex a couvert les ${total} questions du marché.`);
      return;
    }
    const replis = Object.values(t.besoins || {}).filter((b) => b.servi_par && b.essayees[0] !== b.servi_par);
    toast.warning(`Données de marché incomplètes — ${couvertes}/${total} question(s) couverte(s)`, {
      description: [
        ...(t.sources_en_echec || []).map((s) => `${s.service} : ${s.erreur}`),
        replis.length ? `Repli utilisé pour ${replis.map((b) => b.titre).join(", ")}.` : null,
        t.nouvelle_tentative_le ? "Une nouvelle tentative est programmée." : null,
      ].filter(Boolean).join(" · "),
      duration: 14000,
    });
  };

  const demarrer = (forcer) => {
    if (apercu) return;
    clearTimeout(suivi.current);
    bilan.current = null;
    setEtapes(ETAPES_INITIALES);
    setEtape(0);
    setEnCours(true);
    lancer.mutate({ forcer });
  };

  const dejaLu = !!(lot?.valeur_locative || lot?.transactions_fonds || lot?.analyse_loyer || lot?.prix_residentiel);

  return (
    <section className="border border-[#2c3139] rounded-[16px] bg-[#0f1114] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5] inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#96c0b8]" /> Alex
          </h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">
            La recherche de marché en entier : les loyers commerciaux, les cessions de fonds, le résidentiel. Une source
            qui ne répond pas est réessayée, puis remplacée par la suivante. Comptez deux minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => demarrer(dejaLu)}
          disabled={apercu || enCours}
          className="inline-flex items-center gap-2 text-[13px] px-4 py-2 rounded-full bg-[#96c0b8] text-[#04140c] font-semibold hover:bg-[#abd0c8] disabled:opacity-40 flex-shrink-0"
        >
          {enCours ? <PenseeIA etat="searching" taille={20} /> : <Sparkles className="w-3.5 h-3.5" />}
          {enCours ? "Alex cherche…" : dejaLu ? "Relancer Alex" : "Lancer Alex"}
        </button>
      </div>

      {enCours && (
        <ConnexionExterne
          service="Alex"
          etapes={etapes}
          etapeServeur={etape}
          dureeEtape={2600}
          onFini={finir}
        />
      )}
    </section>
  );
}

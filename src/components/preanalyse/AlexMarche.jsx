import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";
import ConnexionExterne from "@/components/preanalyse/ConnexionExterne";

// Alex — l'agent qui fait la recherche de marché à votre place.
//
// L'équipe ouvrait trois services à la main, l'un après l'autre. Alex les
// enchaîne dans le même ordre : Data-B pour la valeur locative de la rue puis
// les cessions de fonds, Equimmox pour les baux comparables, Le Figaro pour le
// résidentiel. Chaque lecture se pose sur le dossier dès qu'elle arrive.
//
// L'écran suit Alex : c'est le serveur qui dit où il en est, pas un minuteur.

const ETAPES = [
  {
    court: "Data-B — la valeur locative",
    ligne: "Je me connecte sur Data-B",
    legende: "J'ouvre Valeurs locatives et je relève la fourchette de loyer de la rue, du quartier et de la ville.",
  },
  {
    court: "Data-B — les cessions de fonds",
    ligne: "Je relève les cessions de fonds",
    legende: "Ce qui s'est vendu autour du bien, à quel prix, pour quelles activités.",
  },
  {
    court: "Equimmox — les loyers observés",
    ligne: "Je passe sur Equimmox",
    legende: "Les baux comparables à cinq cents mètres, à surface équivalente. Cela prend une minute.",
  },
  {
    court: "Le Figaro — le résidentiel",
    ligne: "Je finis par Le Figaro Immobilier",
    legende: "Le prix et le loyer d'un appartement, au quartier puis à la commune.",
  },
];

const NOMS = {
  valeur_locative: "la valeur locative",
  transactions_fonds: "les cessions de fonds",
  analyse_loyer: "les loyers observés",
  prix_residentiel: "le marché résidentiel",
};

export default function AlexMarche({ dossier, lot, apercu = false, onRefresh }) {
  const [etape, setEtape] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const suivi = useRef(null);
  const bilan = useRef(null);
  useEffect(() => () => clearTimeout(suivi.current), []);

  const arreter = () => { clearTimeout(suivi.current); setEnCours(false); setEtape(null); };

  const recevoir = (t) => {
    setEtape(t.etape ?? 0);
    if (t.etat === "en_cours") {
      suivi.current = setTimeout(() => interroger(t.cle), 2500);
      return;
    }
    // Fini : l'écran va au bout, puis rend la main dans `finir`.
    bilan.current = t;
    setEtape(ETAPES.length);
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
    if (!t) return;
    if (t.erreur) { toast.error(t.erreur); return; }
    const faites = Object.keys(t.resultats || {}).length;
    const rates = Object.entries(t.echecs || {});
    if (rates.length) {
      toast.warning(`Alex a rapporté ${faites} lecture${faites > 1 ? "s" : ""} sur ${ETAPES.length}`, {
        description: rates.map(([c, m]) => `${NOMS[c] || c} : ${m}`).join(" · "),
        duration: 12000,
      });
    } else {
      toast.success("Alex a rapporté les quatre lectures du marché.");
    }
  };

  const demarrer = (forcer) => {
    if (apercu) return;
    clearTimeout(suivi.current);
    bilan.current = null;
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
            La recherche de marché en entier : Data-B pour la rue et les cessions de fonds, Equimmox pour les loyers
            observés, Le Figaro pour le résidentiel. Comptez deux minutes.
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
          etapes={ETAPES}
          etapeServeur={etape}
          dureeEtape={2600}
          onFini={finir}
        />
      )}
    </section>
  );
}

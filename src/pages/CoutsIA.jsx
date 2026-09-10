import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Check, Clock, Loader2, Sparkles } from "lucide-react";

// Ce que coûte un geste, et non une opération technique.
//
// Le journal des coûts dit « matrice : 25 € ». Personne ne travaille en ces
// termes, et ce total ne se compare à rien. Ici chaque coût est ramené à SON
// unité — lire une pièce, rédiger un mail, poser une question — parce qu'on
// sait combien de pièces on dépose par semaine, pas combien de « matrices ».
//
// En face, les leviers, avec leur état réel : ce qui est en place, ce qui
// attend un réglage, ce qui demande une décision.

// Le journal compte en dollars (tarifs publics du modèle) ; on affiche en
// euros, comme la page Suivi, avec le même taux.
const EUR_PAR_USD = 0.92;
const euros = (n, precis = false) => {
  if (n == null) return "—";
  const e = n * EUR_PAR_USD;
  if (e === 0) return "0 €";
  if (e < 0.01 || precis) return `${e.toFixed(e < 0.01 ? 4 : 3).replace(".", ",")} €`;
  return `${e.toFixed(2).replace(".", ",")} €`;
};
const pourcent = (x) => `${Math.round((x || 0) * 100)} %`;
const duree = (ms) => (!ms ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(0)} s` : `${Math.floor(ms / 60000)} min`);

const FENETRES = [
  { jours: 7, mot: "7 jours" },
  { jours: 30, mot: "30 jours" },
  { jours: 90, mot: "90 jours" },
];

// L'état d'un levier : ce qui est fait, ce qui attend, ce qui se décide.
const ETATS = {
  pose: { mot: "En place", fond: "#2f7a5a", Icone: Check },
  regler: { mot: "À régler", fond: "#a8752a", Icone: Clock },
  decider: { mot: "À décider", fond: "#5a8db5", Icone: Sparkles },
};

function Levier({ etat, titre, effet, ou, children }) {
  const e = ETATS[etat];
  return (
    <div className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-white px-2.5 py-0.5 rounded-full" style={{ background: e.fond }}>
          <e.Icone className="w-3 h-3" /> {e.mot}
        </span>
        <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">{titre}</h3>
        {effet && <span className="text-[12.5px] text-[#96c0b8] tabular-nums">{effet}</span>}
      </div>
      <p className="m-0 mt-2 text-[13.5px] leading-[1.65] text-[#c9cdd6] max-w-[70ch]">{children}</p>
      {ou && <p className="m-0 mt-1.5 font-mono text-[11px] text-[#6a7180]">{ou}</p>}
    </div>
  );
}

function Chiffre({ label, valeur, note, teinte = "#f2f3f5" }) {
  return (
    <div className="px-5 py-4 border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] min-w-0">
      <p className="m-0 font-mono text-[10px] tracking-[.18em] uppercase text-[#6a7180]">{label}</p>
      <p className="m-0 mt-1.5 text-[26px] font-light tabular-nums leading-none" style={{ color: teinte }}>{valeur}</p>
      {note && <p className="m-0 mt-1.5 text-[12px] text-[#9298a6]">{note}</p>}
    </div>
  );
}

export default function CoutsIA() {
  const user = useUser();
  const [jours, setJours] = useState(30);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["couts-par-action", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/couts-par-action?jours=${jours}`),
    enabled: user?.role === "admin",
    staleTime: 60 * 1000,
  });

  if (user && user.role !== "admin") {
    return <div className="min-h-screen bg-[#000000] text-[#9298a6] px-6 py-16 text-center text-[14px]">Réservé aux administrateurs.</div>;
  }

  const actions = data?.actions || [];
  const gestes = actions.filter((a) => !a.fond);
  const fonds = actions.filter((a) => a.fond);
  const plusCher = gestes[0] || null;
  const lecture = actions.find((a) => a.cle === "lecture_piece");
  const veille = actions.find((a) => a.cle === "veille");

  const Tableau = ({ titre, sous, lignes }) => (
    <section className="mt-8">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]">{titre}</h2>
        <span className="text-[13px] text-[#6a7180]">{sous}</span>
      </div>
      {lignes.length === 0 ? (
        <p className="m-0 py-6 text-[13.5px] text-[#6a7180]">Aucun geste de ce type sur la période.</p>
      ) : (
        <div className="overflow-x-auto border border-[#1f2228] rounded-[16px]">
          <table className="w-full border-collapse text-[13.5px] min-w-[720px]">
            <thead>
              <tr className="bg-[#0f1114]">
                {["Geste", "Coût courant", "Moyenne", "Le plus cher", "Volume", "Durée"].map((h, i) => (
                  <th key={h} className={`text-left font-normal font-mono text-[10px] tracking-[.16em] uppercase text-[#6a7180] px-4 py-2.5 border-b border-[#1f2228] ${i > 0 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((a) => (
                <tr key={a.cle} className="align-top border-b border-[#1f2228] last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="m-0 text-[#f2f3f5]">{a.libelle}</p>
                    <p className="m-0 mt-0.5 text-[11.5px] text-[#6a7180]">{a.ou}</p>
                  </td>
                  {/* La médiane d'abord : une moyenne se fait emporter par un
                      dossier hors norme, et c'est le cas courant qu'on veut. */}
                  <td className="px-4 py-3 text-right tabular-nums text-[#f2f3f5] whitespace-nowrap">
                    {euros(a.mediane)}
                    <span className="block text-[11px] text-[#6a7180]">{a.unite}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#9298a6] whitespace-nowrap">{euros(a.moyenne)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#9298a6] whitespace-nowrap">{euros(a.maxi)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#9298a6] whitespace-nowrap">
                    {a.unites}
                    <span className="block text-[11px] text-[#6a7180]">{euros(a.cout)} au total</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6a7180] whitespace-nowrap">{duree(a.duree_moyenne_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] px-5 md:px-10 py-8 md:py-12">
      <div className="max-w-[1180px] mx-auto">

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="m-0 text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05]">Ce que coûte chaque geste</h1>
            <p className="m-0 mt-2 text-[14px] text-[#9298a6] max-w-[62ch]">
              Le prix d'une pièce lue, d'un mail rédigé, d'une question posée. Calculé sur votre journal, pas sur des ordres de grandeur.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-[#2c3139] p-0.5">
            {FENETRES.map((f) => (
              <button
                key={f.jours}
                onClick={() => setJours(f.jours)}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] transition-colors ${jours === f.jours ? "bg-[#f2f3f5] text-[#0b0c0e] font-semibold" : "text-[#9298a6] hover:text-[#f2f3f5]"}`}
              >
                {f.mot}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="m-0 py-16 text-center text-[13.5px] text-[#9298a6] inline-flex items-center gap-2 w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Lecture du journal…
          </p>
        ) : isError ? (
          <p className="m-0 py-16 text-center text-[13.5px] text-[#e8746a]">{error?.message || "Journal illisible."}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Chiffre label={`Dépensé sur ${jours} jours`} valeur={euros(data.total)} note={`${actions.reduce((n, a) => n + a.gestes, 0)} gestes mesurés`} />
              <Chiffre
                label="Le geste le plus cher"
                valeur={plusCher ? euros(plusCher.mediane) : "—"}
                note={plusCher ? `${plusCher.libelle.toLowerCase()}, ${plusCher.unite}` : "aucun geste sur la période"}
                teinte="#d9b46a"
              />
              <Chiffre
                label="Part en tâche de fond"
                valeur={pourcent(data.part_fond)}
                note="dépensé sans que personne clique"
                teinte={data.part_fond > 0.4 ? "#e8746a" : "#f2f3f5"}
              />
              <Chiffre
                label="Servi par le cache"
                valeur={pourcent(data.part_cache)}
                note={data.part_cache < 0.05 ? "le cache n'a pas encore mordu" : "à un dixième du prix plein"}
                teinte={data.part_cache < 0.05 ? "#9298a6" : "#96c0b8"}
              />
            </div>

            <Tableau titre="Ce que vous déclenchez" sous="un geste, une unité, son prix courant" lignes={gestes} />
            <Tableau titre="Ce qui tourne sans vous" sous="personne ne clique, la dépense part quand même" lignes={fonds} />

            {data.non_classees?.length > 0 && (
              <p className="m-0 mt-4 text-[12.5px] text-[#6a7180]">
                Non rangé dans un geste : {data.non_classees.map((n) => `${n.operation} (${euros(n.cout)})`).join(" · ")}. À classer dans <code className="text-[#c3ddd6]">server/llm-couts.js</code>.
              </p>
            )}

            {/* ---- Ce qu'on peut faire, avec l'état réel de chaque levier ---- */}
            <section className="mt-12">
              <div className="flex items-baseline gap-3 flex-wrap mb-1">
                <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]">Ce qu'on peut faire</h2>
                <span className="text-[13px] text-[#6a7180]">chaque levier, son effet mesuré, et où il se règle</span>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">

                <Levier etat="pose" titre="Le cache des pièces" effet="une relecture à un dixième du prix" ou="Posé le 9 septembre · une heure de rétention">
                  Une pièce déjà envoyée au modèle revient dix fois moins cher pendant une heure. Vous en êtes à {pourcent(data.part_cache)} de jetons servis par le cache sur cette période
                  {data.part_cache < 0.05 ? " : les lectures d'avant la mise en place pèsent encore dans la moyenne, le chiffre montera de lui-même." : "."}
                </Levier>

                <Levier etat="pose" titre="Le texte du PDF plutôt que ses images" effet="279 574 → 91 061 jetons" ou="Repli automatique sur les images pour un scan · KLOCKA_PDF_NATIF=1 rétablit l'ancien">
                  Un PDF envoyé tel quel fait rendre chacune de ses pages en image. Sur un bail de 119 pages, sa seule couche texte pèse trois fois moins,
                  pour des valeurs extraites identiques et des citations qui gardent leur page.
                </Levier>

                <Levier etat="pose" titre="Ne pas relire une pièce inchangée" effet={lecture ? `${euros(lecture.mediane)} économisés par relecture évitée` : "une lecture entière économisée"} ou="Empreinte : la pièce, les questions posées, la version du gabarit">
                  Revenir sur un dossier ne relance plus rien. Seuls les deux boutons « Relancer l'analyse » forcent une relecture.
                </Levier>

                <Levier etat="pose" titre="Le prix annoncé avant de relire" effet="le devis s'affiche, puis attend" ou="Bouton « Relancer l'analyse », en tête de chaque grille">
                  Les jetons sont comptés par l'API avant l'envoi, ce comptage ne coûte rien. Vous voyez le prix, vous confirmez ou vous annulez.
                </Levier>

                <Levier etat="pose" titre="Un mail écarté n'est plus rejugé" effet="536 appels sur 516 passages, avant" ou="Décision gardée avec sa raison">
                  Le tri des boîtes ne mémorisait que les mails retenus. Un mail refusé repassait donc devant le modèle toutes les cinq minutes, indéfiniment.
                </Levier>

                <Levier etat="regler" titre="L'espacement de la veille" effet={veille ? `${euros(veille.mediane)} par mail douteux` : "quelques centimes par passage"} ou="Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd'hui">
                  Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement,
                  et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15.
                </Levier>

                <Levier etat="decider" titre="Le traitement différé" effet="moitié prix sur tout" ou="Concerne la lecture des pièces et la veille, jamais le chat">
                  L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures
                  au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête.
                  Le choix vous revient, il change un délai.
                </Levier>

                <Levier etat="decider" titre="Un modèle moins cher sur les gestes mécaniques" effet="à mesurer sur vos dossiers" ou="Variable ANTHROPIC_MODEL · claude-opus-5 aujourd'hui">
                  Mettre en forme une valeur déjà lue, trier un mail, ranger un texte dicté : ces gestes partent déjà à effort minimal.
                  Descendre d'un modèle est le levier suivant, mais un modèle moins cher au jeton n'est pas toujours moins cher par dossier abouti.
                  Cela demande un jeu de dossiers de référence, pas une intuition.
                </Levier>

              </div>
            </section>

            <p className="m-0 mt-10 pt-5 border-t border-[#1f2228] text-[12.5px] text-[#6a7180] max-w-[76ch]">
              Les montants viennent du journal des coûts, converti en euros au taux de {String(EUR_PAR_USD).replace(".", ",")}.
              Le coût courant est la médiane, pas la moyenne : un dossier hors norme ne doit pas fausser ce que vous payez d'habitude.
              Le détail appel par appel reste sur la page Suivi.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

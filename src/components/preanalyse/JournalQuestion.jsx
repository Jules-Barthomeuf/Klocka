import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, MessageCircleQuestion } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { useDictee } from "@/lib/dictee";
import PenseeIA from "@/components/PenseeIA";
import MessageIA from "@/components/MessageIA";

// Demander au marché — le composer du dossier, branché sur les sources.
//
// Sur l'onglet Marché, c'est LE chat de la page : il remplace celui du dossier
// en haut d'écran plutôt que de s'ajouter à lui. Deux barres de saisie l'une
// sous l'autre laissaient deviner laquelle interroge les sources.
//
// C'est la même barre que le chat du dossier (ChatDossier) : mêmes classes,
// même dictée, même bouton d'envoi. Seul ce qu'il y a derrière change. Ici la
// question ne part pas dans les documents mais dans les connecteurs —
// Equimmox, Data-B, Le Figaro — et la réponse revient avec ce qui a été lu.
//
// Le modèle n'a pas le droit de répondre de mémoire. Chaque chiffre qu'il
// écrit vient d'un appel qu'il vient de faire, et l'écran affiche sous la
// réponse ce qui est RÉELLEMENT revenu : service, échelle, fourchette, heure,
// lien. C'est cela qui distingue une réponse d'une invention — on peut aller
// vérifier.
//
// Il n'y a pas de réglage de profondeur ici : ce chat interroge TOUTES les
// sources, Equimmox compris (une minute, un vrai navigateur) et l'étude
// d'implantation Data-B (un crédit). C'est le chat de l'analyse — on y vient
// pour une réponse fondée, pas pour une réponse rapide. Le serveur accepte
// toujours « rapide », mais plus personne ne le demande d'ici.
const PROFONDEUR = "reflexion";

// Le répertoire de questions, derrière l'icône de la barre.
//
// Chacune correspond à quelque chose qu'un connecteur sait réellement rendre :
// on ne propose pas une question à laquelle aucune source ne peut répondre.
// Les questions marquées « credit » passent par l'étude d'implantation Data-B,
// qui coûte un crédit et exige le mode Réflexion — l'écran le dit avant.
const REPERTOIRE = [
  {
    famille: "Valeur locative",
    source: "Equimmox + Data-B",
    questions: [
      "Quelle est la valeur locative moyenne dans ce secteur ?",
      "Le loyer en place est-il au-dessus ou en dessous du marché ?",
      "Quelle fourchette de loyer pour une surface comparable à moins de 500 m ?",
      "Equimmox et Data-B disent-ils la même chose sur le loyer ? Si non, de combien ?",
      "À quelle échelle Data-B estime-t-il ce loyer : la rue, le quartier ou la ville ?",
    ],
  },
  {
    famille: "Fonds de commerce",
    source: "Data-B",
    questions: [
      "Qu’est-ce qui s’est vendu comme fonds de commerce autour du bien ?",
      "À quel prix se vendent les fonds dans un rayon de 250 m ?",
      "Quelles activités se sont cédées le plus récemment dans ce secteur ?",
      "Y a-t-il eu une cession dans la même rue que le bien ?",
    ],
  },
  {
    famille: "Résidentiel",
    source: "Le Figaro Immobilier",
    questions: [
      "Le résidentiel monte ou descend dans ce quartier ?",
      "Quel est le prix au m² du logement ici, et son évolution sur 5 ans ?",
      "Quel loyer d’habitation au m² dans ce quartier ?",
      "Le quartier est-il au-dessus ou en dessous de la moyenne de la commune ?",
    ],
  },
  {
    famille: "Ventes réelles",
    source: "DVF · gratuit",
    questions: [
      "À quel prix se sont vendus les locaux commerciaux autour du bien ?",
      "Le prix demandé tient-il au regard des ventes réelles du secteur ?",
      "Combien de ventes de commerces dans 500 m ces cinq dernières années ?",
      "Y a-t-il eu une vente dans le même immeuble ou à côté ?",
    ],
  },
  {
    famille: "Vitalité de la rue",
    source: "BODACC · gratuit",
    questions: [
      "Des commerces ont-ils fermé dans cette rue depuis deux ans ?",
      "La rue gagne-t-elle ou perd-elle des commerces ?",
      "Quels fonds se sont cédés dans la rue, et à quel prix ?",
      "La rue va-t-elle mieux ou moins bien que le reste de la commune ?",
    ],
  },
  {
    famille: "Emplacement",
    source: "Data-B · étude d’implantation",
    credit: true,
    questions: [
      "Quel est le flux piéton devant le bien, et à quelles heures ?",
      "Quels commerces occupent le tronçon de rue, numéro par numéro ?",
      "Qui habite la zone : démographie, revenu moyen, part de CSP+ ?",
      "Le passage justifie-t-il le loyer demandé ?",
    ],
  },
];

// La hauteur maximale du menu, en pixels : elle sert à choisir son côté
// d'ouverture, et doit rester d'accord avec la classe max-h ci-dessous.
const HAUTEUR_MENU = 460;

const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/** Une source réellement lue : ce qui permet de vérifier le chiffre. */
function Source({ s }) {
  const bornes = [fmt(s.bas), fmt(s.median), fmt(s.haut)].filter(Boolean);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="flex-shrink-0 font-pill text-[11px] font-semibold uppercase tracking-[.08em] px-1.5 py-[2px] rounded-[3px] border border-[rgba(150,192,184,.35)] text-menthe">
          {s.service}
        </span>
        <span className="text-[12.5px] text-craie">{s.titre}</span>
        <span className="text-[12.5px] font-medium text-encre">
          {bornes.join(" / ")} {s.unite || ""}
        </span>
      </div>
      <p className="m-0 mt-0.5 text-[11px] leading-5 text-brume">
        {s.echelle ? `échelle : ${s.echelle}` : ""}
        {s.precision ? ` · ${s.precision}` : ""}
        {s.collecte_le ? ` · relevé le ${new Date(s.collecte_le).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
        {s.du_cache ? " · depuis le cache" : ""}
      </p>
      {s.lien && (
        <a href={s.lien} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-start gap-1.5 text-[11px] text-menthe hover:underline break-all">
          {s.lien.slice(0, 110)}
          <ExternalLink className="w-3 h-3 mt-[3px] flex-shrink-0" />
        </a>
      )}
    </li>
  );
}

/**
 * Le répertoire : les questions courantes, rangées par ce qui sait y répondre.
 *
 * Le côté d'ouverture se décide à la mesure. Ici la barre de saisie est en haut
 * de la page, et un menu qui s'ouvre vers le haut sort de l'écran ; avec une
 * longue conversation au-dessus, c'est l'inverse. On regarde donc la place
 * réellement disponible au moment du clic.
 */
function Repertoire({ onChoisir, versLeHaut }) {
  return (
    <div
      role="menu"
      className={`absolute ${versLeHaut ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"} left-0 z-40 w-[min(420px,calc(100vw-40px))] max-h-[min(460px,60vh)] overflow-y-auto rounded-[14px] border border-bord-doux bg-surface shadow-[0_18px_50px_rgba(0,0,0,.55)] py-2`}
    >
      {REPERTOIRE.map((f) => {
        return (
          <div key={f.famille} className="px-1.5 py-1">
            <div className="flex flex-wrap items-baseline gap-x-2 px-2.5 pt-1.5 pb-1">
              <span className="font-pill text-[11px] font-semibold uppercase tracking-[.1em] text-menthe">{f.famille}</span>
              <span className="text-[11px] text-brume">{f.source}</span>
              {f.credit && <span className="text-[11px] text-ambre">1 crédit</span>}
            </div>
            {f.questions.map((q) => (
              <button
                key={q}
                type="button"
                role="menuitem"
                onClick={() => onChoisir(q)}
                className="block w-full text-left rounded-[8px] px-2.5 py-1.5 text-[12.5px] leading-5 text-craie hover:text-encre hover:bg-relief transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function JournalQuestion({ dealId, lotIndex = 0, adresse = null, apercu = false }) {
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [echanges, setEchanges] = useState([]);
  const [repertoire, setRepertoire] = useState(false);
  const [versLeHaut, setVersLeHaut] = useState(false);
  const champ = useRef(null);
  const boite = useRef(null);

  // Le répertoire se referme au clic ailleurs et à Échap : c'est un menu, il
  // ne doit pas rester ouvert dans le dos de celui qui écrit.
  useEffect(() => {
    if (!repertoire) return undefined;
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setRepertoire(false); };
    const clavier = (e) => { if (e.key === "Escape") setRepertoire(false); };
    document.addEventListener("mousedown", dehors);
    window.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", dehors);
      window.removeEventListener("keydown", clavier);
    };
  }, [repertoire]);

  const { supporte: dicteeOk, ecoute, demarrer, arreter } = useDictee({ onTexte: (t) => setTexte(t) });
  const peutEnvoyer = !!texte.trim() && !enCours && !apercu;

  const demander = useCallback(
    async (question) => {
      const q = String(question ?? texte).trim();
      if (!q || enCours || apercu) return;
      if (ecoute) arreter();
      setTexte("");
      setEnCours(true);
      // L'historique donne le fil de la conversation, pas les chiffres :
      // ceux-là, le modèle doit les redemander aux outils.
      const historique = echanges
        .flatMap((e) => [{ role: "user", content: e.question }, { role: "assistant", content: e.reponse || "" }])
        .filter((m) => m.content);
      try {
        const r = await base44.request("POST", "/api/marche/question", {
          body: { question: q, deal_id: dealId || undefined, index: lotIndex, profondeur: PROFONDEUR, historique },
        });
        setEchanges((l) => [...l, { question: q, ...r }]);
      } catch (e) {
        setEchanges((l) => [...l, { question: q, erreur: e?.message || "La question n’a pas abouti." }]);
      } finally {
        setEnCours(false);
        champ.current?.focus();
      }
    },
    [texte, enCours, apercu, ecoute, arreter, echanges, dealId, lotIndex]
  );

  // Choisir une question la MET DANS LE CHAMP, elle ne l'envoie pas. Une
  // question part chercher pour de vrai — jusqu'à une minute de navigateur, et
  // un crédit pour l'implantation. On garde la main pour la corriger d'abord.
  const choisir = useCallback((q) => {
    setRepertoire(false);
    setTexte(q);
    requestAnimationFrame(() => {
      const el = champ.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(q.length, q.length);
    });
  }, []);

  // Le souffle autour du chat est posé en PADDING, pas en marge : le parent est
  // en space-y-5, qui remet à zéro la marge basse de ses enfants.
  return (
    <section className="flex flex-col gap-4 max-w-[880px] mx-auto pt-8 pb-10">
      {echanges.map((e, i) => (
        <div key={i} className="flex flex-col gap-5">
          <MessageIA m={{ role: "user", contenu: e.question }} />
          {e.erreur ? (
            <p className="m-0 text-[12.5px] text-alerte">{e.erreur}</p>
          ) : (
            <>
              {/* La réponse se lit comme partout ailleurs : texte plein, et les
                  deux pouces dessous. Ce qui suit — les outils, les sources —
                  n'existe que dans ce chat-ci. */}
              <MessageIA m={{ role: "assistant", contenu: e.reponse || "" }} question={e.question} surface="marche" dealId={dealId} />
              {e.outils?.length > 0 && (
                <p className="m-0 text-[11px] text-brume">
                  {e.outils.map((o) => `${o.service} · ${o.ok ? `${Math.round(o.ms / 1000)} s` : `échec : ${o.erreur || ""}`}`).join("  ·  ")}
                </p>
              )}
              {e.sources?.length > 0 ? (
                <div>
                  <span className="block font-pill text-[11px] font-semibold uppercase tracking-[.1em] text-brume mb-1">Ce qui a été lu</span>
                  <ul className="m-0 p-0 list-none flex flex-col divide-y divide-relief border-y border-relief">
                    {e.sources.map((s, k) => (
                      <Source key={`${s.indicateur}-${k}`} s={s} />
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="m-0 text-[11px] text-ambre">
                  Aucune source n’a répondu : ce qui précède ne s’appuie sur rien de vérifiable.
                </p>
              )}
            </>
          )}
        </div>
      ))}

      {/* Le composer du dossier, à l'identique. Seul ce qu'il y a derrière change. */}
      <div className={`accueil-wrap sobre ${ecoute ? "voix" : ""}`}>
        <div aria-hidden="true" className="accueil-ring-sage" />
        <div aria-hidden="true" className="accueil-ring"><div className="accueil-beam" /></div>
        <div aria-hidden="true" className="accueil-ring-halo"><div className="accueil-beam" /></div>

        <div className="accueil-composer">
          <textarea
            ref={champ}
            rows={Math.min(4, Math.max(2, texte.split("\n").length))}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && peutEnvoyer) {
                e.preventDefault();
                demander();
              }
            }}
            placeholder={adresse ? `Poser une question sur ${adresse}…` : "Poser une question…"}
            disabled={apercu}
          />
          <div className="accueil-bar">
            <div className="accueil-tools">
              <span ref={boite} className="relative">
                <button
                  type="button"
                  className="accueil-icon"
                  onClick={(e) => {
                    // La place sous le bouton décide du sens : on n'ouvre vers
                    // le haut que s'il y a moins de place en bas, et assez en haut.
                    const r = e.currentTarget.getBoundingClientRect();
                    const dessous = window.innerHeight - r.bottom;
                    setVersLeHaut(dessous < HAUTEUR_MENU && r.top > dessous);
                    setRepertoire((o) => !o);
                  }}
                  aria-expanded={repertoire}
                  aria-haspopup="true"
                  title="Questions courantes — ce que les sources savent réellement rendre"
                  aria-label="Questions courantes"
                >
                  <MessageCircleQuestion className="w-4 h-4" />
                </button>
                {repertoire && <Repertoire onChoisir={choisir} versLeHaut={versLeHaut} />}
              </span>
              <button
                type="button"
                id="accueil-voix"
                aria-pressed={ecoute}
                disabled={apercu}
                onClick={() =>
                  dicteeOk
                    ? ecoute
                      ? arreter()
                      : demarrer()
                    : toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." })
                }
                aria-label={ecoute ? "Arrêter la voix" : "Dicter"} title={ecoute ? "Arrêter la voix" : "Dicter"}
              >
                <span className="dot" />
                <span>Voix</span>
              </button>
            </div>
            <button type="button" className="accueil-send" onClick={() => demander()} disabled={!peutEnvoyer}>
              {enCours ? <PenseeIA etat="searching" taille={20} clair /> : null}
              {enCours ? "Je cherche…" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>

      {enCours && (
        <p className="m-0 text-[11px] text-brume">
          Les outils travaillent — Equimmox ouvre un vrai navigateur, comptez jusqu’à une minute.
        </p>
      )}
    </section>
  );
}

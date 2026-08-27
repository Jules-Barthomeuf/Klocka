import React, { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ComptesGoogle from "@/components/dashboard/ComptesGoogle";
import RapportAuto from "@/components/dashboard/RapportAuto";
import { useConnexionGmail } from "@/components/mails/ConnexionGmail";
import { toast } from "sonner";
import {
  Loader2, Mail, FolderPlus, Briefcase, RefreshCw, Clock, FileWarning, Inbox, MoonStar, Send, X,
  CalendarDays, ExternalLink, ThumbsDown, ChevronDown, KeyRound,
} from "lucide-react";

// Le plan de travail : ce que l'assistant propose de faire, maintenant.
//
// La pile vient du serveur, calculée depuis l'état des dossiers et des mails —
// aucune décision n'est prise par un modèle. Ici on exécute l'action choisie, et
// rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.

const ICONES = {
  mail_a_traiter: Inbox,
  compte_muet: KeyRound,
  reponse_recue: Mail,
  documents_manquants: FileWarning,
  relance_due: Clock,
  engagement_du: Clock,
  projet_a_creer: Briefcase,
  dossier_en_sommeil: MoonStar,
};

// L'urgence se lit au filet de gauche, pas à une pastille de couleur : la même
// grammaire que « Ce qui a échoué », pour que la page se parcoure d'un regard.
const TEINTES = {
  1: { filet: "border-[#c4715c]", icone: "text-[#c4715c]", libelle: "À faire aujourd'hui", label: "text-[#c4715c]" },
  2: { filet: "border-[#d9c08a]", icone: "text-[#d9c08a]", libelle: "Attendu", label: "text-[#d9c08a]" },
  3: { filet: "border-[#4a4844]", icone: "text-[#8b8880]", libelle: "Courant", label: "text-[#8b8880]" },
  4: { filet: "border-[#2f2c29]", icone: "text-[#6f6c66]", libelle: "Plus tard", label: "text-[#6f6c66]" },
};

export default function PlanDeTravail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = useState(null); // { deal_id, intention, objet, corps, destinataire }
  const [enCours, setEnCours] = useState(null); // id de l'action en cours
  const [ouverte, setOuverte] = useState(null); // proposition dépliée
  // Le compte des échecs de la nuit remonte du rapport : l'en-tête doit dire
  // d'un coup d'œil combien de choses attendent et combien ont manqué.
  const [echecs, setEchecs] = useState(0);
  const noterEchecs = useCallback((n) => setEchecs(n), []);

  const { data, isLoading } = useQuery({
    queryKey: ["assistant-propositions"],
    queryFn: () => base44.request("GET", "/api/assistant/propositions"),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;
  const expediteur = (statutMail?.accounts || []).find((c) => c.peut_envoyer)?.id || null;

  const propositions = data?.propositions || [];
  const veille = data?.veille;

  const { data: calendrier } = useQuery({
    queryKey: ["assistant-calendrier"],
    queryFn: () => base44.request("GET", "/api/assistant/calendrier"),
  });
  const compteAgenda = (statutMail?.accounts || []).find((c) => c.peut_agenda)?.id || null;

  const synchroniserAgenda = useMutation({
    mutationFn: () =>
      base44.request("POST", "/api/assistant/calendrier/synchroniser", { body: { compte: compteAgenda } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["assistant-calendrier"] });
      toast.success(r.calendrier_cree ? "Agenda d'équipe créé" : "Agenda à jour", {
        description: [
          `${r.crees} échéance(s) ajoutée(s)`,
          r.majs ? `${r.majs} mise(s) à jour` : null,
          r.partage?.partages?.length ? `partagé avec ${r.partage.partages.length} admin(s)` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (r.partage?.erreurs?.length) {
        toast.warning("Partage incomplet", { description: r.partage.erreurs[0] });
      }
    },
    onError: (e) => toast.error(e?.message || "Synchronisation de l'agenda impossible"),
  });

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });

  // Reconnecter un compte depuis la pile : le serveur relève la boîte dès le
  // consentement accordé, il n'y a donc rien à cliquer ensuite.
  const { connecter: connecterGoogle } = useConnexionGmail(() => {
    queryClient.invalidateQueries({ queryKey: ["mail-status"] });
    rafraichir();
    queryClient.invalidateQueries({ queryKey: ["rapports-auto"] });
    toast.success("Compte reconnecté", { description: "La boîte est relevée dans la foulée." });
  });

  const relever = useMutation({
    mutationFn: () => base44.request("POST", "/api/assistant/relever"),
    onSuccess: (r) => {
      rafraichir();
      const bouts = [
        `${r.nouveaux || 0} mail(s) retenu(s)`,
        r.ecartes ? `${r.ecartes} sans rapport écarté(s)` : null,
        r.rattaches ? `${r.rattaches} rattaché(s) à un dossier` : null,
        r.pieces?.documents ? `${r.pieces.documents} pièce(s) jointe(s) versée(s) au dossier` : null,
        r.pieces?.classes ? `${r.pieces.classes} classée(s) dans le Drive` : null,
        r.pieces?.fiches ? `${r.pieces.fiches} fiche(s) Monday à jour` : null,
      ].filter(Boolean);
      toast.success("Boîtes relevées", { description: bouts.join(" · ") });
      if (r.erreurs?.length) toast.warning(r.erreurs[0]);
    },
    onError: (e) => toast.error(e?.message || "Relève impossible"),
  });

  const envoyer = useMutation({
    mutationFn: () =>
      base44.functions.invoke("sendMail", {
        from: expediteur || undefined,
        to: brouillon.destinataire,
        subject: brouillon.objet,
        body: brouillon.corps,
        deal_id: brouillon.deal_id,
        intention: brouillon.intention,
      }),
    onSuccess: (r) => {
      if (r?.success || r?.simulated) {
        toast.success(r?.simulated ? "Envoi simulé (aucun compte connecté)" : "Mail envoyé");
        setBrouillon(null);
        rafraichir();
      } else toast.error(r?.error || "Envoi impossible");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  // Une proposition traitée se déclare : c'est ce qui permet de savoir, plus
  // tard, lesquelles servent à quelque chose et lesquelles personne ne touche.
  const noterTraitee = (proposition, action) => {
    base44
      .request("POST", "/api/assistant/propositions/traitee", {
        body: {
          type: proposition.type,
          deal_id: proposition.deal_id,
          mail_id: proposition.mail_id,
          id: proposition.id,
          action: action.id,
        },
      })
      .catch(() => {});
  };

  // Chaque mode d'action sait ce qu'il déclenche. Aucun n'envoie de lui-même.
  const executer = async (proposition, action) => {
    const cle = `${proposition.id}:${action.id}`;
    // Ouvrir un dossier n'est pas le traiter : seules les actions comptent.
    if (action.mode === "lien") return navigate(action.href);
    if (action.mode === "google") {
      noterTraitee(proposition, action);
      return connecterGoogle();
    }
    if (action.mode === "externe") noterTraitee(proposition, action);
    if (action.mode === "externe") return window.open(action.href, "_blank", "noopener");

    setEnCours(cle);
    try {
      if (action.mode !== "externe") noterTraitee(proposition, action);
      if (action.mode === "mail") {
        const r = await base44.request("POST", `/api/preanalyse/dossiers/${proposition.deal_id}/mail`, {
          body: { intention: action.intention },
        });
        setBrouillon({
          deal_id: proposition.deal_id,
          intention: action.intention,
          objet: r.objet || "",
          corps: r.corps || "",
          destinataire: r.destinataire || "",
          ia: r.ia,
        });
      } else if (action.mode === "drive") {
        if (!compteDrive) {
          toast.error("Aucun compte Google avec l'accès Drive", {
            description: "Connectez un compte Google autorisant le Drive, ci-dessus.",
          });
        } else {
          const r = await base44.request("POST", `/api/preanalyse/dossiers/${proposition.deal_id}/drive`, {
            body: { compte: compteDrive },
          });
          toast.success("Dossier Drive créé", {
            description: `${r.envoyes?.length || 0} fichier(s) classé(s)`,
          });
          rafraichir();
        }
      } else if (action.mode === "projet") {
        const r = await base44.request("POST", `/api/preanalyse/dossiers/${proposition.deal_id}/lots/0/projet`);
        toast.success(`Projet créé : ${r.titre}`);
        navigate(`/AdminProjets?id=${r.project_id}`);
      } else if (action.mode === "tri") {
        const r = await base44.request("POST", `/api/assistant/mails/${proposition.mail_id}/tri`, {
          body: { decision: action.decision, motif: "écarté depuis le plan de travail" },
        });
        rafraichir();
        // Par défaut on n'écarte que ce mail : l'expéditeur peut très bien
        // envoyer un bon dossier demain. Faire taire l'adresse est un second
        // geste, explicite.
        toast.success("C'est noté", {
          description: `${r.expediteur} continue d'être écouté — ce mail servira d'exemple.`,
          action: {
            label: "Ignorer cet expéditeur",
            onClick: async () => {
              try {
                await base44.request("POST", "/api/assistant/tri-expediteur", {
                  body: {
                    email: r.expediteur,
                    decision: "ignorer",
                    motif: "expéditeur écarté depuis le plan de travail",
                  },
                });
                toast.success(`Plus aucun mail de ${r.expediteur} ne remontera.`);
                rafraichir();
              } catch (err) {
                toast.error(err?.message || "Action impossible");
              }
            },
          },
        });
      } else if (action.mode === "preanalyser") {
        const r = await base44.request("POST", `/api/mails/inbox/${proposition.mail_id}/preanalyser`);
        toast.success("Fiche analysée");
        navigate(`/Analyse?deal_id=${r.deal_id}`);
      }
    } catch (e) {
      toast.error(e?.message || "Action impossible");
    } finally {
      setEnCours(null);
    }
  };

  const maintenant = new Date().toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const REGLE = "h-px bg-[#232120] my-12 max-md:my-9";

  return (
    <div>
      {/* --- En-tête : ce qu'il y a à faire, et combien --------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#8b8880]">
            Équipe Klocka — {maintenant.replace(" à ", ", ")}
          </p>
          <h1 className="m-0 mt-4 text-[46px] max-lg:text-[36px] max-md:text-[28px] font-semibold tracking-[-.025em] leading-[1.05] text-[#f0ece5]">
            Dashboard
          </h1>
        </div>

        <div className="flex items-start gap-10 max-md:gap-7">
          <div className="text-right">
            <p className="m-0 text-[38px] max-md:text-[30px] font-light leading-none text-[#d9c08a]">
              {propositions.length}
            </p>
            <p className="m-0 mt-2.5 text-[10.5px] tracking-[.16em] uppercase text-[#8b8880]">
              Proposition{propositions.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className={`m-0 text-[38px] max-md:text-[30px] font-light leading-none ${echecs ? "text-[#c4715c]" : "text-[#4a4844]"}`}>
              {echecs}
            </p>
            <p className="m-0 mt-2.5 text-[10.5px] tracking-[.16em] uppercase text-[#8b8880]">
              Échec{echecs > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      <div className={REGLE} />

      {veille && !veille.lecture && (
        <p className="mb-9 text-[13.5px] text-[#d9c08a] leading-[1.65] border-l-2 border-[#d9c08a]/60 pl-5">
          La lecture des boîtes Gmail est désactivée : passez <code>GOOGLE_GMAIL_READ=true</code> côté serveur,
          déclarez la portée <code>gmail.readonly</code> chez Google, puis reconnectez les comptes ci-dessous.
          Sans cela, l'assistant ne voit passer aucun mail.
        </p>
      )}

      {/* Ce que la veille a fait seule passe avant le reste : on doit le savoir
          avant de décider quoi faire. */}
      <RapportAuto onCompte={noterEchecs} />

      <div className={REGLE} />

      <ComptesGoogle />

      {calendrier?.actif && (
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#232120] pt-5">
          <CalendarDays className="w-4 h-4 text-[#8b8880] flex-shrink-0" />
          <p className="m-0 text-[13.5px] text-[#8b8880] flex-1 min-w-[240px] leading-[1.5]">
            {calendrier.configure
              ? "Les relances prévues sont reportées dans l'agenda d'équipe."
              : "Un agenda Google partagé peut recevoir les échéances des dossiers."}
          </p>
          {calendrier.lien && (
            <a
              href={calendrier.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#d9c08a] hover:text-[#f0ece5] transition-colors"
            >
              Ouvrir l'agenda <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => synchroniserAgenda.mutate()}
            disabled={!compteAgenda || synchroniserAgenda.isPending}
            title={compteAgenda ? undefined : "Aucun compte Google n'a autorisé l'agenda — reconnectez-le ci-dessus"}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#2f2c29] text-[10.5px] tracking-[.16em] uppercase text-[#b9b5ad] hover:border-[#54504a] disabled:opacity-40 transition-colors"
          >
            {synchroniserAgenda.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {calendrier.configure ? "Mettre à jour" : "Créer l'agenda partagé"}
          </button>
        </div>
      )}

      <div className={REGLE} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 mb-8">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#8b8880]">Propositions</p>
          <p className="m-0 text-[13.5px] text-[#6f6c66]">
            rien ne part sans votre relecture
            {veille?.minutes ? ` · boîtes relevées toutes les ${veille.minutes} minutes` : ""}
          </p>
        </div>
        <button
          onClick={() => relever.mutate()}
          disabled={relever.isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#2f2c29] text-[10.5px] tracking-[.16em] uppercase text-[#b9b5ad] hover:border-[#54504a] disabled:opacity-40 transition-colors"
        >
          {relever.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Relever les boîtes
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#8b8880] animate-spin" />
        </div>
      ) : propositions.length === 0 ? (
        <p className="m-0 py-6 text-[19px] font-light leading-[1.55] text-[#6f6c66]">
          Rien en attente. Les nouveaux mails et les relances dues apparaîtront ici.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-14 gap-y-9 items-start [&>div[data-ouverte=true]]:md:col-span-2 [&>div[data-ouverte=true]]:xl:col-span-3">
          {propositions.map((p) => {
            const Icone = ICONES[p.type] || Inbox;
            const teinte = TEINTES[p.priorite] || TEINTES[3];
            const estOuverte = ouverte === p.id;
            return (
              <div
                key={p.id}
                data-ouverte={estOuverte}
                className={`flex flex-col h-full border-l-2 ${teinte.filet} pl-5 transition-colors`}
              >
                {/* La carte fermée dit la situation ; les actions se méritent
                    d'un clic, pour ne pas transformer la pile en tableau de bord
                    de boutons. */}
                <button
                  onClick={() => setOuverte(estOuverte ? null : p.id)}
                  aria-expanded={estOuverte}
                  className="text-left w-full group"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icone className={`w-3.5 h-3.5 flex-shrink-0 ${teinte.icone}`} />
                    <span className={`text-[10px] tracking-[.16em] uppercase ${teinte.label}`}>{teinte.libelle}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ml-auto text-[#5c5a55] transition-transform ${estOuverte ? "" : "-rotate-90"}`}
                    />
                  </div>

                  <p className="m-0 text-[16.5px] text-[#e8e4dd] leading-snug group-hover:text-[#f0ece5] transition-colors">
                    {p.titre}
                  </p>
                  <p className="m-0 mt-1.5 text-[13px] text-[#8b8880] leading-[1.55]">{p.detail}</p>

                  {!estOuverte && (
                    <p className="m-0 mt-3 text-[12px] text-[#5c5a55]">
                      {p.actions.length} action{p.actions.length > 1 ? "s" : ""} proposée
                      {p.actions.length > 1 ? "s" : ""}
                    </p>
                  )}
                </button>

                {estOuverte && (
                  <div className="mt-4">
                    {/* Sur quoi la proposition se fonde : elle doit pouvoir se
                        discuter, pas seulement s'exécuter. */}
                    {p.contexte?.length > 0 && (
                      <dl className="m-0 mb-5 border-t border-[#232120] pt-3.5 space-y-1.5">
                        {p.contexte.map(([cle, valeur]) => (
                          <div key={cle} className="flex gap-4 text-[12.5px]">
                            <dt className="text-[#6f6c66] w-[130px] flex-shrink-0">{cle}</dt>
                            <dd className="m-0 text-[#b9b5ad] min-w-0 break-words">{valeur}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {p.actions.map((a) => {
                        const cle = `${p.id}:${a.id}`;
                        const occupe = enCours === cle;
                        return (
                          <button
                            key={a.id}
                            onClick={() => executer(p, a)}
                            disabled={!!enCours}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[10.5px] tracking-[.16em] uppercase transition-colors disabled:opacity-40
                              ${a.principal
                                ? "bg-[#d9c08a] text-[#0b0a09] hover:bg-[#e6d0a0]"
                                : "border border-[#2f2c29] text-[#b9b5ad] hover:border-[#54504a]"}`}
                          >
                            {occupe && <Loader2 className="w-3 h-3 animate-spin" />}
                            {a.mode === "mail" && !occupe && <Mail className="w-3 h-3" />}
                            {a.mode === "drive" && !occupe && <FolderPlus className="w-3 h-3" />}
                            {a.mode === "projet" && !occupe && <Briefcase className="w-3 h-3" />}
                            {a.mode === "tri" && !occupe && <ThumbsDown className="w-3 h-3" />}
                            {a.mode === "externe" && !occupe && <ExternalLink className="w-3 h-3" />}
                            {a.mode === "google" && !occupe && <KeyRound className="w-3 h-3" />}
                            {a.libelle}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Brouillon préparé : relu et modifiable avant tout envoi. */}
      {brouillon && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setBrouillon(null)}>
          <div className="w-full max-w-2xl bg-[#0F1116] border border-[#282b2a] rounded-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="m-0 text-[17px] font-medium text-[#edeae5]">Brouillon préparé</h3>
                <p className="m-0 mt-1 text-[12px] text-[#6b7270]">
                  {brouillon.ia === false ? "Texte de secours (IA indisponible)" : "Rédigé par l'assistant"} — relisez avant d'envoyer.
                </p>
              </div>
              <button onClick={() => setBrouillon(null)} className="text-[#8b9391] hover:text-[#edeae5] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-[11px] tracking-[0.14em] uppercase text-[#8b9391] mb-1.5">Destinataire</label>
            <input
              value={brouillon.destinataire}
              onChange={(e) => setBrouillon({ ...brouillon, destinataire: e.target.value })}
              placeholder="adresse@agence.fr"
              className="w-full bg-[#0a0c0c] border border-[#282b2a] focus:border-[#35a79b] rounded-md px-3.5 py-2.5 text-[14px] text-[#edeae5] outline-none transition-colors mb-3"
            />

            <label className="block text-[11px] tracking-[0.14em] uppercase text-[#8b9391] mb-1.5">Objet</label>
            <input
              value={brouillon.objet}
              onChange={(e) => setBrouillon({ ...brouillon, objet: e.target.value })}
              className="w-full bg-[#0a0c0c] border border-[#282b2a] focus:border-[#35a79b] rounded-md px-3.5 py-2.5 text-[14px] text-[#edeae5] outline-none transition-colors mb-3"
            />

            <label className="block text-[11px] tracking-[0.14em] uppercase text-[#8b9391] mb-1.5">Message</label>
            <textarea
              rows={12}
              value={brouillon.corps}
              onChange={(e) => setBrouillon({ ...brouillon, corps: e.target.value })}
              className="w-full bg-[#0a0c0c] border border-[#282b2a] focus:border-[#35a79b] rounded-md px-3.5 py-2.5 text-[13.5px] leading-[1.65] text-[#edeae5] outline-none resize-y transition-colors mb-5"
            />

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setBrouillon(null)}
                className="bg-transparent border border-[#edeae5]/[0.14] text-[#C3C7CE] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#edeae5]/[0.06] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => envoyer.mutate()}
                disabled={!brouillon.destinataire.trim() || !brouillon.objet.trim() || envoyer.isPending}
                className="inline-flex items-center gap-2 text-[#0c0e0d] bg-[#edeae5] rounded-md px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50 hover:brightness-95 transition-all"
              >
                {envoyer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

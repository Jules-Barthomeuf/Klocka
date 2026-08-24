import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Loader2, Mail, FolderPlus, Briefcase, RefreshCw, Clock, FileWarning, Inbox, MoonStar, Send, X,
  CalendarDays, Users, ExternalLink,
} from "lucide-react";

// Le plan de travail : ce que l'assistant propose de faire, maintenant.
//
// La pile vient du serveur, calculée depuis l'état des dossiers et des mails —
// aucune décision n'est prise par un modèle. Ici on exécute l'action choisie, et
// rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.

const ICONES = {
  clients_interesses: Users,
  mail_a_traiter: Inbox,
  reponse_recue: Mail,
  documents_manquants: FileWarning,
  relance_due: Clock,
  projet_a_creer: Briefcase,
  dossier_en_sommeil: MoonStar,
};

const TEINTES = {
  1: { bord: "border-[#e2564d]/40", pastille: "bg-[#e2564d]/15 text-[#e2564d]", libelle: "À faire aujourd'hui" },
  2: { bord: "border-[#e0c9a0]/35", pastille: "bg-[#e0c9a0]/15 text-[#e0c9a0]", libelle: "Attendu" },
  3: { bord: "border-[#242726]", pastille: "bg-[#35a79b]/15 text-[#7fd3c9]", libelle: "Courant" },
  4: { bord: "border-[#242726]", pastille: "bg-[#edeae5]/[0.06] text-[#8b9391]", libelle: "Plus tard" },
};

export default function PlanDeTravail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = useState(null); // { deal_id, intention, objet, corps, destinataire }
  const [enCours, setEnCours] = useState(null); // id de l'action en cours

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

  const relever = useMutation({
    mutationFn: () => base44.request("POST", "/api/assistant/relever"),
    onSuccess: (r) => {
      rafraichir();
      const bouts = [
        `${r.nouveaux || 0} nouveau(x) mail(s)`,
        r.rattaches ? `${r.rattaches} rattaché(s) à un dossier` : null,
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

  // Chaque mode d'action sait ce qu'il déclenche. Aucun n'envoie de lui-même.
  const executer = async (proposition, action) => {
    const cle = `${proposition.id}:${action.id}`;
    if (action.mode === "lien") return navigate(action.href);

    setEnCours(cle);
    try {
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
            description: "Connectez-en un depuis la page Mails.",
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="m-0 text-[30px] max-md:text-[24px] font-light tracking-[-.02em] text-[#edeae5]">Dashboard</h1>
          <p className="mt-2 mb-0 max-w-[62ch] text-[13.5px] leading-[1.65] text-[#9aa19e]">
            Les boîtes mail sont relevées{veille?.minutes ? ` toutes les ${veille.minutes} minutes` : ""} et les
            réponses rattachées à leur dossier. Rien n'est envoyé sans votre relecture.
          </p>
        </div>
        <button
          onClick={() => relever.mutate()}
          disabled={relever.isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-[#303332] text-[13px] text-[#d3d8d6] hover:text-[#edeae5] hover:border-[#565b59] disabled:opacity-50 transition-colors"
        >
          {relever.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Relever les boîtes
        </button>
      </div>

      {veille && !veille.lecture && (
        <p className="mb-4 text-[12.5px] text-[#e0c9a0] leading-[1.6] border border-[#e0c9a0]/25 bg-[#e0c9a0]/[0.06] rounded-md px-4 py-3">
          La lecture des boîtes Gmail est désactivée : passez <code>GOOGLE_GMAIL_READ=true</code> côté serveur,
          déclarez la portée <code>gmail.readonly</code> chez Google, puis reconnectez les comptes depuis la page
          Mails. Sans cela, l'assistant ne voit passer aucun mail.
        </p>
      )}

      {calendrier?.actif && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border border-[#242726] rounded-md px-4 py-3">
          <CalendarDays className="w-4 h-4 text-[#7fd3c9] flex-shrink-0" />
          <p className="m-0 text-[12.5px] text-[#9aa19e] flex-1 min-w-[240px] leading-[1.5]">
            {calendrier.configure
              ? "Les relances prévues sont reportées dans l'agenda d'équipe."
              : "Un agenda Google partagé peut recevoir les échéances des dossiers."}
          </p>
          {calendrier.lien && (
            <a
              href={calendrier.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] text-[#7fd3c9] hover:text-[#edeae5] transition-colors"
            >
              Ouvrir l'agenda <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => synchroniserAgenda.mutate()}
            disabled={!compteAgenda || synchroniserAgenda.isPending}
            title={compteAgenda ? undefined : "Aucun compte Google n'a autorisé l'agenda — reconnectez-le depuis la page Mails"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#303332] text-[12px] text-[#d3d8d6] hover:text-[#edeae5] hover:border-[#565b59] disabled:opacity-50 transition-colors"
          >
            {synchroniserAgenda.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarDays className="w-3 h-3" />}
            {calendrier.configure ? "Mettre à jour" : "Créer l'agenda partagé"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#8b9391] animate-spin" />
        </div>
      ) : propositions.length === 0 ? (
        <p className="border border-[#242726] rounded-md py-12 text-center text-[13.5px] text-[#6b7270] m-0">
          Rien en attente. Les nouveaux mails et les relances dues apparaîtront ici.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 items-start">
          {propositions.map((p) => {
            const Icone = ICONES[p.type] || Inbox;
            const teinte = TEINTES[p.priorite] || TEINTES[3];
            return (
              <div
                key={p.id}
                className={`flex flex-col h-full border ${teinte.bord} rounded-lg bg-[#0c0e0d] p-4 hover:bg-[#edeae5]/[0.02] transition-colors`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${teinte.pastille}`}>
                    <Icone className="w-4 h-4" />
                  </span>
                  <span className={`text-[9.5px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-full ${teinte.pastille}`}>
                    {teinte.libelle}
                  </span>
                </div>

                <p className="m-0 text-[14.5px] text-[#edeae5] font-medium leading-snug">{p.titre}</p>
                <p className="m-0 mt-1.5 text-[12.5px] text-[#9aa19e] leading-[1.6]">{p.detail}</p>

                {/* Les actions restent en bas, alignées d'une carte à l'autre. */}
                <div className="flex flex-wrap items-center gap-2 mt-auto pt-4">
                  {p.actions.map((a) => {
                    const cle = `${p.id}:${a.id}`;
                    const occupe = enCours === cle;
                    return (
                      <button
                        key={a.id}
                        onClick={() => executer(p, a)}
                        disabled={!!enCours}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors disabled:opacity-50
                          ${a.principal
                            ? "bg-[#edeae5] text-[#0c0e0d] font-medium hover:bg-[#d8d5d0]"
                            : "border border-[#303332] text-[#9aa19e] hover:text-[#edeae5] hover:border-[#565b59]"}`}
                      >
                        {occupe && <Loader2 className="w-3 h-3 animate-spin" />}
                        {a.mode === "mail" && !occupe && <Mail className="w-3 h-3" />}
                        {a.mode === "drive" && !occupe && <FolderPlus className="w-3 h-3" />}
                        {a.mode === "projet" && !occupe && <Briefcase className="w-3 h-3" />}
                        {a.libelle}
                      </button>
                    );
                  })}
                </div>
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

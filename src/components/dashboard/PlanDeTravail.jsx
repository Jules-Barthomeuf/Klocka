import React, { useCallback, useRef, useState } from "react";
import RelancesEnAttente from "./RelancesEnAttente";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ComptesGoogle from "@/components/dashboard/ComptesGoogle";
import RapportAuto from "@/components/dashboard/RapportAuto";
import { useConnexionGmail } from "@/components/mails/ConnexionGmail";
import { toast } from "sonner";
import { useUser } from "@/components/providers/UserProvider";
import { UserPlus,
  Loader2, Mail, FolderPlus, Briefcase, RefreshCw, Clock, FileWarning, Inbox, MoonStar, Send, X,
  CalendarDays, ExternalLink, ThumbsDown, ChevronDown, KeyRound,
} from "lucide-react";

// Le plan de travail : ce que l'assistant propose de faire, maintenant.
//
// La pile vient du serveur, calculée depuis l'état des dossiers et des mails —
// aucune décision n'est prise par un modèle. Ici on exécute l'action choisie, et
// rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.


// L'urgence se lit au filet de gauche, pas à une pastille de couleur : la même
// grammaire que « Ce qui a échoué », pour que la page se parcoure d'un regard.

// Une phrase d'accueil, tirée au sort à chaque venue, avec le prénom — et à
// l'heure : « Bonjour » jusqu'à 18 h, « Bonsoir » ensuite, jamais l'inverse.
const SALUTS = (p, heure) => [
  heure >= 18 || heure < 5 ? `Bonsoir ${p}` : `Bonjour ${p}`,
  "Je vous écoute", `À vous, ${p}`, "Je suis prêt", `On y va, ${p}`, "Dites-moi tout", `De retour, ${p}`, "Prêt quand vous voulez", "On reprend\u202f?",
];

export default function PlanDeTravail({ chat = null }) {
  const utilisateur = useUser();
  const prenom = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const [salut] = useState(() => { const l = SALUTS(prenom ? prenom.charAt(0).toUpperCase() + prenom.slice(1) : "Jules", new Date().getHours()); return l[Math.floor(Math.random() * l.length)]; });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Le compte des échecs de la nuit remonte du rapport : l'en-tête doit dire
  // d'un coup d'œil combien de choses attendent et combien ont manqué.
  const [echecs, setEchecs] = useState(0);
  const noterEchecs = useCallback((n) => setEchecs(n), []);


  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;
  const expediteur = (statutMail?.accounts || []).find((c) => c.peut_envoyer)?.id || null;




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



  // Une proposition traitée se déclare : c'est ce qui permet de savoir, plus
  // tard, lesquelles servent à quelque chose et lesquelles personne ne touche.

  const { data: sante } = useQuery({ queryKey: ["sante"], queryFn: () => base44.request("GET", "/api/health"), staleTime: 60000 });
  const fichierSauvegardeRef = useRef(null);
  const restaurerSauvegarde = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const form = new FormData();
      form.append("fichier", f);
      const r = await base44.request("POST", "/api/admin/sauvegarde", { body: form, isForm: true });
      toast.success("Sauvegarde restaurée", { description: `${r.records} enregistrements ramenés` });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(err?.message || "Restauration impossible");
    }
  };


  const maintenant = new Date().toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const REGLE = "h-px bg-[#1f2228] my-12 max-md:my-9";

  return (
    <div>
      <input ref={fichierSauvegardeRef} type="file" accept=".json" className="hidden" onChange={restaurerSauvegarde} />
      {/* --- En-tête --------------------------------------------------------- */}
      {/* On arrive sur une question, pas sur un tableau : le chat au centre,
          un halo menthe derrière, les gestes courants juste en dessous. */}
      {/* L'accueil : un salut en italique, deux halos sauge, le chat au centre. */}
      <header className="accueil relative text-center pt-[10vh] max-md:pt-6">
        <div aria-hidden="true" className="accueil-halo-a" />
        <div aria-hidden="true" className="accueil-halo-b" />
        <p className="relative m-0 text-[11px] tracking-[.16em] uppercase text-[#5c646b]" style={{ fontFamily: "Figtree, sans-serif" }}>
          Équipe Klocka — {maintenant.replace(" à ", ", ")}
        </p>
        <h1 className="relative m-0 mt-5 text-[40px] max-md:text-[30px] font-normal italic tracking-[-.01em] leading-[1.1] text-white" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
          {salut}
        </h1>
      </header>

      {/* Le stockage, tant qu'il n'est pas sûr : on ne découvre pas la perte après coup. */}
      {sante?.hebergeur === "render" && !sante?.base?.persistante && (
        <div className="mt-8 border rounded-xl px-5 py-4" style={{ borderColor: "#e8746a66", background: "#0f1114" }}>
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#e8746a]">La base sera effacée au prochain déploiement</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-[#c9cdd6]">{sante.base?.diagnostic}</p>
          <p className="m-0 mt-1.5 text-[12px] text-[#6a7180]">
            Chemin : {sante.base?.emplacement} · déclaré : {sante.base?.declaree ? "oui" : "non"} · disque monté : {sante.base?.disque_monte ? "oui" : "non"}
          </p>
        </div>
      )}

      {/* Le chat, centré et pas plus large qu'une page : on le lit d'un regard. */}
      {chat && <div className="relative mt-11 max-md:mt-8 max-w-[900px] mx-auto">{chat}</div>}

      <div className={REGLE} />

      {/* Ce qui attend : la note d'appel écrit dans Monday, le tableau de bord relit. */}
      <RelancesEnAttente />

      <div className={REGLE} />


      {/* Ce que la veille a fait seule passe avant le reste : on doit le savoir
          avant de décider quoi faire. */}
      <RapportAuto onCompte={noterEchecs} />

      <div className={REGLE} />

      <ComptesGoogle />

      {calendrier?.actif && (
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#1f2228] pt-5">
          <CalendarDays className="w-4 h-4 text-[#9298a6] flex-shrink-0" />
          <p className="m-0 text-[13.5px] text-[#9298a6] flex-1 min-w-[240px] leading-[1.5]">
            {calendrier.configure
              ? "Les relances prévues sont reportées dans l'agenda d'équipe."
              : "Un agenda Google partagé peut recevoir les échéances des dossiers."}
          </p>
          {calendrier.lien && (
            <a
              href={calendrier.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#96c0b8] hover:text-[#ffffff] transition-colors"
            >
              Ouvrir l'agenda <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => synchroniserAgenda.mutate()}
            disabled={!compteAgenda || synchroniserAgenda.isPending}
            title={compteAgenda ? undefined : "Aucun compte Google n'a autorisé l'agenda — reconnectez-le ci-dessus"}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#22262d] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a] disabled:opacity-40 transition-colors"
          >
            {synchroniserAgenda.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {calendrier.configure ? "Mettre à jour" : "Créer l'agenda partagé"}
          </button>
        </div>
      )}

      <div className={REGLE} />

      {/* --- La base s'emporte : avant de déployer, on la télécharge ; après, on la ramène. --- */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="m-0 text-[13.5px] text-[#6a7180]">
          Sauvegarde de la base — emportez-la avant de déployer, ramenez-la après.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/sauvegarde"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#22262d] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a] transition-colors"
          >
            Télécharger
          </a>
          <button
            onClick={() => fichierSauvegardeRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#22262d] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a] transition-colors"
          >
            Restaurer
          </button>
        </div>
      </div>
    </div>
  );
}

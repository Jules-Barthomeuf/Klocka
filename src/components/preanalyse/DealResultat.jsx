import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Archive, Check, ChevronDown, ChevronUp, Loader2, MapPin, Quote, Send, X,
} from "lucide-react";
import { toast } from "sonner";
import SimulateurRapide from "@/components/preanalyse/SimulateurRapide";
import CarteGoogle from "@/components/CarteGoogle";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";

// Bibliothèque partagée du workflow d'analyse : verdicts, statuts, carte d'un
// lot, dialogue de mail d'intention, journal de suivi. Consommée par
// WorkflowDeal (la page Analyse) et PipelineDeals (la liste des deals).

export const VERDICTS = {
  "GO": { classe: "bg-[#35a79b]/15 text-[#7fd3c9] border-[#35a79b]/30", bord: "border-[#35a79b]/40" },
  "GO SOUS RÉSERVE": { classe: "bg-[#e0c9a0]/15 text-[#e0c9a0] border-[#e0c9a0]/30", bord: "border-[#e0c9a0]/30" },
  "INSUFFISANT": { classe: "bg-sky-500/15 text-sky-300 border-sky-500/30", bord: "border-sky-500/30" },
  "NO-GO": { classe: "bg-red-500/15 text-red-300 border-red-500/30", bord: "border-red-500/30" },
};

export const STATUTS_DEAL = {
  analyse: { libelle: "Analysé", classe: "bg-[#edeae5]/10 text-[#d3d8d6] border-[#edeae5]/20" },
  documents_demandes: { libelle: "Docs demandés", classe: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  documents_recus: { libelle: "Docs reçus", classe: "bg-[#e0c9a0]/15 text-[#e0c9a0] border-[#e0c9a0]/30" },
  depouille: { libelle: "Dépouillé", classe: "bg-[#35a79b]/15 text-[#7fd3c9] border-[#35a79b]/30" },
  abandonne: { libelle: "Abandonné", classe: "bg-red-500/15 text-red-300 border-red-500/30" },
  projet_cree: { libelle: "Projet créé", classe: "bg-[#35a79b]/20 text-[#7fd3c9] border-[#35a79b]/40" },
};

const EMPLACEMENTS = [
  { code: "n1", libelle: "N°1" },
  { code: "n1_bis", libelle: "N°1 bis" },
  { code: "intermediaire", libelle: "Intermédiaire" },
  { code: "secondaire", libelle: "Secondaire" },
];

const CHAMPS_AFFICHES = [
  ["adresse", "Adresse"],
  ["type_actif", "Type d'actif"],
  ["surface_m2", "Surface"],
  ["prix_fai", "Prix FAI"],
  ["honoraires_inclus", "Honoraires inclus"],
  ["montant_honoraires", "Montant honoraires"],
  ["loyer_annuel_ht_hc", "Loyer annuel HT HC"],
  ["rendement_annonce", "Rendement annoncé"],
  ["locataire_nom", "Locataire"],
  ["locataire_activite", "Activité"],
  ["bail_type", "Type de bail"],
  ["bail_echeance", "Échéance du bail"],
  ["occupe", "Occupé"],
];

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

function afficherValeur(champ, valeur) {
  if (valeur == null) return "—";
  if (champ === "adresse") {
    return [valeur.rue, [valeur.code_postal, valeur.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  if (champ === "surface_m2") return `${valeur} m²`;
  if (champ === "rendement_annonce") return `${valeur} %`;
  if (["prix_fai", "loyer_annuel_ht_hc", "montant_honoraires"].includes(champ)) return euros(valeur);
  return String(valeur);
}

export function Bandeau({ type, items }) {
  const styles =
    type === "alerte"
      ? "border-[#e0c9a0]/25 bg-[#e0c9a0]/10 text-amber-200/90"
      : "border-[#edeae5]/10 bg-[#edeae5]/[0.03] text-[#9aa19e]";
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${styles}`}>
      {items.map((t, i) => (
        <p key={i} className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogue de mail d'intention : brouillon généré, éditable, avec expéditeur.
// ---------------------------------------------------------------------------

const TITRES_INTENTION = {
  refus: "Mail de refus à l'agent",
  demande_documents: "Demande de documents à l'agent",
  relance: "Relance de l'agent",
  abandon: "Mail d'abandon à l'agent",
  presentation_client: "Mail de présentation client",
  complement: "Mail de relance à l'agent",
};

// Raisons d'abandon proposées en un clic ; le texte libre reste possible.
const RAISONS_ABANDON = [
  "Rendement insuffisant",
  "Prix au-dessus du marché",
  "Travaux trop lourds",
  "Vacance locative",
  "Copropriété fragile",
  "Zone peu tendue",
];

// Ce que l'envoi déclenche côté pipeline, affiché sous le brouillon pour que
// la conséquence soit lisible avant de cliquer.
const EFFETS_INTENTION = {
  refus: "Statut → Abandonné. Le deal alimente la base de données marché puis part aux archives.",
  demande_documents: "Statut → Documents en attente. Relance automatique programmée à J+7.",
  relance: "La prochaine relance est reprogrammée à J+7.",
  abandon: "Statut → Abandonné. Le deal alimente la base de données marché puis part aux archives.",
  presentation_client: "Décision actée. L'étape Plateforme s'ouvre pour créer le projet.",
};

export function DialogMailIntention({ dossier, intention, mailInitial, onClose, onDone, onArchiverSansMail }) {
  const [objet, setObjet] = useState(mailInitial?.objet || "");
  const [corps, setCorps] = useState(mailInitial?.corps || "");
  const [destinataire, setDestinataire] = useState(dossier.contact_agent_email || "");
  const [expediteur, setExpediteur] = useState(
    () => localStorage.getItem("klocka:dernier-expediteur") || ""
  );
  const [raisons, setRaisons] = useState("");
  const [raisonsChoisies, setRaisonsChoisies] = useState([]);
  // Le mail d'abandon attend d'abord les raisons ; les autres se génèrent seuls.
  const [etape, setEtape] = useState(intention === "abandon" && !mailInitial ? "raisons" : "brouillon");

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const comptes = statutMail?.accounts || [];

  const generer = useMutation({
    mutationFn: (params) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/mail`, {
        body: { intention, lot_index: 0, ...params },
      }),
    onSuccess: (r) => {
      setObjet(r.objet || "");
      setCorps(r.corps || "");
      if (r.destinataire && !destinataire) setDestinataire(r.destinataire);
      setEtape("brouillon");
    },
    onError: (e) => toast.error(e?.message || "Génération impossible"),
  });

  // Génération automatique à l'ouverture (sauf abandon qui attend les raisons,
  // et sauf brouillon déjà fourni).
  useEffect(() => {
    if (!mailInitial && etape === "brouillon" && !corps && !generer.isPending) {
      generer.mutate({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const envoyer = useMutation({
    mutationFn: (depuis) =>
      base44.functions.invoke("sendMail", {
        from: depuis || expediteur || undefined,
        to: destinataire,
        subject: objet,
        body: corps,
        deal_id: dossier.deal_id,
        intention,
      }),
    onSuccess: (r) => {
      if (r?.success) {
        toast.success("Mail envoyé");
        onDone?.();
      } else if (r?.simulated) {
        toast.info("Aucun compte expéditeur connecté : envoi simulé, le suivi avance quand même.");
        onDone?.();
      } else {
        toast.error(r?.error || "Envoi impossible");
      }
    },
  });

  // Sans boîte connectée, « Envoyer » ouvre d'abord la connexion Gmail : le
  // brouillon reste à l'écran et l'envoi part dès que la boîte est rattachée.
  const { connecter, enCours: connexionEnCours } = useConnexionGmail((email) => {
    setExpediteur(email);
    localStorage.setItem("klocka:dernier-expediteur", email);
    envoyer.mutate(email);
  });
  const sansCompte = comptes.length === 0;
  const googleConfigure = statutMail?.google?.enabled !== false;
  // Deal de test : l'envoi est simulé côté serveur, aucune boîte requise.
  const test = !!dossier.test;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITRES_INTENTION[intention] || "Mail à l'agent"}</DialogTitle>
        </DialogHeader>

        {etape === "raisons" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-[#9aa19e] text-xs mb-2 block">
                Raisons de l'abandon (reformulées professionnellement dans le mail)
              </Label>
              <div className="flex flex-wrap gap-[7px] mb-3">
                {RAISONS_ABANDON.map((r) => {
                  const choisie = raisonsChoisies.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setRaisonsChoisies((prev) =>
                          choisie ? prev.filter((x) => x !== r) : [...prev, r]
                        )
                      }
                      className={`px-3 py-[6px] rounded text-[11.5px] border transition-colors ${
                        choisie
                          ? "border-[#e2564d] text-[#e2564d] bg-[#e2564d]/10"
                          : "border-[#303332] text-[#9aa19e] hover:border-[#e2564d]/60"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={raisons}
                onChange={(e) => setRaisons(e.target.value)}
                rows={3}
                placeholder="Précisions libres — ex : travaux de toiture votés en AG non provisionnés, loyer 30 % au-dessus du marché…"
                className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
              />
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5">
                Annuler
              </Button>
              <Button
                onClick={() =>
                  generer.mutate({ raisons: [...raisonsChoisies, raisons.trim()].filter(Boolean).join(" ; ") })
                }
                disabled={(!raisons.trim() && raisonsChoisies.length === 0) || generer.isPending}
                className="bg-[#35a79b] hover:bg-[#2f8d84] text-[#0a0c0c]"
              >
                {generer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Rédiger le mail
              </Button>
            </DialogFooter>
          </div>
        ) : generer.isPending ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 text-[#35a79b] animate-spin mx-auto mb-3" />
            <p className="text-[#9aa19e] text-sm">Rédaction du mail…</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {comptes.length > 0 && (
                <div>
                  <Label className="text-[#9aa19e] text-xs mb-1.5 block">Envoyer depuis</Label>
                  <Select
                    value={expediteur || comptes[0]?.id}
                    onValueChange={(v) => {
                      setExpediteur(v);
                      localStorage.setItem("klocka:dernier-expediteur", v);
                    }}
                  >
                    <SelectTrigger className="bg-[#171918] border-[#282b2a] text-[#edeae5]">
                      <SelectValue placeholder="Choisir un compte" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5]">
                      {comptes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name ? `${c.name} — ${c.id}` : c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {sansCompte && !test && (
                <EncartConnexionGmail
                  googleConfigure={googleConfigure}
                  onConnecte={(email) => {
                    setExpediteur(email);
                    localStorage.setItem("klocka:dernier-expediteur", email);
                  }}
                />
              )}
              <div>
                <Label className="text-[#9aa19e] text-xs mb-1.5 block">Destinataire</Label>
                <Input
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
                  placeholder="agent@agence.fr"
                  className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
                />
              </div>
              <div>
                <Label className="text-[#9aa19e] text-xs mb-1.5 block">Objet</Label>
                <Input value={objet} onChange={(e) => setObjet(e.target.value)} className="bg-[#171918] border-[#282b2a] text-[#edeae5]" />
              </div>
              <div>
                <Label className="text-[#9aa19e] text-xs mb-1.5 block">Corps</Label>
                <Textarea
                  value={corps}
                  onChange={(e) => setCorps(e.target.value)}
                  rows={12}
                  className="bg-[#171918] border-[#282b2a] text-[#edeae5] leading-relaxed"
                />
              </div>
              {EFFETS_INTENTION[intention] && (
                <p className="text-[11.5px] text-[#6b7270] border-t border-[#242726] pt-3">
                  À l'envoi : {EFFETS_INTENTION[intention]}
                </p>
              )}
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5">
                <X className="w-4 h-4 mr-1.5" /> Fermer
              </Button>
              <Button
                onClick={() => (sansCompte && googleConfigure && !test ? connecter() : envoyer.mutate())}
                disabled={
                  !destinataire.trim() || !objet.trim() || !corps.trim() || envoyer.isPending || connexionEnCours
                }
                className="bg-[#35a79b] hover:bg-[#2f8d84] text-[#0a0c0c] font-medium"
              >
                {envoyer.isPending || connexionEnCours ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {test ? "Envoyer (simulé)" : sansCompte && googleConfigure ? "Connecter Gmail et envoyer" : "Envoyer"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Journal de suivi
// ---------------------------------------------------------------------------

const LIBELLES_SUIVI = {
  analyse: "Analyse",
  statut: "Statut",
  mail_envoye: "Mail envoyé",
  relance: "Relance",
  documents_recus: "Documents",
  abandon: "Abandon",
  projet_cree: "Projet",
};

export function JournalSuivi({ suivi }) {
  if (!suivi?.length) return null;
  return (
    <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4">
      <p className="text-[#9aa19e] text-xs mb-3">Historique du dossier</p>
      <div className="space-y-2">
        {[...suivi].reverse().map((e, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <span className="text-[#6b7270] w-32 flex-shrink-0">
              {new Date(e.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <Badge className="bg-[#edeae5]/5 text-[#9aa19e] border-[#edeae5]/10 text-[10px] flex-shrink-0">
              {LIBELLES_SUIVI[e.type] || e.type}
            </Badge>
            <span className="text-[#9aa19e] min-w-0">
              {e.detail}
              {e.intention ? ` (${e.intention.replace(/_/g, " ")})` : ""}
              {e.destinataire ? ` → ${e.destinataire}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte d'un lot analysé (extraite d'AnalyseAnnonces)
// ---------------------------------------------------------------------------

export function CarteLot({ lot, dossier, onSaisie, enCours, apercu = false }) {
  // Ouvert d'emblée, sur la carte : situer le bien est le premier réflexe.
  const [ongletsOuverts, setOngletsOuverts] = useState(true);
  const [mailOuvert, setMailOuvert] = useState(false);
  const v = VERDICTS[lot.evaluation.verdict] || {};
  const aem = lot.evaluation.aem;
  const enr = lot.enrichissement;

  return (
    <div className={`bg-[#0a0c0c] border rounded-md overflow-hidden ${v.bord || "border-[#242726]"}`}>
      {/* En-tête */}
      <div className="p-5 border-b border-[#242726]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            {lot.intitule && <p className="text-[#8b9391] text-xs mb-1">{lot.intitule}</p>}
            <h3 className="text-[#edeae5] font-medium leading-snug">{lot.synthese?.titre || "Lot"}</h3>
          </div>
          <Badge className={`${v.classe} flex-shrink-0`}>{lot.evaluation.verdict}</Badge>
        </div>

        <p className="text-[#9aa19e] text-sm leading-relaxed">{lot.synthese?.synthese}</p>

        {lot.evaluation.profil && (
          <p className="text-[#7fd3c9] text-xs mt-2">Profil : {lot.evaluation.profil.libelle}</p>
        )}

        {lot.evaluation.reserves?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lot.evaluation.reserves.map((r) => (
              <li key={r.id} className="text-[#e0c9a0]/80 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                {r.motif}
              </li>
            ))}
          </ul>
        )}

        {lot.mail_agent && (
          <Button
            onClick={() => !apercu && setMailOuvert(true)}
            disabled={apercu}
            size="sm"
            className="mt-4 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-0"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Mail de relance à l'agent
          </Button>
        )}
      </div>

      {/* Rendement : annoncé vs AEM */}
      {aem && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#242726] border-b border-[#242726]">
          <Metrique label="Prix FAI" valeur={euros(aem.prix_fai)} />
          <Metrique label="Prix AEM" valeur={euros(aem.prix_aem)} accent sousTitre={`+${euros(aem.surcout_vs_fai)}`} />
          <Metrique label="Rendement annoncé" valeur={aem.rendement_fai != null ? `${aem.rendement_fai} %` : "—"} />
          <Metrique label="Rendement AEM" valeur={aem.rendement_aem != null ? `${aem.rendement_aem} %` : "—"} accent />
        </div>
      )}

      {/* Emplacement : saisie humaine */}
      <div className="px-5 py-4 border-b border-[#242726]">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-[#8b9391]" />
          <span className="text-[#9aa19e] text-xs">Emplacement — qualification humaine</span>
          {enr?.emplacement === "a_qualifier" && (
            <Badge className="bg-[#e0c9a0]/15 text-[#e0c9a0] border-[#e0c9a0]/25 text-[10px]">à qualifier</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {EMPLACEMENTS.map((e) => (
            <button
              key={e.code}
              disabled={apercu || enCours}
              onClick={() => onSaisie?.({ emplacement: e.code })}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-50 ${
                enr?.emplacement === e.code
                  ? "bg-[#35a79b]/20 border-[#35a79b]/40 text-[#7fd3c9]"
                  : "border-[#edeae5]/10 text-[#9aa19e] hover:border-[#edeae5]/25 hover:text-[#edeae5]"
              }`}
            >
              {e.code === enr?.emplacement && <Check className="w-3 h-3 inline mr-1" />}
              {e.libelle}
            </button>
          ))}
          {enr?.commune && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [lot.lot.adresse?.valeur?.rue, enr.commune.nom].filter(Boolean).join(", ")
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs border border-[#edeae5]/10 text-[#8b9391] hover:text-[#edeae5] hover:border-[#edeae5]/25 ml-auto"
            >
              Voir sur la carte
            </a>
          )}
        </div>
      </div>

      {/* Simulateur pré-rempli */}
      <div className="px-5 py-5 border-b border-[#242726]">
        <p className="text-[#9aa19e] text-xs mb-3">Simulateur — pré-rempli avec ce dossier</p>
        <SimulateurRapide parametres={lot.simulateur} />
      </div>

      {/* Détail */}
      <button
        onClick={() => setOngletsOuverts((o) => !o)}
        className="w-full px-5 py-3 flex items-center justify-between text-[#8b9391] hover:text-[#edeae5] text-xs transition-colors"
      >
        <span>Détail de l'extraction et de l'enrichissement</span>
        {ongletsOuverts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {ongletsOuverts && (
        <div className="px-5 pb-5">
          <Tabs defaultValue="carte">
            <TabsList className="bg-[#0a0c0c] border border-[#282b2a] mb-4">
              <TabsTrigger value="extraction">Données extraites</TabsTrigger>
              <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
              <TabsTrigger value="calcul">Calcul AEM</TabsTrigger>
              <TabsTrigger value="carte">Carte</TabsTrigger>
              {lot.contexte_marche && <TabsTrigger value="marche">Marché local</TabsTrigger>}
            </TabsList>

            <TabsContent value="extraction">
              {lot.incidents_garde_fou?.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                  <p className="text-red-300 text-xs font-medium mb-1">
                    {lot.incidents_garde_fou.length} valeur(s) rejetée(s) par le garde-fou
                  </p>
                  {lot.incidents_garde_fou.map((i, k) => (
                    <p key={k} className="text-red-300/70 text-[11px]">
                      {i.champ} : {i.motif}
                      {i.valeur_rejetee != null && ` (valeur écartée : ${JSON.stringify(i.valeur_rejetee)})`}
                    </p>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {CHAMPS_AFFICHES.map(([champ, libelle]) => {
                  const c = lot.lot[champ];
                  const absent = !c || c.absent;
                  return (
                    <div key={champ} className="flex items-start gap-3 py-1.5 border-b border-[#232625]">
                      <span className="text-[#8b9391] text-xs w-40 flex-shrink-0">{libelle}</span>
                      <span className={`text-xs flex-1 ${absent ? "text-[#6b7270] italic" : "text-[#edeae5]"}`}>
                        {absent ? "non renseigné dans la fiche" : afficherValeur(champ, c.valeur)}
                      </span>
                      {!absent && c.citation && (
                        <span
                          title={c.citation}
                          className="text-[#6b7270] text-[11px] flex items-center gap-1 max-w-[45%] truncate cursor-help"
                        >
                          <Quote className="w-3 h-3 flex-shrink-0" />
                          {c.citation}
                        </span>
                      )}
                      {!absent && c.confiance === "basse" && (
                        <Badge className="bg-[#e0c9a0]/15 text-[#e0c9a0] border-[#e0c9a0]/25 text-[10px]">
                          confiance basse
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="enrichissement">
              <div className="space-y-1 text-xs">
                <LigneDetail label="Commune" valeur={enr?.commune ? `${enr.commune.nom} (${enr.commune.code_insee})` : "non résolue"} />
                <LigneDetail label="Population" valeur={enr?.commune?.population?.toLocaleString("fr-FR") ?? "—"} />
                <LigneDetail label="Typologie" valeur={enr?.typologie_ville ?? "—"} />
                <LigneDetail
                  label="Ville riche"
                  valeur={enr?.ville_riche === null ? "inconnu (revenu médian non renseigné)" : enr?.ville_riche ? "oui" : "non"}
                />
                <LigneDetail label="Paris" valeur={enr?.paris ? "oui" : "non"} />
                <LigneDetail
                  label="Signature"
                  valeur={`${enr?.signature?.niveau ?? "—"} (${enr?.signature?.source ?? "—"}, confiance ${enr?.signature?.confiance ?? "—"})`}
                />
                <LigneDetail label="Activité" valeur={`${enr?.activite?.libelle ?? "—"}${enr?.activite?.exclue ? " — EXCLUE" : ""}`} />
                <LigneDetail label="Emplacement" valeur={enr?.emplacement ?? "—"} />
              </div>
              {enr?.signature?.a_valider && (
                <ValidationEnseigne nom={lot.lot.locataire_nom?.valeur} signature={enr.signature} apercu={apercu} />
              )}
            </TabsContent>

            <TabsContent value="calcul">
              {aem ? (
                <div className="space-y-1 text-xs">
                  <LigneDetail label="Prix FAI" valeur={euros(aem.prix_fai)} />
                  <LigneDetail label={`Honoraires agence (${aem.taux.commission_agent} %)`} valeur={euros(aem.honoraires_agence)} />
                  <LigneDetail label="Prix hors droits" valeur={euros(aem.prix_hors_droits)} />
                  <LigneDetail label={`Droits d'enregistrement (${aem.taux.droits_enregistrement} %)`} valeur={euros(aem.droits_enregistrement)} />
                  <LigneDetail label={`Honoraires Klocka (${aem.taux.fees_klocka} %)`} valeur={euros(aem.fees_klocka)} />
                  <LigneDetail label="Frais divers" valeur={euros(aem.frais_divers)} />
                  <LigneDetail label="Prix AEM (prix de revient)" valeur={euros(aem.prix_aem)} fort />
                  <LigneDetail label="Écart vs prix FAI" valeur={`+ ${euros(aem.surcout_vs_fai)}`} />
                </div>
              ) : (
                <p className="text-[#8b9391] text-xs">Calcul impossible : prix ou loyer manquant.</p>
              )}
            </TabsContent>

            <TabsContent value="carte">
              <CarteGoogle
                adresse={
                  lot.lot.adresse?.valeur?.rue
                    ? [lot.lot.adresse.valeur.rue, lot.lot.adresse.valeur.code_postal, lot.lot.adresse.valeur.ville]
                        .filter(Boolean)
                        .join(", ")
                    : null
                }
                lat={enr?.commune?.centre?.lat}
                lon={enr?.commune?.centre?.lon}
              />
            </TabsContent>

            {lot.contexte_marche && (
              <TabsContent value="marche">
                <div className="space-y-3">
                  <p className="text-[#d3d8d6] text-sm leading-relaxed whitespace-pre-wrap">
                    {lot.contexte_marche.resume}
                  </p>
                  {lot.contexte_marche.sources?.length > 0 && (
                    <div>
                      <p className="text-[#8b9391] text-xs mb-1.5">Sources consultées :</p>
                      <ul className="space-y-1">
                        {lot.contexte_marche.sources.map((s, i) => (
                          <li key={i}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#7fd3c9] hover:text-[#edeae5] text-xs underline underline-offset-2 transition-colors"
                            >
                              {s.titre}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[#6b7270] text-[11px]">
                    Généré avec recherche web — à vérifier avant décision. Ce contexte n'entre pas dans le
                    verdict.
                  </p>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      {mailOuvert && (
        <DialogMailIntention
          dossier={dossier}
          intention="complement"
          mailInitial={lot.mail_agent}
          onClose={() => setMailOuvert(false)}
          onDone={() => setMailOuvert(false)}
        />
      )}
    </div>
  );
}

function Metrique({ label, valeur, sousTitre, accent }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[#8b9391] text-[11px] mb-1">{label}</p>
      <p className={`text-lg font-light ${accent ? "text-[#7fd3c9]" : "text-[#edeae5]"}`}>{valeur}</p>
      {sousTitre && <p className="text-[#6b7270] text-[11px]">{sousTitre}</p>}
    </div>
  );
}

function LigneDetail({ label, valeur, fort }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[#232625]">
      <span className="text-[#8b9391]">{label}</span>
      <span className={fort ? "text-[#7fd3c9]" : "text-[#edeae5]"}>{valeur}</span>
    </div>
  );
}

function ValidationEnseigne({ nom, signature, apercu }) {
  const [fait, setFait] = useState(false);
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", "/api/preanalyse/enseignes", { body: { nom, niveau: signature.niveau } }),
    onSuccess: (r) => {
      if (r?.success) {
        setFait(true);
        toast.success("Enseigne ajoutée au référentiel");
      } else toast.error(r?.error || "Ajout impossible");
    },
  });

  if (fait) return <p className="text-[#7fd3c9] text-xs mt-3">Enseigne ajoutée au référentiel.</p>;

  return (
    <div className="mt-3 rounded-lg border border-[#e0c9a0]/25 bg-[#e0c9a0]/10 px-3 py-2.5">
      <p className="text-amber-200/90 text-xs mb-1">
        « {nom} » est absente du référentiel. Qualification proposée par l'IA : <strong>{signature.niveau}</strong>.
      </p>
      {signature.justification && <p className="text-amber-200/60 text-[11px] mb-2">{signature.justification}</p>}
      <Button
        size="sm"
        onClick={() => enregistrer.mutate()}
        disabled={apercu || enregistrer.isPending}
        className="bg-[#e0c9a0]/20 hover:bg-[#e0c9a0]/30 text-amber-200 border-0 h-7 text-xs"
      >
        Valider et ajouter au référentiel
      </Button>
    </div>
  );
}

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
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import ClientsCorrespondants from "@/components/admin/ClientsCorrespondants";
import CarteGoogle from "@/components/CarteGoogle";
import PlongeeCarte from "@/components/projet/PlongeeCarte";
import StreetViewRue from "@/components/projet/StreetViewRue";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";

// Bibliothèque partagée du workflow d'analyse : verdicts, statuts, carte d'un
// lot, dialogue de mail d'intention, journal de suivi. Consommée par
// WorkflowDeal (la page Analyse) et PipelineDeals (la liste des deals).

// Les clés sont les valeurs du moteur de règles (invariant serveur) ; seuls
// les libellés affichés changent — un langage de comité, pas de jargon GO/NO-GO.
export const VERDICTS = {
  "GO": { libelle: "Validé", classe: "bg-[#96c0b8]/15 text-[#c3ddd6] border-[#96c0b8]/30", bord: "border-[#96c0b8]/40" },
  "GO SOUS RÉSERVE": { libelle: "Validé sous conditions", classe: "bg-[#96c0b8]/15 text-[#96c0b8] border-[#96c0b8]/30", bord: "border-[#96c0b8]/30" },
  "INSUFFISANT": { libelle: "Dossier incomplet", classe: "bg-sky-500/15 text-sky-300 border-sky-500/30", bord: "border-sky-500/30" },
  "NO-GO": { libelle: "Non retenu", classe: "bg-red-500/15 text-red-300 border-red-500/30", bord: "border-red-500/30" },
};

export const libelleVerdict = (v) => VERDICTS[v]?.libelle || v;

export const STATUTS_DEAL = {
  analyse: { libelle: "Analysé", classe: "bg-[#f2f3f5]/10 text-[#c9cdd6] border-[#f2f3f5]/20" },
  documents_demandes: { libelle: "Docs demandés", classe: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  documents_recus: { libelle: "Docs reçus", classe: "bg-[#96c0b8]/15 text-[#96c0b8] border-[#96c0b8]/30" },
  depouille: { libelle: "Extrait", classe: "bg-[#96c0b8]/15 text-[#c3ddd6] border-[#96c0b8]/30" },
  abandonne: { libelle: "Abandonné", classe: "bg-red-500/15 text-red-300 border-red-500/30" },
  projet_cree: { libelle: "Projet créé", classe: "bg-[#96c0b8]/20 text-[#c3ddd6] border-[#96c0b8]/40" },
};

// La grille des critères : nos critères à gauche, le bien à droite, et le
// verdict ligne à ligne — une coche menthe ou une croix corail. C'est ce
// qu'on voit en premier : le verdict global n'est que la somme de ces lignes.
function GrilleCriteres({ lignes }) {
  // La grille se lit comme un relevé : à gauche le verdict du critère, au
  // milieu ce qu'on attend, à droite ce que le bien donne. Les critères ratés
  // remontent en tête de chaque groupe — ce sont eux qui décident.
  const [deplies, setDeplies] = useState(() => new Set());
  if (!lignes?.length) return null;
  const groupes = [];
  for (const l of lignes) {
    const g = groupes.find((x) => x.nom === l.groupe);
    if (g) g.lignes.push(l);
    else groupes.push({ nom: l.groupe, lignes: [l] });
  }
  const rang = (l) => (l.ok === false ? 0 : l.ok == null ? 1 : 2);
  for (const g of groupes) g.lignes.sort((a, b) => rang(a) - rang(b));
  const passes = lignes.filter((l) => l.ok === true).length;
  const echecs = lignes.filter((l) => l.ok === false).length;
  const inconnus = lignes.length - passes - echecs;
  const basculer = (cle) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  return (
    <div className="border-b border-[#1f2228] px-5 py-5">
      {/* --- Le bilan, en une ligne ---------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Grille de critères</p>
          <p className="m-0 mt-1.5 text-[15px] text-[#f2f3f5]">
            <span className="text-[#96c0b8]">{passes} tenu{passes > 1 ? "s" : ""}</span>
            <span className="text-[#6a7180]"> · </span>
            <span className={echecs ? "text-[#e8746a]" : "text-[#6a7180]"}>{echecs} raté{echecs > 1 ? "s" : ""}</span>
            {inconnus > 0 && (
              <>
                <span className="text-[#6a7180]"> · </span>
                <span className="text-[#6a7180]">{inconnus} non renseigné{inconnus > 1 ? "s" : ""}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex h-1.5 w-[220px] max-w-full overflow-hidden rounded-full bg-[#1f2228]">
          <div className="h-full bg-[#96c0b8]" style={{ width: `${(passes / lignes.length) * 100}%` }} />
          <div className="h-full bg-[#e8746a]" style={{ width: `${(echecs / lignes.length) * 100}%` }} />
        </div>
      </div>

      {/* --- Les groupes ------------------------------------------------------ */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-x-10 gap-y-6">
        {groupes.map((g) => {
          const ok = g.lignes.filter((l) => l.ok === true).length;
          const ko = g.lignes.filter((l) => l.ok === false).length;
          return (
            <section key={g.nom} className="min-w-0">
              <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-[#22262d]">
                <p className="m-0 text-[10px] tracking-[.16em] uppercase text-[#96c0b8]/80">{g.nom}</p>
                <p className="m-0 text-[11px] text-[#6a7180]">
                  {ok}/{g.lignes.length}
                  {ko > 0 && <span className="text-[#e8746a]"> · {ko} raté{ko > 1 ? "s" : ""}</span>}
                </p>
              </div>
              <ul className="m-0 p-0 list-none">
                {g.lignes.map((l, i) => {
                  const cle = `${g.nom}-${l.champ}-${i}`;
                  const ouvert = deplies.has(cle);
                  const teinte = l.ok === true ? "#96c0b8" : l.ok === false ? "#e8746a" : "#3a3f4a";
                  return (
                    <li
                      key={cle}
                      title={l.motif || undefined}
                      className={`flex items-start gap-3 py-2.5 border-b border-[#1f2228]/60 ${l.ok === false ? "bg-[#e8746a]/[0.04] -mx-2 px-2 rounded" : ""}`}
                    >
                      <span
                        className="mt-[3px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full"
                        style={{ background: `${teinte}22`, color: teinte }}
                      >
                        {l.ok === true && <Check className="w-3 h-3" strokeWidth={3} />}
                        {l.ok === false && <X className="w-3 h-3" strokeWidth={3} />}
                        {l.ok == null && <span className="text-[10px] leading-none">?</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13px] leading-snug text-[#f2f3f5]">{l.critere}</p>
                        {l.attendu && <p className="m-0 mt-0.5 text-[11px] leading-snug text-[#6a7180]">attendu : {l.attendu}</p>}
                        {l.ok === false && l.motif && <p className="m-0 mt-0.5 text-[11px] leading-snug text-[#e8746a]/80">{l.motif}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => l.valeur != null && basculer(cle)}
                        title={l.valeur || undefined}
                        className={`max-w-[46%] flex-none text-right text-[13px] leading-snug ${
                          l.valeur == null ? "text-[#6a7180] italic" : "text-[#c9cdd6]"
                        } ${ouvert ? "whitespace-normal break-words" : "truncate"}`}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {l.valeur == null ? "non renseigné" : l.valeur}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

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
      ? "border-[#96c0b8]/25 bg-[#96c0b8]/10 text-amber-200/90"
      : "border-[#f2f3f5]/10 bg-[#f2f3f5]/[0.03] text-[#9298a6]";
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
      <DialogContent className="bg-[#000000] border-[#1f2228] text-[#f2f3f5] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITRES_INTENTION[intention] || "Mail à l'agent"}</DialogTitle>
        </DialogHeader>

        {etape === "raisons" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-[#9298a6] text-xs mb-2 block">
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
                          ? "border-[#e8746a] text-[#e8746a] bg-[#e8746a]/10"
                          : "border-[#22262d] text-[#9298a6] hover:border-[#e8746a]/60"
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
                className="bg-[#0f1114] border-[#1f2228] text-[#f2f3f5]"
              />
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5">
                Annuler
              </Button>
              <Button
                onClick={() =>
                  generer.mutate({ raisons: [...raisonsChoisies, raisons.trim()].filter(Boolean).join(" ; ") })
                }
                disabled={(!raisons.trim() && raisonsChoisies.length === 0) || generer.isPending}
                className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114]"
              >
                {generer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Rédiger le mail
              </Button>
            </DialogFooter>
          </div>
        ) : generer.isPending ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin mx-auto mb-3" />
            <p className="text-[#9298a6] text-sm">Rédaction du mail…</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {comptes.length > 0 && (
                <div>
                  <Label className="text-[#9298a6] text-xs mb-1.5 block">Envoyer depuis</Label>
                  <Select
                    value={expediteur || comptes[0]?.id}
                    onValueChange={(v) => {
                      setExpediteur(v);
                      localStorage.setItem("klocka:dernier-expediteur", v);
                    }}
                  >
                    <SelectTrigger className="bg-[#0f1114] border-[#1f2228] text-[#f2f3f5]">
                      <SelectValue placeholder="Choisir un compte" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#000000] border-[#1f2228] text-[#f2f3f5]">
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
                <Label className="text-[#9298a6] text-xs mb-1.5 block">Destinataire</Label>
                <Input
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
                  placeholder="agent@agence.fr"
                  className="bg-[#0f1114] border-[#1f2228] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6] text-xs mb-1.5 block">Objet</Label>
                <Input value={objet} onChange={(e) => setObjet(e.target.value)} className="bg-[#0f1114] border-[#1f2228] text-[#f2f3f5]" />
              </div>
              <div>
                <Label className="text-[#9298a6] text-xs mb-1.5 block">Corps</Label>
                <Textarea
                  value={corps}
                  onChange={(e) => setCorps(e.target.value)}
                  rows={12}
                  className="bg-[#0f1114] border-[#1f2228] text-[#f2f3f5] leading-relaxed"
                />
              </div>
              {EFFETS_INTENTION[intention] && (
                <p className="text-[11.5px] text-[#6a7180] border-t border-[#1f2228] pt-3">
                  À l'envoi : {EFFETS_INTENTION[intention]}
                </p>
              )}
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5">
                <X className="w-4 h-4 mr-1.5" /> Fermer
              </Button>
              <Button
                onClick={() => (sansCompte && googleConfigure && !test ? connecter() : envoyer.mutate())}
                disabled={
                  !destinataire.trim() || !objet.trim() || !corps.trim() || envoyer.isPending || connexionEnCours
                }
                className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114] font-medium"
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
    <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-4">
      <p className="text-[#9298a6] text-xs mb-3">Historique du dossier</p>
      <div className="space-y-2">
        {[...suivi].reverse().map((e, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <span className="text-[#6a7180] w-32 flex-shrink-0">
              {new Date(e.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <Badge className="bg-[#f2f3f5]/5 text-[#9298a6] border-[#f2f3f5]/10 text-[10px] flex-shrink-0">
              {LIBELLES_SUIVI[e.type] || e.type}
            </Badge>
            <span className="text-[#9298a6] min-w-0">
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

// Situer le bien de trois façons : le plan, la plongée 3D qui tourne autour
// de la rue, et la vue piéton. Les deux dernières réutilisent les vues de la
// page projet, alimentées par l'adresse du lot (ou le centre de la commune).
function VuesLieu({ lot, enr }) {
  const [vue, setVue] = useState("carte");
  const a = lot.lot?.adresse?.valeur;
  const adresse = a?.rue ? [a.rue, a.code_postal, a.ville].filter(Boolean).join(", ") : null;
  // Les vues de la page projet attendent un objet « projet » : on le compose.
  const lieu = {
    id: `lot-${lot.index ?? 0}`,
    adresse_complete: adresse || [a?.code_postal, a?.ville].filter(Boolean).join(" ") || enr?.commune?.nom || null,
    latitude: adresse ? null : enr?.commune?.centre?.lat || null,
    longitude: adresse ? null : enr?.commune?.centre?.lon || null,
  };
  const localisable = !!(lieu.adresse_complete || (lieu.latitude && lieu.longitude));

  const VUES = [
    { id: "carte", label: "Plan" },
    { id: "3d", label: "Vue 3D" },
    { id: "street", label: "Street View" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {VUES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVue(v.id)}
            disabled={v.id !== "carte" && !localisable}
            title={v.id !== "carte" && !localisable ? "Adresse inconnue pour ce lot" : undefined}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors disabled:opacity-40
              ${vue === v.id ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000] font-medium" : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vue === "carte" && (
        <CarteGoogle adresse={adresse} lat={enr?.commune?.centre?.lat} lon={enr?.commune?.centre?.lon} />
      )}
      {vue === "3d" && (
        <div className="relative h-[420px] rounded-md overflow-hidden border border-[#1f2228]">
          <PlongeeCarte project={lieu} onClose={() => setVue("carte")} />
        </div>
      )}
      {vue === "street" && (
        <div className="relative h-[420px] rounded-md overflow-hidden border border-[#1f2228]">
          <StreetViewRue project={lieu} />
        </div>
      )}
      {vue !== "carte" && !adresse && (
        <p className="m-0 text-[11.5px] text-[#6a7180]">
          Adresse précise absente de la fiche : la vue est centrée sur la commune.
        </p>
      )}
    </div>
  );
}

export function CarteLot({ lot, dossier, onSaisie, enCours, apercu = false }) {
  // Ouvert d'emblée, sur la carte : situer le bien est le premier réflexe.
  const [ongletsOuverts, setOngletsOuverts] = useState(true);

  // À qui ce bien pourrait correspondre, d'après les investisseurs de Monday :
  // dès la pré-analyse, avant même de décider, on sait s'il y a preneur.
  const {
    data: correspondances,
    isLoading: chargementCorrespondances,
    isError: erreurCorrespondances,
  } = useQuery({
    queryKey: ["dossier-clients", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/clients`),
    enabled: !!dossier?.deal_id,
    staleTime: 5 * 60 * 1000,
  });
  const [mailOuvert, setMailOuvert] = useState(false);
  const v = VERDICTS[lot.evaluation.verdict] || {};
  const aem = lot.evaluation.aem;
  const enr = lot.enrichissement;

  return (
    <div className={`bg-[#000000] border rounded-md overflow-hidden ${v.bord || "border-[#1f2228]"}`}>
      {/* En-tête */}
      <div className="p-5 border-b border-[#1f2228]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            {lot.intitule && <p className="text-[#9298a6] text-xs mb-1">{lot.intitule}</p>}
            <h3 className="text-[#f2f3f5] font-medium leading-snug">{lot.synthese?.titre || "Lot"}</h3>
          </div>
          <Badge className={`${v.classe} flex-shrink-0`}>{libelleVerdict(lot.evaluation.verdict)}</Badge>
        </div>

        {lot.evaluation.profil && (
          <p className="text-[#c3ddd6] text-xs mb-3">Profil : {lot.evaluation.profil.libelle}</p>
        )}
      </div>

      <GrilleCriteres lignes={lot.evaluation.grille} />

      <div className="p-5 border-b border-[#1f2228]">
        <p className="text-[#9298a6] text-sm leading-relaxed">{lot.synthese?.synthese}</p>


        {lot.evaluation.reserves?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lot.evaluation.reserves.map((r) => (
              <li key={r.id} className="text-[#96c0b8]/80 text-xs flex items-start gap-2">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#1f2228] border-b border-[#1f2228]">
          <Metrique label="Prix FAI" valeur={euros(aem.prix_fai)} />
          <Metrique label="Prix AEM" valeur={euros(aem.prix_aem)} accent sousTitre={`+${euros(aem.surcout_vs_fai)}`} />
          <Metrique label="Rendement annoncé" valeur={aem.rendement_fai != null ? `${aem.rendement_fai} %` : "—"} />
          <Metrique label="Rendement AEM" valeur={aem.rendement_aem != null ? `${aem.rendement_aem} %` : "—"} accent />
        </div>
      )}

      {/* Emplacement : saisie humaine */}
      <div className="px-5 py-4 border-b border-[#1f2228]">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-[#9298a6]" />
          <span className="text-[#9298a6] text-xs">Emplacement — qualification humaine</span>
          {enr?.emplacement === "a_qualifier" && (
            <Badge className="bg-[#96c0b8]/15 text-[#96c0b8] border-[#96c0b8]/25 text-[10px]">à qualifier</Badge>
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
                  ? "bg-[#96c0b8]/20 border-[#96c0b8]/40 text-[#c3ddd6]"
                  : "border-[#f2f3f5]/10 text-[#9298a6] hover:border-[#f2f3f5]/25 hover:text-[#f2f3f5]"
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
              className="px-3 py-1.5 rounded-lg text-xs border border-[#f2f3f5]/10 text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#f2f3f5]/25 ml-auto"
            >
              Voir sur la carte
            </a>
          )}
        </div>
      </div>

      {/* Simulateur complet, pré-rempli — remplace le calcul AEM figé */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <p className="text-[#9298a6] text-xs mb-3">
          Simulateur — pré-rempli avec ce dossier, tous les paramètres sont manipulables
        </p>
        <SimulateurDossier parametres={lot.simulateur} />
      </div>

      {/* Clients à qui ce bien pourrait correspondre */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <p className="text-[#9298a6] text-xs mb-1">
          Clients à qui ce bien pourrait correspondre — budget, apport et zone de recherche, d'après Monday
        </p>
        <ClientsCorrespondants
          clients={correspondances?.clients}
          chargement={chargementCorrespondances}
          configure={correspondances?.configure}
          erreur={erreurCorrespondances}
        />
      </div>

      {/* Détail */}
      <button
        onClick={() => setOngletsOuverts((o) => !o)}
        className="w-full px-5 py-3 flex items-center justify-between text-[#9298a6] hover:text-[#f2f3f5] text-xs transition-colors"
      >
        <span>Détail de l'extraction et de l'enrichissement</span>
        {ongletsOuverts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {ongletsOuverts && (
        <div className="px-5 pb-5">
          <Tabs defaultValue="carte">
            <TabsList className="mb-4 gap-5">
              <TabsTrigger value="extraction">Données extraites</TabsTrigger>
              <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
              <TabsTrigger value="carte">Lieu</TabsTrigger>
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
                    <div key={champ} className="flex items-start gap-3 py-1.5 border-b border-[#15171b]">
                      <span className="text-[#9298a6] text-xs w-40 flex-shrink-0">{libelle}</span>
                      <span className={`text-xs flex-1 ${absent ? "text-[#6a7180] italic" : "text-[#f2f3f5]"}`}>
                        {absent ? "non renseigné dans la fiche" : afficherValeur(champ, c.valeur)}
                      </span>
                      {!absent && c.citation && (
                        <span
                          title={c.citation}
                          className="text-[#6a7180] text-[11px] flex items-center gap-1 max-w-[45%] truncate cursor-help"
                        >
                          <Quote className="w-3 h-3 flex-shrink-0" />
                          {c.citation}
                        </span>
                      )}
                      {!absent && c.confiance === "basse" && (
                        <Badge className="bg-[#96c0b8]/15 text-[#96c0b8] border-[#96c0b8]/25 text-[10px]">
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

            <TabsContent value="carte">
              <VuesLieu lot={lot} enr={enr} />
            </TabsContent>

            {lot.contexte_marche && (
              <TabsContent value="marche">
                <div className="space-y-3">
                  <p className="text-[#c9cdd6] text-sm leading-relaxed whitespace-pre-wrap">
                    {lot.contexte_marche.resume}
                  </p>
                  {lot.contexte_marche.sources?.length > 0 && (
                    <div>
                      <p className="text-[#9298a6] text-xs mb-1.5">Sources consultées :</p>
                      <ul className="space-y-1">
                        {lot.contexte_marche.sources.map((s, i) => (
                          <li key={i}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#c3ddd6] hover:text-[#f2f3f5] text-xs underline underline-offset-2 transition-colors"
                            >
                              {s.titre}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[#6a7180] text-[11px]">
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
      <p className="text-[#9298a6] text-[11px] mb-1">{label}</p>
      <p className={`text-lg font-light ${accent ? "text-[#c3ddd6]" : "text-[#f2f3f5]"}`}>{valeur}</p>
      {sousTitre && <p className="text-[#6a7180] text-[11px]">{sousTitre}</p>}
    </div>
  );
}

function LigneDetail({ label, valeur, fort }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[#15171b]">
      <span className="text-[#9298a6]">{label}</span>
      <span className={fort ? "text-[#c3ddd6]" : "text-[#f2f3f5]"}>{valeur}</span>
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

  if (fait) return <p className="text-[#c3ddd6] text-xs mt-3">Enseigne ajoutée au référentiel.</p>;

  return (
    <div className="mt-3 rounded-lg border border-[#96c0b8]/25 bg-[#96c0b8]/10 px-3 py-2.5">
      <p className="text-amber-200/90 text-xs mb-1">
        « {nom} » est absente du référentiel. Qualification proposée par l'IA : <strong>{signature.niveau}</strong>.
      </p>
      {signature.justification && <p className="text-amber-200/60 text-[11px] mb-2">{signature.justification}</p>}
      <Button
        size="sm"
        onClick={() => enregistrer.mutate()}
        disabled={apercu || enregistrer.isPending}
        className="bg-[#96c0b8]/20 hover:bg-[#96c0b8]/30 text-amber-200 border-0 h-7 text-xs"
      >
        Valider et ajouter au référentiel
      </Button>
    </div>
  );
}

import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Loader2, MapPin,
  Microscope, Quote, Send, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import SimulateurRapide from "@/components/preanalyse/SimulateurRapide";

const VERDICTS = {
  "GO": { classe: "bg-[#2A9D8F]/15 text-[#71CCBA] border-[#2A9D8F]/30", bord: "border-[#2A9D8F]/40" },
  "GO SOUS RÉSERVE": { classe: "bg-amber-500/15 text-amber-300 border-amber-500/30", bord: "border-amber-500/30" },
  "INSUFFISANT": { classe: "bg-sky-500/15 text-sky-300 border-sky-500/30", bord: "border-sky-500/30" },
  "NO-GO": { classe: "bg-red-500/15 text-red-300 border-red-500/30", bord: "border-red-500/30" },
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

export default function Preanalyse() {
  const queryClient = useQueryClient();
  const inputFichier = useRef(null);
  const [texte, setTexte] = useState("");
  const [dossier, setDossier] = useState(null);

  const { data: historique = [] } = useQuery({
    queryKey: ["preanalyse-dossiers"],
    queryFn: () => base44.request("GET", "/api/preanalyse/dossiers"),
    initialData: [],
  });

  const analyser = useMutation({
    mutationFn: async ({ fichier, texte: t }) => {
      const form = new FormData();
      if (fichier) form.append("fichier", fichier);
      if (t) form.append("texte", t);
      return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true });
    },
    onSuccess: (d) => {
      setDossier(d);
      setTexte("");
      queryClient.invalidateQueries({ queryKey: ["preanalyse-dossiers"] });
      toast.success(d.multi_lots ? `${d.lots.length} lots analysés` : "Fiche analysée");
    },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  const ouvrirDossier = useMutation({
    mutationFn: (dealId) => base44.request("GET", `/api/preanalyse/dossiers/${dealId}`),
    onSuccess: (d) => setDossier(d),
  });

  const majLot = useMutation({
    mutationFn: ({ dealId, index, saisie }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${index}`, { body: saisie }),
    onSuccess: (r) => {
      setDossier((d) => {
        if (!d) return d;
        const lots = [...d.lots];
        lots[r.lot.index] = r.lot;
        return { ...d, lots };
      });
      toast.success("Verdict recalculé");
    },
    onError: (e) => toast.error(e?.message || "Recalcul impossible"),
  });

  const onFichier = (e) => {
    const f = e.target.files?.[0];
    if (f) analyser.mutate({ fichier: f });
    e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#2A9D8F]/20 rounded-xl flex items-center justify-center">
              <Microscope className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-light tracking-tight">Préanalyse</h1>
              <p className="text-gray-500 text-sm">
                Déposez une fiche commerciale : verdict, rendement AEM et mail de relance.
              </p>
            </div>
          </div>
          <div className="h-px w-16 bg-[#2A9D8F] mt-3" />
        </div>

        {/* Dépôt */}
        <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-400 text-xs mb-2 block">Fiche commerciale</Label>
              <button
                onClick={() => inputFichier.current?.click()}
                disabled={analyser.isPending}
                className="w-full h-[104px] border border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-[#2A9D8F]/50 hover:bg-white/[0.02] transition-all disabled:opacity-50"
              >
                <Upload className="w-5 h-5 text-[#2A9D8F]" />
                <span className="text-gray-400 text-sm">PDF, image, .eml</span>
                <span className="text-gray-600 text-[11px]">Les PDF scannés sont transcrits automatiquement</span>
              </button>
              <input
                ref={inputFichier}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.eml,.txt"
                onChange={onFichier}
                className="hidden"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-2 block">…ou collez le texte du mail</Label>
              <Textarea
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                rows={4}
                placeholder="Bonjour, je vous propose un local commercial situé…"
                className="bg-neutral-900 border-white/[0.08] text-white resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => analyser.mutate({ texte })}
              disabled={!texte.trim() || analyser.isPending}
              className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
            >
              {analyser.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse…</>
              ) : (
                <><Microscope className="w-4 h-4 mr-2" /> Analyser</>
              )}
            </Button>
          </div>
        </div>

        {analyser.isPending && (
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-8 text-center mb-6">
            <Loader2 className="w-6 h-6 text-[#2A9D8F] animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Lecture, extraction, vérification des citations puis application des règles…</p>
          </div>
        )}

        {/* Résultat */}
        {dossier && (
          <div className="space-y-5 mb-8">
            {dossier.source?.avertissements?.length > 0 && (
              <Bandeau type="info" items={dossier.source.avertissements} />
            )}
            {dossier.profils_configures === 0 && (
              <Bandeau
                type="alerte"
                items={[
                  "Aucun profil d'acquéreur n'est encore défini dans server/deal/data/rules.json : le moteur applique les knock-outs et contrôle les données clés, mais ne peut pas conclure à un GO ferme.",
                ]}
              />
            )}
            {dossier.multi_lots && (
              <Bandeau type="info" items={[`Cette fiche décrit ${dossier.lots.length} lots, analysés séparément.`]} />
            )}

            {dossier.lots.map((lot) => (
              <CarteLot
                key={lot.index}
                lot={lot}
                dealId={dossier.deal_id}
                onSaisie={(saisie) => majLot.mutate({ dealId: dossier.deal_id, index: lot.index, saisie })}
                enCours={majLot.isPending}
              />
            ))}
          </div>
        )}

        {/* Historique */}
        {historique.length > 0 && (
          <div>
            <h2 className="text-gray-400 text-sm mb-3">Dossiers récents</h2>
            <div className="space-y-2">
              {historique.map((d) => (
                <button
                  key={d.deal_id}
                  onClick={() => ouvrirDossier.mutate(d.deal_id)}
                  className="w-full text-left bg-[#0A0A0A] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-[#2A9D8F]/30 transition-all flex items-center gap-3"
                >
                  <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">
                      {d.lots?.[0]?.titre || d.nom_fichier || "Fiche"}
                    </p>
                    <p className="text-gray-600 text-xs">
                      {new Date(d.cree_le).toLocaleString("fr-FR")}
                      {d.lots?.length > 1 ? ` · ${d.lots.length} lots` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(d.lots || []).map((l) => (
                      <Badge key={l.index} className={`${VERDICTS[l.verdict]?.classe || ""} text-[10px]`}>
                        {l.verdict}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Bandeau({ type, items }) {
  const styles =
    type === "alerte"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-200/90"
      : "border-white/10 bg-white/[0.03] text-gray-400";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {items.map((t, i) => (
        <p key={i} className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t}
        </p>
      ))}
    </div>
  );
}

function CarteLot({ lot, dealId, onSaisie, enCours }) {
  const [ongletsOuverts, setOngletsOuverts] = useState(false);
  const [mailOuvert, setMailOuvert] = useState(false);
  const v = VERDICTS[lot.evaluation.verdict] || {};
  const aem = lot.evaluation.aem;
  const enr = lot.enrichissement;

  return (
    <div className={`bg-[#0A0A0A] border rounded-2xl overflow-hidden ${v.bord || "border-white/[0.06]"}`}>
      {/* En-tête */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            {lot.intitule && <p className="text-gray-500 text-xs mb-1">{lot.intitule}</p>}
            <h3 className="text-white font-medium leading-snug">{lot.synthese?.titre || "Lot"}</h3>
          </div>
          <Badge className={`${v.classe} flex-shrink-0`}>{lot.evaluation.verdict}</Badge>
        </div>

        <p className="text-gray-400 text-sm leading-relaxed">{lot.synthese?.synthese}</p>

        {lot.evaluation.profil && (
          <p className="text-[#71CCBA] text-xs mt-2">Profil : {lot.evaluation.profil.libelle}</p>
        )}

        {lot.evaluation.reserves?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lot.evaluation.reserves.map((r) => (
              <li key={r.id} className="text-amber-300/80 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                {r.motif}
              </li>
            ))}
          </ul>
        )}

        {lot.mail_agent && (
          <Button
            onClick={() => setMailOuvert(true)}
            size="sm"
            className="mt-4 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-0"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Mail de relance à l'agent
          </Button>
        )}
      </div>

      {/* Rendement : annoncé vs AEM */}
      {aem && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.06]">
          <Metrique label="Prix FAI" valeur={euros(aem.prix_fai)} />
          <Metrique label="Prix AEM" valeur={euros(aem.prix_aem)} accent sousTitre={`+${euros(aem.surcout_vs_fai)}`} />
          <Metrique label="Rendement annoncé" valeur={aem.rendement_fai != null ? `${aem.rendement_fai} %` : "—"} />
          <Metrique label="Rendement AEM" valeur={aem.rendement_aem != null ? `${aem.rendement_aem} %` : "—"} accent />
        </div>
      )}

      {/* Emplacement : saisie humaine */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-400 text-xs">Emplacement — qualification humaine</span>
          {enr?.emplacement === "a_qualifier" && (
            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px]">à qualifier</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {EMPLACEMENTS.map((e) => (
            <button
              key={e.code}
              disabled={enCours}
              onClick={() => onSaisie({ emplacement: e.code })}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-50 ${
                enr?.emplacement === e.code
                  ? "bg-[#2A9D8F]/20 border-[#2A9D8F]/40 text-[#71CCBA]"
                  : "border-white/10 text-gray-400 hover:border-white/25 hover:text-white"
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
              className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-gray-500 hover:text-white hover:border-white/25 ml-auto"
            >
              Voir sur la carte
            </a>
          )}
        </div>
      </div>

      {/* Simulateur pré-rempli */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <p className="text-gray-400 text-xs mb-3">Simulateur — pré-rempli avec ce dossier</p>
        <SimulateurRapide parametres={lot.simulateur} />
      </div>

      {/* Détail */}
      <button
        onClick={() => setOngletsOuverts((o) => !o)}
        className="w-full px-5 py-3 flex items-center justify-between text-gray-500 hover:text-white text-xs transition-colors"
      >
        <span>Détail de l'extraction et de l'enrichissement</span>
        {ongletsOuverts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {ongletsOuverts && (
        <div className="px-5 pb-5">
          <Tabs defaultValue="extraction">
            <TabsList className="bg-neutral-900 border border-white/[0.08] mb-4">
              <TabsTrigger value="extraction">Données extraites</TabsTrigger>
              <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
              <TabsTrigger value="calcul">Calcul AEM</TabsTrigger>
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
                    <div key={champ} className="flex items-start gap-3 py-1.5 border-b border-white/[0.04]">
                      <span className="text-gray-500 text-xs w-40 flex-shrink-0">{libelle}</span>
                      <span className={`text-xs flex-1 ${absent ? "text-gray-600 italic" : "text-white"}`}>
                        {absent ? "non renseigné dans la fiche" : afficherValeur(champ, c.valeur)}
                      </span>
                      {!absent && c.citation && (
                        <span
                          title={c.citation}
                          className="text-gray-600 text-[11px] flex items-center gap-1 max-w-[45%] truncate cursor-help"
                        >
                          <Quote className="w-3 h-3 flex-shrink-0" />
                          {c.citation}
                        </span>
                      )}
                      {!absent && c.confiance === "basse" && (
                        <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px]">
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
                <ValidationEnseigne nom={lot.lot.locataire_nom?.valeur} signature={enr.signature} />
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
                <p className="text-gray-500 text-xs">Calcul impossible : prix ou loyer manquant.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {mailOuvert && (
        <DialogMail mail={lot.mail_agent} onClose={() => setMailOuvert(false)} dealId={dealId} />
      )}
    </div>
  );
}

function Metrique({ label, valeur, sousTitre, accent }) {
  return (
    <div className="px-4 py-3">
      <p className="text-gray-500 text-[11px] mb-1">{label}</p>
      <p className={`text-lg font-light ${accent ? "text-[#71CCBA]" : "text-white"}`}>{valeur}</p>
      {sousTitre && <p className="text-gray-600 text-[11px]">{sousTitre}</p>}
    </div>
  );
}

function LigneDetail({ label, valeur, fort }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-white/[0.04]">
      <span className="text-gray-500">{label}</span>
      <span className={fort ? "text-[#71CCBA]" : "text-gray-200"}>{valeur}</span>
    </div>
  );
}

function ValidationEnseigne({ nom, signature }) {
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

  if (fait) return <p className="text-[#71CCBA] text-xs mt-3">Enseigne ajoutée au référentiel.</p>;

  return (
    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
      <p className="text-amber-200/90 text-xs mb-1">
        « {nom} » est absente du référentiel. Qualification proposée par l'IA : <strong>{signature.niveau}</strong>.
      </p>
      {signature.justification && <p className="text-amber-200/60 text-[11px] mb-2">{signature.justification}</p>}
      <Button
        size="sm"
        onClick={() => enregistrer.mutate()}
        disabled={enregistrer.isPending}
        className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-0 h-7 text-xs"
      >
        Valider et ajouter au référentiel
      </Button>
    </div>
  );
}

function DialogMail({ mail, onClose }) {
  const [objet, setObjet] = useState(mail.objet);
  const [corps, setCorps] = useState(mail.corps);
  const [destinataire, setDestinataire] = useState("");

  const envoyer = useMutation({
    mutationFn: () =>
      base44.functions.invoke("sendMail", { to: destinataire, subject: objet, body: corps }),
    onSuccess: (r) => {
      if (r?.success) {
        toast.success("Mail envoyé");
        onClose();
      } else toast.error(r?.error || "Envoi impossible");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mail de relance à l'agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Destinataire</Label>
            <Input
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              placeholder="agent@agence.fr"
              className="bg-neutral-800 border-white/[0.08] text-white"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Objet</Label>
            <Input value={objet} onChange={(e) => setObjet(e.target.value)} className="bg-neutral-800 border-white/[0.08] text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Corps</Label>
            <Textarea
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={14}
              className="bg-neutral-800 border-white/[0.08] text-white leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/5">
            <X className="w-4 h-4 mr-1.5" /> Fermer
          </Button>
          <Button
            onClick={() => envoyer.mutate()}
            disabled={!destinataire.trim() || envoyer.isPending}
            className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
          >
            {envoyer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

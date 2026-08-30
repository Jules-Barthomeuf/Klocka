import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { LogoGoogle } from "@/components/mails/ConnexionGmail";

// Connexion en deux temps : on saisit son adresse, l'app reconnaît le compte,
// puis on saisit son mot de passe — ou on le choisit s'il s'agit de la première
// connexion. La connexion Google est proposée en alternative : même règle,
// aucun compte ne se crée librement, seules les adresses déjà enregistrées
// par Klocka peuvent entrer.

const ETAPES = { EMAIL: "email", MOT_DE_PASSE: "mot_de_passe", CREATION: "creation", INCONNU: "inconnu" };

// Panneau de connexion nu : porte toute la logique, sans Dialog. La page
// d'accueil l'affiche en colonne de droite ; ConnexionDialog reste disponible
// pour l'ouvrir en surimpression ailleurs.
/**
 * @param {{invitation?: {email, prenom, jeton}}} props - une invitation ouvre
 *   directement sur le choix du mot de passe : l'adresse vient du lien.
 */
export function ConnexionPanel({ invitation = null } = {}) {
  const [etape, setEtape] = useState(invitation ? ETAPES.CREATION : ETAPES.EMAIL);
  const [email, setEmail] = useState(invitation?.email || "");
  const [compte, setCompte] = useState(invitation ? { prenom: invitation.prenom, role: "user" } : null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // La connexion Google n'est proposée que si le serveur est configuré pour.
  const [googleDispo, setGoogleDispo] = useState(false);
  const champMotDePasse = useRef(null);

  useEffect(() => {
    let vivant = true;
    base44
      .request("GET", "/api/health")
      .then((r) => vivant && setGoogleDispo(!!r?.google))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    if (etape === ETAPES.MOT_DE_PASSE || etape === ETAPES.CREATION) {
      setTimeout(() => champMotDePasse.current?.focus(), 50);
    }
  }, [etape]);

  const reinitialiser = () => {
    setEtape(ETAPES.EMAIL);
    setCompte(null);
    setMotDePasse("");
    setConfirmation("");
    setErreur(null);
  };

  const verifierEmail = async (e) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/verifier-email", { body: { email } });
      if (!r.connu) {
        setEtape(ETAPES.INCONNU);
      } else {
        setCompte(r);
        setEtape(r.mot_de_passe_defini ? ETAPES.MOT_DE_PASSE : ETAPES.CREATION);
      }
    } catch (err) {
      setErreur(err?.message || "Vérification impossible.");
    } finally {
      setEnCours(false);
    }
  };

  const seConnecter = async (e) => {
    e?.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await base44.request("POST", "/api/auth/connexion", { body: { email, mot_de_passe: motDePasse } });
      // Rechargement complet : l'app rejoue son amorçage avec la session posée.
      window.location.href = "/Dashboard";
    } catch (err) {
      setErreur(err?.message || "Connexion impossible.");
      setMotDePasse("");
      setEnCours(false);
    }
  };

  const definirMotDePasse = async (e) => {
    e?.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await base44.request("POST", "/api/auth/definir-mot-de-passe", {
        body: { email, mot_de_passe: motDePasse, ...(invitation?.jeton ? { jeton: invitation.jeton } : {}) },
      });
      window.location.href = "/Dashboard";
    } catch (err) {
      setErreur(err?.message || "Enregistrement impossible.");
      setEnCours(false);
    }
  };

  return (
    <div className="text-[#f2f3f5]">
        {/* Étape 1 — adresse */}
        {etape === ETAPES.EMAIL && (
          <form onSubmit={verifierEmail} className="space-y-4">
            <EnTete icone={Mail} titre="Connexion" sousTitre="Saisissez votre adresse professionnelle." />
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Adresse email</Label>
              <Input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] rounded-none px-0 text-[15px] text-[#f2f3f5] focus-visible:ring-0 focus-visible:border-[#8fa0f2] placeholder:text-[#6a7180]"
              />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button
              type="submit"
              disabled={!email.trim() || enCours}
              className="w-full rounded-none bg-transparent border border-[#8fa0f2] text-[#aab6f5] hover:bg-[#8fa0f2]/[0.16] hover:text-[#aab6f5] text-[11px] tracking-[0.16em] uppercase h-11"
            >
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Continuer <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            {googleDispo && (
              <>
                <Separateur />
                <BoutonGoogle />
              </>
            )}
            <p className="text-[12px] text-[#6a7180] text-center pt-1 mb-0">
              Pas encore client ?{" "}
              <a href="https://dpe3smipjxh.typeform.com/to/GD7sREFs" target="_blank" rel="noopener noreferrer"
                className="text-[#aab6f5] hover:text-[#f2f3f5] transition-colors">
                Créez un compte
              </a>
            </p>
          </form>
        )}

        {/* Étape 2a — mot de passe existant */}
        {etape === ETAPES.MOT_DE_PASSE && (
          <form onSubmit={seConnecter} className="space-y-4">
            <EnTete
              icone={Lock}
              titre={compte?.prenom ? `Bonjour ${compte.prenom}` : "Mot de passe"}
              sousTitre={email}
              badge={compte?.role === "admin" ? "Administrateur" : null}
            />
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Mot de passe</Label>
              <Input
                ref={champMotDePasse}
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className="bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] rounded-none px-0 text-[15px] text-[#f2f3f5] focus-visible:ring-0 focus-visible:border-[#8fa0f2] placeholder:text-[#6a7180]"
              />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button
              type="submit"
              disabled={!motDePasse || enCours}
              className="w-full rounded-none bg-transparent border border-[#8fa0f2] text-[#aab6f5] hover:bg-[#8fa0f2]/[0.16] hover:text-[#aab6f5] text-[11px] tracking-[0.16em] uppercase h-11"
            >
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Se connecter
            </Button>
            {googleDispo && (
              <>
                <Separateur />
                <BoutonGoogle />
              </>
            )}
            <BoutonRetour onClick={reinitialiser} />
          </form>
        )}

        {/* Étape 2b — première connexion */}
        {etape === ETAPES.CREATION && (
          <form onSubmit={definirMotDePasse} className="space-y-4">
            <EnTete
              icone={ShieldCheck}
              titre={compte?.prenom ? `Bienvenue ${compte.prenom}` : "Première connexion"}
              sousTitre={`${email} — choisissez votre mot de passe, il vous servira pour les prochaines fois.`}
              badge={compte?.role === "admin" ? "Administrateur" : null}
            />
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Mot de passe (8 caractères minimum)</Label>
              <Input
                ref={champMotDePasse}
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className="bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] rounded-none px-0 text-[15px] text-[#f2f3f5] focus-visible:ring-0 focus-visible:border-[#8fa0f2] placeholder:text-[#6a7180]"
              />
            </div>
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Confirmation</Label>
              <Input
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] rounded-none px-0 text-[15px] text-[#f2f3f5] focus-visible:ring-0 focus-visible:border-[#8fa0f2] placeholder:text-[#6a7180]"
              />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button
              type="submit"
              disabled={!motDePasse || !confirmation || enCours}
              className="w-full rounded-none bg-transparent border border-[#8fa0f2] text-[#aab6f5] hover:bg-[#8fa0f2]/[0.16] hover:text-[#aab6f5] text-[11px] tracking-[0.16em] uppercase h-11"
            >
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer et entrer
            </Button>
            {!invitation && <BoutonRetour onClick={reinitialiser} />}
          </form>
        )}

        {/* Adresse non reconnue */}
        {etape === ETAPES.INCONNU && (
          <div className="space-y-4">
            <EnTete icone={AlertCircle} titre="Adresse non reconnue" sousTitre={email} />
            <p className="text-[#9298a6] text-sm leading-relaxed">
              Cette adresse ne correspond à aucun compte. Les accès sont créés par Klocka : vérifiez la saisie, ou
              rapprochez-vous de votre interlocuteur pour qu'il vous ouvre un accès.
            </p>
            <BoutonRetour onClick={reinitialiser} libelle="Essayer une autre adresse" />
          </div>
        )}
    </div>
  );
}

// Enveloppe en surimpression, conservée pour un usage ponctuel.
export default function ConnexionDialog({ ouvert, onClose }) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#000000] border-[#f2f3f5]/[0.13] text-[#f2f3f5] max-w-md">
        <ConnexionPanel />
      </DialogContent>
    </Dialog>
  );
}

// Redirection pleine page : c'est une connexion, il n'y a pas de saisie à
// préserver, et la session doit être posée avant que l'app ne s'amorce.
function BoutonGoogle() {
  return (
    <a
      href="/api/auth/google/login?returnTo=%2FDashboard"
      className="w-full inline-flex items-center justify-center gap-2.5 bg-[#f2f3f5] text-[#3c4043] font-medium text-sm rounded-none px-4 py-2.5 hover:opacity-90 transition-colors"
    >
      <LogoGoogle />
      Se connecter avec Google
    </a>
  );
}

function Separateur() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-[#f2f3f5]/[0.08]" />
      <span className="text-[#6a7180] text-[11px]">ou</span>
      <span className="h-px flex-1 bg-[#f2f3f5]/[0.08]" />
    </div>
  );
}

function EnTete({ icone: Icone, titre, sousTitre, badge }) {
  return (
    <div className="pb-2">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[#f2f3f5] text-[22px] font-light tracking-[-0.02em] m-0">{titre}</h2>
        {badge && (
          <span className="text-[9px] tracking-[0.14em] uppercase text-[#a9c5b9] border border-[#a9c5b9]/40 rounded-full px-2 py-px">{badge}</span>
        )}
      </div>
      {sousTitre && <p className="text-[#9298a6] text-[12.5px] mt-1.5 mb-0 break-all">{sousTitre}</p>}
    </div>
  );
}

function Erreur({ texte }) {
  return (
    <p className="text-red-400 text-xs flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      {texte}
    </p>
  );
}

function BoutonRetour({ onClick, libelle = "Changer d'adresse" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-[#9298a6] hover:text-[#c9cdd6] text-xs flex items-center justify-center gap-1.5 transition-colors"
    >
      <ArrowLeft className="w-3 h-3" /> {libelle}
    </button>
  );
}

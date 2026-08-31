import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft, ArrowRight, KeyRound, Loader2, Lock, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { LogoGoogle } from "@/components/mails/ConnexionGmail";

// Connexion en deux temps : on saisit son adresse, l'app reconnaît le compte,
// puis on saisit son mot de passe — ou on le choisit s'il s'agit de la première
// connexion (compte invité par l'équipe).
//
// Une adresse inconnue peut s'inscrire : prénom, mot de passe, et un code à
// six chiffres reçu par mail prouve l'adresse. Le compte naît en découverte —
// un aperçu, et la porte du rendez-vous. Google fait la même chose en un clic.

const ETAPES = {
  EMAIL: "email",
  MOT_DE_PASSE: "mot_de_passe",
  CREATION: "creation",
  INSCRIPTION: "inscription",
  CODE: "code",
  INCONNU: "inconnu",
};

const QUESTIONNAIRE_URL = "https://dpe3smipjxh.typeform.com/to/GD7sREFs";
const CHAMP = "bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] rounded-none px-0 text-[15px] text-[#f2f3f5] focus-visible:ring-0 focus-visible:border-[#96c0b8] placeholder:text-[#6a7180]";
const BOUTON = "w-full rounded-none bg-transparent border border-[#96c0b8] text-[#c3ddd6] hover:bg-[#96c0b8]/[0.16] hover:text-[#c3ddd6] text-[11px] tracking-[0.16em] uppercase h-11";

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
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // Ce qui est ouvert pour s'inscrire, dit par le serveur.
  const [inscription, setInscription] = useState({ google: false, email: false });
  const [renvoiDans, setRenvoiDans] = useState(0);
  // La connexion Google n'est proposée que si le serveur est configuré pour.
  const [googleDispo, setGoogleDispo] = useState(false);
  const champMotDePasse = useRef(null);
  const champCode = useRef(null);
  // Cette fenêtre veut son propre compte : la session ira dans la fenêtre,
  // pas dans le cookie commun. L'autre compte reste connecté ailleurs.
  const enFenetre = base44.auth.fenetre.active();

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
    if (etape === ETAPES.MOT_DE_PASSE || etape === ETAPES.CREATION) setTimeout(() => champMotDePasse.current?.focus(), 50);
    if (etape === ETAPES.CODE) setTimeout(() => champCode.current?.focus(), 50);
  }, [etape]);

  useEffect(() => {
    if (renvoiDans <= 0) return undefined;
    const t = setTimeout(() => setRenvoiDans((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [renvoiDans]);

  const reinitialiser = () => {
    setEtape(ETAPES.EMAIL);
    setCompte(null);
    setMotDePasse("");
    setConfirmation("");
    setCode("");
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
        setInscription(r.inscription || { google: false, email: false });
        setEtape(r.inscription?.google || r.inscription?.email ? ETAPES.INSCRIPTION : ETAPES.INCONNU);
      } else if (r.code_requis) {
        // Compte né par Google, sans mot de passe : un code par mail pour en choisir un.
        setCompte(r);
        setInscription({ google: !!r.google, email: true });
        setEtape(ETAPES.INSCRIPTION);
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
      const r = await base44.request("POST", "/api/auth/connexion", { body: { email, mot_de_passe: motDePasse, fenetre: enFenetre } });
      if (r?.jeton_session) base44.auth.fenetre.poserJeton(r.jeton_session);
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
      const r = await base44.request("POST", "/api/auth/definir-mot-de-passe", {
        body: { email, mot_de_passe: motDePasse, fenetre: enFenetre, ...(invitation?.jeton ? { jeton: invitation.jeton } : {}) },
      });
      if (r?.jeton_session) base44.auth.fenetre.poserJeton(r.jeton_session);
      window.location.href = "/Dashboard";
    } catch (err) {
      setErreur(err?.message || "Enregistrement impossible.");
      setEnCours(false);
    }
  };

  // Inscription : le code part, puis on le saisit.
  const demanderCode = async (e) => {
    e?.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (motDePasse.length < 8) {
      setErreur("Huit caractères au moins.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/inscription/code", { body: { email, full_name: nom } });
      if (r?.sans_code) {
        // Aucun code n'a pu partir : le serveur ouvre l'espace quand même.
        const c = await base44.request("POST", "/api/auth/inscription/confirmer", { body: { email, mot_de_passe: motDePasse, full_name: nom, fenetre: enFenetre } });
        if (c?.jeton_session) base44.auth.fenetre.poserJeton(c.jeton_session);
        window.location.href = "/Dashboard";
        return;
      }
      setCode("");
      setRenvoiDans(60);
      setEtape(ETAPES.CODE);
    } catch (err) {
      setErreur(err?.message || "Envoi du code impossible.");
    } finally {
      setEnCours(false);
    }
  };

  const renvoyerCode = async () => {
    if (renvoiDans > 0 || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      await base44.request("POST", "/api/auth/inscription/code", { body: { email, full_name: nom } });
      setRenvoiDans(60);
    } catch (err) {
      setErreur(err?.message || "Envoi du code impossible.");
    } finally {
      setEnCours(false);
    }
  };

  const confirmerInscription = async (e) => {
    e?.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/inscription/confirmer", {
        body: { email, code: code.replace(/\D/g, ""), mot_de_passe: motDePasse, full_name: nom, fenetre: enFenetre },
      });
      if (r?.jeton_session) base44.auth.fenetre.poserJeton(r.jeton_session);
      window.location.href = "/Dashboard";
    } catch (err) {
      setErreur(err?.message || "Code refusé.");
      setEnCours(false);
    }
  };

  const ouvrirInscription = () => {
    setErreur(null);
    setInscription({ google: googleDispo, email: true });
    setEtape(ETAPES.INSCRIPTION);
  };

  return (
    <div className="text-[#f2f3f5]">
        {/* Étape 1 — adresse */}
        {etape === ETAPES.EMAIL && (
          <form onSubmit={verifierEmail} className="space-y-4">
            <EnTete icone={Mail} titre="Connexion" sousTitre={enFenetre ? "Cette fenêtre est indépendante : votre autre compte reste connecté dans les autres." : "Saisissez votre adresse professionnelle."} />
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Adresse email</Label>
              <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" className={CHAMP} />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button type="submit" disabled={!email.trim() || enCours} className={BOUTON}>
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Continuer <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            {googleDispo && (
              <>
                <Separateur />
                <BoutonGoogle libelle="Continuer avec Google" />
              </>
            )}
            <p className="text-[12px] text-[#6a7180] text-center pt-1 mb-0">
              Pas encore client ?{" "}
              <button type="button" onClick={ouvrirInscription} className="text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors">
                Créez un compte
              </button>
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
              <Input ref={champMotDePasse} type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={CHAMP} />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button type="submit" disabled={!motDePasse || enCours} className={BOUTON}>
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

        {/* Étape 2b — première connexion d'un compte invité */}
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
              <Input ref={champMotDePasse} type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={CHAMP} />
            </div>
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Confirmation</Label>
              <Input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={CHAMP} />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button type="submit" disabled={!motDePasse || !confirmation || enCours} className={BOUTON}>
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer et entrer
            </Button>
            {!invitation && <BoutonRetour onClick={reinitialiser} />}
          </form>
        )}

        {/* Inscription — l'espace découverte */}
        {etape === ETAPES.INSCRIPTION && (
          <form onSubmit={demanderCode} className="space-y-4">
            <EnTete
              icone={UserPlus}
              titre={compte?.code_requis ? "Choisir un mot de passe" : "Créer mon espace"}
              sousTitre={
                compte?.code_requis
                  ? `${email} — ce compte est né avec Google. Un code par e-mail, et vous choisissez un mot de passe.`
                  : "Un aperçu de Klocka — des projets, le simulateur — puis un rendez-vous pour définir votre stratégie."
              }
            />
            {inscription.google && !compte?.code_requis && (
              <>
                <BoutonGoogle libelle="Continuer avec Google" />
                {inscription.email && <Separateur />}
              </>
            )}
            {inscription.email ? (
              <>
                <div>
                  <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Adresse email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" className={CHAMP} readOnly={!!compte?.code_requis} />
                </div>
                {!compte?.code_requis && (
                  <div>
                    <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Prénom et nom</Label>
                    <Input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Camille Martin" className={CHAMP} />
                  </div>
                )}
                <div>
                  <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Mot de passe (8 caractères minimum)</Label>
                  <Input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={CHAMP} />
                </div>
                <div>
                  <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Confirmation</Label>
                  <Input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={CHAMP} />
                </div>
                {erreur && <Erreur texte={erreur} />}
                <Button type="submit" disabled={!email.trim() || !motDePasse || !confirmation || enCours} className={BOUTON}>
                  {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Recevoir mon code <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            ) : (
              <>
                {erreur && <Erreur texte={erreur} />}
                <p className="text-[#9298a6] text-[12.5px] leading-relaxed m-0">
                  L'inscription par e-mail est momentanément indisponible : continuez avec Google, ou écrivez-nous.
                </p>
              </>
            )}
            <p className="text-[12px] text-[#6a7180] text-center pt-1 mb-0">
              Vous préférez nous écrire d'abord ?{" "}
              <a href={QUESTIONNAIRE_URL} target="_blank" rel="noopener noreferrer" className="text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors">
                Répondez au questionnaire
              </a>
            </p>
            <BoutonRetour onClick={reinitialiser} libelle="J'ai déjà un compte" />
          </form>
        )}

        {/* Le code reçu */}
        {etape === ETAPES.CODE && (
          <form onSubmit={confirmerInscription} className="space-y-4">
            <EnTete icone={KeyRound} titre="Votre code" sousTitre={`Six chiffres, envoyés à ${email}. Ils valent dix minutes.`} />
            <div>
              <Label className="text-[10px] tracking-[0.16em] uppercase text-[#9298a6] mb-1.5 block">Code</Label>
              <Input
                ref={champCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
                placeholder="000 000"
                className={`${CHAMP} text-[24px] tracking-[.3em]`}
              />
            </div>
            {erreur && <Erreur texte={erreur} />}
            <Button type="submit" disabled={code.replace(/\D/g, "").length !== 6 || enCours} className={BOUTON}>
              {enCours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {compte?.code_requis ? "Enregistrer et entrer" : "Créer mon espace"}
            </Button>
            <button
              type="button"
              onClick={renvoyerCode}
              disabled={renvoiDans > 0 || enCours}
              className="w-full text-[#9298a6] hover:text-[#c9cdd6] disabled:hover:text-[#9298a6] text-xs transition-colors disabled:opacity-60"
            >
              {renvoiDans > 0 ? `Renvoyer le code dans ${renvoiDans} s` : "Renvoyer le code"}
            </button>
            <BoutonRetour onClick={() => { setErreur(null); setEtape(ETAPES.INSCRIPTION); }} libelle="Corriger mes informations" />
          </form>
        )}

        {/* Adresse non reconnue, et aucune inscription ouverte */}
        {etape === ETAPES.INCONNU && (
          <div className="space-y-4">
            <EnTete icone={AlertCircle} titre="Adresse non reconnue" sousTitre={email} />
            <p className="text-[#9298a6] text-sm leading-relaxed">
              Cette adresse ne correspond à aucun compte, et les inscriptions sont momentanément fermées. Vérifiez la
              saisie, ou rapprochez-vous de votre interlocuteur Klocka.
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
function BoutonGoogle({ libelle = "Se connecter avec Google" }) {
  return (
    <a
      href={`/api/auth/google/login?returnTo=%2FDashboard${base44.auth.fenetre.active() ? "&fenetre=1" : ""}`}
      className="w-full inline-flex items-center justify-center gap-2.5 bg-[#f2f3f5] text-[#3c4043] font-medium text-sm rounded-none px-4 py-2.5 hover:opacity-90 transition-colors"
    >
      <LogoGoogle />
      {libelle}
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
          <span className="text-[9px] tracking-[0.14em] uppercase text-[#96c0b8] border border-[#96c0b8]/40 rounded-full px-2 py-px">{badge}</span>
        )}
      </div>
      {sousTitre && <p className="text-[#9298a6] text-[12.5px] mt-1.5 mb-0 break-words">{sousTitre}</p>}
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

import React, { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// L'assistant : une pilule au repos, un cadre qui s'étire une fois ouvert.
//
// Le liseré or est le seul séparateur — le panneau partage le fond de la page,
// et c'est le trait qui le détache. D'où l'absence de fond plus clair : en
// ajouter un ferait deux séparations concurrentes.
//
// Le cadre est unique : la barre de saisie du bas est la même que la pilule du
// repos, simplement étirée. Rien ne se superpose, rien ne se déplace.

const OR = "#d8c9a3";
const FOND = "#070908";
const TEXTE = "#dcdedb";
const META = "#8b908c";
const FILET = "#3a3e3c";
const SEPARATEUR = "#1f2321";

// La police du reste de l'application, pas une seconde : l'assistant est une
// pièce de Klocka, il n'a pas à s'annoncer par sa typographie. IBM Plex Sans
// tient mieux les petites tailles qu'Inter Tight, dont les chasses serrées
// brouillaient les 12,5 px de la barre de saisie.
const SANS = "'IBM Plex Sans', Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif";
// Le libellé en capitales espacées tombait jusqu'ici sur la mono du système —
// donc sur une police différente selon la machine.
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// L'indicateur de frappe doit se voir : on ne montre jamais la réponse avant.
const DUREE_FRAPPE = 900;

const ANIMATIONS = `
@keyframes assistant-dot {
  0%, 100% { opacity: .25; transform: translateY(0); }
  50%      { opacity: 1;   transform: translateY(-3px); }
}
`;

// Ce que l'utilisateur a sous les yeux : « mets-le dans Monday » doit suffire.
function useContextePage() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  if (pathname.startsWith("/Analyse") && params.get("deal_id")) return { deal_id: params.get("deal_id") };
  if (pathname.startsWith("/AdminProjets") && params.get("id")) return { projet_id: params.get("id") };
  return null;
}

function Frappe() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 13 }}>
      {[0, 0.15, 0.3].map((d) => (
        <span
          key={d}
          style={{ width: 5, height: 5, borderRadius: "50%", background: OR, animation: `assistant-dot 1.2s ${d}s infinite` }}
        />
      ))}
    </div>
  );
}

export default function AssistantFlottant() {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [messages, setMessages] = useState([]);
  const [frappe, setFrappe] = useState(false);
  const [brouillon, setBrouillon] = useState(null);
  const [suites, setSuites] = useState([]);
  const finRef = useRef(null);
  const champRef = useRef(null);
  const contexte = useContextePage();

  // Le fil survit au rechargement : il vit en base, pas dans l'onglet.
  useEffect(() => {
    let vivant = true;
    base44
      .request("GET", "/api/assistant/fil")
      .then((r) => { if (vivant && r?.messages?.length) setMessages(r.messages); })
      .catch(() => {});
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, frappe, brouillon]);

  useEffect(() => {
    const surTouche = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  const envoyer = useMutation({
    mutationFn: async (suite) => {
      // La réponse attend que l'indicateur ait eu le temps d'exister : sans
      // cela, une réponse rapide donne un à-coup.
      const [r] = await Promise.all([
        base44.request("POST", "/api/assistant/commande", { body: { messages: suite, contexte } }),
        new Promise((resoudre) => setTimeout(resoudre, DUREE_FRAPPE)),
      ]);
      return r;
    },
    onSuccess: (r) => {
      setFrappe(false);
      setMessages((m) => [...m, { role: "assistant", contenu: r.texte || "—" }]);

      const mail = (r.actions || []).find((a) => a.name === "preparer_mail" && a.resultat?.brouillon);
      if (mail) {
        setBrouillon({
          deal_id: mail.resultat.deal_id,
          intention: mail.resultat.intention,
          destinataire: mail.resultat.destinataire || "",
          objet: mail.resultat.objet || "",
          corps: mail.resultat.corps || "",
        });
      }

      // Les suites proposées sortent de ce qui vient d'être fait — pas d'un
      // catalogue décoratif.
      const agies = (r.actions || []).filter((a) => a.name !== "preparer_mail");
      const propositions = [];
      for (const a of agies) {
        if (a.resultat?.url) {
          propositions.push({ libelle: "Ouvrir la fiche", principal: true, href: a.resultat.url });
        }
        if (a.resultat?.cree) propositions.push({ libelle: "Annuler", texte: "annule ça" });
        if (a.resultat?.avertissement) {
          propositions.push({ libelle: "Compléter", texte: a.resultat.avertissement.slice(0, 90) });
        }
      }
      setSuites(propositions.slice(0, 3));

      for (const a of agies) {
        const drive = a.name === "creer_drive_dossier";
        toast.success(drive ? "Dossier Drive créé" : a.resultat?.cree ? "Ajouté à Monday" : "Mis à jour", {
          description: drive && a.resultat?.chemin ? a.resultat.chemin : a.resultat?.titre,
        });
      }
    },
    onError: (e) => {
      setFrappe(false);
      setMessages((m) => [...m, { role: "assistant", contenu: e?.message || "Je n'ai pas pu traiter la demande." }]);
    },
  });

  const envoyerMail = useMutation({
    mutationFn: () =>
      base44.functions.invoke("sendMail", {
        to: brouillon.destinataire,
        subject: brouillon.objet,
        body: brouillon.corps,
        deal_id: brouillon.deal_id,
        intention: brouillon.intention,
      }),
    onSuccess: (r) => {
      if (r?.success || r?.simulated) {
        toast.success(r?.simulated ? "Envoi simulé" : "Mail envoyé", { description: brouillon.destinataire });
        setMessages((m) => [...m, { role: "assistant", contenu: `Mail envoyé à ${brouillon.destinataire}.` }]);
        setBrouillon(null);
      } else toast.error(r?.error || "Envoi impossible");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const lancer = (contenu) => {
    const demande = (contenu ?? texte).trim();
    if (!demande || envoyer.isPending) return;
    const suite = [...messages, { role: "user", contenu: demande }];
    setMessages(suite);
    setTexte("");
    setSuites([]);
    setOuvert(true);
    setFrappe(true);
    envoyer.mutate(suite);
  };

  const actif = !!texte.trim();

  return (
    <div
      className="assistant-flottant"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        width: ouvert ? 420 : 330,
        maxWidth: "calc(100vw - 40px)",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: SANS,
        transition: "width .18s ease",
      }}
    >
      <style>{ANIMATIONS}</style>

      {/* Deux parties distinctes : la transcription, puis la saisie. Chacune
          porte son propre liseré or — la barre reste une pilule autonome. */}
      {ouvert && (
        <div
          style={{
            background: FOND,
            border: `1px solid ${OR}`,
            borderRadius: 20,
            boxShadow: "0 20px 50px rgba(0,0,0,.7)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Barre méta : l'étiquette et la fermeture. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 14px 11px 16px",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".16em", color: "#8a8570" }}>
              ASSISTANT
            </span>
            <button
              onClick={() => setOuvert(false)}
              aria-label="Replier"
              style={{
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 5, fontSize: 14, color: META, background: "none", border: 0, cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* Transcription : elle défile, la saisie reste collée en bas. */}
          <div
            style={{
              padding: "0 18px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "55vh",
              overflowY: "auto",
              paddingBottom: 16,
            }}
          >
            {messages.map((m, i) =>
              m.role === "user" ? (
                // Tour utilisateur : bulle blanche, texte noir, à droite.
                <div
                  key={i}
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    background: "#fff",
                    color: "#111",
                    padding: "8px 11px",
                    // Le coin bas-droit se ferme : la bulle pointe vers celui
                    // qui l'a écrite.
                    borderRadius: "12px 12px 3px 12px",
                    maxWidth: "88%",
                    alignSelf: "flex-end",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.contenu}
                </div>
              ) : (
                // Tour assistant : texte plein derrière un filet vertical.
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 1.5, flex: "none", background: FILET }} />
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: TEXTE, whiteSpace: "pre-wrap" }}>
                    {m.contenu}
                  </div>
                </div>
              )
            )}

            {frappe && <Frappe />}

            {suites.length > 0 && !frappe && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suites.map((s, i) => (
                  <button
                    key={`${s.libelle}-${i}`}
                    onClick={() => (s.href ? window.open(s.href, "_blank", "noopener") : lancer(s.texte))}
                    style={{
                      fontSize: 12,
                      color: s.principal ? "#cfcabb" : META,
                      background: "none",
                      border: `1px solid ${s.principal ? "#4a4633" : "#2a2e2c"}`,
                      borderRadius: 6,
                      padding: "5px 10px",
                      cursor: "pointer",
                      fontFamily: SANS,
                    }}
                  >
                    {s.libelle}
                  </button>
                ))}
              </div>
            )}

            {brouillon && (
              <div style={{ border: `1px solid ${SEPARATEUR}`, borderRadius: 10, padding: 11 }}>
                <p style={{ margin: "0 0 8px", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".16em", color: "#8a8570" }}>
                  BROUILLON — À RELIRE
                </p>
                {[["destinataire", "Destinataire"], ["objet", "Objet"]].map(([cle, libelle]) => (
                  <input
                    key={cle}
                    value={brouillon[cle]}
                    onChange={(e) => setBrouillon({ ...brouillon, [cle]: e.target.value })}
                    placeholder={libelle}
                    style={{
                      width: "100%", marginBottom: 6, background: FOND, border: `1px solid ${SEPARATEUR}`,
                      borderRadius: 7, padding: "6px 9px", color: TEXTE, fontSize: 12.5, fontFamily: SANS, outline: "none",
                    }}
                  />
                ))}
                <textarea
                  rows={7}
                  value={brouillon.corps}
                  onChange={(e) => setBrouillon({ ...brouillon, corps: e.target.value })}
                  style={{
                    width: "100%", background: FOND, border: `1px solid ${SEPARATEUR}`, borderRadius: 7,
                    padding: "6px 9px", color: TEXTE, fontSize: 12.5, lineHeight: 1.55, fontFamily: SANS,
                    outline: "none", resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => setBrouillon(null)}
                    style={{ background: "none", border: `1px solid #2a2e2c`, borderRadius: 6, color: META, fontSize: 12, padding: "5px 10px", cursor: "pointer", fontFamily: SANS }}
                  >
                    Écarter
                  </button>
                  <button
                    onClick={() => envoyerMail.mutate()}
                    disabled={!brouillon.destinataire.trim() || !brouillon.objet.trim() || envoyerMail.isPending}
                    style={{
                      background: OR, border: 0, borderRadius: 6, color: FOND, fontSize: 12, fontWeight: 500,
                      padding: "5px 12px", cursor: "pointer", fontFamily: SANS,
                      opacity: !brouillon.destinataire.trim() || !brouillon.objet.trim() ? 0.4 : 1,
                    }}
                  >
                    {envoyerMail.isPending ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </div>
            )}

            <div ref={finRef} />
          </div>
        </div>
      )}

      {/* La saisie : une pilule, ouverte ou non. */}
      <div
        onClick={() => { setOuvert(true); champRef.current?.focus(); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "12px 12px 12px 18px",
          background: FOND,
          border: `1px solid ${OR}`,
          borderRadius: 26,
          boxShadow: ouvert ? "0 20px 50px rgba(0,0,0,.7)" : "none",
          cursor: "text",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: OR, flex: "none" }} />

        <input
          ref={champRef}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onFocus={() => setOuvert(true)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lancer(); } }}
          placeholder="Ask the assistant"
          style={{
            flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none",
            color: TEXTE, fontFamily: SANS, fontSize: 14,
          }}
        />

        <button
          onClick={(e) => { e.stopPropagation(); lancer(); }}
          aria-label="Envoyer"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            cursor: actif ? "pointer" : "default",
            // Plein or une fois ouvert, contour sombre au repos.
            background: ouvert ? OR : "#1a1c1b",
            color: ouvert ? FOND : "#cfcabb",
            border: ouvert ? 0 : `1px solid ${FILET}`,
            opacity: ouvert && !actif ? 0.55 : 1,
            transition: "all .15s",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

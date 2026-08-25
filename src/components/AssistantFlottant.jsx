import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// L'assistant : le champ de saisie EST le bouton.
//
// Au repos, une pilule étroite ancrée en bas à droite. Dès la frappe ou au clic,
// une feuille de
// conversation s'ouvre au-dessus ; la barre, elle, ne bouge pas — c'est ce qui
// distingue ce motif d'une fenêtre de discussion classique.
//
// Le modèle ne décide de rien : il traduit une phrase en appel d'outil, et les
// outils sont du code vérifié côté serveur.

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// L'indicateur de frappe doit se voir : on ne montre jamais la réponse avant.
const DUREE_FRAPPE = 900;

const ANIMATIONS = `
@keyframes assistant-rise {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes assistant-dot {
  0%, 100% { opacity: .2; transform: translateY(0); }
  50%      { opacity: 1;  transform: translateY(-3px); }
}
`;

function Bulle({ role, children }) {
  const moi = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: moi ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "84%",
          fontSize: 13,
          lineHeight: 1.55,
          padding: "10px 12px",
          whiteSpace: "pre-wrap",
          ...(moi
            ? { background: "#fff", color: "#111", borderRadius: "13px 13px 3px 13px" }
            : {
                background: "#161616",
                color: "#e6e6e4",
                border: "1px solid #222",
                borderRadius: "13px 13px 13px 3px",
              }),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Frappe() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 2 }}>
      {[0, 0.15, 0.3].map((delai) => (
        <span
          key={delai}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#fff",
            animation: `assistant-dot 1.2s ${delai}s infinite`,
          }}
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
  const finRef = useRef(null);
  const champRef = useRef(null);

  // Le fil colle au dernier message, indicateur de frappe compris.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, frappe]);

  const envoyer = useMutation({
    mutationFn: async (suite) => {
      // La réponse ne s'affiche pas avant que l'indicateur ait eu le temps
      // d'exister : sans cela, une réponse rapide donne un à-coup.
      const [r] = await Promise.all([
        base44.request("POST", "/api/assistant/commande", { body: { messages: suite } }),
        new Promise((resoudre) => setTimeout(resoudre, DUREE_FRAPPE)),
      ]);
      return r;
    },
    onSuccess: (r) => {
      setFrappe(false);
      setMessages((m) => [...m, { role: "assistant", contenu: r.texte || "—" }]);
      // Une action réellement exécutée se signale : le texte du modèle n'en est
      // pas la preuve.
      for (const a of r.actions || []) {
        const drive = a.name === "creer_drive_dossier";
        toast.success(drive ? "Dossier Drive créé" : a.resultat?.cree ? "Ajouté à Monday" : "Mis à jour dans Monday", {
          description: drive && a.resultat?.chemin ? a.resultat.chemin : a.resultat?.titre,
          action: a.resultat?.url
            ? { label: "Ouvrir", onClick: () => window.open(a.resultat.url, "_blank", "noopener") }
            : undefined,
        });
      }
    },
    onError: (e) => {
      setFrappe(false);
      setMessages((m) => [...m, { role: "assistant", contenu: e?.message || "Je n'ai pas pu traiter la demande." }]);
    },
  });

  const lancer = () => {
    const demande = texte.trim();
    if (!demande || envoyer.isPending) return;
    const suite = [...messages, { role: "user", contenu: demande }];
    setMessages(suite);
    setTexte("");
    setOuvert(true);
    setFrappe(true);
    envoyer.mutate(suite);
  };

  const actif = !!texte.trim();

  return (
    <div
      className="assistant-flottant"
      style={{
        // Étroite et calée à droite, là où se tenait la bulle de signalement.
        position: "fixed",
        right: 24,
        bottom: 24,
        width: "min(360px, calc(100vw - 48px))",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: SANS,
      }}
    >
      <style>{ANIMATIONS}</style>

      {/* Feuille de conversation — au-dessus de la barre, qui ne bouge pas. */}
      {ouvert && (
        <div
          style={{
            height: 336,
            borderRadius: 18,
            background: "#0b0b0b",
            border: "1px solid #1f1f1f",
            overflow: "hidden",
            boxShadow: "0 22px 54px rgba(0,0,0,.28)",
            animation: "assistant-rise .22s cubic-bezier(.2,.8,.2,1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <Bulle key={i} role={m.role}>
                {m.contenu}
              </Bulle>
            ))}
            {frappe && <Frappe />}
            <div ref={finRef} />
          </div>

          <div
            style={{
              borderTop: "1px solid #1f1f1f",
              padding: "11px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#7a7a78",
            }}
          >
            <span>Assistant</span>
            <button
              onClick={() => setOuvert(false)}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#7a7a78")}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                font: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
                color: "#7a7a78",
                transition: "color .15s",
              }}
            >
              Collapse
            </button>
          </div>
        </div>
      )}

      {/* La barre : c'est elle le bouton. */}
      <div
        onClick={() => { setOuvert(true); champRef.current?.focus(); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#111",
          border: "1px solid #fff",
          borderRadius: 999,
          padding: "9px 9px 9px 16px",
          cursor: "text",
          boxShadow: ouvert ? "none" : "0 10px 26px rgba(0,0,0,.22)",
          transition: "box-shadow .2s",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", flex: "0 0 auto" }} />

        <input
          ref={champRef}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onFocus={() => setOuvert(true)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lancer(); } }}
          placeholder="Ask the assistant"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: 0,
            outline: "none",
            color: "#fff",
            fontFamily: SANS,
            fontSize: 13.5,
          }}
        />

        <button
          onClick={(e) => { e.stopPropagation(); lancer(); }}
          aria-label="Envoyer"
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: 0,
            flex: "0 0 auto",
            cursor: actif ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            lineHeight: 1,
            background: actif ? "#fff" : "#1c1c1c",
            color: actif ? "#111" : "#666",
            transition: "all .15s",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

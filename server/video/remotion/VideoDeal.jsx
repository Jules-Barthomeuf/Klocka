// Composition Remotion : vidéo de présentation client d'un lot (~30 s).
//
// Volontairement factuelle : elle ne montre QUE des données extraites de la
// fiche (bien, chiffres, bail, ville) — jamais le verdict, les motifs ou les
// réserves, qui sont des éléments d'analyse internes. Les champs absents sont
// simplement omis, aucune valeur n'est inventée.

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export const FPS = 30;
export const DUREE_FRAMES = 30 * FPS; // 30 secondes

// Palette de l'application (éditorial sombre).
const C = {
  fond: "#0a0c0c",
  panneau: "#0e100f",
  bordure: "#242726",
  ivoire: "#edeae5",
  gris: "#8b9391",
  teal: "#35a79b",
  tealClair: "#7fd3c9",
};

const POLICE = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const euros = (n) =>
  n == null ? null : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
const pourcent = (n) => (n == null ? null : n.toFixed(2).replace(".", ",") + " %");
const nombre = (n) => (n == null ? null : new Intl.NumberFormat("fr-FR").format(n));

const TYPOLOGIES = {
  petite_ville: "Petite ville",
  ville_moyenne: "Ville moyenne",
  grande_ville: "Grande ville",
  metropole: "Métropole",
};

// ---------------------------------------------------------------------------
// Briques d'animation
// ---------------------------------------------------------------------------

// Fond commun : noir profond + halo teal discret + liseré bas.
function Fond() {
  return (
    <AbsoluteFill style={{ backgroundColor: C.fond }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 45% at 50% 0%, rgba(53,167,155,0.10), transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: `linear-gradient(90deg, transparent, ${C.teal}, transparent)`,
          opacity: 0.5,
        }}
      />
    </AbsoluteFill>
  );
}

// Fondu d'entrée/sortie d'une scène (frames relatifs à la Sequence).
function Scene({ duree, children }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, duree - 12, duree], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        opacity,
        fontFamily: POLICE,
        color: C.ivoire,
        justifyContent: "center",
        alignItems: "center",
        padding: "0 140px",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

// Apparition en glissé vertical, décalée de `delai` frames.
function Montee({ delai = 0, children, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delai, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 36}px)`, ...style }}>
      {children}
    </div>
  );
}

// Petit intitulé teal en capitales espacées.
function Etiquette({ children }) {
  return (
    <div style={{ color: C.teal, fontSize: 30, letterSpacing: "0.32em", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

// Valeur numérique qui « compte » jusqu'à sa cible.
function Compteur({ valeur, format, delai = 0, duree = 45, style }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame - delai, [0, duree], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Décélération douce en fin de compte.
  const eased = 1 - Math.pow(1 - t, 3);
  return <div style={style}>{format(valeur * eased)}</div>;
}

// Trait horizontal qui se déploie.
function Trait({ delai = 0, largeur = 220 }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delai, [0, 30], [0, largeur], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ height: 2, width: w, background: C.teal, margin: "42px auto" }} />;
}

// ---------------------------------------------------------------------------
// Scènes
// ---------------------------------------------------------------------------

function SceneOuverture({ d, duree }) {
  return (
    <Scene duree={duree}>
      <Montee delai={4}>
        <Etiquette>Klocka</Etiquette>
      </Montee>
      <Trait delai={14} />
      <Montee delai={20} style={{ textAlign: "center" }}>
        <div style={{ fontSize: 92, fontWeight: 300, lineHeight: 1.15, maxWidth: 1400 }}>
          Opportunité d'investissement
        </div>
      </Montee>
      <Montee delai={38} style={{ marginTop: 44, textAlign: "center" }}>
        <div style={{ fontSize: 42, color: C.gris, fontWeight: 300 }}>
          {[d.type_actif, d.commune].filter(Boolean).join(" — ")}
        </div>
      </Montee>
    </Scene>
  );
}

function LigneBien({ delai, titre, valeur }) {
  if (!valeur) return null;
  return (
    <Montee
      delai={delai}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderBottom: `1px solid ${C.bordure}`,
        padding: "30px 8px",
        gap: 60,
      }}
    >
      <div style={{ color: C.gris, fontSize: 34 }}>{titre}</div>
      <div style={{ fontSize: 44, fontWeight: 400, textAlign: "right" }}>{valeur}</div>
    </Montee>
  );
}

function SceneBien({ d, duree }) {
  const lignes = [
    ["Type d'actif", d.type_actif],
    ["Surface", d.surface_m2 ? `${nombre(d.surface_m2)} m²` : null],
    ["Localisation", [d.adresse, d.commune].filter(Boolean).join(", ") || null],
    ["Locataire", d.locataire],
    ["Activité", d.activite],
  ].filter(([, v]) => v);

  return (
    <Scene duree={duree}>
      <Montee delai={4} style={{ alignSelf: "flex-start" }}>
        <Etiquette>Le bien</Etiquette>
      </Montee>
      <div style={{ width: "100%", maxWidth: 1300, marginTop: 60 }}>
        {lignes.map(([titre, valeur], i) => (
          <LigneBien key={titre} delai={16 + i * 12} titre={titre} valeur={valeur} />
        ))}
      </div>
    </Scene>
  );
}

function TuileChiffre({ delai, titre, valeur, format, note }) {
  return (
    <Montee
      delai={delai}
      style={{
        flex: 1,
        border: `1px solid ${C.bordure}`,
        borderRadius: 10,
        background: C.panneau,
        padding: "70px 40px",
        textAlign: "center",
      }}
    >
      <div style={{ color: C.gris, fontSize: 30, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {titre}
      </div>
      <Compteur
        valeur={valeur}
        format={format}
        delai={delai + 10}
        style={{ fontSize: 76, fontWeight: 300, color: C.tealClair, marginTop: 36 }}
      />
      {note && <div style={{ color: C.gris, fontSize: 26, marginTop: 24 }}>{note}</div>}
    </Montee>
  );
}

function SceneChiffres({ d, duree }) {
  const tuiles = [
    d.prix_fai != null && { titre: "Prix FAI", valeur: d.prix_fai, format: euros },
    d.loyer_annuel != null && { titre: "Loyer annuel", valeur: d.loyer_annuel, format: euros, note: "HT-HC" },
    d.rendement != null && { titre: "Rendement", valeur: d.rendement, format: pourcent, note: "sur prix FAI" },
  ].filter(Boolean);

  return (
    <Scene duree={duree}>
      <Montee delai={4}>
        <Etiquette>Chiffres clés</Etiquette>
      </Montee>
      <div style={{ display: "flex", gap: 44, width: "100%", maxWidth: 1560, marginTop: 80 }}>
        {tuiles.map((t, i) => (
          <TuileChiffre key={t.titre} delai={16 + i * 14} {...t} />
        ))}
      </div>
    </Scene>
  );
}

function SceneBailVille({ d, duree }) {
  const gauche = [
    ["Type de bail", d.bail_type],
    ["Échéance", d.bail_echeance],
    ["Années restantes", d.annees_bail_restantes != null ? String(d.annees_bail_restantes) : null],
  ].filter(([, v]) => v);
  const droite = [
    ["Commune", d.commune],
    ["Population", d.population ? `${nombre(d.population)} habitants` : null],
    ["Typologie", TYPOLOGIES[d.typologie_ville] || null],
  ].filter(([, v]) => v);

  const Colonne = ({ titre, lignes, delai }) => (
    <Montee delai={delai} style={{ flex: 1 }}>
      <Etiquette>{titre}</Etiquette>
      <div style={{ marginTop: 40 }}>
        {lignes.map(([t, v]) => (
          <div key={t} style={{ borderBottom: `1px solid ${C.bordure}`, padding: "26px 4px" }}>
            <div style={{ color: C.gris, fontSize: 28 }}>{t}</div>
            <div style={{ fontSize: 46, fontWeight: 300, marginTop: 10 }}>{v}</div>
          </div>
        ))}
      </div>
    </Montee>
  );

  return (
    <Scene duree={duree}>
      <div style={{ display: "flex", gap: 120, width: "100%", maxWidth: 1500 }}>
        {gauche.length > 0 && <Colonne titre="Le bail" lignes={gauche} delai={8} />}
        {droite.length > 0 && <Colonne titre="La ville" lignes={droite} delai={22} />}
      </div>
    </Scene>
  );
}

function SceneFin({ duree }) {
  return (
    <Scene duree={duree}>
      <Montee delai={6}>
        <div
          style={{
            width: 76,
            height: 76,
            border: `2px solid ${C.teal}`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.teal,
            fontSize: 40,
            margin: "0 auto",
          }}
        >
          K
        </div>
      </Montee>
      <Montee delai={18} style={{ marginTop: 52, textAlign: "center" }}>
        <div style={{ fontSize: 66, fontWeight: 300 }}>Présenté par Klocka</div>
      </Montee>
      <Montee delai={32} style={{ marginTop: 30, textAlign: "center" }}>
        <div style={{ fontSize: 34, color: C.gris, fontWeight: 300 }}>
          Votre conseiller vous accompagne sur ce dossier
        </div>
      </Montee>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Composition : 5 séquences sur 900 frames.
// ---------------------------------------------------------------------------

export function VideoDeal(props) {
  const d = props || {};
  const scenes = [
    { duree: 120, rendu: (n) => <SceneOuverture d={d} duree={n} /> },
    { duree: 210, rendu: (n) => <SceneBien d={d} duree={n} /> },
    { duree: 240, rendu: (n) => <SceneChiffres d={d} duree={n} /> },
    { duree: 210, rendu: (n) => <SceneBailVille d={d} duree={n} /> },
    { duree: 120, rendu: (n) => <SceneFin duree={n} /> },
  ];

  let debut = 0;
  return (
    <AbsoluteFill>
      <Fond />
      {scenes.map((s, i) => {
        const from = debut;
        debut += s.duree;
        return (
          <Sequence key={i} from={from} durationInFrames={s.duree}>
            {s.rendu(s.duree)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

// Props d'exemple pour le studio / le rendu par défaut.
export const propsExemple = {
  type_actif: "Local commercial",
  commune: "Bayonne",
  adresse: "12 rue Port-Neuf",
  surface_m2: 185,
  locataire: "Picard",
  activite: "Surgelés alimentaires",
  bail_type: "3/6/9",
  bail_echeance: "2031",
  annees_bail_restantes: 5,
  prix_fai: 780000,
  loyer_annuel: 50700,
  rendement: 6.5,
  population: 52006,
  typologie_ville: "ville_moyenne",
};

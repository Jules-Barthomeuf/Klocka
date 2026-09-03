// Composition Remotion : teaser client d'un lot (~20 s).
//
// Trois temps : la devanture du bien en mouvement 3D, les quatre chiffres qui
// décident (prix de revient, apport, rentabilité, cash-flow), puis l'appel.
//
// Volontairement factuelle : elle ne montre QUE des données extraites de la
// fiche et calculées par le moteur du simulateur — jamais le verdict, les
// motifs ou les réserves, qui sont des éléments d'analyse internes. Les champs
// absents sont simplement omis, aucune valeur n'est inventée.

import React from "react";
import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";

export const FPS = 30;
export const DUREE_FRAMES = 20 * FPS; // 20 secondes — c'est un teaser
// Scène d'ouverture cartographique (plongée France → adresse), ajoutée en tête
// quand le lot a pu être géolocalisé (prop `carte`).
export const DUREE_CARTE = 390; // 13 secondes

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
// Scène carte : plongée satellite continue de la France jusqu'à l'adresse.
//
// Principe « slippy map » : des couches de tuiles (orthophotos IGN, comme la
// plongée du détail projet) sont empilées, chacune nette autour de son niveau
// de zoom ; une caméra au zoom continu Z les fait grossir (scale 2^ΔZ) et se
// fondre l'une dans l'autre. Le point visé reste au centre de l'écran.
// ---------------------------------------------------------------------------

const URL_ORTHO =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg";

const TUILE = 512; // px logiques par tuile — images @2x, nettes jusqu'à ×2
const clampInterp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Projection Web Mercator normalisée (0..1 sur le monde entier).
const mercator = (lat, lon) => {
  const rad = (lat * Math.PI) / 180;
  return {
    x: (lon + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
};

// Une tuile qui sait disparaître si le CDN ne répond pas (trou sombre sur fond
// sombre plutôt qu'un rendu en échec).
function Tuile({ src, style }) {
  const [perdue, setPerdue] = React.useState(false);
  if (perdue) return null;
  return <Img src={src} style={style} onError={() => setPerdue(true)} pauseWhenLoading />;
}

// Une couche de tuiles au niveau L, dessinée à 512 px/tuile (= zoom L+1),
// mise à l'échelle et fondue selon le zoom caméra courant. `centre` est la
// position caméra en Mercator normalisé — elle glisse de la France au bien.
function CoucheTuiles({ centre, L, zoomCourant }) {
  const zBase = L + 1;
  // Les couches s'empilent : celle du dessous reste opaque pendant que la
  // suivante, plus nette, apparaît PAR-DESSUS et la recouvre. Croiser deux
  // fondus sur fond noir creusait un passage sombre à chaque transition.
  // On ne retire une couche qu'une fois totalement cachée (zoom > zBase+2.1).
  const opacity = interpolate(
    zoomCourant,
    [zBase - 0.35, zBase - 0.1, zBase + 2.1, zBase + 2.45],
    [0, 1, 1, 0],
    clampInterp
  );
  if (opacity <= 0.002) return null;

  const s = Math.pow(2, zoomCourant - zBase);
  const n = Math.pow(2, L);
  const cx = centre.x * n;
  const cy = centre.y * n;
  // Couverture calculée au plus petit scale où la couche est visible (0.85) :
  // au-delà, on zoome — les bords sortent de l'écran d'eux-mêmes.
  const porteeX = 960 / 0.85 / TUILE;
  const porteeY = 540 / 0.85 / TUILE;
  const tuiles = [];
  for (let tx = Math.floor(cx - porteeX); tx <= Math.floor(cx + porteeX); tx++) {
    for (let ty = Math.floor(cy - porteeY); ty <= Math.floor(cy + porteeY); ty++) {
      if (ty < 0 || ty >= n) continue;
      const txMonde = ((tx % n) + n) % n; // la longitude boucle
      tuiles.push({ tx, ty, txMonde });
    }
  }

  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${s})` }}>
      {tuiles.map(({ tx, ty, txMonde }) => (
        <Tuile
          key={`${tx}:${ty}`}
          src={`${URL_ORTHO}&TILEMATRIX=${L}&TILEROW=${ty}&TILECOL=${txMonde}`}
          style={{
            position: "absolute",
            left: 960 + (tx - cx) * TUILE,
            top: 540 + (ty - cy) * TUILE,
            width: TUILE,
            height: TUILE,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

// Marqueur : point teal pulsant à l'adresse, avec le libellé en cartouche.
function MarqueurAdresse({ apparition, libelle }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - apparition, fps, config: { damping: 14, stiffness: 160 } });
  if (frame < apparition) return null;
  const pulsation = ((frame - apparition) % 50) / 50;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: POLICE }}>
      {/* Onde qui s'étend depuis le point */}
      <div
        style={{
          position: "absolute",
          width: 26 + pulsation * 150,
          height: 26 + pulsation * 150,
          borderRadius: "50%",
          border: `2px solid ${C.teal}`,
          opacity: (1 - pulsation) * 0.55 * p,
        }}
      />
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: C.teal,
          border: `4px solid ${C.fond}`,
          boxShadow: `0 0 30px rgba(53,167,155,0.8)`,
          transform: `scale(${p})`,
        }}
      />
      {libelle && (
        <div
          style={{
            position: "absolute",
            top: "58%",
            padding: "18px 34px",
            background: "rgba(10,12,12,0.82)",
            border: `1px solid ${C.bordure}`,
            borderRadius: 8,
            fontSize: 34,
            fontWeight: 300,
            color: C.ivoire,
            opacity: p,
            transform: `translateY(${(1 - p) * 24}px)`,
            maxWidth: 1100,
            textAlign: "center",
          }}
        >
          {libelle}
        </div>
      )}
    </AbsoluteFill>
  );
}

function SceneCarte({ carte, duree }) {
  const frame = useCurrentFrame();
  const zoomDepart = 6.2; // la France remplit l'écran
  const zoomFinal = carte.zoom || 16;
  // Caméra : posée sur la France, plongée sur ~9 s (cubique : lente au
  // décollage, rapide en croisière, douce à l'atterrissage), puis 3 s sur
  // l'adresse pendant que le marqueur s'installe.
  const t = interpolate(frame, [20, duree - 90], [0, 1], {
    ...clampInterp,
    easing: Easing.inOut(Easing.cubic),
  });
  const zoomCourant = zoomDepart + (zoomFinal - zoomDepart) * t;
  // Le centre caméra glisse du milieu de la France jusqu'au bien pendant la
  // plongée (interpolation en espace Mercator, comme le ferait un globe).
  const depart = mercator(46.4, 2.6);
  const arrivee = mercator(carte.lat, carte.lon);
  const centre = {
    x: depart.x + (arrivee.x - depart.x) * t,
    y: depart.y + (arrivee.y - depart.y) * t,
  };
  // Couches tous les 2 niveaux.
  const niveaux = [4, 6, 8, 10, 12, 14, 16].filter((L) => L + 1 - 0.35 <= zoomFinal + 0.2);
  const opacity = interpolate(frame, [0, 10, duree - 12, duree], [0, 1, 1, 0], clampInterp);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: C.fond }}>
      {niveaux.map((L) => (
        <CoucheTuiles key={L} centre={centre} L={L} zoomCourant={zoomCourant} />
      ))}
      {/* Vignettage : recentre l'œil et fond les tuiles dans l'habillage */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 55%, rgba(10,12,12,0.75) 100%)",
        }}
      />
      <Montee
        delai={6}
        style={{
          position: "absolute",
          top: 90,
          width: "100%",
          textAlign: "center",
          fontFamily: POLICE,
          textShadow: "0 1px 16px rgba(4,7,10,0.95), 0 0 3px rgba(4,7,10,0.8)",
        }}
      >
        <Etiquette>Localisation</Etiquette>
      </Montee>
      <MarqueurAdresse apparition={duree - 84} libelle={carte.libelle} />
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 32,
          fontFamily: POLICE,
          fontSize: 20,
          color: "rgba(139,147,145,0.6)",
        }}
      >
        © IGN
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Vue aérienne en 3D : quand Street View n'a pas de façade, l'orthophoto IGN
// du bien prend la même caméra — une perspective qui contourne l'image, un
// arrière-plan flouté qui glisse plus lentement. Le relief vient du décalage.
// ---------------------------------------------------------------------------

function SceneVueAerienne({ d, duree }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, duree], [0, 1], clampInterp);
  const doux = Easing.inOut(Easing.quad)(t);
  const rotation = -8 + doux * 16;
  const inclinaison = 14 - doux * 6;
  const echelle = 1.18 + doux * 0.12;
  const glissement = (0.5 - doux) * 70;
  const opacity = interpolate(frame, [0, 14, duree - 14, duree], [0, 1, 1, 0], clampInterp);
  const centre = mercator(d.carte.lat, d.carte.lon);
  const titre = [d.adresse, d.commune].filter(Boolean).join(", ") || d.commune || "Le bien";

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: C.fond, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(1.6) translateX(${glissement / 2}px)`, filter: "blur(26px) brightness(0.45)" }}>
        <CoucheTuiles centre={centre} L={17} zoomCourant={18.4} />
      </AbsoluteFill>
      <AbsoluteFill style={{ perspective: 1500, justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `rotateX(${inclinaison}deg) rotateY(${rotation}deg) scale(${echelle}) translateX(${glissement}px)`,
            transformStyle: "preserve-3d",
            boxShadow: "0 60px 140px rgba(0,0,0,0.7)",
            overflow: "hidden",
          }}
        >
          <CoucheTuiles centre={centre} L={17} zoomCourant={18.6} />
          {/* Le repère du bien, au centre */}
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background: C.menthe || "#96c0b8", boxShadow: "0 0 0 10px rgba(150,192,184,0.25), 0 0 40px rgba(0,0,0,0.6)" }} />
          </AbsoluteFill>
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,12,12,0.55) 0%, transparent 28%, rgba(10,12,12,0.55) 62%, rgba(10,12,12,0.97) 100%)",
        }}
      />
      <AbsoluteFill style={{ fontFamily: POLICE, color: C.ivoire, justifyContent: "flex-end", padding: "0 120px 110px" }}>
        <Montee delai={16}>
          <Etiquette>{d.type_actif || "Opportunité"}</Etiquette>
        </Montee>
        <Montee delai={28} style={{ marginTop: 26 }}>
          <div
            style={{
              fontSize: titre.length > 46 ? 58 : titre.length > 30 ? 72 : 86,
              fontWeight: 300,
              lineHeight: 1.12,
              textShadow: "0 2px 30px rgba(0,0,0,0.95)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {titre}
          </div>
        </Montee>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Devanture : la façade en mouvement 3D.
//
// Pas de vraie profondeur — on n'en a pas — mais une caméra qui contourne
// légèrement l'image en perspective, avec un plan d'arrière-fond flouté qui
// glisse plus lentement. Le décalage entre les deux plans donne le relief.
// ---------------------------------------------------------------------------

function SceneDevanture({ d, duree }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, duree], [0, 1], clampInterp);
  const doux = Easing.inOut(Easing.quad)(t);

  // Rotation de faible amplitude : au-delà, la déformation se voit.
  const rotation = -7 + doux * 14;
  const echelle = 1.12 + doux * 0.1;
  const glissement = (0.5 - doux) * 60;
  const opacity = interpolate(frame, [0, 14, duree - 14, duree], [0, 1, 1, 0], clampInterp);
  const titre = [d.adresse, d.commune].filter(Boolean).join(", ") || d.commune || "Le bien";

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: C.fond, overflow: "hidden" }}>
      {/* Arrière-plan flouté : il glisse deux fois moins vite que la façade. */}
      <AbsoluteFill
        style={{
          transform: `scale(1.5) translateX(${glissement / 2}px)`,
          filter: "blur(28px) brightness(0.45)",
        }}
      >
        <Img src={d.devanture} style={{ width: "100%", height: "100%", objectFit: "cover" }} pauseWhenLoading />
      </AbsoluteFill>

      {/* Façade, posée dans une scène en perspective. */}
      <AbsoluteFill style={{ perspective: 1600, justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `rotateY(${rotation}deg) scale(${echelle}) translateX(${glissement}px)`,
            transformStyle: "preserve-3d",
            boxShadow: "0 60px 140px rgba(0,0,0,0.7)",
          }}
        >
          <Img src={d.devanture} style={{ width: "100%", height: "100%", objectFit: "cover" }} pauseWhenLoading />
        </div>
      </AbsoluteFill>

      {/* Assombrissement du bas : le texte doit rester lisible sur toute photo. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,12,12,0.55) 0%, transparent 28%, rgba(10,12,12,0.55) 62%, rgba(10,12,12,0.97) 100%)",
        }}
      />

      {/* La couleur doit être posée ici : contrairement aux autres scènes, celle-ci
          ne passe pas par <Scene>, qui portait le blanc ivoire. */}
      <AbsoluteFill
        style={{ fontFamily: POLICE, color: C.ivoire, justifyContent: "flex-end", padding: "0 120px 110px" }}
      >
        <Montee delai={16}>
          <Etiquette>{d.type_actif || "Opportunité"}</Etiquette>
        </Montee>
        <Montee delai={28} style={{ marginTop: 26 }}>
          <div
            style={{
              // Une adresse à rallonge ne doit pas manger l'image : la taille
              // s'adapte et le texte se coupe à deux lignes.
              fontSize: titre.length > 46 ? 58 : titre.length > 30 ? 72 : 86,
              fontWeight: 300,
              lineHeight: 1.12,
              textShadow: "0 2px 30px rgba(0,0,0,0.95)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {titre}
          </div>
        </Montee>
        {(d.locataire || d.surface_m2) && (
          <Montee delai={42} style={{ marginTop: 22 }}>
            <div style={{ fontSize: 38, color: C.ivoire, opacity: 0.75, fontWeight: 300 }}>
              {[d.locataire, d.surface_m2 ? `${nombre(d.surface_m2)} m²` : null].filter(Boolean).join(" · ")}
            </div>
          </Montee>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
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
        padding: "54px 26px",
        textAlign: "center",
      }}
    >
      <div style={{ color: C.gris, fontSize: 25, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {titre}
      </div>
      <Compteur
        valeur={valeur}
        format={format}
        delai={delai + 10}
        style={{ fontSize: 56, fontWeight: 300, color: C.tealClair, marginTop: 28, whiteSpace: "nowrap" }}
      />
      {note && <div style={{ color: C.gris, fontSize: 22, marginTop: 18 }}>{note}</div>}
    </Montee>
  );
}

// Les quatre chiffres qui décident. Ils viennent du moteur du simulateur, pas
// d'un calcul refait pour la vidéo : ce que voit le client est ce que voit
// l'analyste.
function SceneDonneesCles({ d, duree }) {
  const c = d.cles || {};
  const tuiles = [
    c.prix_revient != null && { titre: "Prix de revient", valeur: c.prix_revient, format: euros, note: "acte en main" },
    c.apport != null && { titre: "Apport nécessaire", valeur: c.apport, format: euros },
    c.rentabilite != null && { titre: "Rentabilité", valeur: c.rentabilite, format: pourcent },
    // « / mois » va dans la note : accolé à la valeur, il la faisait passer à
    // la ligne dans la tuile.
    c.cashflow_mois != null && { titre: "Cash-flow moyen", valeur: c.cashflow_mois, format: euros, note: "par mois" },
  ].filter(Boolean);

  return (
    <Scene duree={duree}>
      <Montee delai={4}>
        <Etiquette>Données clés</Etiquette>
      </Montee>
      <div style={{ display: "flex", gap: 30, width: "100%", maxWidth: 1660, marginTop: 64 }}>
        {tuiles.map((t, i) => (
          <TuileChiffre key={t.titre} delai={14 + i * 10} {...t} />
        ))}
      </div>
      {c.hypotheses && (
        <Montee delai={70} style={{ marginTop: 52 }}>
          {/* Une hypothèse tue se prend pour un fait : on l'affiche. */}
          <div style={{ fontSize: 26, color: C.gris, fontWeight: 300 }}>
            Hypothèses de financement : {c.hypotheses}
          </div>
        </Montee>
      )}
    </Scene>
  );
}

function SceneFin({ duree }) {
  return (
    <Scene duree={duree}>
      <Montee delai={6}>
        {/* Monogramme Klocka (même dessin que public/logo-klocka.svg). */}
        <svg viewBox="26 20 48 60" style={{ width: 110, height: 138, display: "block", margin: "0 auto" }}>
          <rect x="33" y="26.5" width="6.8" height="47" fill="#ffffff" />
          <polygon points="66.2,26.5 69.6,26.5 47.1,49.2 43.7,49.2" fill="#ffffff" />
          <path d="M40.2 51.2 H52.4 L71.6 73.5 H59.4 L40.2 56.4 Z" fill="#8CCFBE" />
        </svg>
      </Montee>
      <Montee delai={18} style={{ marginTop: 52, textAlign: "center" }}>
        <div style={{ fontSize: 66, fontWeight: 300 }}>Le dossier complet vous attend</div>
      </Montee>
      <Montee delai={32} style={{ marginTop: 30, textAlign: "center" }}>
        <div style={{ fontSize: 34, color: C.gris, fontWeight: 300 }}>
          Bail, copropriété, marché local et simulation — avec votre conseiller Klocka
        </div>
      </Montee>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Composition : 5 séquences sur 900 frames.
// ---------------------------------------------------------------------------

/**
 * Le montage, en un seul endroit : trois temps — la devanture, les chiffres,
 * l'appel. Chaque scène n'apparaît que si elle a de quoi se remplir ; un teaser
 * à trous serait pire que court.
 *
 * La durée de la composition en découle (voir dureeTotale) : calculée à part,
 * elle finissait par ne plus correspondre au montage.
 */
export function construireScenes(props) {
  const d = props || {};
  const ouverture = d.devanture
    ? { duree: 240, rendu: (n) => <SceneDevanture d={d} duree={n} /> }
    : d.carte
      ? // Pas de façade disponible : la plongée cartographique situe le bien.
        { duree: DUREE_CARTE, rendu: (n) => <SceneCarte carte={d.carte} duree={n} /> }
      : { duree: 150, rendu: (n) => <SceneOuverture d={d} duree={n} /> };

  // Sans façade mais avec une adresse précise : après la plongée, la vue
  // aérienne prend la caméra 3D — la vidéo ne perd pas son mouvement.
  const aerienne = !d.devanture && d.carte && d.carte.zoom >= 17
    ? [{ duree: 210, rendu: (n) => <SceneVueAerienne d={d} duree={n} /> }]
    : [];

  return [
    ouverture,
    ...aerienne,
    ...(d.cles ? [{ duree: 270, rendu: (n) => <SceneDonneesCles d={d} duree={n} /> }] : []),
    // Sans chiffres, le bien parle de lui-même plutôt que de laisser un vide.
    ...(d.cles ? [] : [{ duree: 210, rendu: (n) => <SceneBien d={d} duree={n} /> }]),
    { duree: 90, rendu: (n) => <SceneFin duree={n} /> },
  ];
}

/** Durée exacte du montage, en frames. */
export const dureeTotale = (props) =>
  construireScenes(props).reduce((n, s) => n + s.duree, 0);

export function VideoDeal(props) {
  const scenes = construireScenes(props);

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
  carte: {
    lat: 43.4904,
    lon: -1.4768,
    zoom: 17,
    libelle: "12 Rue Port-Neuf 64100 Bayonne",
  },
  cles: {
    prix_revient: 905000,
    apport: 135750,
    rentabilite: 5.6,
    cashflow_mois: 310,
    hypotheses: "apport 15 %, 3,7 % sur 20 ans",
  },
};

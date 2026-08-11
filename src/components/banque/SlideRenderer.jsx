import React from "react";
import { MapPin, Building2, Users, Globe, Star, Briefcase, Bus, Euro, Wrench, Landmark as LandmarkIcon, TrendingUp, Calendar, Percent, HandCoins, Info, CheckCircle2, ArrowDown, Home, Key, FileText, Mail } from "lucide-react";

const fmt = (v) => typeof v === "number" ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v)) : v;
const fmtEur = (v) => typeof v === "number" ? fmt(v) + " €" : v;

/* ====== Shared visual elements ====== */

// Decorative arcs (bottom-right corner, like the PDF)
function DecoArcs({ opacity = 0.06 }) {
  return (
    <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: '40%', height: '80%' }}>
      <svg viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="xMaxYMax meet">
        <circle cx="400" cy="400" r="200" fill="none" stroke="white" strokeWidth="1" opacity={opacity} />
        <circle cx="400" cy="400" r="280" fill="none" stroke="white" strokeWidth="1" opacity={opacity * 0.7} />
      </svg>
    </div>
  );
}

// Slide title bar (big bold title + teal subtitle + teal underline)
function SlideTitle({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-[2.8vw] font-extrabold text-white leading-tight tracking-tight uppercase">{title}</h2>
      {subtitle && <p className="text-[#2A9D8F] text-[1.2vw] mt-1">{subtitle}</p>}
      <div className="w-[6%] h-[3px] bg-[#2A9D8F] mt-3 rounded-full" />
    </div>
  );
}

// Icon circle (colored bg with icon)
function IconCircle({ icon: Icon, color = "#2A9D8F", size = "w-10 h-10" }) {
  return (
    <div className={`${size} rounded-full flex items-center justify-center`} style={{ backgroundColor: color + '25' }}>
      <Icon className="w-[55%] h-[55%]" style={{ color }} />
    </div>
  );
}

// Card with colored top border
function InfoCard({ color = "#2A9D8F", children, className = "" }) {
  return (
    <div className={`relative rounded-xl bg-[#1E1E1E]/80 border border-white/[0.06] overflow-hidden ${className}`}>
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ backgroundColor: color }} />
      <div className="p-5 pt-6">{children}</div>
    </div>
  );
}

/* ====== SLIDE COMPONENTS ====== */

// PAGE 1: Cover - Candlestick pattern + bold title
function CoverSlide({ slide }) {
  const c = slide.content;
  // Generate candlestick-like pattern
  const candles = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 30; col++) {
      const h = 8 + Math.random() * 22;
      const y = 6 + row * 24;
      const x = 6 + col * 20;
      const isRed = Math.random() > 0.6;
      const opacity = 0.15 + Math.random() * 0.5;
      candles.push(
        <g key={`${row}-${col}`}>
          <line x1={x + 3} y1={y} x2={x + 3} y2={y + h + 4} stroke={isRed ? "#ef4444" : "#9ca3af"} strokeWidth="1" opacity={opacity * 0.5} />
          <rect x={x} y={y + 2} width="6" height={h} rx="1" fill={isRed ? "#ef4444" : "#9ca3af"} opacity={opacity} />
        </g>
      );
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] relative overflow-hidden">
      {/* Klocka icon */}
      <div className="absolute top-4 left-5 z-10">
        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
          <Building2 className="w-4 h-4 text-white/60" />
        </div>
      </div>
      {/* Candlestick background */}
      <div className="w-full" style={{ height: '48%' }}>
        <svg viewBox="0 0 620 130" className="w-full h-full" preserveAspectRatio="xMidYMid slice">{candles}</svg>
      </div>
      {/* Content */}
      <div className="flex-1 px-[5%] pb-[4%] flex flex-col justify-end relative">
        <DecoArcs opacity={0.08} />
        {c.client_name && <p className="text-gray-300 text-[1.4vw] mb-2">{c.client_name}</p>}
        <h1 className="text-[4vw] font-extrabold text-white leading-[1.05] tracking-tight uppercase">
          BUSINESS PLAN<br/>INVESTISSEMENT IMMOBILIER
        </h1>
        {(c.subtitle || c.project_title) && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/[0.08] border border-white/[0.1] rounded-lg px-4 py-2 w-fit">
            <MapPin className="w-4 h-4 text-white/60" />
            <span className="text-white text-[1.1vw]">{c.subtitle || c.project_title}</span>
          </div>
        )}
        <p className="text-gray-400 text-[1vw] mt-3">Présentation à l'attention de votre établissement bancaire</p>
      </div>
    </div>
  );
}

// PAGE 2: Sommaire
function SommaireSlide({ slide }) {
  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="Sommaire" />
      <div className="flex-1 grid grid-cols-3 gap-3 mt-2">
        {slide.content.sections.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E]/60 border border-white/[0.06] hover:bg-[#1E1E1E] transition-colors">
            <span className="text-[#2A9D8F] text-[1.4vw] font-bold w-8">{s.num}</span>
            <span className="text-gray-300 text-[1vw]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// PAGE 3: La ville / Environnement dynamique
function VilleSlide({ slide }) {
  const c = slide.content;
  const BULLET_ICONS = [Globe, Briefcase, Users, Star];
  const BULLET_COLORS = ["#2A9D8F", "#2A9D8F", "#2A9D8F", "#F59E0B"];

  // Split description into bullet points
  const bullets = c.description ? c.description.split(/[.!]\s+/).filter(s => s.trim().length > 15).slice(0, 4) : [];

  return (
    <div className="w-full h-full flex bg-[#2D2D2D] relative overflow-hidden">
      <DecoArcs />
      {/* Left panel */}
      <div className="w-[45%] p-[5%] flex flex-col justify-center">
        <div className="mb-2">
          <Globe className="w-6 h-6 text-white/40 mb-4" />
        </div>
        <h2 className="text-[2.6vw] font-extrabold text-white leading-tight uppercase">UN ENVIRONNEMENT DYNAMIQUE</h2>
        <p className="text-[#F59E0B] text-[1.1vw] uppercase tracking-wider mt-2">
          {c.badges?.[0] ? `SUR ${c.badges[0].toUpperCase()}` : "SUR LE QUARTIER"}
        </p>
        <div className="mt-8 p-5 rounded-xl bg-[#1E1E1E]/80 border border-white/[0.06] border-t-2 border-t-[#F59E0B]">
          <p className="text-gray-500 text-[0.8vw] uppercase tracking-wider mb-1">ADRESSE STRATÉGIQUE</p>
          <p className="text-white text-[1.2vw] font-semibold">{slide.content.badges?.[0] || "Le quartier"}</p>
          <p className="text-gray-400 text-[0.9vw] mt-1 flex items-center gap-1"><MapPin className="w-3 h-3 text-[#2A9D8F]" /> Cœur du secteur</p>
        </div>
      </div>
      {/* Right panel - bullet cards */}
      <div className="w-[55%] p-[4%] flex flex-col justify-center">
        <div className="bg-[#1E1E1E]/60 rounded-2xl border border-white/[0.06] p-6 relative">
          <p className="text-gray-500 text-[3vw] leading-none mb-4">"</p>
          <div className="space-y-5">
            {bullets.map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <IconCircle icon={BULLET_ICONS[i % BULLET_ICONS.length]} color={BULLET_COLORS[i % BULLET_COLORS.length]} size="w-8 h-8" />
                <p className="text-gray-300 text-[0.95vw] leading-relaxed flex-1">{text.trim()}.</p>
              </div>
            ))}
            {bullets.length === 0 && c.description && (
              <p className="text-gray-300 text-[0.95vw] leading-relaxed">{c.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// PAGE 4: Transition - Emplacement
function TransitionSlide({ slide }) {
  const c = slide.content;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#2D2D2D] relative overflow-hidden">
      {c.photo && <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${c.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#2D2D2D] via-[#2D2D2D]/80 to-[#2D2D2D]/60" />
      <DecoArcs opacity={0.1} />
      <div className="relative z-10 text-center px-[10%]">
        <h2 className="text-[3.5vw] font-extrabold text-white tracking-tight uppercase">{slide.title}</h2>
        {c.subtitle && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/[0.08] border border-white/[0.1] rounded-lg px-4 py-2">
            <MapPin className="w-4 h-4 text-[#2A9D8F]" />
            <span className="text-white text-[1.1vw]">{c.subtitle}</span>
          </div>
        )}
        {c.description && <p className="text-gray-400 text-[1vw] mt-4 max-w-lg mx-auto">{c.description}</p>}
      </div>
    </div>
  );
}

// PAGE 5: Zoom quartier - 3 columns
function QuartierSlide({ slide }) {
  const c = slide.content;

  // Build columns from structured data
  const popItems = (c.entreprises || []).filter(Boolean);
  const locItems = (c.services || []).filter(Boolean);
  // transports_text = editable text lines, fallback to formatted transports objects
  let accItems = (c.transports_text || []).filter(Boolean);
  if (accItems.length === 0 && c.transports?.length) {
    accItems = c.transports.slice(0, 4).map(t => `${t.type} ${t.ligne} — ${t.distance_metres}m`);
  }

  // If columns are empty, split description as fallback
  const descBullets = c.description ? c.description.split(/[.!]\s+/).filter(s => s.trim().length > 10).map(s => s.trim()) : [];
  if (popItems.length === 0 && descBullets.length > 0) {
    popItems.push(...descBullets.splice(0, Math.min(4, descBullets.length)));
  }
  if (locItems.length === 0 && descBullets.length > 0) {
    locItems.push(...descBullets.splice(0, Math.min(4, descBullets.length)));
  }
  if (accItems.length === 0 && descBullets.length > 0) {
    accItems.push(...descBullets.splice(0, Math.min(4, descBullets.length)));
  }

  const cols = [
    { title: "POPULATION & AMBIANCE", icon: Users, color: "#8B5CF6", items: popItems },
    { title: "LOCALISATION", icon: MapPin, color: "#F59E0B", items: locItems },
    { title: "ACCESSIBILITÉ", icon: Bus, color: "#8B5CF6", items: accItems },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-5 h-5 text-white/40" />
      </div>
      <SlideTitle title={slide.title} subtitle="Un écrin résidentiel et commerçant" />
      <div className="flex-1 grid grid-cols-3 gap-4 mt-2">
        {cols.map((col, ci) => (
          <InfoCard key={ci} color={col.color}>
            <IconCircle icon={col.icon} color={col.color} size="w-12 h-12" />
            <p className="text-[0.9vw] font-bold uppercase tracking-wider mt-3" style={{ color: col.color }}>{col.title}</p>
            <div className="mt-3 space-y-2">
              {col.items.map((item, ii) => (
                <div key={ii} className="flex items-start gap-2">
                  <span className="text-[#F59E0B] text-[0.8vw] mt-0.5">›</span>
                  <p className="text-gray-300 text-[0.85vw] leading-snug">{item}</p>
                </div>
              ))}
              {col.items.length === 0 && (
                <p className="text-gray-600 text-[0.8vw] italic">À compléter</p>
              )}
            </div>
          </InfoCard>
        ))}
      </div>
    </div>
  );
}

// PAGE 6: Tension locative / Enseignes
function TensionSlide({ slide }) {
  const c = slide.content;
  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="ENSEIGNES & COMMERCES DE PREMIER RANG" subtitle="Un écosystème commercial dynamique et attractif" />
      <div className="flex-1">
        {c.logos?.length > 0 ? (
          <div className="grid grid-cols-3 gap-4" style={{ gridAutoRows: 'minmax(0, 1fr)' }}>
            {c.logos.slice(0, 5).map((url, i) => (
              <div key={i} className="bg-white rounded-2xl flex items-center justify-center p-4 shadow-lg">
                <img src={url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 mt-4">
            {(c.projets_urbains ? [c.projets_urbains] : []).concat(
              c.taux_vacance != null ? [`Taux de vacance: ${c.taux_vacance}%`] : [],
              c.bassin_emploi > 0 ? [`Bassin d'emploi: ${fmt(c.bassin_emploi)} emplois`] : [],
              c.pct_commerces > 0 ? [`${c.pct_commerces}% commerces`] : [],
            ).map((item, i) => (
              <div key={i} className="bg-[#1E1E1E]/80 rounded-xl border border-white/[0.06] p-5">
                <p className="text-gray-300 text-[0.95vw]">{item}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// PAGE 7: Présentation du local - 6 card grid
function LocalSlide({ slide }) {
  const c = slide.content;
  const loyer = c.loyer_mensuel || (c.loyer_annuel_ht ? fmtEur(Math.round(c.loyer_annuel_ht / 12)) + " /mois" : null);

  const cards = [
    { icon: MapPin, color: "#2A9D8F", label: "ADRESSE", value: c.adresse?.split(',')[0] || "—", detail: c.adresse?.split(',').slice(1).join(',').trim() },
    { icon: Home, color: "#3B82F6", label: "SURFACE TOTALE", value: c.surface || "—", detail: c.type_construction },
    { icon: Building2, color: "#F59E0B", label: "ACCÈS & VISIBILITÉ", value: "Accès Rue", detail: c.badges?.join(', ') },
    { icon: Key, color: "#EF4444", label: "LOCATAIRE EN PLACE", value: c.locataire || "—", detail: c.activite || "Activité pérenne" },
    { icon: Euro, color: "#10B981", label: "LOYER ACTUEL", value: loyer || "—", detail: null },
    { icon: Info, color: "#6B7280", label: null, value: null, detail: c.bail_type || "Bail commercial", isInfo: true },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="PRÉSENTATION DU LOCAL" subtitle="Fiche d'identité & Caractéristiques" />
      <div className="flex-1 grid grid-cols-3 gap-4">
        {cards.map((card, i) => {
          if (card.isInfo) {
            return (
              <div key={i} className="rounded-xl border border-dashed border-white/[0.1] bg-[#1E1E1E]/40 flex flex-col items-center justify-center p-4 text-center">
                <IconCircle icon={Info} color="#6B7280" size="w-10 h-10" />
                <p className="text-gray-400 text-[0.85vw] mt-2">{card.detail}</p>
              </div>
            );
          }
          return (
            <div key={i} className="rounded-xl bg-[#1E1E1E]/80 border border-white/[0.06] p-5">
              <IconCircle icon={card.icon} color={card.color} size="w-10 h-10" />
              <p className="text-gray-500 text-[0.7vw] uppercase tracking-wider mt-3">{card.label}</p>
              <p className="text-white text-[1.2vw] font-semibold mt-1" style={{ color: card.color === "#2A9D8F" ? "#2A9D8F" : undefined }}>{card.value}</p>
              {card.detail && <p className="text-gray-400 text-[0.8vw] mt-1">{card.detail}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PAGE 8: Photos du local
function LocalPhotosSlide({ slide }) {
  const c = slide.content;
  const photos = c.photos || [];
  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="PRÉSENTATION VISUELLE DU LOCAL" subtitle={c.adresse ? `${c.adresse}${c.surface ? ` - ${c.surface}` : ''}` : null} />
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
        {photos.length > 0 ? photos.slice(0, 3).map((p, i) => (
          <div key={i} className={`rounded-xl overflow-hidden border border-white/[0.06] ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
            <img src={p} alt="" className="w-full h-full object-cover" />
          </div>
        )) : (
          <>
            <div className="col-span-2 row-span-2 rounded-xl bg-[#1E2A3A] border border-white/[0.06] flex items-center justify-center">
              <p className="text-gray-500 text-[1vw]">Façade Principale et Vitrine</p>
            </div>
            <div className="rounded-xl bg-[#1E2A3A] border border-white/[0.06] flex items-center justify-center">
              <p className="text-gray-500 text-[0.9vw]">Vue Intérieure 2</p>
            </div>
            <div className="rounded-xl bg-[#1E2A3A] border border-white/[0.06] flex items-center justify-center">
              <p className="text-gray-500 text-[0.9vw]">Vue Intérieure 3</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// PAGE 9: Marché immobilier - 2 big cards
function MarcheSlide({ slide }) {
  const c = slide.content;
  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="MARCHÉ IMMOBILIER - INDICATEURS CLÉS" subtitle="Analyse comparative des valeurs sectorielles" />
      <div className="flex-1 grid grid-cols-2 gap-5 mt-2">
        <InfoCard color="#2A9D8F" className="flex flex-col items-center justify-center text-center">
          <span className="text-gray-500 text-[0.7vw] uppercase bg-[#2D2D2D] px-3 py-1 rounded-full border border-white/[0.06] mb-4">SOURCE : EQUIMMOX / DVF</span>
          <IconCircle icon={Home} color="#2A9D8F" size="w-14 h-14" />
          <p className="text-gray-400 text-[0.85vw] uppercase tracking-wider mt-4">VALEUR MOYENNE DES MURS</p>
          <p className="mt-2">
            <span className="text-white text-[3.5vw] font-bold">{c.prix_m2_median > 0 ? fmt(c.prix_m2_median) : "—"}</span>
            <span className="text-gray-400 text-[1.2vw] ml-1">€ / m²</span>
          </p>
          <p className="text-gray-500 text-[0.75vw] italic mt-3 max-w-xs">Basé sur les transactions pour des emplacements et surfaces équivalentes.</p>
        </InfoCard>

        <InfoCard color="#F59E0B" className="flex flex-col items-center justify-center text-center">
          <span className="text-gray-500 text-[0.7vw] uppercase bg-[#2D2D2D] px-3 py-1 rounded-full border border-white/[0.06] mb-4">SOURCE : EQUIMMOX</span>
          <IconCircle icon={Key} color="#F59E0B" size="w-14 h-14" />
          <p className="text-gray-400 text-[0.85vw] uppercase tracking-wider mt-4">VALEUR LOCATIVE MOYENNE</p>
          <p className="mt-2">
            <span className="text-white text-[3.5vw] font-bold">{c.offre_moyenne > 0 ? fmt(c.offre_moyenne) : c.baux_moyenne > 0 ? fmt(c.baux_moyenne) : "—"}</span>
            <span className="text-gray-400 text-[1.2vw] ml-1">€ / m² / an</span>
          </p>
          <p className="text-gray-500 text-[0.75vw] italic mt-3 max-w-xs">Basé sur les baux commerciaux en cours pour des actifs similaires dans le secteur.</p>
        </InfoCard>
      </div>
      <div className="mt-4 flex items-center gap-3 bg-[#1E1E1E]/60 rounded-xl border-l-3 border-[#2A9D8F] p-4" style={{ borderLeft: '3px solid #F59E0B' }}>
        <CheckCircle2 className="w-5 h-5 text-[#2A9D8F] flex-shrink-0" />
        <p className="text-gray-300 text-[0.9vw]">Potentiel commercial confirmé par les niveaux de loyers et valorisations du secteur.</p>
      </div>
    </div>
  );
}

// PAGE 10: Bail commercial - 6 card grid
function BailSlide({ slide }) {
  const c = slide.content;
  const dateFormat = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; } };

  const cards = [
    { icon: FileText, color: "#2A9D8F", label: "TYPE DE BAIL", value: c.bail_type || "Commercial 3/6/9", detail: "Bail classique offrant sécurité et visibilité à long terme." },
    { icon: Calendar, color: "#F59E0B", label: "DURÉE ET ÉCHÉANCE", value: `${dateFormat(c.date_debut) || "—"} - ${dateFormat(c.echeance) || "—"}`, detail: c.statut_bail ? `Statut: ${c.statut_bail}` : null },
    { icon: Building2, color: "#3B82F6", label: "DESTINATION", value: c.activite || "Activité commerciale", detail: "La destination des locaux loués." },
    { icon: Euro, color: "#EF4444", label: "LOYER ANNUEL", value: c.loyer_annuel || "—", detail: `Indexation: ${c.indexation || "ILC"}` },
    { icon: Wrench, color: "#F59E0B", label: "CHARGES ET CONDITIONS", value: c.surface || "—", detail: null },
    { icon: LandmarkIcon, color: "#8B5CF6", label: "TAXE FONCIÈRE", value: "Charge Propriétaire", detail: null },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <div className="flex items-center justify-between">
        <SlideTitle title="ZOOM SUR LE BAIL COMMERCIAL" subtitle="Analyse détaillée des conditions locatives" />
        <div className="w-10 h-10 bg-white/[0.05] rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-white/40" />
        </div>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-4 mt-1">
        {cards.map((card, i) => (
          <div key={i} className="rounded-xl bg-[#1E1E1E]/80 border border-white/[0.06] overflow-hidden">
            <div className="h-[3px]" style={{ backgroundColor: card.color }} />
            <div className="p-4 flex items-start gap-3">
              <IconCircle icon={card.icon} color={card.color} size="w-9 h-9" />
              <div className="flex-1 min-w-0">
                <p className="text-gray-500 text-[0.7vw] uppercase tracking-wider font-semibold">{card.label}</p>
                <p className="text-white text-[1.05vw] font-semibold mt-1">{card.value}</p>
                {card.detail && <p className="text-gray-400 text-[0.75vw] mt-1 leading-snug">{card.detail}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// PAGE 11: Acquisition vs Marché - 2 columns with diff badges
function AcquisitionVsMarcheSlide({ slide }) {
  const c = slide.content;
  const prixDiff = c.prix_m2_marche_median > 0 && c.prix_m2_achat > 0
    ? Math.round(((c.prix_m2_achat - c.prix_m2_marche_median) / c.prix_m2_marche_median) * 100)
    : null;
  const loyerDiff = c.offre_moyenne_marche > 0 && c.loyer_m2_achat > 0
    ? Math.round(((c.loyer_m2_achat - c.offre_moyenne_marche) / c.offre_moyenne_marche) * 100)
    : null;

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="PRIX D'ACQUISITION ET LOYERS VS MARCHÉ" subtitle="Analyse comparative du positionnement de l'actif" />
      <div className="flex-1 grid grid-cols-2 gap-5 mt-2">
        {/* Marché */}
        <InfoCard color="#2A9D8F">
          <div className="flex items-center gap-3 mb-5">
            <IconCircle icon={TrendingUp} color="#2A9D8F" size="w-9 h-9" />
            <div>
              <p className="text-white text-[1.1vw] font-bold">PRIX DE MARCHÉ</p>
              <p className="text-gray-500 text-[0.8vw]">Secteur Centre-Ville</p>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-[0.8vw]">Valeur Moyenne des Murs</p>
                <Home className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-white text-[2.5vw] font-bold mt-1">{c.prix_m2_marche_median > 0 ? fmt(c.prix_m2_marche_median) : "—"} <span className="text-gray-400 text-[1vw]">€ / m²</span></p>
              <div className="h-[2px] bg-gray-700 mt-2" />
              <span className="inline-block mt-2 text-[#2A9D8F] text-[0.7vw] border border-[#2A9D8F]/30 rounded-full px-3 py-0.5">Référence Marché</span>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-[0.8vw]">Valeur Locative Moyenne</p>
                <Key className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-white text-[2.5vw] font-bold mt-1">{c.offre_moyenne_marche > 0 ? fmt(c.offre_moyenne_marche) : c.baux_moyenne_marche > 0 ? fmt(c.baux_moyenne_marche) : "—"} <span className="text-gray-400 text-[1vw]">€ / m² / an</span></p>
              <div className="h-[2px] bg-gray-700 mt-2" />
              <span className="inline-block mt-2 text-[#2A9D8F] text-[0.7vw] border border-[#2A9D8F]/30 rounded-full px-3 py-0.5">Référence Marché</span>
            </div>
          </div>
        </InfoCard>

        {/* Actif cible */}
        <InfoCard color="#F59E0B">
          <div className="flex items-center gap-3 mb-5">
            <IconCircle icon={MapPin} color="#F59E0B" size="w-9 h-9" />
            <div>
              <p className="text-white text-[1.1vw] font-bold">LOCAL CIBLE</p>
              <p className="text-gray-500 text-[0.8vw]">Actif Cible</p>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-[0.8vw]">Prix d'Acquisition hors droits {c.prix_negocie ? `(${c.prix_negocie})` : ''}</p>
                {prixDiff !== null && (
                  <div className="flex items-center gap-1 border-2 border-[#2A9D8F] rounded-lg px-2 py-1">
                    <ArrowDown className="w-3 h-3 text-[#2A9D8F]" />
                    <span className="text-[#2A9D8F] text-[0.9vw] font-bold">{prixDiff}%</span>
                  </div>
                )}
              </div>
              <p className="text-white text-[2.5vw] font-bold mt-1">{c.prix_m2_achat > 0 ? fmt(c.prix_m2_achat) : "—"} <span className="text-gray-400 text-[1vw]">€ / m²</span></p>
              <div className="h-[2px] bg-gray-700 mt-2" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-[0.8vw]">Loyer Annuel</p>
                {loyerDiff !== null && (
                  <div className="flex items-center gap-1 border-2 border-[#2A9D8F] rounded-lg px-2 py-1">
                    <ArrowDown className="w-3 h-3 text-[#2A9D8F]" />
                    <span className="text-[#2A9D8F] text-[0.9vw] font-bold">{loyerDiff}%</span>
                  </div>
                )}
              </div>
              <p className="text-white text-[2.5vw] font-bold mt-1">{c.loyer_m2_achat > 0 ? fmt(c.loyer_m2_achat) : "—"} <span className="text-gray-400 text-[1vw]">€ / m² / an</span></p>
              <div className="h-[2px] bg-gray-700 mt-2" />
            </div>
          </div>
        </InfoCard>
      </div>
      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-[#1E1E1E]/60" style={{ borderLeft: '3px solid #F59E0B' }}>
        <CheckCircle2 className="w-5 h-5 text-[#2A9D8F] flex-shrink-0" />
        <p className="text-gray-300 text-[0.85vw]">Point d'entrée attractif avec potentiel de valorisation long terme.</p>
      </div>
    </div>
  );
}

// PAGE 12: Projection financière (paramètres business plan) - 6 cards
function ProjectionSlide({ slide }) {
  const c = slide.content;
  const cards = [
    { icon: Euro, color: "#2A9D8F", label: "LOYER INITIAL", value: c.loyer_initial || "—", detail: "Montant annuel HT HC\n(Base de calcul An 1)" },
    { icon: Building2, color: "#3B82F6", label: "CHARGES DE COPROPRIÉTÉ", value: "Locataire", detail: "Entièrement refacturées\n(Impact net nul)" },
    { icon: Wrench, color: "#F59E0B", label: "TRAVAUX (ARTICLE 606)", value: "10 000 €", detail: "Provision décennale\n(Tous les 10 ans)" },
    { icon: LandmarkIcon, color: "#EF4444", label: "TAXE FONCIÈRE", value: "Bailleur", detail: "Charge propriétaire" },
    { icon: TrendingUp, color: "#2A9D8F", label: "INDEXATION ILC", value: `+ ${c.indexation || 2} %`, detail: "Évolution théorique annuelle\n(Indice des Loyers Commerciaux)" },
    { icon: Info, color: "#6B7280", label: null, value: null, isInfo: true },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="PARAMÈTRES DU BUSINESS PLAN" subtitle="Hypothèses Financières & Techniques" />
      <div className="flex-1 grid grid-cols-3 gap-4 mt-1">
        {cards.map((card, i) => {
          if (card.isInfo) {
            return (
              <div key={i} className="rounded-xl border border-dashed border-white/[0.1] bg-[#1E1E1E]/40 flex flex-col items-center justify-center p-4 text-center">
                <IconCircle icon={Info} color="#6B7280" size="w-10 h-10" />
                <p className="text-gray-500 text-[0.8vw] mt-3 leading-snug">Ces hypothèses servent de base<br/>aux projections sur 20 ans.</p>
              </div>
            );
          }
          return (
            <div key={i} className="rounded-xl bg-[#1E1E1E]/80 border border-white/[0.06] p-5">
              <IconCircle icon={card.icon} color={card.color} size="w-10 h-10" />
              <p className="text-gray-500 text-[0.7vw] uppercase tracking-wider mt-3">{card.label}</p>
              <p className="text-[#2A9D8F] text-[1.3vw] font-bold mt-1">{card.value}</p>
              {card.detail && <p className="text-gray-400 text-[0.75vw] mt-1 whitespace-pre-line leading-snug">{card.detail}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PAGE 13: Conditions de financement - 3 big cards
function ConditionsSlide({ slide }) {
  const c = slide.content;
  const items = c.items || [];
  const duree = items.find(i => i.label?.toLowerCase().includes('dur'))?.value || "20 ans";
  const montant = items.find(i => i.label?.toLowerCase().includes('emprunt') || i.label?.toLowerCase().includes('montant'))?.value || "—";

  const condCards = [
    { icon: Calendar, color: "#2A9D8F", label: "DURÉE DU PRÊT", value: duree.replace(/\D*(\d+)\D*/, '$1'), suffix: "ANS" },
    { icon: Percent, color: "#6366F1", label: "TYPE DE TAUX", value: "TAUX FIXE", suffix: null },
    { icon: HandCoins, color: "#10B981", label: "MONTANT MAXIMUM EMPRUNTÉ", value: montant, suffix: null },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="CONDITIONS DE FINANCEMENT SOUHAITÉES" subtitle="CADRE FINANCIER DU PROJET D'INVESTISSEMENT" />
      <div className="flex-1 grid grid-cols-3 gap-5 mt-4 items-center">
        {condCards.map((card, i) => (
          <InfoCard key={i} color={card.color} className="flex flex-col items-center justify-center text-center py-8">
            <IconCircle icon={card.icon} color={card.color} size="w-16 h-16" />
            <p className="text-gray-400 text-[0.8vw] uppercase tracking-wider mt-5">{card.label}</p>
            <p className="mt-3">
              <span className="text-[#2A9D8F] text-[3vw] font-extrabold">{card.value}</span>
              {card.suffix && <span className="text-gray-400 text-[1.2vw] ml-1 align-super">{card.suffix}</span>}
            </p>
          </InfoCard>
        ))}
      </div>
    </div>
  );
}

// PAGE 14: CV porteur du projet
function CVSlide({ slide }) {
  const c = slide.content;
  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="STRUCTURATION DE L'OPÉRATION" subtitle="ORGANISATION JURIDIQUE ET CAPITALISTIQUE" />
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex gap-8 mb-8">
          <InfoCard color="#2A9D8F" className="w-56 text-center py-6">
            <IconCircle icon={Users} color="#2A9D8F" size="w-12 h-12" />
            <p className="text-white text-[1.1vw] font-semibold mt-3">{c.nom || "Investisseur"}</p>
            <p className="text-gray-500 text-[0.75vw] uppercase tracking-wider mt-1">PERSONNE PHYSIQUE</p>
          </InfoCard>
        </div>
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-px h-8 border-l border-dashed border-gray-600" />
          <div className="w-2 h-2 border border-gray-600 rotate-45" />
        </div>
        <InfoCard color="#3B82F6" className="w-72 text-center py-6 bg-[#1A2332]">
          <IconCircle icon={LandmarkIcon} color="#3B82F6" size="w-12 h-12" />
          <p className="text-white text-[1.1vw] font-bold mt-3">SOCIÉTÉ CIVILE</p>
          <p className="text-gray-500 text-[0.75vw] uppercase tracking-wider mt-1">STRUCTURE MORALE & SUPPORT<br/>D'INVESTISSEMENT</p>
        </InfoCard>
        <div className="mt-6 bg-[#2A2210] border border-[#F59E0B]/30 rounded-xl p-4 flex items-center gap-3 max-w-md">
          <FileText className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
          <div>
            <p className="text-[#F59E0B] text-[0.8vw] font-bold uppercase">EN COURS DE FINALISATION</p>
            <p className="text-gray-400 text-[0.75vw] mt-0.5">Rédaction des statuts et répartition en cours de validation.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// PAGE 15: Diagnostics
function DiagnosticsSlide({ slide }) {
  const c = slide.content;
  const dpeColors = { A: "#319834", B: "#34CC0C", C: "#C3D301", D: "#FDEE03", E: "#FDB814", F: "#EF8023", G: "#E5001E" };
  const gesColors = { A: "#F1EEF6", B: "#E3D5EC", C: "#C7AED7", D: "#A777BE", E: "#8B50A2", F: "#6A3285", G: "#4E1F67" };

  const renderScale = (note, colors, label, detail) => (
    <div>
      <p className="text-white text-[1.1vw] font-semibold mb-4">{label}</p>
      <div className="space-y-1">
        {["A", "B", "C", "D", "E", "F", "G"].map((n, idx) => {
          const isActive = note === n;
          return (
            <div key={n} className={`flex items-center transition-all ${isActive ? 'scale-105' : 'opacity-40'}`}>
              <div className="h-7 flex items-center justify-between px-3 rounded-r-md text-white text-xs" style={{ backgroundColor: colors[n], width: `${50 + idx * 8}%` }}>
                <span className="font-bold">{n}</span>
                {isActive && detail && <span className="text-[10px]">{detail}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#2D2D2D] p-[5%] relative overflow-hidden">
      <DecoArcs />
      <SlideTitle title="DIAGNOSTICS ÉNERGÉTIQUES" subtitle="Performance et émissions du local" />
      <div className="flex-1 grid grid-cols-2 gap-10 mt-4">
        {c.dpe_note && renderScale(c.dpe_note, dpeColors, "DPE — Performance énergétique", c.dpe_consommation > 0 ? `${c.dpe_consommation} kWh/m²/an` : null)}
        {c.ges_note && renderScale(c.ges_note, gesColors, "GES — Émissions de gaz", c.ges_emission > 0 ? `${c.ges_emission} kg CO₂/m²/an` : null)}
      </div>
    </div>
  );
}

// PAGE 16: Contact / Merci
function ContactSlide({ slide }) {
  const c = slide.content;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#2D2D2D] relative overflow-hidden">
      <DecoArcs opacity={0.1} />
      <div className="relative z-10 text-center px-[10%]">
        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
          <Building2 className="w-4 h-4 text-white/60" />
        </div>
        <div className="w-20 h-[2px] bg-[#2A9D8F] mx-auto mb-8" />
        <h2 className="text-[3vw] font-extrabold text-white uppercase">{c.message || "Merci pour votre attention"}</h2>
        {c.client_name && <p className="text-white text-[1.4vw] font-light mt-4">{c.client_name}</p>}
        {c.client_email && (
          <p className="text-gray-400 text-[0.9vw] mt-2 flex items-center justify-center gap-2">
            <Mail className="w-4 h-4" /> {c.client_email}
          </p>
        )}
        <div className="w-20 h-[2px] bg-[#2A9D8F] mx-auto mt-8" />
      </div>
    </div>
  );
}

/* ====== ROUTING MAP ====== */

const RENDERERS = {
  cover: CoverSlide,
  sommaire: SommaireSlide,
  ville: VilleSlide,
  transition: TransitionSlide,
  quartier: QuartierSlide,
  tension_locative: TensionSlide,
  marche: MarcheSlide,
  local: LocalSlide,
  local_photos: LocalPhotosSlide,
  bail: BailSlide,
  acquisition_vs_marche: AcquisitionVsMarcheSlide,
  projection: ProjectionSlide,
  conditions: ConditionsSlide,
  cv: CVSlide,
  diagnostics: DiagnosticsSlide,
  contact: ContactSlide,
};

export default function SlideRenderer({ slide }) {
  const Comp = RENDERERS[slide.type];
  if (!Comp) return <div className="w-full h-full bg-[#2D2D2D] flex items-center justify-center text-gray-500">Slide non reconnue : {slide.type}</div>;
  return <Comp slide={slide} />;
}
import { SimSlider as S, SimToggle as T, SimGroup as G } from "./SimControls";

const eur = (v) => Math.round(v).toLocaleString("fr-FR") + " €";

export default function ParamsPanel({ p, set, cost }) {
  const b = (k) => ({ value: p[k], onChange: (v) => set(k, v) });
  return (
    <aside className="lg:sticky lg:top-[100px] self-start rounded-[24px] bg-k-card border border-white/10 p-6 lg:max-h-[calc(100vh/0.8-130px)] overflow-y-auto">
      <span className="inline-block rounded-full bg-k-sage/15 text-k-sage text-[12px] px-3 py-1">Mode par défaut</span>
      <p className="mt-5 k-label">Prix de revient</p>
      <p className="text-[34px] mt-1 tracking-[-0.03em]">{eur(cost)}</p>
      <G title="Champs principaux" boxed>
        <S label="Prix négocié" min={100000} max={5000000} step={10000} {...b("price")} />
        <S label="Loyer annuel" min={5000} max={400000} step={1000} {...b("rent")} />
        <S label="Apport" min={0} max={2000000} step={5000} {...b("apport")} />
        <S label="Durée du crédit" unit="ans" min={5} max={25} {...b("duration")} />
        <S label="Taux du crédit" unit="%" min={0} max={8} step={0.05} {...b("rate")} />
        <S label="Année de revente" unit="" min={1} max={30} {...b("saleYear")} />
      </G>
      <div className="mt-4" />
      <G title="Acquisition">
        <S label="Prix FAI" min={100000} max={5000000} step={10000} {...b("priceFai")} />
        <S label="Surface pondérée" unit="m²" min={10} max={3000} step={5} {...b("surface")} hint={`${Math.round(p.rent / p.surface)} €/m²/an`} />
      </G>
      <G title="Location">
        <S label="Indexation annuelle" unit="%" min={0} max={5} step={0.1} {...b("index")} />
        <S label="Charges de copropriété" min={0} max={50000} step={100} {...b("copro")} />
        <S label="Taxe foncière" min={0} max={50000} step={100} {...b("tf")} />
        <T label="Copropriété refacturée" {...b("refCopro")} />
        <T label="Taxe foncière refacturée" {...b("refTf")} />
      </G>
      <G title="Financement">
        <S label="Taux d’assurance" unit="%" min={0} max={1} step={0.01} {...b("insurance")} />
        <T label="Achat comptant" {...b("cash")} />
        <T label="Prêt in fine" {...b("inFine")} />
      </G>
      <G title="Frais & charges" defaultOpen={false}>
        <S label="Création de société" min={0} max={10000} step={100} {...b("company")} />
        <S label="Frais de dossier" min={0} max={10000} step={100} {...b("dossier")} />
        <S label="Courtage" min={0} max={30000} step={500} {...b("broker")} />
        <S label="Comptabilité / an" min={0} max={10000} step={100} {...b("accounting")} />
        <S label="Assurance PNE / an" min={0} max={5000} step={50} {...b("pne")} />
        <S label="Gestion" unit="% du loyer" min={0} max={10} step={0.5} {...b("mgmt")} />
        <S label="Charges diverses / an" min={0} max={20000} step={100} {...b("misc")} />
      </G>
      <G title="Revente">
        <S label="Honoraires de revente" unit="%" min={0} max={10} step={0.5} {...b("saleFees")} />
        <S label="Rendement brut de l’acquéreur" unit="%" min={3} max={12} step={0.1} {...b("buyerYield")} />
      </G>
    </aside>
  );
}

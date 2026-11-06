export const DEFAULTS = {
  price: 500000, rent: 40000, apport: 100000, duration: 20, rate: 4, saleYear: 15,
  priceFai: 520000, surface: 250,
  index: 2, copro: 3000, tf: 4000, refCopro: true, refTf: true,
  insurance: 0.3, cash: false, inFine: false,
  company: 1500, dossier: 1000, broker: 5000, accounting: 1800, pne: 600, mgmt: 3, misc: 1000,
  saleFees: 5, buyerYield: 7,
};

const isTax = (b) => (b <= 0 ? 0 : Math.min(b, 42500) * 0.15 + Math.max(0, b - 42500) * 0.25);

export function simulate(p) {
  const cost = p.price * 1.2 + p.company + p.dossier + p.broker;
  const equity = p.cash ? cost : Math.min(p.apport, cost);
  const loan = cost - equity;
  const r = p.rate / 100 / 12, n = p.duration * 12;
  const pay = loan && !p.inFine ? (r ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
  const amort = (0.8 * p.price) / 25;
  let debt = loan, deficit = 0, cumCap = 0;
  const years = [];
  for (let y = 1; y <= p.saleYear; y++) {
    const f = Math.pow(1 + p.index / 100, y - 1);
    const rent = p.rent * f, copro = p.copro * f, tf = p.tf * f;
    const rebill = (p.refCopro ? copro : 0) + (p.refTf ? tf : 0);
    let interest = 0, capital = 0;
    for (let m = 0; m < 12 && debt > 0.01 && (y - 1) * 12 + m < n; m++) {
      const i = debt * r; interest += i;
      const c = p.inFine ? ((y - 1) * 12 + m === n - 1 ? debt : 0) : pay - i;
      capital += c; debt -= c;
    }
    const ins = debt > 0.01 || capital ? (loan * p.insurance) / 100 : 0;
    const opex = copro + tf + p.accounting + p.pne + (rent * p.mgmt) / 100 + p.misc + (y % 10 === 0 ? 10000 : 0);
    let base = rent + rebill - opex - interest - ins - (y <= 25 ? amort : 0) - deficit;
    deficit = base < 0 ? -base : 0;
    const tax = isTax(base);
    const cf = rent + rebill - opex - interest - capital - ins - tax;
    cumCap += capital;
    years.push({ y, rent, rebill, interest, capital, ins, loanTotal: interest + capital + ins, opex, tax, vat: 0, cf, cfMonth: cf / 12, cumCap });
  }
  const last = years[years.length - 1];
  const sale = (last.rent / (p.buyerYield / 100)) * (1 - p.saleFees / 100);
  const netSale = sale - Math.max(0, debt);
  const sumCf = years.reduce((s, x) => s + x.cf, 0);
  const flows = [-equity, ...years.map((x, i) => x.cf + (i === years.length - 1 ? netSale : 0))];
  const npv = (t) => flows.reduce((s, v, i) => s + v / Math.pow(1 + t, i), 0);
  let lo = -0.99, hi = 1;
  for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; npv(mid) > 0 ? (lo = mid) : (hi = mid); }
  const y1 = years[0];
  return {
    cost, equity, years, sale, netSale,
    netYield: ((y1.rent + y1.rebill - y1.opex) / cost) * 100,
    cfMonth: y1.cfMonth,
    wealth: sumCf + netSale - equity,
    multiple: (sumCf + netSale) / equity,
    irr: lo * 100,
  };
}

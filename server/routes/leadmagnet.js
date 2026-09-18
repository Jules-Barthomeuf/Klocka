// Les lead magnets : une porte ouverte, et son arrière-boutique.
//
// `/api/lm/*` est PUBLIC — pas de compte, pas de session. C'est voulu : c'est
// la page qu'on partage. Tout ce qui s'y fait est gratuit, borné par adresse,
// et n'écrit qu'un lead.
//
// `/api/leadmagnets/*` est réservé à l'équipe : la liste des leads porte des
// noms, des revenus et des adresses e-mail.

import { currentUser, ok, wrap } from '../contexte.js';
import {
  genererFeuilleDeRoute, tropDeDemandes, lireLeadMagnet,
  listerLeadMagnets, listerLeads, marquerTraite, assurerLeadMagnetInitial,
} from '../leadmagnet.js';

const ipDe = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'inconnue';

export function monterLeadMagnet(app) {
  assurerLeadMagnetInitial();

  // --- Public ---------------------------------------------------------------

  app.get('/api/lm/:slug', wrap((req, res) => {
    const m = lireLeadMagnet(req.params.slug);
    if (!m) return res.status(404).json({ error: "Cette page n'existe pas ou n'est plus publiée." });
    ok(res, { lead_magnet: { slug: m.slug, titre: m.titre, accroche: m.accroche } });
  }));

  app.post('/api/lm/:slug/roadmap', wrap(async (req, res) => {
    const m = lireLeadMagnet(req.params.slug);
    if (!m) return res.status(404).json({ error: "Cette page n'existe pas ou n'est plus publiée." });
    const ip = ipDe(req);
    if (tropDeDemandes(ip)) {
      return res.status(429).json({ error: 'Trop de demandes depuis cette connexion. Réessayez dans une heure.' });
    }
    // Base vide : le lien du simulateur reste relatif, donc juste quel que soit
    // l'hôte. Le jour où la roadmap partira par mail, il faudra une base absolue.
    const r = await genererFeuilleDeRoute({ ...req.body, slug: m.slug }, { ip, base: '' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // --- Équipe ---------------------------------------------------------------

  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/leadmagnets', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { lead_magnets: listerLeadMagnets(), leads: listerLeads() });
  }));

  app.patch('/api/leadmagnets/leads/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = marquerTraite(req.params.id, req.body?.traite);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}

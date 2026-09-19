// Les lead magnets : une porte ouverte, et son arrière-boutique.
//
// `/api/lm/*` est PUBLIC — pas de compte, pas de session. C'est voulu : c'est
// la page qu'on partage. Tout ce qui s'y fait est gratuit, borné par adresse,
// et n'écrit qu'un lead ou une ligne de fréquentation.
//
// `/api/leadmagnets/*` est réservé à l'équipe : la liste des leads porte des
// noms, des revenus et des adresses e-mail.

import { currentUser, ok, wrap } from '../contexte.js';
import {
  genererFeuilleDeRoute, tropDeDemandes, lireLeadMagnet,
  listerLeadMagnets, listerLeads, marquerTraite, supprimerLead,
  reinitialiser, assurerLeadMagnetInitial, ouvrirVue, avancerVue, MAX_VUES_PAR_HEURE,
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

  // Une visite s'ouvre. La page nous redonnera cet identifiant pour dire
  // jusqu'où elle est allée et combien de temps elle y est restée.
  app.post('/api/lm/:slug/vue', wrap((req, res) => {
    const m = lireLeadMagnet(req.params.slug);
    if (!m) return res.status(404).json({ error: "Cette page n'existe pas ou n'est plus publiée." });
    // Compter un passage coûte une ligne : on en tolère plus qu'un calcul, mais
    // pas un robot qui gonflerait les compteurs.
    if (tropDeDemandes(ipDe(req), { seau: 'vue', max: MAX_VUES_PAR_HEURE })) return ok(res, { vue_id: null });
    // La page déclare elle-même sa provenance, et `null` y veut dire « interne ».
    // On ne retombe sur l'en-tête que si elle n'a rien dit du tout.
    const declare = Object.prototype.hasOwnProperty.call(req.body || {}, 'referent');
    ok(res, ouvrirVue(m.slug, {
      ip: ipDe(req),
      referer: declare ? req.body.referent : (req.headers.referer || req.headers.referrer || null),
      ua: req.headers['user-agent'] || null,
      utm: req.body?.source || null,
      // Notre propre hôte, pour qu'une navigation interne se lise « Direct ».
      hote: req.headers.host || null,
    }));
  }));

  // La visite avance : écran atteint, temps passé, bouton d'appel cliqué. Le
  // navigateur l'envoie aussi au départ, par `sendBeacon`.
  app.post('/api/lm/:slug/vue/:id', wrap((req, res) => {
    const r = avancerVue(req.params.id, req.body || {});
    // Une visite inconnue n'est pas une erreur à montrer : la page est publique,
    // et un identifiant périmé ne doit pas faire clignoter un message.
    if (!r.ok) return ok(res, { ok: false });
    ok(res, r);
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

  app.delete('/api/leadmagnets/leads/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerLead(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Tout remettre à zéro. Irréversible, donc la demande doit nommer le lead
  // magnet qu'elle efface : un appel fait par mégarde ne suffit pas.
  app.post('/api/leadmagnets/:slug/reinitialiser', wrap((req, res) => {
    if (!admin(req, res)) return;
    if (req.body?.confirmation !== req.params.slug) {
      return res.status(400).json({ error: 'Pour tout effacer, la demande doit confirmer le nom du lead magnet.' });
    }
    const r = reinitialiser(req.params.slug);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}

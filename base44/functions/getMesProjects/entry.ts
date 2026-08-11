import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Normalise pour une comparaison souple (minuscules, sans accents)
function normalize(str: string): string {
    return (str || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Ne garder que les champs utiles à l'analyse (réduit drastiquement la taille)
function slimProject(p: any) {
    return {
        id: p.id,
        titre: p.titre,
        adresse_complete: p.adresse_complete,
        nom_locataire: p.nom_locataire,
        activite_locataire: p.activite_locataire,
        surface_m2: p.surface_m2,
        rendement_locatif: p.rendement_locatif,
        prix_acquisition: p.prix_acquisition,
        statut: p.statut,
        // Champs simulateur
        sim_prix_bien_negocie: p.sim_prix_bien_negocie,
        sim_prix_revient: p.sim_prix_revient,
        sim_apport: p.sim_apport,
        sim_montant_credit: p.sim_montant_credit,
        sim_loyer_initial_ht: p.sim_loyer_initial_ht,
        sim_surface: p.sim_surface,
        sim_indexation_loyers: p.sim_indexation_loyers,
        sim_rendement_locatif_global_net: p.sim_rendement_locatif_global_net,
        sim_cashflow_cumule: p.sim_cashflow_cumule,
        sim_creation_richesse_nette: p.sim_creation_richesse_nette,
        sim_multiple_fonds_propres: p.sim_multiple_fonds_propres,
        sim_rendement_net_fonds_propres: p.sim_rendement_net_fonds_propres,
        sim_annee_revente: p.sim_annee_revente,
        sim_prix_vente_net: p.sim_prix_vente_net,
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Terme de recherche optionnel (nom du projet, locataire, adresse...)
        let search = '';
        try {
            const body = await req.json();
            search = body?.search || body?.query || '';
        } catch (_e) {
            // pas de body, ignorer
        }

        const allProjects = await base44.entities.Project.list();

        // Déterminer les projets accessibles selon le rôle
        let accessibleProjects;
        if (user.role === 'admin') {
            accessibleProjects = allProjects;
        } else {
            const emailToCheck = user.est_compte_shadow && user.compte_maitre_email
                ? user.compte_maitre_email
                : user.email;
            const userEtape = user.etape_actuelle || 1;

            if (userEtape >= 4 && user.projet_selectionne_id) {
                const selected = allProjects.find(p => p.id === user.projet_selectionne_id);
                accessibleProjects = selected ? [selected] : [];
            } else {
                accessibleProjects = allProjects.filter(project => {
                    const isInClientEmail = project.client_email === emailToCheck;
                    const isInClientEmails = Array.isArray(project.client_emails) &&
                        project.client_emails.includes(emailToCheck);
                    return isInClientEmail || isInClientEmails;
                });
            }
        }

        // Si une recherche est fournie, filtrer par correspondance souple
        let matched = accessibleProjects;
        if (search && search.trim().length > 0) {
            const normSearch = normalize(search);
            const searchWords = normSearch.split(' ').filter(w => w.length > 2);

            const scored = accessibleProjects
                .map(p => {
                    const haystack = normalize(
                        [p.titre, p.nom_locataire, p.activite_locataire, p.adresse_complete]
                            .filter(Boolean)
                            .join(' ')
                    );
                    let score = 0;
                    if (haystack.includes(normSearch)) score += 100;
                    for (const w of searchWords) {
                        if (haystack.includes(w)) score += 1;
                    }
                    return { p, score };
                })
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0) {
                matched = scored.map(x => x.p);
            }
        }

        // Limiter le nombre de résultats renvoyés pour rester sous la limite de taille
        const limited = matched.slice(0, 8).map(slimProject);

        return Response.json({
            success: true,
            projects: limited,
            count: limited.length,
            total_accessible: accessibleProjects.length,
            search_applied: search || null,
            user_email: user.email
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});
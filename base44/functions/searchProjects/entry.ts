import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Vérifier l'authentification
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Récupérer le terme de recherche
        const { searchTerm } = await req.json();
        
        if (!searchTerm) {
            return Response.json({ error: 'searchTerm is required' }, { status: 400 });
        }

        // Récupérer TOUS les projets
        const allProjects = await base44.asServiceRole.entities.Project.list();
        
        // Normaliser le terme de recherche
        const normalizedSearch = searchTerm.toLowerCase().trim();
        
        // Filtrer les projets qui correspondent
        const matchingProjects = allProjects.filter(project => {
            // Chercher dans le titre
            if (project.titre && project.titre.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            
            // Chercher dans l'adresse
            if (project.adresse_complete && project.adresse_complete.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            
            // Chercher dans les champs ville/secteur
            if (project.ville_secteur_champ1 && project.ville_secteur_champ1.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            if (project.ville_secteur_champ2 && project.ville_secteur_champ2.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            if (project.ville_secteur_champ3 && project.ville_secteur_champ3.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            
            // Chercher dans le nom du locataire
            if (project.nom_locataire && project.nom_locataire.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            
            // Chercher dans l'activité du locataire
            if (project.activite_locataire && project.activite_locataire.toLowerCase().includes(normalizedSearch)) {
                return true;
            }
            
            return false;
        });

        return Response.json({
            success: true,
            searchTerm: searchTerm,
            count: matchingProjects.length,
            projects: matchingProjects
        });
        
    } catch (error) {
        console.error('Search error:', error);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { owner, repo, projectId } = await req.json();
    const token = Deno.env.get('GITHUB_PAT');

    if (!owner || !repo) {
      return Response.json({ error: 'Missing required fields: owner, repo' }, { status: 400 });
    }

    if (!token) {
      return Response.json({ error: 'GITHUB_PAT secret is not configured' }, { status: 500 });
    }

    // Get project data if projectId is provided
    let projectContent = '';
    if (projectId) {
      const project = await base44.entities.Project.list();
      const targetProject = project.find(p => p.id === projectId);
      if (targetProject) {
        projectContent = `# Projet: ${targetProject.titre}\n\n`;
        projectContent += `**Adresse:** ${targetProject.adresse_complete || 'N/A'}\n`;
        projectContent += `**Surface:** ${targetProject.surface_m2 || 'N/A'} m²\n`;
        projectContent += `**Statut:** ${targetProject.statut || 'N/A'}\n`;
        projectContent += `**Client:** ${targetProject.client_email || 'N/A'}\n`;
        projectContent += `**Loyer annuel HT:** ${targetProject.loyer_annuel_ht || 'N/A'} €\n`;
        projectContent += `**Rendement locatif:** ${targetProject.rendement_locatif || 'N/A'} %\n\n`;
        projectContent += `**Description:**\n${targetProject.description_bien || targetProject.analyse_bail || 'Pas de description'}\n`;
      }
    }

    // Create or update README in GitHub
    const githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/README.md`;
    
    const content = projectContent || 'Application Klocka\n\nConnecté via GitHub API';
    const encodedContent = btoa(content);

    // Check if file exists
    let sha = null;
    try {
      const checkRes = await fetch(githubUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (checkRes.ok) {
        const data = await checkRes.json();
        sha = data.sha;
      }
    } catch (e) {
      // File doesn't exist yet
    }

    // Push/update file to GitHub
    const pushRes = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update from Klocka ${new Date().toISOString()}`,
        content: encodedContent,
        ...(sha && { sha })
      })
    });

    if (!pushRes.ok) {
      const error = await pushRes.json();
      return Response.json({ 
        error: 'GitHub API error', 
        details: error.message || error 
      }, { status: pushRes.status });
    }

    const result = await pushRes.json();
    
    return Response.json({
      success: true,
      message: 'Synchronisation avec GitHub réussie',
      file: result.content?.html_url || `https://github.com/${owner}/${repo}`
    });

  } catch (error) {
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});
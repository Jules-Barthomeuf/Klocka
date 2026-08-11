import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const url = new URL(req.url);
    let projectId = url.searchParams.get('id');

    // Also accept id in JSON body (frontend SDK sends payload as body)
    if (!projectId) {
      try {
        const body = await req.json();
        projectId = body?.id;
      } catch (_) {
        // no body
      }
    }

    if (!projectId) {
      return Response.json({ success: false, error: 'Missing project id' }, { status: 400 });
    }

    // Service role read — accessible even for non-clients / non-logged-in visitors
    const project = await base44.asServiceRole.entities.Project.get(projectId);

    if (!project) {
      return Response.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return Response.json({ success: true, project });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
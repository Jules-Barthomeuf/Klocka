import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { address } = await req.json();
    
    if (!address) {
      return Response.json({ error: 'Address is required' }, { status: 400 });
    }

    // Obtenir le token d'accès Google Drive
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");

    // Note: Avec le scope drive.file, on ne peut pas chercher dans tout le Drive
    // On va utiliser l'API Google Picker pour permettre à l'utilisateur de sélectionner le dossier
    // Cette fonction retourne l'URL du picker
    const pickerUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(address)}`;

    return Response.json({ 
      pickerUrl,
      message: "Ouvrez Google Drive pour sélectionner le dossier correspondant à l'adresse"
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
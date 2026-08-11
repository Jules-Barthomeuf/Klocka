import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Récupérer le token Google Drive
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Upload vers Google Drive
    const arrayBuffer = await file.arrayBuffer();
    const metadata = {
      name: file.name,
      mimeType: file.type
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([arrayBuffer], { type: file.type }));

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: form
    });

    if (!uploadResponse.ok) {
      throw new Error(`Google Drive upload failed: ${uploadResponse.statusText}`);
    }

    const driveFile = await uploadResponse.json();

    // Rendre le fichier public
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    // Construire l'URL publique
    const file_url = `https://drive.google.com/uc?export=view&id=${driveFile.id}`;

    return Response.json({ 
      file_url,
      success: true 
    });

  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});
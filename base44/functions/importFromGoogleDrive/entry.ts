import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { folderId } = await req.json();
    
    if (!folderId) {
      return Response.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    // Obtenir le token d'accès Google Drive
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");

    // Lister les fichiers dans le dossier
    const listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,webContentLink,webViewLink)&pageSize=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.text();
      return Response.json({ error: 'Failed to list files: ' + error }, { status: 500 });
    }

    const { files } = await listResponse.json();

    if (!files || files.length === 0) {
      return Response.json({ files: [], message: 'No files found in this folder' });
    }

    // Télécharger chaque fichier et l'uploader sur Base44
    const uploadedFiles = [];
    
    for (const file of files) {
      try {
        // Télécharger le fichier depuis Google Drive
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            }
          }
        );

        if (!fileResponse.ok) {
          console.error(`Failed to download file ${file.name}`);
          continue;
        }

        const fileBlob = await fileResponse.blob();
        
        // Uploader sur Base44
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
          file: fileBlob
        });

        uploadedFiles.push({
          name: file.name,
          url: uploadResult.file_url,
          mimeType: file.mimeType
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    return Response.json({ 
      files: uploadedFiles,
      count: uploadedFiles.length,
      message: `${uploadedFiles.length} fichier(s) importé(s) avec succès`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
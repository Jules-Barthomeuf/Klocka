import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Vérifier que l'utilisateur est admin
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { clientEmail, projectTitle, projectId } = await req.json();

        if (!clientEmail || !projectTitle) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Envoyer l'email via Resend
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        
        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Klocka <onboarding@resend.dev>',
                to: [clientEmail],
                subject: `Nouveau projet assigné : ${projectTitle}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #2A9D8F 0%, #71CCBA 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0;">Nouveau projet assigné</h1>
                        </div>
                        <div style="padding: 30px; background-color: #f9f9f9;">
                            <h2 style="color: #2A9D8F;">${projectTitle}</h2>
                            <p style="color: #333; font-size: 16px; line-height: 1.6;">
                                Un nouveau projet d'investissement immobilier commercial vous a été assigné sur la plateforme Klocka.
                            </p>
                            <p style="color: #333; font-size: 16px; line-height: 1.6;">
                                Connectez-vous à votre espace client pour consulter tous les détails du projet.
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://app.klocka.immo" 
                                   style="background-color: #2A9D8F; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                                    Voir le projet
                                </a>
                            </div>
                            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                                L'équipe Klocka
                            </p>
                        </div>
                    </div>
                `
            })
        });

        const result = await emailResponse.json();

        if (!emailResponse.ok) {
            // Logger l'échec
            await base44.asServiceRole.entities.EmailLog.create({
                to: clientEmail,
                subject: `Nouveau projet assigné : ${projectTitle}`,
                body: `Projet assigné`,
                project_id: projectId || null,
                status: 'failed'
            });
            
            return Response.json({ 
                success: false, 
                error: result.message || 'Failed to send email' 
            }, { status: 500 });
        }

        // Logger le succès
        await base44.asServiceRole.entities.EmailLog.create({
            to: clientEmail,
            subject: `Nouveau projet assigné : ${projectTitle}`,
            body: `Projet ${projectTitle} assigné`,
            project_id: projectId || null,
            status: 'sent',
            resend_id: result.id
        });

        return Response.json({ 
            success: true, 
            emailId: result.id 
        });

    } catch (error) {
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Vérifier que l'utilisateur est admin
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { to, subject, body } = await req.json();

        if (!to || !subject || !body) {
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
                to: [to],
                subject: subject,
                html: body
            })
        });

        const result = await emailResponse.json();

        if (!emailResponse.ok) {
            // Logger l'échec
            await base44.asServiceRole.entities.EmailLog.create({
                to,
                subject,
                body,
                status: 'failed'
            });
            
            return Response.json({ 
                success: false, 
                error: result.message || 'Failed to send email' 
            }, { status: 500 });
        }

        // Logger le succès
        await base44.asServiceRole.entities.EmailLog.create({
            to,
            subject,
            body,
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
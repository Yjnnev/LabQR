// supabase/functions/notify-admin/index.ts
// Deploy with: npx supabase functions deploy notify-admin
// Set secrets first:
//   npx supabase secrets set RESEND_API_KEY=your_resend_key
// (ADMIN_EMAIL is no longer required — admin recipients are pulled live from
// the profiles table, so adding a new admin there is all you need to do.)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    if (record.action !== 'checked_out' && record.action !== 'returned') {
      return new Response('Skipped (not a checkout/return event)', { status: 200 })
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const [{ data: equipment }, { data: studentProfile }, { data: admins }] = await Promise.all([
      supabase.from('equipment').select('name, location').eq('id', record.equipment_id).single(),
      supabase.from('profiles').select('full_name, email').eq('id', record.user_id).single(),
      supabase.from('profiles').select('email').eq('role', 'admin'),
    ])

    const studentName = studentProfile?.full_name || studentProfile?.email || 'A student'
    const what = equipment?.name || record.equipment_id
    const where = equipment?.location ? ` (${equipment.location})` : ''
    const when = new Date(record.created_at).toLocaleString()

    const isReturn = record.action === 'returned'

    // returns notify the student; checkouts notify every admin on file
    const recipient = isReturn
      ? studentProfile?.email
      : (admins || []).map((a) => a.email).filter(Boolean)

    const hasRecipient = isReturn ? !!recipient : recipient.length > 0
    if (!hasRecipient) {
      return new Response('Skipped (no recipient email found)', { status: 200 })
    }

    const subject = isReturn
      ? `LabQR: "${what}" has been returned`
      : `LabQR: "${what}" checked out`

    const text = isReturn
      ? `Your checkout of "${what}"${where} has been marked returned by an admin, as of ${when}.`
      : `${studentName} checked out "${what}"${where} at ${when}.`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LabQR Alerts <onboarding@resend.dev>', // Resend's shared test sender — swap once you verify your own domain
        to: recipient,
        subject,
        text,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(`Resend error: ${errText}`, { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(`Error: ${message}`, { status: 500 })
  }
})

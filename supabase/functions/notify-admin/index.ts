// supabase/functions/notify-admin/index.ts
// Deploy with: npx supabase functions deploy notify-admin
// Set secrets first:
//   npx supabase secrets set RESEND_API_KEY=your_resend_key
//   npx supabase secrets set ADMIN_EMAIL=the_email_you_signed_up_to_resend_with

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    // Only care about checkouts for now — keeping this as simple as possible
    if (record.action !== 'checked_out') {
      return new Response('Skipped (not a checkout event)', { status: 200 })
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LabQR Alerts <onboarding@resend.dev>',
        to: ADMIN_EMAIL,
        subject: 'LabQR: equipment checked out',
        text: `Equipment ID ${record.equipment_id} was checked out at ${record.created_at}.`,
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

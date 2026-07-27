// supabase/functions/notify-admin/index.ts
// Deploy with: npx supabase functions deploy notify-admin
// Set secrets first:
//   npx supabase secrets set RESEND_API_KEY=your_resend_key
//   npx supabase secrets set ADMIN_EMAIL=the_email_you_signed_up_to_resend_with
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    // Only care about checkouts for now — keeping this as simple as possible
    if (record.action !== 'checked_out') {
      return new Response('Skipped (not a checkout event)', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // the trigger payload only has raw IDs — look up the human-readable details
    const [{ data: equipment }, { data: borrower }, { data: checkout }] = await Promise.all([
      supabase.from('equipment').select('name, location').eq('id', record.equipment_id).single(),
      supabase.from('profiles').select('full_name, email').eq('id', record.user_id).single(),
      supabase
        .from('checkouts')
        .select('quantity')
        .eq('equipment_id', record.equipment_id)
        .eq('user_id', record.user_id)
        .is('returned_at', null)
        .order('checked_out_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const equipmentName = equipment?.name || 'an item'
    const borrowerName = borrower?.full_name || borrower?.email || 'Someone'
    const quantity = checkout?.quantity ?? 1

    const checkedOutAt = new Date(record.created_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')

    const subject = `LabQR: ${borrowerName} checked out ${equipmentName}`

    const text = `${borrowerName} checked out ${quantity} × ${equipmentName} on ${checkedOutAt}.` +
      (equipment?.location ? ` Location: ${equipment.location}.` : '')

    const html = `
      <div style="font-family: -apple-system, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
        <p style="margin: 0 0 14px;"><strong>${borrowerName}</strong> just checked out equipment.</p>
        <table style="border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Item</td><td>${equipmentName}</td></tr>
          <tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Quantity</td><td>${quantity}</td></tr>
          ${equipment?.location ? `<tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Location</td><td>${equipment.location}</td></tr>` : ''}
          <tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Checked out</td><td>${checkedOutAt}</td></tr>
        </table>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LabQR Alerts <onboarding@resend.dev>',
        to: ADMIN_EMAIL,
        subject,
        text,
        html,
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

// AERPOLICE - Vercel serverless function
// Emails the team a contact-form submission via Resend.
//
// SETUP (Vercel project -> Settings -> Environment Variables):
//   RESEND_API_KEY = your Resend API key (required)
//   REPORT_FROM    = "AERPOLICE <report@aerpolice.com>"  (verified Resend sender; required)
//   TEAM_EMAIL     = aerpolicereport@aeredium.io   (where contact submissions go; required)
//   CONTACT_TO     = optional override for where contact submissions go (defaults to TEAM_EMAIL)

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function row(label, val) {
  if (!val) return '';
  return '<tr><td style="padding:8px 0;color:#888;font-size:13px;width:90px;vertical-align:top;">' + esc(label) + '</td>'
    + '<td style="padding:8px 0;color:#111;font-size:14px;">' + esc(val) + '</td></tr>';
}

function html(d) {
  return '<!DOCTYPE html><html><body style="margin:0;background:#f4f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:24px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9ea;">'
    + '<tr><td style="background:#08090a;padding:20px 28px;color:#fff;font-weight:700;font-size:16px;">AERPOLICE &middot; new contact</td></tr>'
    + '<tr><td style="padding:24px 28px;"><table width="100%" cellpadding="0" cellspacing="0">'
    + row('Name', d.name) + row('Email', d.email) + row('Company', d.company) + row('Type', d.type)
    + '</table>'
    + (d.message ? '<p style="margin:18px 0 0;color:#333;font-size:14px;line-height:1.6;white-space:pre-wrap;">' + esc(d.message) + '</p>' : '')
    + '</td></tr></table></td></tr></table></body></html>';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'RESEND_API_KEY not set' });
  const to = process.env.CONTACT_TO || process.env.TEAM_EMAIL;
  if (!to) return res.status(500).json({ success: false, error: 'TEAM_EMAIL not set' });

  let data = req.body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  data = data || {};
  const email = String(data.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  const from = process.env.REPORT_FROM || 'AERPOLICE <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: email,
        subject: 'New AERPOLICE contact: ' + (data.company || data.name || email),
        html: html(data)
      })
    });
    const out = await r.json().catch(function () { return {}; });
    if (!r.ok) return res.status(502).json({ success: false, error: (out && out.message) ? out.message : 'Resend send failed' });
    return res.status(200).json({ success: true, id: out.id });
  } catch (e) {
    return res.status(502).json({ success: false, error: String(e) });
  }
};

// AERPOLICE - Vercel serverless function
// Emails the visitor their full Agent Containment Index report, and notifies the team, via Resend.
//
// SETUP (Vercel project -> Settings -> Environment Variables):
//   RESEND_API_KEY = your Resend API key (required)
//   REPORT_FROM    = "AERPOLICE <report@aerpolice.com>"  (a verified Resend sender; required)
//   TEAM_EMAIL     = aerpolicereport@aeredium.io   (where lead notifications go; optional but recommended)
//
// Verify your sending domain (e.g. aerpolice.com) in Resend before emailing arbitrary recipients.

const BAND_COLORS = { Contained: '#1d9e8f', Partial: '#b8860b', Exposed: '#c0392b' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function bandLabel(b) {
  if (!b) return '';
  return String(b).charAt(0).toUpperCase() + String(b).slice(1);
}

function layerTable(layers) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;border-collapse:separate;">'
    + layers.map(function (L) {
      const lab = bandLabel(L.band);
      const col = BAND_COLORS[lab] || '#666';
      return '<tr>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111;">' + esc(L.name) + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">'
        + '<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:' + col + ';color:#fff;font-size:12px;font-weight:600;">' + esc(lab) + '</span>'
        + '<span style="color:#999;font-size:12px;margin-left:8px;">' + esc(L.raw) + '/4</span>'
        + '</td></tr>';
    }).join('')
    + '</table>';
}

function answerList(answers) {
  if (!answers.length) return '';
  return '<ul style="margin:0;padding-left:18px;">'
    + answers.map(function (a) {
      return '<li style="margin:0 0 8px;color:#333;font-size:13px;line-height:1.5;">' + esc(a) + '</li>';
    }).join('')
    + '</ul>';
}

function shell(inner) {
  return '<!DOCTYPE html><html><body style="margin:0;background:#f4f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:24px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9ea;">'
    + '<tr><td style="background:#08090a;padding:22px 28px;">'
    + '<span style="color:#fff;font-weight:700;font-size:18px;letter-spacing:.5px;">AERPOLICE</span>'
    + '<span style="color:#7a8a8f;font-size:12px;">&nbsp; an AEREDIUM Trust Layer product</span>'
    + '</td></tr>'
    + '<tr><td style="padding:28px;">' + inner + '</td></tr>'
    + '<tr><td style="background:#fafbfb;padding:16px 28px;border-top:1px solid #eee;color:#9aa1a3;font-size:11px;line-height:1.5;">'
    + 'AERPOLICE, an AEREDIUM Trust Layer product. aerpolice.com'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function visitorHtml(d) {
  const score = (d.score != null) ? d.score : 'n/a';
  const inner = '<p style="margin:0 0 6px;color:#999;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Agent Containment Index</p>'
    + '<h1 style="margin:0 0 4px;font-size:42px;color:#08090a;line-height:1;">' + esc(score) + '<span style="font-size:18px;color:#999;">/100</span></h1>'
    + '<p style="margin:0 0 16px;font-size:14px;color:#1d9e8f;font-weight:600;">' + esc(d.safety || '') + '</p>'
    + (d.archetype ? '<p style="margin:0 0 16px;font-size:13px;color:#555;">Agent type: <b style="color:#222;">' + esc(d.archetype) + '</b></p>' : '')
    + '<h2 style="margin:18px 0 8px;font-size:15px;color:#08090a;">Your containment line</h2>'
    + layerTable(Array.isArray(d.layers) ? d.layers : [])
    + (Array.isArray(d.answers) && d.answers.length ? '<h2 style="margin:24px 0 8px;font-size:15px;color:#08090a;">Your answers</h2>' + answerList(d.answers) : '')
    + '<p style="margin:24px 0 0;font-size:13px;color:#555;">Want to walk through the gaps and how to close them? Just reply to this email.</p>';
  return shell(inner);
}

function teamHtml(d) {
  const score = (d.score != null) ? d.score : 'n/a';
  const inner = '<p style="margin:0 0 6px;color:#999;font-size:11px;letter-spacing:1px;text-transform:uppercase;">New ACI lead</p>'
    + '<p style="margin:0 0 4px;font-size:18px;color:#08090a;"><b>' + esc(d.email) + '</b></p>'
    + '<p style="margin:0 0 16px;font-size:14px;color:#555;">Score <b style="color:#08090a;">' + esc(score) + '/100</b> &middot; ' + esc(d.safety || '') + (d.archetype ? ' &middot; ' + esc(d.archetype) : '') + '</p>'
    + (d.consent ? '<p style="margin:0 0 16px;font-size:12px;color:#1d9e8f;">Consent: ' + esc(d.consent) + '</p>' : '')
    + '<h2 style="margin:18px 0 8px;font-size:15px;color:#08090a;">Containment line</h2>'
    + layerTable(Array.isArray(d.layers) ? d.layers : [])
    + (Array.isArray(d.answers) && d.answers.length ? '<h2 style="margin:24px 0 8px;font-size:15px;color:#08090a;">Answers</h2>' + answerList(d.answers) : '');
  return shell(inner);
}

async function sendEmail(key, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await r.json().catch(function () { return {}; });
  return { ok: r.ok, out: out };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'RESEND_API_KEY not set' });

  let data = req.body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  data = data || {};

  const email = String(data.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  const from = process.env.REPORT_FROM || 'AERPOLICE <onboarding@resend.dev>';
  const team = process.env.TEAM_EMAIL;
  const scoreTxt = (data.score != null ? data.score : 'n/a');

  try {
    // 1) Report to the visitor
    const visitor = await sendEmail(key, {
      from: from,
      to: [email],
      reply_to: team || undefined,
      subject: 'Your AERPOLICE containment report - ' + scoreTxt + '/100',
      html: visitorHtml(data)
    });
    if (!visitor.ok) {
      return res.status(502).json({ success: false, error: (visitor.out && visitor.out.message) ? visitor.out.message : 'Resend send failed' });
    }

    // 2) Lead notification to the team (best effort)
    if (team) {
      await sendEmail(key, {
        from: from,
        to: [team],
        reply_to: email,
        subject: 'New ACI lead: ' + email + ' - ' + scoreTxt + '/100 (' + (data.safety || '') + ')',
        html: teamHtml(data)
      });
    }

    return res.status(200).json({ success: true, id: visitor.out.id });
  } catch (e) {
    return res.status(502).json({ success: false, error: String(e) });
  }
};

// Exposed for local preview/testing only; harmless in production.
module.exports.visitorHtml = visitorHtml;
module.exports.teamHtml = teamHtml;

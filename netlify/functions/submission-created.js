// netlify/functions/submission-created.js
// Runs automatically on every Netlify form submission (marketing site).
// Creates/updates a HubSpot contact from the business-leads form and
// attaches the "what would you hand off first" answer as a note.
// Env: HUBSPOT_SERVICE_KEY (or HUBSPOT_TOKEN) — set in Netlify env vars.

const HS = "https://api.hubapi.com";

async function hs(path, method, body, token) {
  const res = await fetch(HS + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json };
}

exports.handler = async (event) => {
  const token = process.env.HUBSPOT_SERVICE_KEY || process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.log("HUBSPOT_SERVICE_KEY not set — skipping CRM sync");
    return { statusCode: 200, body: "no token" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    return { statusCode: 400, body: "bad payload" };
  }

  // Only sync the business-leads form
  if (payload.form_name && payload.form_name !== "business-leads") {
    return { statusCode: 200, body: "ignored form" };
  }

  const d = payload.data || {};
  const email = (d.email || "").trim().toLowerCase();
  if (!email) return { statusCode: 200, body: "no email" };

  const props = {
    email,
    firstname: (d.name || "").trim(),
    company: (d.business || "").trim(),
    lifecyclestage: "lead",
    hs_lead_status: "NEW",
  };

  // Upsert contact: search by email, then update or create
  let contactId = null;
  const search = await hs("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email"], limit: 1,
  }, token);

  if (search.status === 200 && search.json.total > 0) {
    contactId = search.json.results[0].id;
    const upd = await hs(`/crm/v3/objects/contacts/${contactId}`, "PATCH", { properties: props }, token);
    console.log("contact updated", contactId, upd.status);
  } else {
    const crt = await hs("/crm/v3/objects/contacts", "POST", { properties: props }, token);
    if (crt.status === 201) { contactId = crt.json.id; console.log("contact created", contactId); }
    else { console.log("contact create failed", crt.status, JSON.stringify(crt.json).slice(0, 300)); }
  }

  // Attach the message as a note (best-effort — contact already saved)
  if (contactId && (d.message || "").trim()) {
    const note = await hs("/crm/v3/objects/notes", "POST", {
      properties: {
        hs_timestamp: Date.now(),
        hs_note_body: `Website lead (project9tech.com/business) — "What would you hand off first?"\n\n${d.message.trim()}\n\nBusiness: ${d.business || "?"} · Name: ${d.name || "?"}`,
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }], // note -> contact
      }],
    }, token);
    console.log("note", note.status);
  }

  return { statusCode: 200, body: "ok" };
};

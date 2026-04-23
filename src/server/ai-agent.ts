import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SYSTEM_PROMPT = `You are the Dex Logistics Kenya (Dexcargo) customer support AI agent on WhatsApp.
Dex Logistics Kenya is an international logistics company specializing in shipping from China and Dubai to Kenya.
Services: sea freight, air freight, customs clearance, and warehousing.

Company info:
- Address: Kivi Milimani Apartments, Nairobi
- Phone: 0725 053202
- Hours: Open daily, closes 5 pm
- Payments: M-Pesa (STK push)

Standard rates (China → Kenya):
- Air freight: USD 11 per kg, transit 7–14 days
- Sea freight: KES 54,000 per CBM, transit 30–45 days
Always use the quote_shipping or get_rates tools for the latest figures before quoting.

Tone: friendly, concise, professional. You can mix English and Swahili if the client uses Swahili.

Your responsibilities:
- Greet new clients, collect their full name, city if you don't know them.
- Help clients track packages by tracking number, sender name, or sender phone number.
- Quote shipping costs using the quote_shipping tool (always state mode, transit time, and total).
- Inform clients about current status of their packages and share the China warehouse photo when available.
- Initiate M-Pesa STK push payment when a client agrees to pay for a shipment.
- Share the office address or phone when clients ask how to reach the company.
- Remember details about the client across the conversation.

Note about package records:
- Every package has a tracking number and a warehouse photo. Sender name and sender phone are optional but commonly recorded.
- If a client gives you only a phone number or a name (no tracking number), use search_packages to find their packages.

Rules:
- Use the provided tools to look up real data. Never invent tracking numbers, prices, or statuses.
- If a tool returns no data, tell the client honestly and offer to escalate to a human agent.
- Keep replies short for WhatsApp (under 600 chars when possible). Use line breaks, not markdown headings.
- Never reveal internal IDs (UUIDs). Use tracking numbers, names, and human-readable info.
- For payments always confirm amount and phone number before triggering STK push.
- Always include transit time when quoting (e.g. "arrives in 7–14 days by air").
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "find_client",
      description: "Look up a client by WhatsApp number, name, or tracking number.",
      parameters: {
        type: "object",
        properties: {
          whatsapp_number: { type: "string" },
          name: { type: "string" },
          tracking_number: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_client",
      description: "Create or update a client record. Use when a new client introduces themselves.",
      parameters: {
        type: "object",
        properties: {
          whatsapp_number: { type: "string" },
          full_name: { type: "string" },
          country: { type: "string" },
          city: { type: "string" },
          email: { type: "string" },
        },
        required: ["whatsapp_number", "full_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_package",
      description: "Get the current status, full event timeline, and warehouse photo for a package by tracking number.",
      parameters: {
        type: "object",
        properties: { tracking_number: { type: "string" } },
        required: ["tracking_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_packages",
      description: "Search packages by sender phone number or sender name when the client doesn't have a tracking number. Returns up to 10 matching packages with tracking numbers and current status.",
      parameters: {
        type: "object",
        properties: {
          sender_phone: { type: "string", description: "Phone number of the person who shipped the package" },
          sender_name: { type: "string", description: "Name of the person who shipped the package (partial match)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_client_packages",
      description: "List all packages for a client by their WhatsApp number.",
      parameters: {
        type: "object",
        properties: { whatsapp_number: { type: "string" } },
        required: ["whatsapp_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rates",
      description: "Get active shipping rates, optionally filtered by destination country and mode (air/sea/express).",
      parameters: {
        type: "object",
        properties: {
          destination_country: { type: "string" },
          mode: { type: "string", enum: ["air", "sea", "express"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_shipping",
      description: "Calculate exact shipping cost for a client based on destination, mode, and either weight (air/express) or CBM (sea). Always use this when client asks 'how much' to ship something.",
      parameters: {
        type: "object",
        properties: {
          destination_country: { type: "string" },
          mode: { type: "string", enum: ["air", "sea", "express"] },
          category: { type: "string", description: "Optional category like electronics, clothing, general" },
          weight_kg: { type: "number" },
          cbm: { type: "number" },
        },
        required: ["destination_country", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_warehouse_photo",
      description: "Send the China warehouse photo for a package to the client. Use after the client asks to see their package.",
      parameters: {
        type: "object",
        properties: { tracking_number: { type: "string" } },
        required: ["tracking_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "initiate_payment",
      description: "Trigger an M-Pesa STK push for the client to pay for a package. Always confirm amount and phone with the client first.",
      parameters: {
        type: "object",
        properties: {
          tracking_number: { type: "string" },
          phone: { type: "string", description: "MSISDN starting with 254..." },
          amount: { type: "number" },
        },
        required: ["tracking_number", "phone", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Mark conversation for human agent follow-up when AI cannot help.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
];

type ToolCtx = { whatsappNumber: string; conversationId: string };

async function executeTool(name: string, args: any, ctx: ToolCtx): Promise<any> {
  const sb = supabaseAdmin;
  switch (name) {
    case "find_client": {
      let q = sb.from("clients").select("*").limit(5);
      if (args.whatsapp_number) q = q.eq("whatsapp_number", String(args.whatsapp_number).replace(/\D/g, ""));
      else if (args.tracking_number) {
        const { data: pkg } = await sb.from("packages").select("client_id").eq("tracking_number", args.tracking_number).maybeSingle();
        if (!pkg?.client_id) return { found: false };
        q = q.eq("id", pkg.client_id);
      } else if (args.name) q = q.ilike("full_name", `%${args.name}%`);
      const { data } = await q;
      return { found: (data?.length ?? 0) > 0, clients: data };
    }
    case "register_client": {
      const wa = String(args.whatsapp_number).replace(/\D/g, "");
      const { data: existing } = await sb.from("clients").select("id").eq("whatsapp_number", wa).maybeSingle();
      if (existing) {
        const { data } = await sb.from("clients").update({
          full_name: args.full_name,
          country: args.country ?? null,
          city: args.city ?? null,
          email: args.email ?? null,
        }).eq("id", existing.id).select().single();
        await sb.from("conversations").update({ client_id: existing.id }).eq("id", ctx.conversationId);
        return { ok: true, client: data, action: "updated" };
      }
      const { data, error } = await sb.from("clients").insert({
        whatsapp_number: wa,
        full_name: args.full_name,
        country: args.country,
        city: args.city,
        email: args.email,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      await sb.from("conversations").update({ client_id: data.id }).eq("id", ctx.conversationId);
      return { ok: true, client: data, action: "created" };
    }
    case "track_package": {
      const { data: pkg } = await sb.from("packages").select("*, clients(full_name, whatsapp_number)").eq("tracking_number", args.tracking_number).maybeSingle();
      if (!pkg) return { found: false };
      const { data: events } = await sb.from("package_events").select("status, location, notes, created_at").eq("package_id", pkg.id).order("created_at", { ascending: true });
      return {
        found: true,
        tracking_number: pkg.tracking_number,
        description: pkg.description,
        status: pkg.status,
        sender_name: pkg.sender_name ?? (pkg as any).clients?.full_name ?? null,
        sender_phone: pkg.sender_phone ?? (pkg as any).clients?.whatsapp_number ?? null,
        weight_kg: pkg.weight_kg,
        cbm: pkg.cbm,
        mode: pkg.mode,
        origin: pkg.origin,
        destination: `${pkg.destination_city ?? ""} ${pkg.destination_country ?? ""}`.trim(),
        estimated_arrival: pkg.estimated_arrival,
        shipping_cost: pkg.shipping_cost,
        currency: pkg.currency,
        has_warehouse_photo: !!pkg.warehouse_photo_url,
        events,
      };
    }
    case "search_packages": {
      let q = sb.from("packages").select("tracking_number, description, status, mode, sender_name, sender_phone, estimated_arrival").order("created_at", { ascending: false }).limit(10);
      if (args.sender_phone) {
        const phone = String(args.sender_phone).replace(/\D/g, "");
        q = q.eq("sender_phone", phone);
      } else if (args.sender_name) {
        q = q.ilike("sender_name", `%${args.sender_name}%`);
      } else {
        return { found: false, error: "Provide sender_phone or sender_name" };
      }
      const { data } = await q;
      return { found: (data?.length ?? 0) > 0, packages: data ?? [] };
    }
    case "list_client_packages": {
      const wa = String(args.whatsapp_number).replace(/\D/g, "");
      const { data: client } = await sb.from("clients").select("id, full_name").eq("whatsapp_number", wa).maybeSingle();
      if (!client) return { found: false };
      const { data } = await sb.from("packages").select("tracking_number, description, status, mode, estimated_arrival").eq("client_id", client.id).order("created_at", { ascending: false }).limit(20);
      return { found: true, client_name: client.full_name, packages: data };
    }
    case "get_rates": {
      let q = sb.from("rates").select("*").eq("active", true);
      if (args.destination_country) q = q.ilike("destination_country", `%${args.destination_country}%`);
      if (args.mode) q = q.eq("mode", args.mode);
      const { data } = await q;
      return { rates: data };
    }
    case "quote_shipping": {
      const { computeQuote } = await import("./quote");
      return await computeQuote({
        destinationCountry: args.destination_country,
        mode: args.mode,
        category: args.category,
        weightKg: args.weight_kg,
        cbm: args.cbm,
      });
    }
    case "send_warehouse_photo": {
      const { data: pkg } = await sb.from("packages").select("warehouse_photo_url, description").eq("tracking_number", args.tracking_number).maybeSingle();
      if (!pkg?.warehouse_photo_url) return { sent: false, reason: "No photo on file yet." };
      const { sendWhatsAppImage } = await import("./evolution");
      await sendWhatsAppImage(ctx.whatsappNumber, pkg.warehouse_photo_url, `Your package: ${pkg.description ?? args.tracking_number}`);
      return { sent: true };
    }
    case "initiate_payment": {
      const { initiateStkPush } = await import("./daraja");
      const { data: pkg } = await sb.from("packages").select("id, client_id").eq("tracking_number", args.tracking_number).maybeSingle();
      try {
        const r = await initiateStkPush({
          phone: String(args.phone),
          amount: Number(args.amount),
          accountReference: args.tracking_number,
          description: `Dexcargo ${args.tracking_number}`,
          packageId: pkg?.id,
          clientId: pkg?.client_id ?? undefined,
        });
        return { ok: true, message: "STK push sent. Please enter your M-Pesa PIN.", checkout_request_id: r.CheckoutRequestID };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    }
    case "escalate_to_human": {
      await sb.from("conversations").update({ ai_enabled: false }).eq("id", ctx.conversationId);
      return { ok: true, message: "A human agent will contact you shortly." };
    }
  }
  return { error: "unknown tool" };
}

export async function runAgent(opts: {
  conversationId: string;
  whatsappNumber: string;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  userMessage: string;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT + `\n\nClient WhatsApp number: ${opts.whatsappNumber}` },
    ...opts.history.slice(-20),
    { role: "user", content: opts.userMessage },
  ];

  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: TOOLS,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, t);
      if (res.status === 429) return "Sorry, our system is busy right now. Please try again in a moment.";
      if (res.status === 402) return "Our AI service is temporarily unavailable. A human agent will reply soon.";
      return "Sorry, I had trouble processing that. Could you rephrase?";
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) return "Sorry, no response. Please try again.";

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        const result = await executeTool(tc.function.name, args, { whatsappNumber: opts.whatsappNumber, conversationId: opts.conversationId });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    return msg.content || "";
  }
  return "Sorry, that took too long. Please try again.";
}
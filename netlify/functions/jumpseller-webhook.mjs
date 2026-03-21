/**
 * Pistón Barbería — Webhook Jumpseller
 * Recibe el evento "Order Paid" de Jumpseller y registra la venta en Supabase.
 *
 * Env vars requeridas (configurar en Netlify > Site configuration > Environment variables):
 *   JUMPSELLER_HOOKS_TOKEN   → Token de verificación HMAC (Panel Jumpseller > Apps > Webhooks)
 *   SUPABASE_URL             → https://ssirnhqtmjxuuuwyilmp.supabase.co
 *   SUPABASE_SERVICE_KEY     → Service role key de Supabase (Settings > API)
 *   WEB_BARBERO_ID           → UUID del barbero asignado a ventas web
 *   WEB_BARBERO_NOMBRE       → Nombre del barbero (ej: PISTON)
 */

import { createHmac } from "crypto";

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapFormaPago(paymentMethod = "") {
  const m = paymentMethod.toLowerCase();
  if (m.includes("webpay") || m.includes("tarjeta") || m.includes("credit") || m.includes("debit") || m.includes("paypal")) return "TK";
  if (m.includes("transfer") || m.includes("transferencia")) return "TRF";
  return "EF";
}

function buildVenta(order, barberoId, barberoNombre) {
  const fecha = new Date(order.completed_at || order.created_at);
  const fechaStr = fecha.toISOString().split("T")[0]; // YYYY-MM-DD

  const formaPago = mapFormaPago(order.payment_method_name || "");
  const monto = Math.round(Number(order.total) || 0);
  const descuento = Math.round(Number(order.discount) || 0);
  const total = monto - descuento;

  // Construir descripción de productos
  const items = (order.products || [])
    .map((p) => `${p.name} x${p.qty}`)
    .join(", ");

  // Nombre del cliente
  const cliente = [order.customer?.name, order.customer?.surname]
    .filter(Boolean)
    .join(" ")
    .trim() || null;

  return {
    barbero_id: barberoId,
    barbero_nombre: barberoNombre,
    cod_autorizacion: String(order.id),
    boleta: order.invoice_number ? String(order.invoice_number) : null,
    anio: fecha.getFullYear(),
    n_mes: fecha.getMonth() + 1,
    mes: MESES[fecha.getMonth()],
    dia: fecha.getDate(),
    dia_semana: DIAS_ES[fecha.getDay()],
    fecha: fechaStr,
    tipo: "PRODUCTO",
    cliente,
    servicio_producto: items || "Venta web",
    monto,
    propina: 0,
    descuento,
    total,
    forma_pago: formaPago,
    es_web: true,
    comentarios: `Pedido Jumpseller #${order.id} — ${order.payment_method_name || ""}`,
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async (req) => {
  // Solo aceptar POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hooksToken   = Netlify.env.get("JUMPSELLER_HOOKS_TOKEN");
  const supabaseUrl  = Netlify.env.get("SUPABASE_URL");
  const supabaseKey  = Netlify.env.get("SUPABASE_SERVICE_KEY");
  const barberoId    = Netlify.env.get("WEB_BARBERO_ID");
  const barberoNombre = Netlify.env.get("WEB_BARBERO_NOMBRE") || "PISTON";

  const rawBody = await req.text();

  // ── Verificar firma HMAC de Jumpseller ──────────────────────────────────────
  if (hooksToken) {
    const hmacHeader = req.headers.get("Jumpseller-Hmac-Sha256") || "";
    const computed = createHmac("sha256", hooksToken)
      .update(rawBody)
      .digest("base64")
      .trim();
    if (computed !== hmacHeader) {
      console.error("HMAC mismatch — request rejected");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // ── Parsear payload ──────────────────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request — invalid JSON", { status: 400 });
  }

  const order = payload.order;
  if (!order) {
    return new Response("No order in payload", { status: 400 });
  }

  // Solo procesar pedidos pagados
  const status = (order.status || "").toLowerCase();
  if (status !== "paid" && status !== "complete" && status !== "completed") {
    console.log(`Order ${order.id} ignored — status: ${status}`);
    return new Response("OK — ignored (not paid)", { status: 200 });
  }

  // ── Insertar en Supabase ─────────────────────────────────────────────────────
  const venta = buildVenta(order, barberoId, barberoNombre);

  const res = await fetch(`${supabaseUrl}/rest/v1/ventas`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(venta),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Supabase error:", err);
    return new Response(`Supabase error: ${err}`, { status: 500 });
  }

  console.log(`✓ Venta web registrada — Pedido Jumpseller #${order.id} — ${venta.total}`);
  return new Response("OK", { status: 200 });
};

export const config = {
  path: "/api/jumpseller-webhook",
};

// API de la tienda en Netlify Functions + Netlify Blobs (reemplaza a server.js)
//   GET  /api/tienda  -> catálogo compartido (público)
//   PUT  /api/tienda  -> guarda el catálogo (solo administrador)
//   POST /api/login   -> verifica usuario y clave
//   POST /api/pedidos -> guarda un pedido
// Usuario y clave se definen en Netlify > Variables ambientales: ADMIN_USUARIO y ADMIN_CLAVE
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const esAdmin = (o) => {
    const u = process.env.ADMIN_USUARIO, c = process.env.ADMIN_CLAVE;
    return !!u && !!c && !!o && String(o.usuario || "").trim().toUpperCase() === u.trim().toUpperCase() && o.clave === c;
};

// Revisa el pedido y recalcula subtotales y total (no confía en los que manda el navegador)
function validarPedido(o) {
    if (!o || typeof o.id !== "string" || !Array.isArray(o.items) || !o.items.length || o.items.length > 200) return null;
    const items = [];
    for (const i of o.items) {
        const cantidad = Number(i.cantidad), precioUnitario = Number(i.precioUnitario);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99 || !(precioUnitario >= 0) || typeof i.producto !== "string") return null;
        items.push({ producto: i.producto.slice(0, 120), precioUnitario, cantidad, subtotal: precioUnitario * cantidad });
    }
    return { id: o.id.slice(0, 40), fecha: new Date().toISOString(), items, total: items.reduce((s, i) => s + i.subtotal, 0) };
}

export default async (req) => {
    const ruta = new URL(req.url).pathname;
    // consistency "strong": lo que publica el admin se ve enseguida en todos los dispositivos
    const tienda = getStore({ name: "tienda", consistency: "strong" });

    if (ruta === "/api/tienda" && req.method === "GET") {
        const t = await tienda.get("catalogo", { type: "json" });
        return t ? json(t) : json({ ok: false }, 404);
    }

    let cuerpo = null;
    if (req.method === "POST" || req.method === "PUT") { try { cuerpo = await req.json(); } catch { /* inválido */ } }

    if (ruta === "/api/login" && req.method === "POST") {
        const ok = esAdmin(cuerpo);
        return json({ ok }, ok ? 200 : 401);
    }

    if (ruta === "/api/tienda" && req.method === "PUT") {
        if (!esAdmin(cuerpo)) return json({ ok: false, error: "No autorizado" }, 401);
        if (!cuerpo.tienda || !Array.isArray(cuerpo.tienda.categorias)) return json({ ok: false, error: "Datos inválidos" }, 400);
        await tienda.setJSON("catalogo", cuerpo.tienda);
        return json({ ok: true });
    }

    if (ruta === "/api/pedidos" && req.method === "POST") {
        const pedido = validarPedido(cuerpo);
        if (!pedido) return json({ ok: false, error: "Pedido inválido" }, 400);
        await getStore("pedidos").setJSON(pedido.id.replace(/[^A-Za-z0-9-]/g, ""), pedido);
        return json({ ok: true, id: pedido.id }, 201);
    }

    return json({ ok: false }, 405);
};

export const config = { path: ["/api/tienda", "/api/login", "/api/pedidos"] };

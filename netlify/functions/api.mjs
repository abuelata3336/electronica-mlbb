// API de la tienda en Netlify Functions + Netlify Blobs (reemplaza a server.js)
//   GET  /api/tienda  -> catálogo compartido (público)
//   PUT  /api/tienda  -> guarda el catálogo (solo administrador)
//   POST /api/login   -> verifica usuario y clave
//   POST /api/pedidos -> valida el pedido, genera el PDF, lo envía por correo al negocio y lo devuelve al cliente
//   POST /api/admin   -> (solo administrador) lee o cambia el correo que recibe los pedidos
// Variables ambientales en Netlify:
//   ADMIN_USUARIO, ADMIN_CLAVE            -> acceso del administrador
//   GMAIL_USER, GMAIL_APP_PASSWORD        -> cuenta Gmail que ENVÍA los correos (con "contraseña de aplicación")
import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import { armarPedido, PAGOS, ENTREGAS } from "../lib/pedido.mjs";
import { generarComprobante } from "../lib/comprobante.mjs";

const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const esAdmin = (o) => {
    const u = process.env.ADMIN_USUARIO, c = process.env.ADMIN_CLAVE;
    return !!u && !!c && !!o && String(o.usuario || "").trim().toUpperCase() === u.trim().toUpperCase() && o.clave === c;
};

const dinero = (n) => "$" + Number(n).toLocaleString("es-AR");

// Envía el PDF (con los datos del cliente) al correo del negocio. Devuelve true si salió bien.
async function avisarAlNegocio(pedido, pdf, destino) {
    const usuario = process.env.GMAIL_USER, clave = process.env.GMAIL_APP_PASSWORD;
    if (!usuario || !clave || !(destino || usuario)) { console.error("Falta GMAIL_USER o GMAIL_APP_PASSWORD: no se envió el correo del pedido", pedido.id); return false; }
    try {
        const c = pedido.cliente, e = pedido.entrega;
        const destinoTexto = e.tipo === "retiro" ? `Sucursal elegida: ${e.sucursal.nombre} - ${e.sucursal.direccion}` : `Dirección de destino: ${e.direccion}`;
        const correo = nodemailer.createTransport({ service: "gmail", auth: { user: usuario, pass: clave.replace(/\s/g, "") } });
        await correo.sendMail({
            from: `"Pedidos de la tienda" <${usuario}>`,
            to: destino || usuario,
            subject: `Nuevo pedido ${pedido.id} (${e.tipo === "retiro" ? "RETIRO" : "ENVÍO"}) - ${c.nombre} - ${dinero(pedido.total)}`,
            text: `Nuevo pedido ${pedido.id}\n\nCliente: ${c.nombre}\nTeléfono: ${c.telefono}\nEntrega: ${ENTREGAS[pedido.entrega.tipo]}\n${destinoTexto}\nPago: ${PAGOS[pedido.pago]}\n\n` +
                pedido.items.map((i) => `- ${i.cantidad} x ${i.producto} = ${dinero(i.subtotal)}`).join("\n") + `\n\nTotal: ${dinero(pedido.total)}\n\nEl comprobante está adjunto en PDF.`,
            attachments: [{ filename: `pedido-${pedido.id}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
        });
        return true;
    } catch (e) { console.error("No se pudo enviar el correo del pedido", pedido.id, e.message); return false; }
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
        const catalogo = await tienda.get("catalogo", { type: "json" });
        const r = armarPedido(cuerpo, catalogo);
        if (r.error) return json({ ok: false, error: r.error }, r.codigo);
        const { pedido } = r;
        const opciones = { tienda: (catalogo && catalogo.textos && catalogo.textos.titulo) || "Tienda", alias: (catalogo && catalogo.textos && catalogo.textos.alias) || "" };
        const destino = await getStore({ name: "config", consistency: "strong" }).get("correo");
        // PDF para el cliente y PDF para el negocio (con sus datos); guardado y correo en paralelo
        const [pdfCliente, pdfNegocio] = await Promise.all([
            generarComprobante(pedido, { ...opciones, paraNegocio: false }),
            generarComprobante(pedido, { ...opciones, paraNegocio: true }),
        ]);
        const [, correo] = await Promise.all([getStore("pedidos").setJSON(pedido.id, pedido), avisarAlNegocio(pedido, pdfNegocio, destino)]);
        return json({ ok: true, id: pedido.id, total: pedido.total, items: pedido.items, pago: pedido.pago, entrega: pedido.entrega, correo, pdf: Buffer.from(pdfCliente).toString("base64") }, 201);
    }

    if (ruta === "/api/admin" && req.method === "POST") {
        if (!esAdmin(cuerpo)) return json({ ok: false, error: "No autorizado" }, 401);
        const config = getStore({ name: "config", consistency: "strong" });
        if (cuerpo.accion === "leerCorreo") return json({ ok: true, correo: (await config.get("correo")) || "" });
        if (cuerpo.accion === "guardarCorreo") {
            const c = String(cuerpo.correo || "").trim().toLowerCase();
            if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return json({ ok: false, error: "Correo inválido" }, 400);
            if (c) await config.set("correo", c); else await config.delete("correo");
            return json({ ok: true });
        }
        return json({ ok: false, error: "Acción desconocida" }, 400);
    }

    return json({ ok: false }, 405);
};

export const config = { path: ["/api/tienda", "/api/login", "/api/pedidos", "/api/admin"] };

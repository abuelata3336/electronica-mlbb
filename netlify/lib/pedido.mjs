// Validación del pedido. El servidor NO confía en precios ni nombres que manda el navegador:
// los toma del catálogo publicado (y revisa el stock).
export const PAGOS = { mercadopago: "Transferencia por Mercado Pago", efectivo: "Efectivo (abona al recibir)" };
const txt = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function armarPedido(o, catalogo) {
    const err = (error, codigo = 400) => ({ error, codigo });
    if (!o || typeof o.id !== "string" || !/^[A-Za-z0-9-]{3,40}$/.test(o.id)) return err("Pedido inválido.");
    const cl = o.cliente || {};
    const cliente = { nombre: txt(cl.nombre, 80), telefono: txt(cl.telefono, 30), direccion: txt(cl.direccion, 200) };
    if (!cliente.nombre || !cliente.direccion) return err("Completá nombre y apellido, y dirección.");
    if (cliente.telefono.replace(/\D/g, "").length < 6) return err("Ingresá un teléfono válido.");
    if (!PAGOS[o.pago]) return err("Elegí un método de pago.");
    if (!Array.isArray(o.items) || !o.items.length || o.items.length > 50) return err("El carrito está vacío o es demasiado grande.");

    const cats = catalogo && Array.isArray(catalogo.categorias) ? catalogo.categorias : null;
    const items = [];
    for (const i of o.items) {
        const cantidad = Number(i.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) return err("Cantidad inválida.");
        let producto, precioUnitario;
        if (cats) {
            const c = cats.find((x) => x.id === i.c), p = c && (c.productos || []).find((x) => x.id === i.p);
            const v = p && i.v ? (p.variantes || []).find((x) => x.id === i.v) : null;
            if (!p || (i.v && !v)) return err("Un producto del carrito ya no está disponible. Actualizá la página.", 409);
            producto = (p.nombre || c.nombre) + (v ? ` – ${v.nombre}` : "");
            if (p.stock === false || (v && v.stock === false)) return err(`"${producto}" se quedó sin stock. Quitalo del carrito.`, 409);
            precioUnitario = Number(p.precio);
        } else {   // el negocio todavía no publicó el catálogo: se usan los datos del navegador
            producto = txt(i.producto, 120);
            precioUnitario = Number(i.precioUnitario);
        }
        if (!producto || !Number.isFinite(precioUnitario) || precioUnitario < 0) return err("Producto inválido.");
        items.push({ producto: txt(producto, 120), precioUnitario, cantidad, subtotal: precioUnitario * cantidad });
    }
    return { pedido: { id: o.id, fecha: new Date().toISOString(), cliente, pago: o.pago, items, total: items.reduce((s, i) => s + i.subtotal, 0) } };
}

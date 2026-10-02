// Validación del pedido. El servidor NO confía en precios ni nombres que manda el navegador:
// los toma del catálogo publicado (y revisa el stock).
export const ENTREGAS = { domicilio: "Envío a Domicilio", retiro: "Retiro en Sucursal" };
export const PAGOS = { mercadopago: "Transferencia por Mercado Pago", efectivo: "Efectivo (abona al recibir)" };
const txt = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function armarPedido(o, catalogo) {
    const err = (error, codigo = 400) => ({ error, codigo });
    if (!o || typeof o.id !== "string" || !/^[A-Za-z0-9-]{3,40}$/.test(o.id)) return err("Pedido inválido.");
    const cl = o.cliente || {};
    const cliente = { nombre: txt(cl.nombre, 80), telefono: txt(cl.telefono, 30) };
    if (!cliente.nombre) return err("Completá nombre y apellido.");
    if (cliente.telefono.replace(/\D/g, "").length < 6) return err("Ingresá un teléfono válido.");

    // Entrega: envío a domicilio (requiere dirección) o retiro en una sucursal que exista en la lista del administrador
    const en = o.entrega || {};
    let entrega;
    if (en.tipo === "retiro") {
        const lista = catalogo && catalogo.textos && catalogo.textos.sucursales;
        const suc = Array.isArray(lista) && lista.find((x) => x && x.id === en.sucursalId);
        if (!suc) return err("Elegí una sucursal de la lista (puede que ya no esté disponible).", 409);
        entrega = { tipo: "retiro", sucursal: { id: suc.id, nombre: txt(suc.nombre, 80), direccion: txt(suc.direccion, 200) } };
    } else if (en.calle === undefined && txt(en.direccion ?? cl.direccion, 200)) {
        // página vieja en caché: una sola línea de dirección
        const direccion = txt(en.direccion ?? cl.direccion, 200);
        if (direccion.length < 5) return err("Ingresá la dirección de entrega.");
        entrega = { tipo: "domicilio", direccion };
    } else {
        const calle = txt(en.calle, 120), piso = txt(en.piso, 40), localidad = txt(en.localidad, 80);
        const provincia = txt(en.provincia, 40), referencias = txt(en.referencias, 200), cp = txt(en.cp, 10).toUpperCase().replace(/\s/g, "");
        if (calle.length < 3) return err("Ingresá la calle y el número.");
        if (!localidad) return err("Ingresá la localidad o barrio.");
        if (!/^(\d{4}|[A-Z]\d{4}[A-Z]{3})$/.test(cp)) return err("Ingresá un código postal válido (4 números, ej: 1832).");
        if (!provincia) return err("Elegí la provincia.");
        const direccion = [calle, piso, localidad].filter(Boolean).join(", ") + ` (CP ${cp}), ${provincia}`;
        entrega = { tipo: "domicilio", calle, piso, localidad, cp, provincia, referencias, direccion };
    }

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
    return { pedido: { id: o.id, fecha: new Date().toISOString(), cliente, entrega, pago: o.pago, items, total: items.reduce((s, i) => s + i.subtotal, 0) } };
}

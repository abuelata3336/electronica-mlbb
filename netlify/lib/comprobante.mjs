// Genera el PDF del comprobante. paraNegocio=true agrega los datos del cliente (nombre, teléfono, dirección).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PAGOS, ENTREGAS } from "./pedido.mjs";

// Las fuentes estándar del PDF solo admiten Latin-1: se reemplaza o descarta lo demás
const limpiar = (s) => String(s ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "").trim();
const dinero = (n) => "$" + Number(n).toLocaleString("es-AR");
const fechaAR = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

export async function generarComprobante(pedido, { tienda = "Tienda", alias = "", paraNegocio = false } = {}) {
    const pdf = await PDFDocument.create();
    const normal = await pdf.embedFont(StandardFonts.Helvetica), negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595, H = 842, M = 40, AZUL = rgb(0, 0.17, 0.36), GRIS = rgb(0.35, 0.35, 0.35), NEGRO = rgb(0, 0, 0);
    const X_CANT = 330, X_UNIT = 450, X_SUB = W - M;
    let pagina, y;

    const texto = (t, x, yy, { f = normal, tam = 10, color = NEGRO } = {}) => pagina.drawText(limpiar(t), { x, y: yy, size: tam, font: f, color });
    const derecha = (t, xDer, yy, o = {}) => texto(t, xDer - (o.f || normal).widthOfTextAtSize(limpiar(t), o.tam || 10), yy, o);
    const envolver = (t, ancho, f, tam) => {
        const lineas = []; let actual = "";
        for (const palabra of limpiar(t).split(" ")) {
            const prueba = actual ? actual + " " + palabra : palabra;
            if (f.widthOfTextAtSize(prueba, tam) <= ancho || !actual) actual = prueba; else { lineas.push(actual); actual = palabra; }
        }
        return actual ? [...lineas, actual] : lineas;
    };
    const recortar = (t, ancho, f, tam) => {
        let s = limpiar(t);
        if (f.widthOfTextAtSize(s, tam) <= ancho) return s;
        while (s.length > 1 && f.widthOfTextAtSize(s + "...", tam) > ancho) s = s.slice(0, -1);
        return s + "...";
    };
    const encabezadoTabla = () => {
        pagina.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.85, 0.9, 0.97) });
        texto("Producto", M + 6, y, { f: negrita }); derecha("Cant.", X_CANT, y, { f: negrita });
        derecha("Precio unit.", X_UNIT, y, { f: negrita }); derecha("Subtotal", X_SUB - 6, y, { f: negrita });
        y -= 22;
    };
    const nuevaPagina = () => { pagina = pdf.addPage([W, H]); y = H - M; };

    nuevaPagina();
    pagina.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: AZUL });
    texto(tienda, M, H - 38, { f: negrita, tam: 20, color: rgb(1, 1, 1) });
    texto(paraNegocio ? "NUEVO PEDIDO - copia para el negocio" : "Comprobante de pedido", M, H - 60, { tam: 12, color: rgb(1, 1, 1) });
    y = H - 110;

    // Fila "Etiqueta: valor" con el valor ajustado a varias líneas si es largo
    const campo = (etiqueta, valor) => {
        texto(etiqueta, M, y, { f: negrita });
        const lineas = envolver(valor, W - M - (M + 125), normal, 10);
        lineas.forEach((l, k) => texto(l, M + 125, y - k * 13));
        y -= 15 + Math.max(0, lineas.length - 1) * 13;
    };
    // Entrega: lo que se imprime depende de lo que eligió el cliente
    const e = pedido.entrega || { tipo: "domicilio", direccion: (pedido.cliente && pedido.cliente.direccion) || "" };
    campo("Pedido:", pedido.id);
    campo("Fecha:", fechaAR(pedido.fecha));
    campo("Pago:", PAGOS[pedido.pago] + (pedido.pago === "mercadopago" && alias ? ` - Alias: ${alias}` : ""));
    campo("Tipo de entrega:", ENTREGAS[e.tipo]);
    if (e.tipo === "retiro") campo("Sucursal elegida:", `${e.sucursal.nombre} - ${e.sucursal.direccion}`);
    else {
        campo("Dirección de destino:", e.direccion);
        if (e.referencias) campo("Referencias:", e.referencias);
    }
    y -= 12;

    if (paraNegocio) {
        const c = pedido.cliente;
        pagina.drawRectangle({ x: M, y: y - 36, width: W - 2 * M, height: 52, borderColor: AZUL, borderWidth: 1.2, color: rgb(0.95, 0.97, 1) });
        texto("DATOS DEL CLIENTE", M + 10, y, { f: negrita, color: AZUL }); y -= 17;
        texto("Nombre y apellido:", M + 10, y, { f: negrita }); texto(c.nombre, M + 125, y); y -= 15;
        texto("Teléfono:", M + 10, y, { f: negrita }); texto(c.telefono, M + 125, y);
        y -= 36;
    }

    encabezadoTabla();
    for (const it of pedido.items) {
        if (y < M + 70) { nuevaPagina(); encabezadoTabla(); }
        texto(recortar(it.producto, X_CANT - M - 38, normal, 10), M + 6, y);
        derecha(String(it.cantidad), X_CANT, y); derecha(dinero(it.precioUnitario), X_UNIT, y); derecha(dinero(it.subtotal), X_SUB - 6, y);
        pagina.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        y -= 20;
    }
    if (y < M + 50) nuevaPagina();
    y -= 6;
    derecha("TOTAL:  " + dinero(pedido.total), X_SUB - 6, y, { f: negrita, tam: 15, color: AZUL });
    y -= 40;
    texto(paraNegocio ? "Preparar el pedido y coordinar la entrega con el cliente." : "¡Gracias por tu compra!", M, y, { tam: 10, color: GRIS });
    return await pdf.save();   // Uint8Array
}

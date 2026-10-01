/* ====== CARRITO DE INVITADO + PEDIDOS (se carga antes de app.js) ====== */
const KEY_CARRITO = 'tienda_carrito', MAX_CANT = 99;
const API = typeof API_PEDIDOS !== 'undefined' ? API_PEDIDOS : 'http://localhost:3000/api/pedidos';
let pendiente = null, pedidoHecho = null;

/* ---- Carrito guardado en el navegador del invitado ---- */
const leerCarrito = () => { try { return JSON.parse(localStorage.getItem(KEY_CARRITO) || '[]'); } catch { return []; } };
const claveItem = (i) => `${i.p}|${i.v}`;

function guardarCarrito(items) {
    localStorage.setItem(KEY_CARRITO, JSON.stringify(items));
    actualizarContador();
    if ($('dlgCarrito').open) pintarCarrito();
}

// Precio y nombre se leen del catálogo actual, así siempre están al día
function lineas() {
    return leerCarrito().map((i) => {
        const c = buscar(i.c), p = c && c.productos.find((x) => x.id === i.p);
        if (!p) return null;
        const v = (p.variantes || []).find((x) => x.id === i.v);
        return { k: claveItem(i), nombre: (p.nombre || c.nombre) + (v ? ` – ${v.nombre}` : ''), unit: p.precio, n: i.n, sub: p.precio * i.n };
    }).filter(Boolean);
}
const totalCarrito = () => lineas().reduce((s, l) => s + l.sub, 0);
function actualizarContador() {
    const el = document.getElementById('cuentaCarrito');
    if (el) el.textContent = lineas().reduce((s, l) => s + l.n, 0);
}
function cambiarCant(k, delta) {
    const items = leerCarrito(), it = items.find((i) => claveItem(i) === k);
    if (!it) return;
    it.n = Math.min(MAX_CANT, it.n + delta);
    guardarCarrito(it.n < 1 ? items.filter((i) => i !== it) : items);
}

/* ---- Pantallas del carrito ---- */
const filaCarrito = (l) => `<div class="fila-carrito">
    <div><strong>${esc(l.nombre)}</strong><br><small>${precio(l.unit)} c/u</small></div>
    <div class="cantidad"><button data-a="itemMenos" data-k="${esc(l.k)}" aria-label="Menos">−</button><span>${l.n}</span><button data-a="itemMas" data-k="${esc(l.k)}" aria-label="Más">+</button></div>
    <div class="subtotal">${precio(l.sub)}<br><button class="peligro" data-a="itemQuitar" data-k="${esc(l.k)}">Quitar</button></div></div>`;

function vistaPago() {
    const o = pedidoHecho, { alias, telefono, gmail } = textos;
    const resumen = `Hola! Hice el pedido ${o.id}:\n` + o.items.map((i) => `- ${i.cantidad} x ${i.producto} = ${precio(i.subtotal)}`).join('\n') + `\nTotal: ${precio(o.total)}`;
    const digitos = telefono.replace(/\D/g, '');
    const bloques = [
        alias && `<p>Alias de Mercado Pago: <strong>${esc(alias)}</strong> <button class="secundario" data-a="copiarAlias">Copiar</button></p>`,
        telefono && `<p>WhatsApp: ${digitos ? `<a href="https://wa.me/${digitos}?text=${encodeURIComponent(resumen)}" target="_blank" rel="noopener">${esc(telefono)}</a>` : esc(telefono)}</p>`,
        gmail && `<p>Correo: <a href="mailto:${esc(gmail)}?subject=${encodeURIComponent('Pedido ' + o.id)}&body=${encodeURIComponent(resumen)}">${esc(gmail)}</a></p>`,
    ].filter(Boolean).join('');
    return `<h2>Pedido ${o.id} confirmado</h2>
        <p>Total a pagar: <strong>${precio(o.total)}</strong></p>
        <div class="pago">${bloques ? '<p>Transferí el total y enviá el comprobante por:</p>' + bloques : '<p>Te vamos a contactar para coordinar el pago.</p>'}</div>
        <div class="fila"><button data-a="cerrarPedido">Listo</button></div>`;
}

function pintarCarrito() {
    const cont = $('cuerpoCarrito'), ls = lineas();
    if (pedidoHecho) { cont.innerHTML = vistaPago(); return; }
    cont.innerHTML = ls.length
        ? `<h2>Tu carrito</h2>${ls.map(filaCarrito).join('')}
           <p class="total-carrito">Total: ${precio(totalCarrito())}</p>
           <div class="fila"><button data-a="confirmarPedido">Confirmar pedido</button>
           <button class="secundario" data-a="cerrarCarrito">Seguir comprando</button>
           <button class="secundario" data-a="vaciarCarrito">Vaciar</button></div>`
        : `<h2>Tu carrito</h2><p class="vacio">Tu carrito está vacío.</p><div class="fila"><button data-a="cerrarCarrito">Ver productos</button></div>`;
}

/* ---- Acciones (se suman a las de app.js) ---- */
const accionesCarrito = {
    comprar(el) {
        const c = buscar(el.dataset.c), p = c.productos.find((x) => x.id === el.dataset.p);
        const v = (p.variantes || []).find((x) => x.id === el.dataset.v);
        pendiente = { c: c.id, p: p.id, v: v ? v.id : '' };
        $('cantTitulo').textContent = (p.nombre || c.nombre) + (v ? ` – ${v.nombre}` : '');
        $('cantInput').value = 1;
        $('dlgCant').showModal();
        $('cantInput').select();
    },
    qtyMas() { $('cantInput').value = Math.min(MAX_CANT, (Number($('cantInput').value) || 0) + 1); },
    qtyMenos() { $('cantInput').value = Math.max(1, (Number($('cantInput').value) || 2) - 1); },
    cantCancelar() { $('dlgCant').close(); },
    itemMas(el) { cambiarCant(el.dataset.k, 1); },
    itemMenos(el) { cambiarCant(el.dataset.k, -1); },
    itemQuitar(el) { guardarCarrito(leerCarrito().filter((i) => claveItem(i) !== el.dataset.k)); },
    vaciarCarrito() { if (confirm('¿Vaciar el carrito?')) guardarCarrito([]); },
    cerrarCarrito() { $('dlgCarrito').close(); },
    cerrarPedido() { $('dlgCarrito').close(); },
    copiarAlias() { navigator.clipboard.writeText(textos.alias).then(() => avisar('Alias copiado')); },
    async confirmarPedido() {
        const ls = lineas();
        if (!ls.length) return;
        pedidoHecho = {
            id: 'PED-' + Date.now().toString(36).toUpperCase(), fecha: new Date().toISOString(),
            items: ls.map((l) => ({ producto: l.nombre, precioUnitario: l.unit, cantidad: l.n, subtotal: l.sub })),
            total: totalCarrito(),
        };
        guardarCarrito([]);   // vacía el carrito y muestra los datos de pago
        try {
            const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedidoHecho) });
            if (!r.ok) throw new Error(r.status);
        } catch { console.warn('El pedido no llegó al servidor (¿está corriendo server.js?).'); }
    },
    /* Panel de administrador */
    togglePedidos() { textos.pedidos = !textos.pedidos; guardarTextos(); },
    editarCobro() {
        const a = prompt('Alias de Mercado Pago (vacío = no se muestra):', textos.alias);
        if (a === null) return;
        const t = prompt('WhatsApp con código de país, ej: 5491112345678 (vacío = no se muestra):', textos.telefono);
        if (t === null) return;
        const g = prompt('Correo Gmail (vacío = no se muestra):', textos.gmail);
        if (g === null) return;
        Object.assign(textos, { alias: a.trim(), telefono: t.trim(), gmail: g.trim() });
        guardarTextos();
    },
};

function iniciarCarrito() {
    document.body.insertAdjacentHTML('beforeend', `
        <dialog id="dlgCant"><form id="formCant">
            <h2 id="cantTitulo"></h2>
            <p>¿Qué cantidad deseas comprar?</p>
            <div class="cantidad grande">
                <button type="button" data-a="qtyMenos" aria-label="Menos">−</button>
                <input id="cantInput" type="number" min="1" max="${MAX_CANT}" value="1" inputmode="numeric" aria-label="Cantidad">
                <button type="button" data-a="qtyMas" aria-label="Más">+</button>
            </div>
            <div class="fila"><button type="submit">Agregar al carrito</button><button type="button" class="secundario" data-a="cantCancelar">Cancelar</button></div>
        </form></dialog>
        <dialog id="dlgCarrito"><div id="cuerpoCarrito"></div></dialog>`);
    Object.assign(acciones, accionesCarrito);
    $('btnCarrito').addEventListener('click', () => { pedidoHecho = null; pintarCarrito(); $('dlgCarrito').showModal(); });
    $('dlgCarrito').addEventListener('close', () => { pedidoHecho = null; });
    $('formCant').addEventListener('submit', (e) => {
        e.preventDefault();
        const n = Math.floor(Number($('cantInput').value));
        if (!(n >= 1)) return alert('Ingresá una cantidad de 1 o más.');
        const items = leerCarrito(), it = items.find((i) => i.p === pendiente.p && i.v === pendiente.v);
        if (it) it.n = Math.min(MAX_CANT, it.n + n);        // ya estaba: se acumula
        else items.push({ ...pendiente, n: Math.min(MAX_CANT, n) });
        guardarCarrito(items);
        $('dlgCant').close();
        avisar(`Agregado: ${n} × ${$('cantTitulo').textContent}`);
    });
}

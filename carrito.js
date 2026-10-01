/* ====== CARRITO DE INVITADO + COMPRA + PEDIDOS (se carga antes de app.js) ====== */
const KEY_CARRITO = 'tienda_carrito', MAX_CANT = 99;
const API = typeof API_PEDIDOS !== 'undefined' ? API_PEDIDOS : '/api/pedidos';
let pendiente = null, pedidoHecho = null, paso = 'carrito', enviando = false;
let datosCliente = { nombre: '', telefono: '', direccion: '', pago: '' };

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
        return { k: claveItem(i), c: c.id, p: p.id, v: v ? v.id : '', nombre: (p.nombre || c.nombre) + (v ? ` – ${v.nombre}` : ''), unit: p.precio, n: i.n, sub: p.precio * i.n };
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

/* ---- PDF del comprobante (lo genera el servidor y llega en base64) ---- */
function urlPdf() {
    if (!pedidoHecho.pdfUrl) {
        const bytes = Uint8Array.from(atob(pedidoHecho.pdf), (ch) => ch.charCodeAt(0));
        pedidoHecho.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    }
    return pedidoHecho.pdfUrl;
}
function descargarPdf() {
    const a = document.createElement('a');
    a.href = urlPdf(); a.download = `comprobante-${pedidoHecho.id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
}

/* ---- Pantallas del carrito ---- */
const filaCarrito = (l) => `<div class="fila-carrito">
    <div><strong>${esc(l.nombre)}</strong><br><small>${precio(l.unit)} c/u</small></div>
    <div class="cantidad"><button data-a="itemMenos" data-k="${esc(l.k)}" aria-label="Menos">−</button><span>${l.n}</span><button data-a="itemMas" data-k="${esc(l.k)}" aria-label="Más">+</button></div>
    <div class="subtotal">${precio(l.sub)}<br><button class="peligro" data-a="itemQuitar" data-k="${esc(l.k)}">Quitar</button></div></div>`;

// Paso 2: datos del cliente + método de pago
function vistaCheckout() {
    const d = datosCliente, alias = textos.alias;
    const resumen = lineas().map((l) => `<div class="fila-resumen"><span>${l.n} × ${esc(l.nombre)}</span><span>${precio(l.sub)}</span></div>`).join('');
    return `<h2>Finalizar compra</h2>
        <div>${resumen}<p class="total-carrito">Total: ${precio(totalCarrito())}</p></div>
        <form id="formPedido">
            <label class="campo">Nombre y apellido <input name="nombre" value="${esc(d.nombre)}" required maxlength="80" autocomplete="name"></label>
            <label class="campo">Número de teléfono <input name="telefono" type="tel" value="${esc(d.telefono)}" required maxlength="30" inputmode="tel" autocomplete="tel" placeholder="Ej: 11 2345-6789"></label>
            <label class="campo">Dirección (de dónde hacés el pedido) <input name="direccion" value="${esc(d.direccion)}" required maxlength="200" autocomplete="street-address" placeholder="Calle, número, localidad"></label>
            <fieldset class="pago-opciones"><legend>Método de pago</legend>
                <label class="opcion-pago"><input type="radio" name="pago" value="mercadopago" required ${d.pago === 'mercadopago' ? 'checked' : ''}> Transferencia por Mercado Pago</label>
                <div class="alias-box">${alias
                    ? `Alias de Mercado Pago: <strong>${esc(alias)}</strong><br><button type="button" class="secundario" data-a="copiarAlias">Copiar alias</button><br><small>Transferí el total y guardá el comprobante.</small>`
                    : '<small>El negocio te va a pasar el alias para transferir.</small>'}</div>
                <label class="opcion-pago"><input type="radio" name="pago" value="efectivo" ${d.pago === 'efectivo' ? 'checked' : ''}> Abonar en efectivo</label>
            </fieldset>
            <p class="error" id="errPedido" role="alert"></p>
            <div class="fila"><button type="submit" id="btnComprar">Comprar</button>
            <button type="button" class="secundario" data-a="volverCarrito">Volver al carrito</button></div>
        </form>`;
}

// Paso 3: pedido confirmado
function vistaPago() {
    const o = pedidoHecho, { alias, telefono } = textos, efectivo = o.pago === 'efectivo';
    const resumen = `Hola! Hice el pedido ${o.id}:\n` + o.items.map((i) => `- ${i.cantidad} x ${i.producto} = ${precio(i.subtotal)}`).join('\n') + `\nTotal: ${precio(o.total)}`;
    const digitos = telefono.replace(/\D/g, '');
    const wa = digitos ? `<p>WhatsApp del negocio: <a href="https://wa.me/${digitos}?text=${encodeURIComponent(resumen)}" target="_blank" rel="noopener">${esc(telefono)}</a></p>` : '';
    const pago = efectivo
        ? '<p>Elegiste <strong>abonar en efectivo</strong>: pagás cuando recibas tu pedido.</p>'
        : alias
            ? `<p>Transferí el total al alias de Mercado Pago: <strong>${esc(alias)}</strong> <button class="secundario" data-a="copiarAlias">Copiar</button></p><p>Después enviá el comprobante de la transferencia al negocio.</p>`
            : '<p>Te vamos a contactar para pasarte el alias y coordinar el pago.</p>';
    return `<h2>¡Pedido ${esc(o.id)} confirmado!</h2>
        <p>Total: <strong>${precio(o.total)}</strong></p>
        <div class="pago">${pago}${wa}</div>
        <p>Se descargó tu comprobante en PDF. Si no se descargó, usá estos botones:</p>
        <div class="fila"><a class="boton" href="${urlPdf()}" download="comprobante-${esc(o.id)}.pdf">Descargar PDF</a>
        <a class="boton secundario" href="${urlPdf()}" target="_blank" rel="noopener">Abrir / imprimir</a></div>
        ${o.correo ? '' : '<p class="aviso-correo">Tu pedido quedó registrado. Si no te contactamos pronto, escribinos por WhatsApp.</p>'}
        <div class="fila"><button data-a="cerrarPedido">Listo</button></div>`;
}

function pintarCarrito() {
    const cont = $('cuerpoCarrito'), ls = lineas();
    if (pedidoHecho) { cont.innerHTML = vistaPago(); return; }
    if (!ls.length) paso = 'carrito';
    if (paso === 'datos') { cont.innerHTML = vistaCheckout(); return; }
    cont.innerHTML = ls.length
        ? `<h2>Tu carrito</h2>${ls.map(filaCarrito).join('')}
           <p class="total-carrito">Total: ${precio(totalCarrito())}</p>
           <div class="fila"><button data-a="confirmarPedido">Continuar con la compra</button>
           <button class="secundario" data-a="cerrarCarrito">Seguir comprando</button>
           <button class="secundario" data-a="vaciarCarrito">Vaciar</button></div>`
        : `<h2>Tu carrito</h2><p class="vacio">Tu carrito está vacío.</p><div class="fila"><button data-a="cerrarCarrito">Ver productos</button></div>`;
}

/* ---- Enviar el pedido: el servidor valida, guarda, genera el PDF y avisa al negocio por correo ---- */
function leerFormulario() {
    const f = $('formPedido');
    if (!f) return;
    const fd = new FormData(f), t = (n) => String(fd.get(n) || '').trim();
    datosCliente = { nombre: t('nombre'), telefono: t('telefono'), direccion: t('direccion'), pago: t('pago') };
}
function errorPedido(msg) {
    const e = $('errPedido'), b = $('btnComprar');
    if (e) e.textContent = msg;
    if (b) { b.disabled = false; b.textContent = 'Comprar'; }
}
async function enviarPedido() {
    if (enviando) return;
    leerFormulario();
    const d = datosCliente, ls = lineas();
    if (!ls.length) return;
    if (d.telefono.replace(/\D/g, '').length < 6) return errorPedido('Ingresá un teléfono válido.');
    if (!d.pago) return errorPedido('Elegí un método de pago.');
    enviando = true;
    errorPedido('');
    $('btnComprar').disabled = true; $('btnComprar').textContent = 'Enviando…';
    try {
        const r = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 'PED-' + Date.now().toString(36).toUpperCase(),
                cliente: { nombre: d.nombre, telefono: d.telefono, direccion: d.direccion }, pago: d.pago,
                items: ls.map((l) => ({ c: l.c, p: l.p, v: l.v, cantidad: l.n, producto: l.nombre, precioUnitario: l.unit })),
            }),
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) throw new Error(res.error || `El servidor respondió con error ${r.status}.`);
        pedidoHecho = res; paso = 'carrito';
        guardarCarrito([]);          // vacía el carrito y muestra la confirmación
        descargarPdf();              // descarga automática del comprobante
    } catch (e) {
        errorPedido(e.message && !/fetch|network/i.test(e.message) ? e.message : 'No se pudo enviar el pedido. Revisá tu conexión e intentá de nuevo.');
    } finally { enviando = false; }
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
    confirmarPedido() { if (lineas().length) { paso = 'datos'; pintarCarrito(); } },
    volverCarrito() { leerFormulario(); paso = 'carrito'; pintarCarrito(); },
    copiarAlias() { navigator.clipboard.writeText(textos.alias).then(() => avisar('Alias copiado')); },
    /* Panel de administrador */
    togglePedidos() { textos.pedidos = !textos.pedidos; guardarTextos(); },
    editarCobro() {
        const a = prompt('Alias de Mercado Pago (vacío = no se muestra):', textos.alias);
        if (a === null) return;
        const t = prompt('WhatsApp con código de país, ej: 5491112345678 (vacío = no se muestra):', textos.telefono);
        if (t === null) return;
        Object.assign(textos, { alias: a.trim(), telefono: t.trim() });
        guardarTextos();
    },
    // Gmail que recibe los PDF de los pedidos. Se guarda SOLO en el servidor y únicamente el administrador puede verlo o cambiarlo.
    async editarCorreoPedidos() {
        const cred = credenciales();
        if (!cred) return alert('Volvé a iniciar sesión como administrador.');
        const pedir = async (extra) => {
            const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cred, ...extra }) });
            return { r, d: await r.json().catch(() => ({})) };
        };
        try {
            const { r, d } = await pedir({ accion: 'leerCorreo' });
            if (!r.ok) return alert(d.error || 'No se pudo leer el correo (error ' + r.status + ').');
            const nuevo = prompt('Gmail que recibe los pedidos en PDF\n(vacío = usar la cuenta que envía los correos):', d.correo || '');
            if (nuevo === null) return;
            const g = await pedir({ accion: 'guardarCorreo', correo: nuevo.trim() });
            if (!g.r.ok) return alert(g.d.error || 'No se pudo guardar el correo.');
            avisar(nuevo.trim() ? 'Los pedidos se enviarán a ' + nuevo.trim() : 'Correo de pedidos borrado');
        } catch { alert('No se pudo conectar con el servidor.'); }
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
    $('btnCarrito').addEventListener('click', () => { pedidoHecho = null; paso = 'carrito'; pintarCarrito(); $('dlgCarrito').showModal(); });
    $('dlgCarrito').addEventListener('close', () => { pedidoHecho = null; paso = 'carrito'; });
    $('dlgCarrito').addEventListener('submit', (e) => { if (e.target.id === 'formPedido') { e.preventDefault(); enviarPedido(); } });
    $('dlgCarrito').addEventListener('input', (e) => { if (e.target.form && e.target.form.id === 'formPedido') leerFormulario(); });
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

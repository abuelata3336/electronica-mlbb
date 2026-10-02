/* ============ DATOS ============ */
const KEY = 'tienda_datos', KEY_SESION = 'tienda_sesion', KEY_TXT = 'tienda_textos';
const KEY_SNAP = 'tienda_guardados', KEY_CAMBIO = 'tienda_cambio', POR_PAGINA = 30;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const precio = (n) => '$' + Number(n).toLocaleString('es-AR');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (t) => (t ? new Date(Number(t)).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
// Usuario y clave del administrador se validan en el servidor (Netlify)

const mk = (carpeta, letra, precios) =>
    precios.map((p, i) => ({ id: letra + (i + 1), nombre: '', foto: `${carpeta}/${i + 1}${letra}.jpg`, precio: p, stock: true, variantes: [] }));
const INICIAL = [
    { id: 'clase1', nombre: 'AURICULARES', desc: 'Auriculares de cable e inalámbricos', productos: mk('abricular', 'a', [9000, 10000, 12000, 12000, 9000, 12000, 5500, 2500, 2500]) },
    { id: 'clase2', nombre: 'PARLANTES', desc: 'Distintos tipos de parlantes inalámbricos', productos: mk('parlante', 'p', [20000, 10000, 8500, 12000, 8000, 18000, 39000, 20000, 1000]) },
    { id: 'clase3', nombre: 'CARGADORES', desc: 'Cargadores para todo tipo de dispositivos', productos: mk('cargador', 'c', [5000, 15000, 6000, 28000, 5000, 3000, 8500, 4500, 5000]) },
];

let datos = JSON.parse(localStorage.getItem(KEY) || 'null') || structuredClone(INICIAL);
const TXT_BASE = { titulo: 'ELECTRONICA B.I.B', eslogan: 'Tu tienda de confianza', pedidos: true, alias: '', telefono: '', gmail: '', sucursales: [] };
const conBase = (t) => ({ ...TXT_BASE, ...t });
let textos = conBase(JSON.parse(localStorage.getItem(KEY_TXT) || 'null'));
function guardarTextos() { localStorage.setItem(KEY_TXT, JSON.stringify(textos)); localStorage.setItem(KEY_CAMBIO, Date.now()); sincronizar(); render(); }
let esAdmin = sessionStorage.getItem(KEY_SESION) === '1';
const KEY_AUTH = 'tienda_auth';
let servidorVacio = false, temporizadorEnvio = null;
const credenciales = () => JSON.parse(sessionStorage.getItem(KEY_AUTH) || 'null');
let vista = 'todo', pagina = 1, busqueda = '', orden = '';
const sel = {};               // opción elegida por producto
const abiertos = new Set();   // paneles de opciones abiertos (admin)

document.body.insertAdjacentHTML('beforeend',
    '<dialog id="visor"><img alt=""><button type="button">Cerrar ✕</button></dialog><div id="aviso" role="status" hidden></div>');

const estado = () => JSON.stringify({ textos, categorias: datos });
const snaps = () => JSON.parse(localStorage.getItem(KEY_SNAP) || '[]');
function avisar(t) { $('aviso').textContent = t; $('aviso').hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => ($('aviso').hidden = true), 2500); }

function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(datos)); localStorage.setItem(KEY_CAMBIO, Date.now()); }
    catch { if (!credenciales()) alert('No hay espacio para guardar. Probá con fotos más chicas o borrá productos.'); }
    sincronizar();
    render();
}

function leerImagen(archivo) {
    return new Promise((ok, fallo) => {
        const lector = new FileReader();
        lector.onload = () => {
            const img = new Image();
            img.onload = () => {
                const e = Math.min(1, 600 / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = img.width * e; c.height = img.height * e;
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                ok(c.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => fallo(new Error('Imagen no válida'));
            img.src = lector.result;
        };
        lector.onerror = fallo;
        lector.readAsDataURL(archivo);
    });
}

/* ============ CATÁLOGO COMPARTIDO (servidor) ============ */
// El admin publica sus cambios en el servidor; todos los demás dispositivos los leen al abrir la página.
function sincronizar() {
    const cred = credenciales();
    if (!esAdmin || !cred) return;
    clearTimeout(temporizadorEnvio);
    temporizadorEnvio = setTimeout(async () => {
        try {
            const r = await fetch('/api/tienda', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...cred, tienda: { textos, categorias: datos } }) });
            if (!r.ok) throw new Error(r.status);
            avisar('Cambios publicados para todos ✔');
        } catch { avisar('⚠ No se pudo publicar en el servidor'); }
    }, 600);
}
async function cargarDelServidor() {
    try {
        const r = await fetch('/api/tienda', { cache: 'no-store' });
        if (r.status === 404) { servidorVacio = true; return; }
        if (!r.ok) return;
        const t = await r.json();
        if (!Array.isArray(t.categorias)) return;
        datos = t.categorias; textos = conBase(t.textos);
        try { localStorage.setItem(KEY, JSON.stringify(datos)); localStorage.setItem(KEY_TXT, JSON.stringify(textos)); } catch { /* sin espacio: no importa */ }
        render();
    } catch { /* sin servidor: se usa lo guardado en este navegador */ }
}

/* ============ DIBUJAR LA PÁGINA ============ */
const buscar = (cid) => datos.find((c) => c.id === cid);

function panelOpciones(c, p) {
    const ids = (x) => `data-c="${c.id}" data-p="${p.id}"${x ? ` data-v="${x.id}"` : ''}`;
    const filas = (p.variantes || []).map((x) => `<div class="var-fila">
        <input value="${esc(x.nombre)}" data-a="varNombre" ${ids(x)} aria-label="Nombre de la opción">
        <label class="boton secundario">${x.foto ? 'Cambiar foto' : 'Agregar foto'}<input type="file" accept="image/*" data-a="varFoto" ${ids(x)} hidden></label>
        ${x.foto ? `<button data-a="varQuitarFoto" ${ids(x)}>Quitar foto</button>` : ''}
        <label class="check"><input type="checkbox" data-a="varStock" ${ids(x)} ${x.stock === false ? 'checked' : ''}> Sin stock</label>
        <button class="peligro" data-a="varBorrar" ${ids(x)}>Quitar opción</button></div>`).join('');
    return `<details class="admin-var" data-p="${p.id}" ${abiertos.has(p.id) ? 'open' : ''}>
        <summary>Opciones: colores, talles… (${(p.variantes || []).length})</summary>${filas}
        <div class="nueva-var">
            <input class="v-nombre" placeholder="Ej: Rojo, Talle M, 64GB">
            <input class="v-foto" type="file" accept="image/*">
            <button data-a="varAgregar" ${ids()}>Agregar opción</button>
            <small>La foto es opcional: sin foto se usa la del producto.</small>
        </div></details>`;
}

function producto(c, p) {
    const vars = p.variantes || [];
    const v = vars.find((x) => x.id === sel[p.id]) || vars[0];
    const foto = (v && v.foto) || p.foto;
    const agotado = p.stock === false || (v && v.stock === false);
    const chips = vars.length ? `<div class="opciones">${vars.map((x) => `<button class="chip${x === v ? ' sel' : ''}${x.stock === false ? ' tachada' : ''}" data-a="opcion" data-p="${p.id}" data-v="${x.id}" aria-pressed="${x === v}">${esc(x.nombre)}</button>`).join('')}</div>` : '';
    const admin = esAdmin ? `
        <div class="admin-prod">
            <label>Nombre <input class="in-nombre" value="${esc(p.nombre)}" placeholder="Ej: Parlante JBL"></label>
            <label>Precio <input type="number" min="0" value="${p.precio}" class="in-precio"></label>
            <button data-a="guardarProd" data-c="${c.id}" data-p="${p.id}">Guardar cambios</button>
            <label class="check"><input type="checkbox" data-a="sinstock" data-c="${c.id}" data-p="${p.id}" ${p.stock === false ? 'checked' : ''}> Sin stock (todo el producto)</label>
            <label class="boton secundario">Cambiar foto principal
                <input type="file" accept="image/*" data-a="cambiarFoto" data-c="${c.id}" data-p="${p.id}" hidden>
            </label>
            ${panelOpciones(c, p)}
            <button class="peligro" data-a="borrarProd" data-c="${c.id}" data-p="${p.id}">Eliminar producto</button>
        </div>` : '';
    return `<div class="producto${agotado ? ' agotado' : ''}">
        <img src="${esc(foto)}" alt="${esc(p.nombre || c.nombre)}" title="Tocá para ampliar">
        ${vista === 'todo' ? `<small class="ruta">${esc(c.nombre)}</small>` : ''}
        ${p.nombre ? `<h3>${esc(p.nombre)}</h3>` : ''}
        ${chips}
        <p>Precio: ${precio(p.precio)}</p>
        ${agotado ? '<p class="stock no">Sin stock</p>' : ''}
        ${textos.pedidos ? `<button data-a="comprar" data-c="${c.id}" data-p="${p.id}" data-v="${v ? v.id : ''}" ${agotado ? 'disabled' : ''}>${agotado ? 'No disponible' : 'Comprar'}</button>` : ''}${admin}
    </div>`;
}

function herramientasAdmin(cat) {
    const base = cat || datos[0];
    return `${cat ? `<div class="admin-tools">
            <button data-a="editarCat">Editar categoría</button>
            <button class="peligro" data-a="borrarCat">Eliminar categoría</button>
        </div>` : ''}
        <div class="nuevo-prod">
            <h3>Agregar producto</h3>
            <select class="n-cat" aria-label="Categoría">${datos.map((c) => `<option value="${c.id}" ${base && base.id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
            <input class="n-nombre" placeholder="Nombre">
            <input class="n-precio" type="number" min="0" placeholder="Precio">
            <input class="n-foto" type="file" accept="image/*">
            <button data-a="agregarProd">Agregar producto</button>
        </div>`;
}

function renderContenido() {
    const cat = buscar(vista), q = norm(busqueda.trim());
    const lista = [];
    datos.forEach((c) => {
        if (cat && c !== cat) return;
        c.productos.forEach((p) => {
            const extra = (p.variantes || []).map((x) => x.nombre).join(' ');
            if (!q || norm(`${p.nombre} ${c.nombre} ${extra}`).includes(q)) lista.push([c, p]);
        });
    });
    const nombreDe = ([c, p]) => norm(p.nombre || c.nombre);
    const criterios = {
        'precio-asc': (x, y) => x[1].precio - y[1].precio,
        'precio-desc': (x, y) => y[1].precio - x[1].precio,
        'az': (x, y) => nombreDe(x).localeCompare(nombreDe(y), 'es'),
        'za': (x, y) => nombreDe(y).localeCompare(nombreDe(x), 'es'),
    };
    if (criterios[orden]) lista.sort(criterios[orden]);
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    pagina = Math.min(Math.max(1, pagina), paginas);
    const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    const btn = (n, txt, off) => `<button data-a="pag" data-n="${n}" ${off ? 'disabled' : ''}>${txt}</button>`;
    const nav = paginas > 1 ? `<div class="paginacion">
        ${btn(1, '« Primera', pagina === 1)}${btn(pagina - 1, '‹ Anterior', pagina === 1)}
        <span>Página ${pagina} de ${paginas}</span>
        ${btn(pagina + 1, 'Siguiente ›', pagina === paginas)}${btn(paginas, 'Última »', pagina === paginas)}</div>` : '';
    $('contenido').innerHTML = `
        <div class="titulo-vista">
            <h2>${cat ? esc(cat.nombre) : 'Todos los productos'}</h2>
            <p class="descripcion">${cat ? esc(cat.desc) : 'Buscá por nombre o elegí una categoría en “Productos”.'}</p>
            <p class="cuenta">${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}${q ? ` para “${esc(busqueda.trim())}”` : ''}</p>
        </div>
        ${esAdmin ? herramientasAdmin(cat) : ''}
        <div class="grid-productos">${visibles.length ? visibles.map(([c, p]) => producto(c, p)).join('') : '<p class="vacio">No se encontraron productos.</p>'}</div>
        ${nav}`;
}

function renderBarra() {
    $('barraAdmin').hidden = !esAdmin;
    if (!esAdmin) { $('barraAdmin').innerHTML = ''; return; }
    const g = snaps(), u = g[g.length - 1];
    const sin = !u || JSON.stringify({ textos: u.textos, categorias: u.categorias }) !== estado();
    $('barraAdmin').innerHTML = `
        <strong>Modo administrador</strong>
        <button data-a="guardarPunto">Guardar (Ctrl+S)</button>
        <button data-a="volverGuardado" class="secundario">Volver al guardado anterior</button>
        <button data-a="editarTextos">Editar título y eslogan</button>
        <button data-a="togglePedidos" class="${textos.pedidos ? '' : 'secundario'}">Pedidos: ${textos.pedidos ? 'ACTIVADO' : 'DESACTIVADO'}</button>
        <button data-a="editarCobro">Datos de cobro</button>
        <button data-a="editarSucursales">Sucursales de retiro (${(textos.sucursales || []).length})</button>
        <button data-a="editarCorreoPedidos">Correo de pedidos (privado)</button>
        <button data-a="nuevaCat">+ Nueva categoría</button>
        <button data-a="exportar" class="secundario">Descargar copia</button>
        <button data-a="importar" class="secundario">Restaurar copia</button>
        <button data-a="salir" class="peligro">Cerrar sesión</button>
        <span class="estado">Último guardado: <b>${fmt(u && u.fecha)}</b> · Último cambio: <b>${fmt(localStorage.getItem(KEY_CAMBIO))}</b>
        ${sin ? '<span class="sin-guardar">Hay cambios sin guardar</span>' : ''}</span>`;
}

function render() {
    if (vista !== 'todo' && !buscar(vista)) vista = 'todo';
    $('titulo').textContent = textos.titulo;
    $('eslogan').textContent = textos.eslogan;
    document.title = textos.titulo;
    const item = (id, n) => `<li><button data-a="verCat" data-c="${id}" class="${vista === id ? 'sel' : ''}">${esc(n)}</button></li>`;
    $('listaCat').innerHTML = item('todo', 'Todo') + datos.map((c) => item(c.id, c.nombre)).join('');
    renderContenido();
    renderBarra();
    $('btnAcceso').hidden = esAdmin;
    $('btnCarrito').hidden = !textos.pedidos;
    actualizarContador();
}

/* ============ MENÚ, BUSCADOR, VISOR ============ */
function cerrarMenu() { $('listaCat').hidden = true; $('btnProd').setAttribute('aria-expanded', 'false'); }
$('btnProd').addEventListener('click', () => {
    const abrir = $('listaCat').hidden;
    $('listaCat').hidden = !abrir;
    $('btnProd').setAttribute('aria-expanded', String(abrir));
});
$('orden').addEventListener('change', (e) => { orden = e.target.value; pagina = 1; renderContenido(); });
$('buscador').addEventListener('input', (e) => { busqueda = e.target.value; pagina = 1; renderContenido(); });
$('visor').addEventListener('click', () => $('visor').close());
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-prod')) cerrarMenu();
    const im = e.target.closest('.producto img');
    if (im) { const v = $('visor').querySelector('img'); v.src = im.src; v.alt = im.alt; $('visor').showModal(); }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarMenu();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && esAdmin) { e.preventDefault(); acciones.guardarPunto(); }
});
document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.classList && d.classList.contains('admin-var')) d.open ? abiertos.add(d.dataset.p) : abiertos.delete(d.dataset.p);
}, true);

/* ============ ACCIONES ============ */
const nuevoId = (pref) => pref + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const prodDe = (el) => buscar(el.dataset.c).productos.find((x) => x.id === el.dataset.p);
const varDe = (el) => prodDe(el).variantes.find((x) => x.id === el.dataset.v);

const acciones = {
    verCat(el) { vista = el.dataset.c; pagina = 1; cerrarMenu(); render(); },
    pag(el) { pagina = Number(el.dataset.n); renderContenido(); window.scrollTo({ top: 0 }); },
    opcion(el) { sel[el.dataset.p] = el.dataset.v; renderContenido(); },
    guardarPunto() {
        let g = snaps();
        if (g.length && JSON.stringify({ textos: g[g.length - 1].textos, categorias: g[g.length - 1].categorias }) === estado()) return avisar('No hay cambios nuevos para guardar.');
        g.push({ fecha: Date.now(), textos, categorias: datos });
        g = g.slice(-2);
        try { localStorage.setItem(KEY_SNAP, JSON.stringify(g)); }
        catch {
            try { localStorage.setItem(KEY_SNAP, JSON.stringify(g.slice(-1))); }
            catch { return alert('No hay espacio para otro guardado. Descargá una copia y borrá algunas fotos.'); }
        }
        avisar('Guardado el ' + fmt(Date.now())); renderBarra();
    },
    volverGuardado() {
        const g = snaps();
        if (!g.length) return alert('Todavía no hay guardados. Apretá Ctrl+S para crear uno.');
        let resto = g, destino = g[g.length - 1];
        if (JSON.stringify({ textos: destino.textos, categorias: destino.categorias }) === estado()) {
            if (g.length < 2) return alert('No hay un guardado anterior a este.');
            resto = g.slice(0, -1); destino = resto[resto.length - 1];
        }
        if (!confirm(`¿Volver al guardado del ${fmt(destino.fecha)}? Se perderán los cambios hechos después.`)) return;
        datos = structuredClone(destino.categorias); textos = conBase(structuredClone(destino.textos));
        localStorage.setItem(KEY_SNAP, JSON.stringify(resto));
        localStorage.setItem(KEY_TXT, JSON.stringify(textos));
        guardar(); avisar('Restaurado el guardado del ' + fmt(destino.fecha));
    },
    editarTextos() {
        const t = prompt('Título de la tienda:', textos.titulo);
        if (t === null) return;
        const e = prompt('Eslogan:', textos.eslogan);
        if (t.trim()) textos.titulo = t.trim();
        if (e !== null) textos.eslogan = e.trim();
        localStorage.setItem(KEY_TXT, JSON.stringify(textos)); localStorage.setItem(KEY_CAMBIO, Date.now());
        sincronizar(); render();
    },
    nuevaCat() {
        const nombre = prompt('Nombre de la categoría (ej: ROPA):');
        if (!nombre || !nombre.trim()) return;
        const c = { id: nuevoId('cat'), nombre: nombre.trim().toUpperCase(), desc: prompt('Descripción de la sección:') || '', productos: [] };
        datos.push(c); vista = c.id; pagina = 1; guardar();
    },
    editarCat() {
        const c = buscar(vista), nombre = prompt('Nombre:', c.nombre);
        if (nombre === null) return;
        const desc = prompt('Descripción:', c.desc);
        if (nombre.trim()) c.nombre = nombre.trim().toUpperCase();
        if (desc !== null) c.desc = desc;
        guardar();
    },
    borrarCat() {
        const c = buscar(vista);
        if (!confirm(`¿Eliminar "${c.nombre}" con sus ${c.productos.length} productos?`)) return;
        datos = datos.filter((x) => x !== c); vista = 'todo'; guardar();
    },
    async agregarProd(el) {
        const caja = el.closest('.nuevo-prod'), c = buscar(caja.querySelector('.n-cat').value);
        const archivo = caja.querySelector('.n-foto').files[0], pr = caja.querySelector('.n-precio').value;
        if (!c) return alert('Primero creá una categoría.');
        if (!archivo || pr === '') return alert('Elegí una foto y escribí el precio.');
        try {
            const foto = await leerImagen(archivo);
            c.productos.push({ id: nuevoId('p'), nombre: caja.querySelector('.n-nombre').value.trim(), foto, precio: Number(pr), stock: true, variantes: [] });
            guardar();
        } catch { alert('No se pudo leer la imagen.'); }
    },
    guardarProd(el) {
        const caja = el.closest('.admin-prod'), v = caja.querySelector('.in-precio').value;
        if (v === '') return alert('Escribí un precio.');
        const p = prodDe(el);
        p.precio = Number(v); p.nombre = caja.querySelector('.in-nombre').value.trim();
        guardar();
    },
    borrarProd(el) {
        if (!confirm('¿Eliminar este producto?')) return;
        const c = buscar(el.dataset.c);
        c.productos = c.productos.filter((x) => x.id !== el.dataset.p); guardar();
    },
    async varAgregar(el) {
        const caja = el.closest('.nueva-var'), nombre = caja.querySelector('.v-nombre').value.trim(), archivo = caja.querySelector('.v-foto').files[0];
        if (!nombre) return alert('Escribí el nombre de la opción (ej: Rojo o Talle M).');
        try {
            const p = prodDe(el);
            (p.variantes = p.variantes || []).push({ id: nuevoId('v'), nombre, foto: archivo ? await leerImagen(archivo) : '', stock: true });
            abiertos.add(p.id); guardar();
        } catch { alert('No se pudo leer la imagen.'); }
    },
    varQuitarFoto(el) { varDe(el).foto = ''; guardar(); },
    varBorrar(el) { const p = prodDe(el); p.variantes = p.variantes.filter((x) => x.id !== el.dataset.v); guardar(); },
    exportar() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ textos, categorias: datos })], { type: 'application/json' }));
        a.download = 'copia-tienda.json'; a.click();
    },
    importar() { $('importar').click(); },
    salir() { esAdmin = false; sessionStorage.removeItem(KEY_SESION); sessionStorage.removeItem(KEY_AUTH); render(); },
};

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (el && el.tagName === 'BUTTON' && acciones[el.dataset.a]) acciones[el.dataset.a](el);
});

document.addEventListener('change', async (e) => {
    const el = e.target, a = el.dataset.a;
    try {
        if (a === 'sinstock') { prodDe(el).stock = !el.checked; guardar(); }
        if (a === 'varStock') { varDe(el).stock = !el.checked; guardar(); }
        if (a === 'varNombre' && el.value.trim()) { varDe(el).nombre = el.value.trim(); guardar(); }
        if (a === 'cambiarFoto' && el.files[0]) { prodDe(el).foto = await leerImagen(el.files[0]); guardar(); }
        if (a === 'varFoto' && el.files[0]) { varDe(el).foto = await leerImagen(el.files[0]); guardar(); }
    } catch { alert('No se pudo leer la imagen.'); }
});

$('importar').addEventListener('change', async (e) => {
    try {
        const nuevo = JSON.parse(await e.target.files[0].text());
        const cats = Array.isArray(nuevo) ? nuevo : nuevo.categorias;
        if (!Array.isArray(cats)) throw 0;
        datos = cats;
        if (nuevo.textos) { textos = conBase(nuevo.textos); localStorage.setItem(KEY_TXT, JSON.stringify(textos)); }
        guardar();
    } catch { alert('El archivo no es una copia válida.'); }
    e.target.value = '';
});

/* ============ LOGIN ============ */
$('btnAcceso').addEventListener('click', () => {
    $('dlgTitulo').textContent = 'Iniciar sesión';
    $('dlgError').textContent = '';
    $('formLogin').reset();
    $('dlg').showModal();
});
$('dlgCancelar').addEventListener('click', () => $('dlg').close());
$('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cred = { usuario: $('usuario').value.trim(), clave: $('clave').value };
    try {
        const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred) });
        if (r.status === 401) { $('dlgError').textContent = 'Usuario o contraseña incorrectos.'; return; }
        if (!r.ok) { $('dlgError').textContent = `El servidor no está respondiendo bien (error ${r.status}). Revisá la función y las variables en Netlify.`; return; }
    } catch { $('dlgError').textContent = 'No se pudo conectar con el servidor.'; return; }
    esAdmin = true; sessionStorage.setItem(KEY_SESION, '1'); sessionStorage.setItem(KEY_AUTH, JSON.stringify(cred));
    $('dlg').close(); render();
    if (servidorVacio) { servidorVacio = false; sincronizar(); }   // primera vez: publica lo que hay
});

iniciarCarrito();
render();
cargarDelServidor();

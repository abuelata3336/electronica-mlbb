// Servidor de pedidos. Uso:  node server.js   (no hace falta instalar nada)
// Abre la tienda en http://localhost:3000 y guarda cada pedido en pedidos.json
const http = require('http'), fs = require('fs'), path = require('path');
const PUERTO = 3000, RAIZ = __dirname, ARCHIVO = path.join(RAIZ, 'pedidos.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const responder = (res, codigo, obj) => { res.writeHead(codigo, { ...CORS, 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// Revisa el pedido y recalcula subtotales y total (no confía en los que manda el navegador)
function validar(o) {
    if (!o || typeof o.id !== 'string' || !Array.isArray(o.items) || !o.items.length || o.items.length > 200) return null;
    const items = [];
    for (const i of o.items) {
        const cantidad = Number(i.cantidad), precioUnitario = Number(i.precioUnitario);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99 || !(precioUnitario >= 0) || typeof i.producto !== 'string') return null;
        items.push({ producto: i.producto.slice(0, 120), precioUnitario, cantidad, subtotal: precioUnitario * cantidad });
    }
    return { id: o.id.slice(0, 40), fecha: new Date().toISOString(), items, total: items.reduce((s, i) => s + i.subtotal, 0) };
}

function guardarPedido(req, res) {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; if (cuerpo.length > 100000) req.destroy(); });
    req.on('end', () => {
        let pedido = null;
        try { pedido = validar(JSON.parse(cuerpo)); } catch { /* inválido */ }
        if (!pedido) return responder(res, 400, { ok: false, error: 'Pedido inválido' });
        let lista = [];
        try { lista = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch { /* primer pedido */ }
        lista.push(pedido);
        fs.writeFileSync(ARCHIVO, JSON.stringify(lista, null, 2));
        console.log(`Pedido ${pedido.id}: ${pedido.items.length} ítems, total $${pedido.total}`);
        responder(res, 201, { ok: true, id: pedido.id });
    });
}

function servirArchivo(req, res) {
    let ruta;
    try { ruta = decodeURIComponent(req.url.split('?')[0]); } catch { return responder(res, 400, { ok: false }); }
    const archivo = path.join(RAIZ, ruta === '/' ? 'index.html' : ruta);
    if (!archivo.startsWith(RAIZ + path.sep) || ['pedidos.json', 'server.js'].includes(path.basename(archivo))) return responder(res, 404, { ok: false });
    fs.readFile(archivo, (err, contenido) => {
        if (err) return responder(res, 404, { ok: false });
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
        res.end(contenido);
    });
}

http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'POST' && req.url === '/api/pedidos') return guardarPedido(req, res);
    if (req.method === 'GET') return servirArchivo(req, res);
    responder(res, 405, { ok: false });
}).listen(PUERTO, () => console.log(`Tienda en http://localhost:${PUERTO}`));

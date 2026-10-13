const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

// ==========================================
// 🛠️ MOTOR DE PARCHE DE BASE DE DATOS
// ==========================================
const ejecutarParche = async () => {
    const queries = [
        "ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(50) DEFAULT 'cliente'",
        "ALTER TABLE pedidos MODIFY COLUMN estado VARCHAR(50) DEFAULT 'pendiente'",
        "ALTER TABLE usuarios ADD COLUMN saldo DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE usuarios ADD COLUMN comision_domicilio INT DEFAULT 15",
        "ALTER TABLE usuarios ADD COLUMN comision_vendedor INT DEFAULT 10",
        "ALTER TABLE usuarios ADD COLUMN banco_nombre VARCHAR(100) DEFAULT 'Nequi'",
        "ALTER TABLE usuarios ADD COLUMN banco_numero VARCHAR(50) DEFAULT ''",
        "ALTER TABLE usuarios ADD COLUMN banco_imagen VARCHAR(255) DEFAULT ''",
        "ALTER TABLE usuarios ADD COLUMN cuenta_retiro VARCHAR(255) DEFAULT ''",
        "ALTER TABLE usuarios ADD COLUMN dinero_a_favor DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE pedidos ADD COLUMN costo_domicilio DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE pedidos ADD COLUMN comision_cobrada DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE pedidos ADD COLUMN comision_productos_cobrada DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE pedidos ADD COLUMN domiciliario_id INT DEFAULT NULL",
        "ALTER TABLE pedidos ADD COLUMN vendedor_id INT DEFAULT NULL",
        "ALTER TABLE productos ADD COLUMN vendedor_id INT DEFAULT NULL",
        "ALTER TABLE pedidos ADD COLUMN banco_destino VARCHAR(100) DEFAULT ''",
        "ALTER TABLE pedidos ADD COLUMN referencia_pago VARCHAR(100) DEFAULT ''",
        "ALTER TABLE pedidos ADD COLUMN estado_pago VARCHAR(50) DEFAULT 'pendiente'",
        "ALTER TABLE pedidos ADD COLUMN motivo_cancelacion TEXT DEFAULT NULL",
        `CREATE TABLE IF NOT EXISTS recargas (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            usuario_id INT, 
            monto DECIMAL(10,2), 
            referencia VARCHAR(100), 
            banco_destino VARCHAR(100) DEFAULT '',
            estado VARCHAR(20) DEFAULT 'pendiente', 
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS bancos (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            nombre VARCHAR(100), 
            numero VARCHAR(50), 
            imagen VARCHAR(255)
        )`,
        `CREATE TABLE IF NOT EXISTS tiendas (
            usuario_id INT PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            descripcion TEXT,
            direccion VARCHAR(255) DEFAULT '',
            telefono VARCHAR(50) DEFAULT '',
            logo_url VARCHAR(255),
            abierta BOOLEAN DEFAULT 1,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )`,
        "ALTER TABLE tiendas ADD COLUMN abierta BOOLEAN DEFAULT 1"
    ];
    for (let q of queries) { try { await db.query(q); } catch (e) {} }
    try { await db.query("ALTER TABLE recargas CHANGE domiciliario_id usuario_id INT"); } catch (e) {}

    try {
        const [adm] = await db.query("SELECT id, nombre, direccion, telefono FROM usuarios WHERE rol = 'admin' LIMIT 1");
        if (adm.length > 0) {
            const adminId = adm[0].id;
            const [tAdmin] = await db.query("SELECT usuario_id FROM tiendas WHERE usuario_id = ?", [adminId]);
            if (tAdmin.length === 0) {
                await db.query(
                    "INSERT INTO tiendas (usuario_id, nombre, descripcion, direccion, telefono, abierta) VALUES (?, ?, ?, ?, ?, 1)",
                    [adminId, "Tienda Principal (Admin)", "Tienda oficial del establecimiento", adm[0].direccion || '', adm[0].telefono || '']
                );
            }
        }
    } catch (e) {
        console.error("Error inicializando tienda del admin:", e);
    }
};

ejecutarParche();

app.get('/api/arreglar-bd', async (req, res) => { await ejecutarParche(); res.json({ success: true, message: "Parcheado." }); });

io.on('connection', (socket) => { 
    socket.on('ubicacion_domiciliario', (data) => io.emit('ubicacion_domiciliario', data)); 
});

// ==========================================
// 🔐 AUTENTICACIÓN Y USUARIOS
// ==========================================

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password]);
        if (users.length > 0) res.json({ success: true, user: users[0] });
        else res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    } catch (error) { res.status(500).json({ message: 'Error en BD' }); }
});

app.post('/api/registro', async (req, res) => {
    const { nombre, email, password, direccion, telefono } = req.body;
    try {
        const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existe.length > 0) return res.status(400).json({ message: 'El correo ya está registrado' });
        await db.query('INSERT INTO usuarios (nombre, email, password, direccion, telefono, rol, es_empresa) VALUES (?, ?, ?, ?, ?, ?, ?)', [nombre, email, password, direccion, telefono, 'cliente', false]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: 'Error al registrar' }); }
});

app.post('/api/usuarios', async (req, res) => {
    const { nombre, email, password, direccion, telefono, es_empresa, rol } = req.body;
    try {
        const [ex] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (ex.length > 0) return res.status(400).json({ message: 'El correo ya está registrado' });
        await db.query('INSERT INTO usuarios (nombre, email, password, direccion, telefono, rol, es_empresa) VALUES (?, ?, ?, ?, ?, ?, ?)', [nombre, email, password, direccion || '', telefono || '', rol || 'cliente', es_empresa ? 1 : 0]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/usuarios', async (req, res) => {
    try { 
        const [u] = await db.query('SELECT id, nombre, email, telefono, direccion, rol, es_empresa, saldo, cuenta_retiro, dinero_a_favor FROM usuarios WHERE rol != "admin"'); 
        res.json(u); 
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/usuarios/:id', async (req, res) => {
    const { nombre, email, password, direccion, telefono, es_empresa, rol } = req.body;
    try { 
        await db.query('UPDATE usuarios SET nombre=?, email=?, password=?, direccion=?, telefono=?, es_empresa=?, rol=? WHERE id=?', [nombre, email, password, direccion, telefono, es_empresa ? 1 : 0, rol, req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try { 
        await db.query('DELETE FROM pedidos WHERE usuario_id = ?', [req.params.id]); 
        await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/usuarios/:id/perfil', async (req, res) => {
    try { 
        await db.query('UPDATE usuarios SET direccion=?, telefono=? WHERE id=?', [req.body.direccion, req.body.telefono, req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/usuarios/:id/direccion', async (req, res) => {
    try { 
        await db.query('UPDATE usuarios SET direccion=? WHERE id=?', [req.body.direccion, req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/usuarios/:id/cuenta-retiro', async (req, res) => {
    try { 
        await db.query('UPDATE usuarios SET cuenta_retiro = ? WHERE id = ?', [req.body.cuenta_retiro, req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/usuarios/:id/pagar-deuda', async (req, res) => {
    try { 
        await db.query('UPDATE usuarios SET dinero_a_favor = 0 WHERE id = ?', [req.params.id]); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

// ==========================================
// ⚙️ CONFIGURACIÓN DEL ADMINISTRADOR Y BANCOS
// ==========================================

app.get('/api/config-admin', async (req, res) => {
    try { const [adm] = await db.query("SELECT * FROM usuarios WHERE rol = 'admin' LIMIT 1"); res.json(adm[0] || {}); } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/config-admin', async (req, res) => {
    const { latitud, longitud, comision_domicilio, comision_vendedor } = req.body;
    try {
        if(latitud && longitud) await db.query("UPDATE usuarios SET latitud = ?, longitud = ? WHERE rol = 'admin'", [latitud, longitud]);
        if(comision_domicilio !== undefined) await db.query("UPDATE usuarios SET comision_domicilio = ? WHERE rol = 'admin'", [comision_domicilio]);
        if(comision_vendedor !== undefined) await db.query("UPDATE usuarios SET comision_vendedor = ? WHERE rol = 'admin'", [comision_vendedor]);
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); }
});

app.post('/api/config-banco', upload.single('imagen'), async (req, res) => {
    const { banco_nombre, banco_numero } = req.body;
    try {
        if (req.file) {
            const urlImagen = `http://localhost:3000/uploads/${req.file.filename}`;
            await db.query("UPDATE usuarios SET banco_nombre = ?, banco_numero = ?, banco_imagen = ? WHERE rol = 'admin'", [banco_nombre, banco_numero, urlImagen]);
        } else {
            await db.query("UPDATE usuarios SET banco_nombre = ?, banco_numero = ? WHERE rol = 'admin'", [banco_nombre, banco_numero]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); }
});

app.delete('/api/config-banco', async (req, res) => {
    try { await db.query("UPDATE usuarios SET banco_nombre = '', banco_numero = '', banco_imagen = '' WHERE rol = 'admin'"); res.json({ success: true }); } catch (e) { res.status(500).send('Error'); }
});

app.get('/api/bancos', async (req, res) => { try { const [b] = await db.query('SELECT * FROM bancos ORDER BY id DESC'); res.json(b); } catch (e) { res.status(500).send('Error'); } });

app.post('/api/bancos', upload.single('imagen'), async (req, res) => {
    try {
        const urlImagen = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : '';
        await db.query('INSERT INTO bancos (nombre, numero, imagen) VALUES (?, ?, ?)', [req.body.nombre, req.body.numero, urlImagen]);
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); }
});

app.delete('/api/bancos/:id', async (req, res) => { try { await db.query('DELETE FROM bancos WHERE id = ?', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).send('Error'); } });

// ==========================================
// 🛍 PRODUCTOS CON DATOS DE LA TIENDA
// ==========================================

app.get('/api/productos', async (req, res) => { 
    try { 
        const query = `
            SELECT 
                p.*, 
                t.nombre AS tienda_nombre, 
                t.logo_url AS tienda_logo,
                COALESCE(t.abierta, 1) AS tienda_abierta
            FROM productos p 
            LEFT JOIN tiendas t ON p.vendedor_id = t.usuario_id
            ORDER BY p.id DESC
        `;
        const [p] = await db.query(query); 
        
        const [usr] = await db.query('SELECT id FROM usuarios WHERE rol = "vendedor" AND saldo <= 0');
        const vendedoresBloqueados = usr.map(u => u.id);
        
        const productosProcesados = p.map(prod => {
            if (prod.vendedor_id && vendedoresBloqueados.includes(prod.vendedor_id)) return { ...prod, disponible: 0, bloqueado_por_saldo: true };
            return prod;
        });
        res.json(productosProcesados); 
    } catch (e) { 
        console.error("Error al cargar productos:", e);
        res.status(500).send('Error'); 
    } 
});

app.post('/api/productos', upload.single('imagen'), async (req, res) => {
    let { nombre, categoria, precio, vendedor_id } = req.body;
    const urlImagen = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500';
    try {
        if (!vendedor_id) {
            const [adm] = await db.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
            if (adm.length > 0) vendedor_id = adm[0].id;
        }

        if (vendedor_id) {
            const [ven] = await db.query('SELECT rol, saldo FROM usuarios WHERE id = ?', [vendedor_id]);
            if (ven[0] && ven[0].rol === 'vendedor' && ven[0].saldo <= 0) {
                return res.status(400).json({ message: 'SALDO AGOTADO: Debes recargar para cubrir las comisiones antes de publicar.' });
            }
        }
        await db.query('INSERT INTO productos (nombre, categoria, precio, imagen, disponible, vendedor_id) VALUES (?, ?, ?, ?, 1, ?)', [nombre, categoria || 'General', precio, urlImagen, vendedor_id || null]);
        io.emit('catalogo_actualizado'); 
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.put('/api/productos/:id/disponibilidad', async (req, res) => { 
    try { 
        if (req.body.disponible) {
            const [prod] = await db.query('SELECT vendedor_id FROM productos WHERE id = ?', [req.params.id]);
            if (prod[0] && prod[0].vendedor_id) {
                const [ven] = await db.query('SELECT rol, saldo FROM usuarios WHERE id = ?', [prod[0].vendedor_id]);
                if (ven[0] && ven[0].rol === 'vendedor' && ven[0].saldo <= 0) {
                    return res.status(400).json({ message: 'SALDO AGOTADO: El vendedor debe recargar para activar productos.' });
                }
            }
        }
        await db.query('UPDATE productos SET disponible = ? WHERE id = ?', [req.body.disponible, req.params.id]); 
        io.emit('catalogo_actualizado'); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); } 
});

app.put('/api/productos/:id', async (req, res) => {
    try { 
        await db.query('UPDATE productos SET nombre = ?, precio = ? WHERE id = ?', [req.body.nombre, req.body.precio, req.params.id]); 
        io.emit('catalogo_actualizado'); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); }
});

app.delete('/api/productos/:id', async (req, res) => { 
    try { 
        await db.query('DELETE FROM productos WHERE id = ?', [req.params.id]); 
        io.emit('catalogo_actualizado'); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); } 
});

// ==========================================
// 📦 LÓGICA DE PEDIDOS CON DIRECCIÓN DE TIENDA Y CLIENTE
// ==========================================

app.post('/api/pedidos', async (req, res) => {
    const { usuario_id, total, costo_domicilio, metodo_pago, banco_destino, referencia_pago, detalles, vendedor_id } = req.body;
    try {
        let vid = vendedor_id;
        if (!vid && detalles) {
            try {
                const parsed = typeof detalles === 'string' ? JSON.parse(detalles) : detalles;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    vid = parsed[0].vendedor_id || null;
                }
            } catch (e) {}
        }

        if (!vid) {
            const [adm] = await db.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
            if (adm.length > 0) vid = adm[0].id;
        }

        const esEfectivo = metodo_pago === 'efectivo';
        const estadoInicialPago = esEfectivo ? 'aprobado' : 'pendiente';
        const detallesString = typeof detalles === 'string' ? detalles : JSON.stringify(detalles);

        const [r] = await db.query(
            'INSERT INTO pedidos (usuario_id, total, costo_domicilio, metodo_pago, banco_destino, referencia_pago, estado_pago, detalles, vendedor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
            [usuario_id, total, costo_domicilio || 0, metodo_pago, banco_destino || '', referencia_pago || '', estadoInicialPago, detallesString, vid]
        );
        
        const [usr] = await db.query('SELECT nombre, direccion, telefono FROM usuarios WHERE id = ?', [usuario_id]);

        let tienda_nombre = 'Tienda Principal';
        let tienda_telefono = '';
        let tienda_direccion = '';

        if (vid) {
            const [vendedor] = await db.query(`
                SELECT 
                    COALESCE(NULLIF(t.nombre, ''), NULLIF(u.nombre, ''), 'Tienda Principal') AS tienda_nombre,
                    COALESCE(NULLIF(t.telefono, ''), NULLIF(u.telefono, ''), '') AS tienda_telefono,
                    COALESCE(NULLIF(t.direccion, ''), NULLIF(u.direccion, ''), '') AS tienda_direccion
                FROM usuarios u 
                LEFT JOIN tiendas t ON u.id = t.usuario_id 
                WHERE u.id = ?
            `, [vid]);
            
            if (vendedor.length > 0) {
                tienda_nombre = vendedor[0].tienda_nombre;
                tienda_telefono = vendedor[0].tienda_telefono;
                tienda_direccion = vendedor[0].tienda_direccion;
            }
        }

        if (!tienda_direccion || !tienda_telefono) {
            const [admConfig] = await db.query("SELECT direccion, telefono FROM usuarios WHERE rol = 'admin' LIMIT 1");
            if (admConfig.length > 0) {
                if (!tienda_direccion) tienda_direccion = admConfig[0].direccion || '';
                if (!tienda_telefono) tienda_telefono = admConfig[0].telefono || '';
            }
        }
        
        const nuevoPedidoData = { 
            id: r.insertId, 
            usuario_id, 
            total, 
            costo_domicilio, 
            metodo_pago, 
            banco_destino, 
            referencia_pago, 
            estado_pago: estadoInicialPago, 
            detalles: detallesString, 
            estado: 'pendiente', 
            cliente: usr[0]?.nombre || '', 
            direccion: usr[0]?.direccion || '', 
            telefono: usr[0]?.telefono || '', 
            vendedor_id: vid,
            tienda_nombre,
            tienda_telefono,
            tienda_direccion,
            fecha_creacion: new Date() 
        };
        
        io.emit('nuevo_pedido', nuevoPedidoData);
        res.json({ success: true, id: r.insertId });
    } catch (e) { console.error("Error en POST /api/pedidos:", e); res.status(500).send('Error'); }
});

app.get('/api/pedidos', async (req, res) => { 
    const { rol } = req.query;
    try { 
        const query = `
            SELECT 
                p.*, 
                u.nombre AS cliente, 
                u.direccion AS direccion, 
                ${rol === 'vendedor' ? "''" : "u.telefono"} AS telefono,
                COALESCE(NULLIF(t.nombre, ''), NULLIF(uv.nombre, ''), (SELECT NULLIF(nombre, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), 'Tienda Principal') AS tienda_nombre,
                COALESCE(NULLIF(t.telefono, ''), NULLIF(uv.telefono, ''), (SELECT NULLIF(telefono, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), '') AS tienda_telefono,
                COALESCE(NULLIF(t.direccion, ''), NULLIF(uv.direccion, ''), (SELECT NULLIF(direccion, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), '') AS tienda_direccion
            FROM pedidos p 
            JOIN usuarios u ON p.usuario_id = u.id 
            LEFT JOIN usuarios uv ON p.vendedor_id = uv.id
            LEFT JOIN tiendas t ON p.vendedor_id = t.usuario_id
            ORDER BY p.id DESC
        `;
        const [p] = await db.query(query); 
        res.json(p); 
    } catch (e) { 
        console.error("Error al obtener pedidos:", e);
        res.status(500).send('Error'); 
    } 
});

app.get('/api/pedidos/cliente/:id', async (req, res) => { 
    try { 
        const query = `
            SELECT 
                p.*,
                COALESCE(NULLIF(t.nombre, ''), NULLIF(uv.nombre, ''), (SELECT NULLIF(nombre, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), 'Tienda Principal') AS tienda_nombre,
                COALESCE(NULLIF(t.telefono, ''), NULLIF(uv.telefono, ''), (SELECT NULLIF(telefono, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), '') AS tienda_telefono,
                COALESCE(NULLIF(t.direccion, ''), NULLIF(uv.direccion, ''), (SELECT NULLIF(direccion, '') FROM usuarios WHERE rol = 'admin' LIMIT 1), '') AS tienda_direccion
            FROM pedidos p
            LEFT JOIN usuarios uv ON p.vendedor_id = uv.id
            LEFT JOIN tiendas t ON p.vendedor_id = t.usuario_id
            WHERE p.usuario_id = ? 
            ORDER BY p.id DESC
        `;
        const [p] = await db.query(query, [req.params.id]); 
        res.json(p); 
    } catch (e) { res.status(500).send('Error'); } 
});

app.put('/api/pedidos/:id/aprobar-pago', async (req, res) => {
    const { estado_pago } = req.body; 
    try {
        let nuevoEstadoPedido = estado_pago === 'rechazado' ? 'cancelado' : 'pendiente';
        await db.query('UPDATE pedidos SET estado_pago = ?, estado = ? WHERE id = ?', [estado_pago, nuevoEstadoPedido, req.params.id]);
        io.emit('estado_actualizado', { id: Number(req.params.id), estado: nuevoEstadoPedido, estado_pago });
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); }
});

app.put('/api/pedidos/:id/estado', async (req, res) => {
    const { estado, motivo_cancelacion, domiciliario_id } = req.body;
    try {
        const [ped] = await db.query('SELECT costo_domicilio, comision_cobrada, comision_productos_cobrada, domiciliario_id, detalles FROM pedidos WHERE id = ?', [req.params.id]);
        if (!ped.length) return res.status(404).json({ message: 'Pedido no encontrado' });
        
        let domiAsignado = domiciliario_id || ped[0].domiciliario_id;

        if (estado === 'llevando_tu_pedido' && domiciliario_id) {
            const [adm] = await db.query("SELECT comision_domicilio FROM usuarios WHERE rol='admin' LIMIT 1");
            const comisionEstimada = (ped[0].costo_domicilio * (adm[0]?.comision_domicilio || 15)) / 100;
            const [domi] = await db.query('SELECT saldo FROM usuarios WHERE id = ?', [domiciliario_id]);
            if (domi[0].saldo < comisionEstimada) {
                return res.status(400).json({ message: `❌ SALDO INSUFICIENTE.\nDebes tener al menos $${comisionEstimada.toLocaleString()} para cubrir la comisión de este viaje.` });
            }
        }

        if (estado === 'entregado' && ped[0].comision_cobrada == 0) {
            const [admConfig] = await db.query("SELECT comision_domicilio, comision_vendedor FROM usuarios WHERE rol='admin' LIMIT 1");
            
            if (domiAsignado) {
                const comisionDomi = (ped[0].costo_domicilio * (admConfig[0]?.comision_domicilio || 15)) / 100;
                await db.query('UPDATE usuarios SET saldo = saldo - ? WHERE id = ?', [comisionDomi, domiAsignado]);
                await db.query('UPDATE pedidos SET comision_cobrada = ? WHERE id = ?', [comisionDomi, req.params.id]);
            }

            let totalComisionVendedores = 0;
            const detallesCarrito = typeof ped[0].detalles === 'string' ? JSON.parse(ped[0].detalles) : ped[0].detalles;
            for (let prod of detallesCarrito) {
                if (prod.vendedor_id) {
                    const [vendedor] = await db.query('SELECT rol FROM usuarios WHERE id = ?', [prod.vendedor_id]);
                    if (vendedor[0] && vendedor[0].rol === 'vendedor') {
                        const totalVentaProducto = Number(prod.precio) * Number(prod.cantidad);
                        const comisionAdmin = totalVentaProducto * ((admConfig[0]?.comision_vendedor || 10) / 100);
                        const gananciaVendedor = totalVentaProducto - comisionAdmin;
                        totalComisionVendedores += comisionAdmin;
                        
                        await db.query('UPDATE usuarios SET saldo = saldo - ? WHERE id = ?', [comisionAdmin, prod.vendedor_id]);
                        await db.query('UPDATE usuarios SET dinero_a_favor = dinero_a_favor + ? WHERE id = ?', [gananciaVendedor, prod.vendedor_id]);
                    }
                }
            }
            await db.query('UPDATE pedidos SET comision_productos_cobrada = ? WHERE id = ?', [totalComisionVendedores, req.params.id]);
        }

        let query = 'UPDATE pedidos SET estado = ?'; 
        let params = [estado];
        if (motivo_cancelacion) { query += ', motivo_cancelacion = ?'; params.push(motivo_cancelacion); }
        if (domiciliario_id) { query += ', domiciliario_id = ?'; params.push(domiciliario_id); }
        query += ' WHERE id = ?'; 
        params.push(req.params.id);

        await db.query(query, params);
        io.emit('estado_actualizado', { id: Number(req.params.id), estado, motivo_cancelacion, domiciliario_id: domiAsignado }); 
        res.json({ success: true });
    } catch (error) { 
        console.error("Error al actualizar estado del pedido:", error);
        res.status(500).json({ message: 'Error interno al actualizar estado del pedido' }); 
    }
});

app.delete('/api/pedidos/:id', async (req, res) => { 
    try { 
        await db.query('DELETE FROM pedidos WHERE id = ?', [req.params.id]); 
        io.emit('pedido_eliminado', req.params.id); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); } 
});

// ==========================================
// 💳 RECARGAS Y BILLETERA
// ==========================================

app.get('/api/recargas', async (req, res) => { 
    try { 
        const [r] = await db.query('SELECT r.*, u.nombre as usuario, u.rol FROM recargas r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.id DESC'); 
        res.json(r); 
    } catch (e) { res.status(500).send('Error'); } 
});

app.post('/api/recargas', async (req, res) => { 
    const uid = req.body.usuario_id || req.body.domiciliario_id;
    try { 
        await db.query('INSERT INTO recargas (usuario_id, monto, referencia, banco_destino) VALUES (?, ?, ?, ?)', [uid, req.body.monto, req.body.referencia, req.body.banco_destino || '']); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).send('Error'); } 
});

app.put('/api/recargas/:id/estado', async (req, res) => {
    try {
        const [r] = await db.query('SELECT monto, usuario_id, estado FROM recargas WHERE id = ?', [req.params.id]);
        if (r[0].estado === 'pendiente' && req.body.estado === 'aprobada') {
            await db.query('UPDATE usuarios SET saldo = saldo + ? WHERE id = ?', [r[0].monto, r[0].usuario_id]);
        }
        await db.query('UPDATE recargas SET estado = ? WHERE id = ?', [req.body.estado, req.params.id]);
        io.emit('catalogo_actualizado');
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); }
});

// ========================================================
// 🏪 ENDPOINTS DE LA TIENDA Y ESTADO
// ========================================================

app.get('/api/tiendas', async (req, res) => {
    try {
        const query = `
            SELECT 
                t.usuario_id, 
                t.nombre, 
                t.descripcion, 
                t.logo_url, 
                COALESCE(t.abierta, 1) AS abierta,
                COALESCE(NULLIF(t.direccion, ''), u.direccion) AS direccion,
                COALESCE(NULLIF(t.telefono, ''), u.telefono) AS telefono,
                u.nombre AS propietario,
                u.rol
            FROM tiendas t
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.rol IN ('vendedor', 'admin')
        `;
        const [tiendas] = await db.query(query);
        res.json(tiendas);
    } catch (err) {
        console.error("Error al obtener tiendas:", err);
        res.status(500).json({ error: 'Error al obtener las tiendas' });
    }
});

app.get('/api/vendedor/tienda/:id', async (req, res) => {
    const usuario_id = req.params.id;
    try {
        const [results] = await db.query('SELECT * FROM tiendas WHERE usuario_id = ?', [usuario_id]);
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.json(null);
        }
    } catch (err) {
        console.error("Error al buscar tienda:", err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/vendedor/tienda/:id/estado', async (req, res) => {
    const usuario_id = req.params.id;
    const abierta = req.body.abierta ? 1 : 0;
    try {
        const [results] = await db.query('SELECT * FROM tiendas WHERE usuario_id = ?', [usuario_id]);
        if (results.length > 0) {
            await db.query('UPDATE tiendas SET abierta = ? WHERE usuario_id = ?', [abierta, usuario_id]);
        } else {
            const [u] = await db.query('SELECT nombre, direccion, telefono FROM usuarios WHERE id = ?', [usuario_id]);
            await db.query('INSERT INTO tiendas (usuario_id, nombre, descripcion, direccion, telefono, abierta) VALUES (?, ?, ?, ?, ?, ?)', [usuario_id, u[0]?.nombre || 'Mi Tienda', '', u[0]?.direccion || '', u[0]?.telefono || '', abierta]);
        }
        io.emit('catalogo_actualizado');
        res.json({ success: true, abierta });
    } catch (err) {
        console.error("Error al cambiar estado de tienda:", err);
        res.status(500).json({ error: 'Error interno servidor' });
    }
});

app.post('/api/vendedor/tienda', upload.single('logo'), async (req, res) => {
    const { usuario_id, nombre, descripcion, direccion, telefono, abierta } = req.body;
    const logo_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!usuario_id || !nombre) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (nombre o usuario_id)' });
    }

    try {
        const [results] = await db.query('SELECT * FROM tiendas WHERE usuario_id = ?', [usuario_id]);

        if (results.length > 0) {
            let query = 'UPDATE tiendas SET nombre = ?, descripcion = ?, direccion = ?';
            let values = [nombre, descripcion || '', direccion || ''];

            if (telefono !== undefined) {
                query += ', telefono = ?';
                values.push(telefono || '');
            }

            if (abierta !== undefined) {
                query += ', abierta = ?';
                values.push(abierta ? 1 : 0);
            }

            if (logo_url) {
                query += ', logo_url = ?';
                values.push(logo_url);
            }
            query += ' WHERE usuario_id = ?';
            values.push(usuario_id);

            await db.query(query, values);
        } else {
            const query = 'INSERT INTO tiendas (usuario_id, nombre, descripcion, direccion, telefono, logo_url, abierta) VALUES (?, ?, ?, ?, ?, ?, ?)';
            await db.query(query, [usuario_id, nombre, descripcion || '', direccion || '', telefono || '', logo_url, abierta !== undefined ? (abierta ? 1 : 0) : 1]);
        }

        if (direccion || telefono) {
            await db.query('UPDATE usuarios SET direccion = COALESCE(NULLIF(?, ""), direccion), telefono = COALESCE(NULLIF(?, ""), telefono) WHERE id = ?', [direccion || '', telefono || '', usuario_id]);
        }

        io.emit('catalogo_actualizado');
        res.json({ mensaje: 'Tienda actualizada correctamente', logo_url: logo_url || (results[0] ? results[0].logo_url : null) });
    } catch (err) {
        console.error("Error al procesar la tienda:", err);
        res.status(500).json({ error: 'Error interno en la base de datos.' });
    }
});

// ==========================================
// 🚀 INICIO DEL SERVIDOR
// ==========================================

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo correctamente en el puerto ${PORT} con Tiendas (Admin + Vendedores)`);
});
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ConfigurarTienda } from './ConfigurarTienda';
import { VendedorAprobarPago } from './VendedorAprobarPago';

const socket = io('');
const obtenerDetalles = (d) => { try { return JSON.parse(d); } catch (e) { return []; } };

function Vendedor() {
    const [misProductos, setMisProductos] = useState([]);
    const [pedidos, setPedidos] = useState([]);
    const [usuarioInfo, setUsuarioInfo] = useState(null);
    const [vistaActiva, setVistaActiva] = useState('ventas');
    const navigate = useNavigate();

    // DATOS DE LA TIENDA DEL VENDEDOR
    const [datosTienda, setDatosTienda] = useState(null);

    // FINANZAS SEPARADAS
    const [miSaldo, setMiSaldo] = useState(0);             // Para pagar comisiones
    const [dineroAFavor, setDineroAFavor] = useState(0);   // Lo que le debe el Admin
    const [cuentaRetiro, setCuentaRetiro] = useState('');  // Dónde le van a pagar

    const [nuevoNombre, setNuevoNombre] = useState('');
    const [nuevoPrecio, setNuevoPrecio] = useState('');
    const [nuevaCategoria, setNuevaCategoria] = useState('panaderia');
    const [archivoFoto, setArchivoFoto] = useState(null); 

    const [recargas, setRecargas] = useState([]);
    const [formRecarga, setFormRecarga] = useState({ monto: '', referencia: '', banco_destino: '' });
    const [bancos, setBancos] = useState([]);

    const audioNuevoPedido = new Audio('https://actions.google.com/sounds/v1/alarms/doorbell.ogg');

    // 🔄 Cargar datos de la tienda y finanzas asegurando conversión numérica de IDs
    const cargarDatos = (id) => {
        if (!id) return;

        axios.get('/api/productos')
            .then(res => setMisProductos(res.data.filter(p => Number(p.vendedor_id) === Number(id))))
            .catch(console.error);
            
        axios.get('/api/usuarios')
            .then(res => {
                const yo = res.data.find(u => Number(u.id) === Number(id));
                if (yo) {
                    setMiSaldo(Number(yo.saldo || 0));
                    setDineroAFavor(Number(yo.dinero_a_favor || 0));
                    setCuentaRetiro(yo.cuenta_retiro || '');
                }
            })
            .catch(console.error);

        axios.get(`/api/vendedor/tienda/${id}`)
            .then(res => setDatosTienda(res.data))
            .catch(console.error);

        axios.get('/api/recargas')
            .then(res => setRecargas(res.data.filter(r => Number(r.usuario_id) === Number(id))))
            .catch(console.error);

        axios.get('/api/bancos')
            .then(res => { 
                setBancos(res.data); 
                if (res.data.length > 0) setFormRecarga(prev => ({...prev, banco_destino: res.data[0].nombre})); 
            })
            .catch(console.error);

        axios.get('/api/pedidos')
            .then(res => setPedidos(res.data))
            .catch(console.error);
    };

    // 🔐 1. Validar sesión de usuario
    useEffect(() => {
        const infoStr = localStorage.getItem('usuario');
        if (!infoStr) return navigate('/login');
        try {
            const info = JSON.parse(infoStr);
            if (String(info.rol).trim().toLowerCase() !== 'vendedor') { 
                alert('Acceso denegado.'); 
                return navigate('/login'); 
            }
            setUsuarioInfo(info);
        } catch (e) {
            navigate('/login');
        }
    }, [navigate]);

    // 🚀 2. Escuchar WebSockets en tiempo real cuando el usuario está cargado
    useEffect(() => {
        if (!usuarioInfo) return;

        const id = usuarioInfo.id;
        cargarDatos(id);

        const manejarNuevoPedido = () => { 
            cargarDatos(id); 
            audioNuevoPedido.play().catch(e => console.log(e)); 
        };

        const manejarActualizaciones = () => {
            cargarDatos(id);
        };

        socket.on('nuevo_pedido', manejarNuevoPedido);
        socket.on('estado_actualizado', manejarActualizaciones);
        socket.on('recarga_actualizada', manejarActualizaciones);
        socket.on('usuario_actualizado', manejarActualizaciones);
        socket.on('catalogo_actualizado', manejarActualizaciones);

        return () => { 
            socket.off('nuevo_pedido', manejarNuevoPedido); 
            socket.off('estado_actualizado', manejarActualizaciones);
            socket.off('recarga_actualizada', manejarActualizaciones);
            socket.off('usuario_actualizado', manejarActualizaciones);
            socket.off('catalogo_actualizado', manejarActualizaciones);
        };
    }, [usuarioInfo]);

    const toggleEstadoTienda = async () => {
        const estadoActual = datosTienda?.abierta !== undefined ? (datosTienda.abierta ? 1 : 0) : 1;
        const nuevoEstado = estadoActual === 1 ? 0 : 1;
        try {
            await axios.put(`/api/vendedor/tienda/${usuarioInfo.id}/estado`, { abierta: nuevoEstado });
            setDatosTienda(prev => prev ? { ...prev, abierta: nuevoEstado } : { usuario_id: usuarioInfo.id, abierta: nuevoEstado });
            alert(`Tu tienda ahora está ${nuevoEstado === 1 ? 'ABIERTA 🟢' : 'CERRADA 🔴'}`);
        } catch (error) {
            alert('Error al actualizar el estado de la tienda');
        }
    };

    const cambiarEstadoPedido = async (id, nuevoEstado) => {
        try { 
            await axios.put(`/api/pedidos/${id}/estado`, { estado: nuevoEstado }); 
            cargarDatos(usuarioInfo.id); 
        } catch (error) { 
            alert('Error al actualizar'); 
        }
    };

    const subirProducto = async (e) => {
        e.preventDefault();
        if (miSaldo <= 0) return alert("❌ Tu saldo prepago está en $0. No puedes subir productos. Recarga tu billetera primero.");

        const formData = new FormData();
        formData.append('nombre', nuevoNombre); 
        formData.append('precio', nuevoPrecio); 
        formData.append('categoria', nuevaCategoria); 
        formData.append('vendedor_id', usuarioInfo.id);
        if (archivoFoto) formData.append('imagen', archivoFoto);

        try {
            await axios.post('/api/productos', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
            alert('¡Producto subido a la tienda con éxito!');
            setNuevoNombre(''); 
            setNuevoPrecio(''); 
            setArchivoFoto(null); 
            cargarDatos(usuarioInfo.id);
        } catch (error) { 
            alert('Error al subir'); 
        }
    };

    const toggleDisp = async (id, estadoActual) => {
        if (!estadoActual && miSaldo <= 0) return alert("❌ No puedes activar productos porque tu saldo está en $0. Por favor, recarga tu billetera.");
        try { 
            await axios.put(`/api/productos/${id}/disponibilidad`, { disponible: !estadoActual }); 
            cargarDatos(usuarioInfo.id); 
        } catch (error) { 
            alert('Error'); 
        }
    };

    const eliminar = async (id) => { 
        if (window.confirm("¿Borrar este producto?")) { 
            await axios.delete(`/api/productos/${id}`); 
            cargarDatos(usuarioInfo.id); 
        } 
    };

    const solicitarRecarga = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/recargas', { usuario_id: usuarioInfo.id, monto: formRecarga.monto, referencia: formRecarga.referencia, banco_destino: formRecarga.banco_destino });
            alert("Solicitud enviada. Espera a que el Admin la apruebe.");
            setFormRecarga({ monto: '', referencia: '', banco_destino: bancos[0]?.nombre || '' });
            cargarDatos(usuarioInfo.id);
        } catch (error) { 
            alert("Error al solicitar recarga"); 
        }
    };

    const guardarCuentaRetiro = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`/api/usuarios/${usuarioInfo.id}/cuenta-retiro`, { cuenta_retiro: cuentaRetiro });
            alert("Cuenta de cobro actualizada exitosamente. El administrador la verá al pagarte.");
        } catch (error) { 
            alert("Error al guardar cuenta"); 
        }
    };

    if (!usuarioInfo) return <p style={{textAlign: 'center', padding: '50px'}}>Cargando panel de ventas... ⏳</p>;

    const misVentas = pedidos.filter(pedido => obtenerDetalles(pedido.detalles).some(d => Number(d.vendedor_id) === Number(usuarioInfo.id)));
    const ventasActivas = misVentas.filter(p => !['entregado', 'cancelado', 'cancelado_devuelto'].includes(p.estado));
    const estaTiendaAbierta = datosTienda?.abierta !== 0;

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f4f4f9', minHeight: '100vh' }}>
            
            {/* INTERRUPTOR PRINCIPAL: TIENDA ABIERTA / CERRADA */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                backgroundColor: estaTiendaAbierta ? '#d4edda' : '#f8d7da', 
                border: `2px solid ${estaTiendaAbierta ? '#28a745' : '#dc3545'}`,
                padding: '12px 15px', 
                borderRadius: '8px', 
                marginBottom: '15px' 
            }}>
                <div>
                    <strong style={{ fontSize: '15px', color: estaTiendaAbierta ? '#155724' : '#721c24' }}>
                        Estado de tu Tienda: {estaTiendaAbierta ? '🟢 ABIERTA (Recibiendo Pedidos)' : '🔴 CERRADA (No recibe compras)'}
                    </strong>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: estaTiendaAbierta ? '#155724' : '#721c24' }}>
                        {estaTiendaAbierta ? 'Los clientes pueden comprar tus productos normalmente.' : 'Tus productos se muestran deshabilitados en el directorio.'}
                    </p>
                </div>
                <button 
                    onClick={toggleEstadoTienda} 
                    style={{ 
                        padding: '8px 14px', 
                        backgroundColor: estaTiendaAbierta ? '#dc3545' : '#28a745', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '5px', 
                        fontWeight: 'bold', 
                        cursor: 'pointer' 
                    }}
                >
                    {estaTiendaAbierta ? '🔴 Cerrar Tienda' : '🟢 Abrir Tienda'}
                </button>
            </div>

            {miSaldo <= 0 && (
                <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #f5c6cb', fontWeight: 'bold' }}>
                    ⚠️ Tu saldo para comisiones está agotado. Tus productos han sido ocultados automáticamente. Ve a "Billetera" y recarga para reactivarlos.
                </div>
            )}

            {/* ENCABEZADO PRINCIPAL CON DATOS DE TIENDA Y SALDOS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', backgroundColor: '#6f42c1', padding: '15px', borderRadius: '8px', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {datosTienda?.logo_url && (
                            <img 
                                src={`${datosTienda.logo_url}`} 
                                alt="Logo" 
                                style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }} 
                            />
                        )}
                        <div>
                            <h2 style={{ margin: 0 }}>{datosTienda?.nombre || '🏪 Portal de Vendedor'}</h2>
                            {datosTienda?.descripcion && <span style={{ fontSize: '12px', opacity: 0.85 }}>{datosTienda.descripcion}</span>}
                        </div>
                    </div>
                    <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Salir</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#563d7c', padding: '10px', borderRadius: '6px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '14px' }}>Dinero a tu favor (Por Cobrar al Admin):</span>
                    <strong style={{ fontSize: '22px', color: '#28a745' }}>${dineroAFavor.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#343a40', padding: '10px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '14px' }}>Saldo Prepago (Para Comisiones):</span>
                    <strong style={{ fontSize: '18px', color: miSaldo <= 0 ? '#dc3545' : '#17a2b8' }}>${miSaldo.toLocaleString()}</strong>
                </div>
            </div>

            {/* BARRA DE BOTONES DE NAVEGACIÓN */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                <button onClick={() => setVistaActiva('ventas')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'ventas' ? '#17a2b8' : '#ddd', color: vistaActiva === 'ventas' ? 'white' : '#333', cursor: 'pointer' }}>🛒 Mis Ventas</button>
                <button onClick={() => setVistaActiva('productos')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'productos' ? '#007bff' : '#ddd', color: vistaActiva === 'productos' ? 'white' : '#333', cursor: 'pointer' }}>📦 Mis Productos</button>
                <button onClick={() => setVistaActiva('subir')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'subir' ? '#28a745' : '#ddd', color: vistaActiva === 'subir' ? 'white' : '#333', cursor: 'pointer' }}>+ Subir Nuevo</button>
                <button onClick={() => setVistaActiva('billetera')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'billetera' ? '#ffc107' : '#ddd', color: '#333', cursor: 'pointer' }}>💰 Billetera</button>
                <button onClick={() => setVistaActiva('tienda')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'tienda' ? '#6f42c1' : '#ddd', color: vistaActiva === 'tienda' ? 'white' : '#333', cursor: 'pointer' }}>🏪 Mi Tienda</button>
                <button onClick={() => setVistaActiva('validar_pagos')} style={{ flex: '1 1 110px', padding: '12px 6px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'validar_pagos' ? '#e83e8c' : '#ddd', color: vistaActiva === 'validar_pagos' ? 'white' : '#333', cursor: 'pointer' }}>💳 Validar Pagos</button>
            </div>

            {/* PESTAÑA: MIS VENTAS */}
            {vistaActiva === 'ventas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <h3 style={{ margin: 0, color: '#333' }}>Pedidos Activos</h3>
                    {ventasActivas.length === 0 ? <p style={{ color: '#666' }}>No hay pedidos pendientes por despachar.</p> : (
                        ventasActivas.map(pedido => {
                            const misItems = obtenerDetalles(pedido.detalles).filter(d => Number(d.vendedor_id) === Number(usuarioInfo.id));
                            return (
                                <div key={pedido.id} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                                        <div>
                                            <strong style={{ fontSize: '18px', color: '#6f42c1' }}>Pedido #{pedido.id}</strong><br/>
                                            <span style={{ fontSize: '13px', color: '#666' }}>{new Date(pedido.fecha_creacion).toLocaleString()}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ display: 'block', fontWeight: 'bold', color: '#333' }}>Cliente: {pedido.cliente}</span>
                                            <span style={{ fontSize: '12px', color: '#007bff', fontWeight: 'bold' }}>{pedido.estado.replace('_', ' ').toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '15px', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '6px' }}>
                                        <strong style={{ display: 'block', marginBottom: '8px' }}>Productos a preparar:</strong>
                                        {misItems.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                                <img src={item.imagen} alt="" style={{ width: '30px', height: '30px', borderRadius: '4px', objectFit: 'cover' }} />
                                                <span><strong style={{ color: '#007bff' }}>{item.cantidad}x</strong> {item.nombre}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {pedido.estado === 'pendiente' && <button onClick={() => cambiarEstadoPedido(pedido.id, 'en_preparacion')} style={{ flex: 1, padding: '12px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>👨‍🍳 Empezar a Preparar</button>}
                                        {pedido.estado === 'en_preparacion' && <button onClick={() => cambiarEstadoPedido(pedido.id, 'listo_para_entrega')} style={{ flex: 1, padding: '12px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>✅ Empacado y Listo</button>}
                                        {pedido.estado === 'listo_para_entrega' && <div style={{ flex: 1, textAlign: 'center', padding: '12px', backgroundColor: '#e9ecef', color: '#555', borderRadius: '4px', fontWeight: 'bold' }}>⏳ Esperando al Domiciliario...</div>}
                                        {pedido.estado === 'llevando_tu_pedido' && <div style={{ flex: 1, textAlign: 'center', padding: '12px', backgroundColor: '#cce5ff', color: '#004085', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #b8daff' }}>🛵 El domiciliario lo está llevando</div>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* PESTAÑA: BILLETERA */}
            {vistaActiva === 'billetera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ backgroundColor: '#d4edda', padding: '20px', borderRadius: '8px', border: '1px solid #c3e6cb' }}>
                        <h3 style={{ marginTop: 0, color: '#155724' }}>📥 Mi Cuenta de Cobro (Dónde recibo dinero)</h3>
                        <p style={{ fontSize: '14px', color: '#155724' }}>Escribe la cuenta donde el Administrador debe enviarte las ganancias de tus ventas (Ej: Nequi 3001234567).</p>
                        <form onSubmit={guardarCuentaRetiro} style={{ display: 'flex', gap: '10px' }}>
                            <input type="text" placeholder="Ej: Daviplata - 312..." value={cuentaRetiro} onChange={e => setCuentaRetiro(e.target.value)} required style={{ padding: '12px', flex: 1, borderRadius: '4px', border: '1px solid #ccc' }} />
                            <button type="submit" style={{ padding: '12px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Guardar</button>
                        </form>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3 style={{ marginTop: 0, color: '#007bff' }}>💳 Recargar Saldo Prepago (Para pagar comisiones)</h3>
                        {bancos.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                                {bancos.map(b => (
                                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: '#e2f3f5', padding: '10px', borderRadius: '6px', border: '1px solid #17a2b8' }}>
                                        {b.imagen ? <img src={b.imagen} alt="Banco" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'contain', backgroundColor: 'white', padding: '2px', border: '1px solid #ccc' }} /> : <span style={{ fontSize: '25px' }}>🏦</span>}
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '15px', color: '#0c5460' }}>{b.nombre}</strong>
                                            <span style={{ fontSize: '13px', color: '#0c5460' }}>Cuenta: <strong>{b.numero}</strong></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px' }}>⚠️ El administrador aún no ha configurado una cuenta.</p>
                        )}
                        <form onSubmit={solicitarRecarga} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <select value={formRecarga.banco_destino} onChange={e => setFormRecarga({...formRecarga, banco_destino: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #007bff', fontWeight: 'bold', color: '#007bff' }}>
                                <option value="">Selecciona a qué cuenta transferiste...</option>
                                {bancos.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
                            </select>
                            <input type="number" placeholder="Monto transferido" value={formRecarga.monto} onChange={e => setFormRecarga({...formRecarga, monto: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <input type="text" placeholder="Referencia" value={formRecarga.referencia} onChange={e => setFormRecarga({...formRecarga, referencia: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <button type="submit" disabled={bancos.length === 0} style={{ padding: '12px', backgroundColor: bancos.length > 0 ? '#007bff' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Enviar Comprobante</button>
                        </form>
                    </div>
                </div>
            )}

            {/* PESTAÑA: SUBIR NUEVO */}
            {vistaActiva === 'subir' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <h3 style={{ marginTop: 0 }}>Tomar Foto y Vender 📸</h3>
                    <form onSubmit={subirProducto} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <input type="text" placeholder="Nombre del producto" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                        <input type="number" placeholder="Precio de venta al público" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                        <div style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '6px', textAlign: 'center' }}>
                            <strong style={{ display: 'block', marginBottom: '10px' }}>Subir Foto desde Galería o Cámara</strong>
                            <input type="file" accept="image/*" capture="environment" onChange={e => setArchivoFoto(e.target.files[0])} style={{ width: '100%' }} />
                        </div>
                        <button type="submit" style={{ padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px' }}>Subir Producto</button>
                    </form>
                </div>
            )}

            {/* PESTAÑA: MIS PRODUCTOS */}
            {vistaActiva === 'productos' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <h3 style={{ marginTop: 0 }}>Mis Productos Activos</h3>
                    {misProductos.length === 0 ? <p>Aún no has publicado nada.</p> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                            {misProductos.map(p => (
                                <div key={p.id} style={{ border: '1px solid #eee', padding: '10px', borderRadius: '6px', display: 'flex', itemsAlign: 'center', gap: '15px' }}>
                                    <img src={p.imagen} alt={p.nombre} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', opacity: p.disponible ? 1 : 0.4 }} />
                                    <div style={{ flex: 1 }}>
                                        <strong style={{ display: 'block', color: p.disponible ? '#333' : '#999' }}>{p.nombre}</strong>
                                        <span style={{ color: p.disponible ? '#28a745' : '#999', fontWeight: 'bold' }}>${Number(p.precio).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <button onClick={() => toggleDisp(p.id, p.disponible)} style={{ padding: '5px', backgroundColor: p.disponible ? '#28a745' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px' }}>{p.disponible ? 'Pausar' : 'Activar'}</button>
                                        <button onClick={() => eliminar(p.id)} style={{ padding: '5px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px' }}>Borrar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* PESTAÑA: CONFIGURACIÓN DE LA TIENDA */}
            {vistaActiva === 'tienda' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <ConfigurarTienda usuarioId={usuarioInfo.id} />
                </div>
            )}

            {/* PESTAÑA: VALIDACIÓN Y APROBACIÓN DE PAGOS */}
            {vistaActiva === 'validar_pagos' && (
                <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <VendedorAprobarPago />
                </div>
            )}

        </div>
    );
}

export default Vendedor;
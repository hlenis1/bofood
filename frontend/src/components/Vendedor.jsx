import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ConfigurarTienda } from './ConfigurarTienda';
import { VendedorAprobarPago } from './VendedorAprobarPago';
import { BotonModoOscuro } from './BotonModoOscuro';

const socket = io('');
const obtenerDetalles = (d) => { try { return typeof d === 'string' ? JSON.parse(d) : (d || []); } catch (e) { return []; } };

// 🔔 HELPER PARA NOTIFICACIONES NATIVAS EN APP EXPO
const notificarAppNativa = (titulo, mensaje) => {
    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
            JSON.stringify({
                type: 'NOTIFICACION_PUSH',
                title: titulo,
                body: mensaje
            })
        );
    }
};

function Vendedor() {
    const [misProductos, setMisProductos] = useState([]);
    const [pedidos, setPedidos] = useState([]);
    const [usuarioInfo, setUsuarioInfo] = useState(null);
    const [vistaActiva, setVistaActiva] = useState('ventas');
    const [subVistaVentas, setSubVistaVentas] = useState('activas'); // 'activas' | 'historial'
    const navigate = useNavigate();

    const [datosTienda, setDatosTienda] = useState(null);

    const [miSaldo, setMiSaldo] = useState(0);             
    const [dineroAFavor, setDineroAFavor] = useState(0);   
    const [cuentaRetiro, setCuentaRetiro] = useState('');  

    const [nuevoNombre, setNuevoNombre] = useState('');
    const [nuevoPrecio, setNuevoPrecio] = useState('');
    const [nuevaCategoria, setNuevaCategoria] = useState('panaderia');
    const [archivoFoto, setArchivoFoto] = useState(null); 

    const [recargas, setRecargas] = useState([]);
    const [formRecarga, setFormRecarga] = useState({ monto: '', referencia: '', banco_destino: '' });
    const [bancos, setBancos] = useState([]);

    const audioNuevoPedido = new Audio('https://actions.google.com/sounds/v1/alarms/doorbell.ogg');

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

        axios.get('/api/tiendas')
            .then(res => {
                const miT = res.data.find(t => Number(t.usuario_id) === Number(id));
                if (miT) {
                    setDatosTienda(prev => ({ ...prev, ...miT }));
                }
            })
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

    useEffect(() => {
        if (!usuarioInfo) return;

        const id = usuarioInfo.id;
        cargarDatos(id);

        const manejarNuevoPedido = (nuevoPedido) => { 
            cargarDatos(id); 
            audioNuevoPedido.play().catch(e => console.log(e)); 

            // 🔔 NOTIFICAR A LA TIENDA CUANDO RECIBE UN PEDIDO
            const idTexto = nuevoPedido?.id ? `#${nuevoPedido.id}` : '';
            notificarAppNativa(
                '🔔 ¡NUEVO PEDIDO RECIBIDO!',
                `Tienes una nueva solicitud de orden ${idTexto} pendiente por preparar.`
            );
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

    const misVentas = pedidos.filter(pedido => {
        const esSuVendedorDirecto = Number(pedido.vendedor_id) === Number(usuarioInfo.id);
        const tieneProdSuVendedor = obtenerDetalles(pedido.detalles).some(d => Number(d.vendedor_id) === Number(usuarioInfo.id));
        return esSuVendedorDirecto || tieneProdSuVendedor;
    });

    const ventasActivas = misVentas.filter(p => !['entregado', 'cancelado', 'cancelado_devuelto'].includes(p.estado));
    const ventasEntregadas = misVentas.filter(p => p.estado === 'entregado');

    const totalDineroRecaudado = ventasEntregadas.reduce((sum, p) => {
        const itemsVendedor = obtenerDetalles(p.detalles).filter(d => Number(d.vendedor_id) === Number(usuarioInfo.id));
        if (itemsVendedor.length > 0) {
            const subtotal = itemsVendedor.reduce((s, item) => s + (Number(item.precio) * Number(item.cantidad)), 0);
            return sum + subtotal;
        }
        return sum + Number(p.total || 0);
    }, 0);

    const calificacionesRecibidas = misVentas.filter(p => p.calificacion_tienda !== null && p.calificacion_tienda !== undefined);
    const promCalificacion = datosTienda?.promedio_calificacion 
        ? Number(datosTienda.promedio_calificacion) 
        : (calificacionesRecibidas.length > 0 
            ? calificacionesRecibidas.reduce((acc, p) => acc + Number(p.calificacion_tienda), 0) / calificacionesRecibidas.length 
            : 0);
    const cantCalificaciones = datosTienda?.total_calificaciones || calificacionesRecibidas.length;

    const estaTiendaAbierta = datosTienda?.abierta !== 0;

    const opcionesNavegacion = [
        { id: 'ventas', label: 'Ventas', icon: '🛒' },
        { id: 'productos', label: 'Productos', icon: '📦' },
        { id: 'subir', label: 'Publicar', icon: '➕' },
        { id: 'billetera', label: 'Billetera', icon: '💰' },
        { id: 'tienda', label: 'Tienda', icon: '🏪' },
        { id: 'validar_pagos', label: 'Pagos', icon: '💳' },
    ];

    return (
        <div className="vendedor-app-wrapper" style={{ padding: '15px 15px 100px 15px', fontFamily: 'sans-serif', maxWidth: '520px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
            
            {/* 🎨 REGLAS CSS PARA CORREGIR EL MODO OSCURO EN CUALQUIER ELEMENTO O INPUT */}
            <style>{`
                body.dark .vendedor-card,
                body.dark-mode .vendedor-card,
                body.modo-oscuro .vendedor-card,
                [data-theme="dark"] .vendedor-card {
                    background-color: #1a1a2e !important;
                    border-color: #2e2e4a !important;
                    color: #ffffff !important;
                }

                body.dark .vendedor-chip,
                body.dark-mode .vendedor-chip,
                body.modo-oscuro .vendedor-chip,
                [data-theme="dark"] .vendedor-chip {
                    background-color: #22223b !important;
                    border-color: #3d3d66 !important;
                    color: #ffffff !important;
                }

                body.dark input, body.dark select, body.dark textarea,
                body.dark-mode input, body.dark-mode select, body.dark-mode textarea,
                body.modo-oscuro input, body.modo-oscuro select, body.modo-oscuro textarea,
                [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea {
                    background-color: #0f0f1a !important;
                    border-color: #3d3d6b !important;
                    color: #ffffff !important;
                }

                body.dark .vendedor-box-bank,
                body.dark-mode .vendedor-box-bank,
                body.modo-oscuro .vendedor-box-bank,
                [data-theme="dark"] .vendedor-box-bank {
                    background-color: #122c38 !important;
                    border-color: #17a2b8 !important;
                    color: #e0f7fa !important;
                }

                body.dark .vendedor-box-rating,
                body.dark-mode .vendedor-box-rating,
                body.modo-oscuro .vendedor-box-rating,
                [data-theme="dark"] .vendedor-box-rating {
                    background-color: #3d3215 !important;
                    border-color: #ffc107 !important;
                    color: #fff3cd !important;
                }

                body.dark .vendedor-subcard,
                body.dark-mode .vendedor-subcard,
                body.modo-oscuro .vendedor-subcard,
                [data-theme="dark"] .vendedor-subcard {
                    background-color: #21213b !important;
                    border-color: #323254 !important;
                    color: #ffffff !important;
                }

                body.dark .vendedor-dock,
                body.dark-mode .vendedor-dock,
                body.modo-oscuro .vendedor-dock,
                [data-theme="dark"] .vendedor-dock {
                    background-color: #121224 !important;
                    border-color: #2e2e4a !important;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
                }
            `}</style>

            {/* 🏷️ BARRITA DE SALUDO Y MODO OSCURO/CLARO */}
            <div className="vendedor-chip" style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-chip, #f0f2f5)',
                border: '1px solid var(--border-color, #e0e0e0)',
                padding: '8px 16px',
                borderRadius: '25px',
                marginBottom: '15px',
                fontSize: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                    <span>Hola, {usuarioInfo.nombre || 'Vendedor'} 🥐☀️</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BotonModoOscuro />
                    <button 
                        onClick={() => { localStorage.clear(); navigate('/login'); }} 
                        style={{ padding: '5px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '15px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                    >
                        Salir
                    </button>
                </div>
            </div>

            {/* 🏪 TARJETA CENTRADA DE LA TIENDA */}
            <div className="vendedor-card" style={{
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e0e0e0)',
                borderRadius: '16px',
                padding: '20px',
                textAlign: 'center',
                marginBottom: '15px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
            }}>
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
                    <img 
                        src={datosTienda?.logo_url || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500'} 
                        alt="Logo" 
                        style={{ width: '85px', height: '85px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #007bff', backgroundColor: '#fff', padding: '2px' }} 
                    />
                    <span style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '18px' }}>
                        {estaTiendaAbierta ? '🟢' : '🔴'}
                    </span>
                </div>

                <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold' }}>
                    {datosTienda?.nombre || 'Mi Tienda'}
                </h2>
                
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', opacity: 0.8 }}>
                    {datosTienda?.descripcion || 'Tienda oficial en la plataforma'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', fontSize: '13px', marginBottom: '15px' }}>
                    <span style={{ fontWeight: 'bold' }}>⭐ {promCalificacion > 0 ? promCalificacion.toFixed(1) : '5.0'} ({cantCalificaciones} reseñas)</span>
                    <span style={{ color: '#28a745', fontWeight: 'bold' }}>💵 Recaudado: ${totalDineroRecaudado.toLocaleString()}</span>
                </div>

                <button 
                    onClick={toggleEstadoTienda} 
                    style={{ 
                        width: '100%', 
                        padding: '12px', 
                        backgroundColor: estaTiendaAbierta ? '#28a745' : '#dc3545', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '10px', 
                        fontWeight: 'bold', 
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                >
                    {estaTiendaAbierta ? '🟢 Tienda Abierta (Recibiendo compras)' : '🔴 Tienda Cerrada (Pausada)'}
                </button>
            </div>

            {/* 💰 TARJETA RESUMEN DE SALDOS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '4px' }}>Por cobrar al Admin:</span>
                    <strong style={{ fontSize: '16px', color: '#28a745' }}>${dineroAFavor.toLocaleString()}</strong>
                </div>
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '4px' }}>Saldo Comisiones:</span>
                    <strong style={{ fontSize: '16px', color: miSaldo <= 0 ? '#dc3545' : '#17a2b8' }}>${miSaldo.toLocaleString()}</strong>
                </div>
            </div>

            {miSaldo <= 0 && (
                <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '12px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #f5c6cb', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                    ⚠️ Saldo agotado. Recarga en "Billetera" para activar tus productos.
                </div>
            )}

            {/* 🛒 VISTA DE CONTENIDO: MIS VENTAS */}
            {vistaActiva === 'ventas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="vendedor-card" style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--card-bg, #ffffff)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color, #e0e0e0)' }}>
                        <button 
                            onClick={() => setSubVistaVentas('activas')}
                            style={{ 
                                flex: 1, 
                                padding: '8px', 
                                border: 'none', 
                                borderRadius: '8px', 
                                backgroundColor: subVistaVentas === 'activas' ? '#007bff' : 'transparent', 
                                color: subVistaVentas === 'activas' ? 'white' : 'inherit', 
                                fontWeight: 'bold', 
                                fontSize: '13px',
                                cursor: 'pointer' 
                            }}
                        >
                            🛵 Activos ({ventasActivas.length})
                        </button>
                        <button 
                            onClick={() => setSubVistaVentas('historial')}
                            style={{ 
                                flex: 1, 
                                padding: '8px', 
                                border: 'none', 
                                borderRadius: '8px', 
                                backgroundColor: subVistaVentas === 'historial' ? '#007bff' : 'transparent', 
                                color: subVistaVentas === 'historial' ? 'white' : 'inherit', 
                                fontWeight: 'bold', 
                                fontSize: '13px',
                                cursor: 'pointer' 
                            }}
                        >
                            📜 Historial ({ventasEntregadas.length})
                        </button>
                    </div>

                    {subVistaVentas === 'activas' && (
                        <div>
                            {ventasActivas.length === 0 ? (
                                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', padding: '25px', borderRadius: '12px', textAlign: 'center', opacity: 0.7, border: '1px solid var(--border-color, #e0e0e0)' }}>
                                    No hay pedidos pendientes por despachar. ☕
                                </div>
                            ) : (
                                ventasActivas.map(pedido => {
                                    const misItems = obtenerDetalles(pedido.detalles).filter(d => Number(d.vendedor_id) === Number(usuarioInfo.id));
                                    return (
                                        <div key={pedido.id} className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', borderRadius: '14px', padding: '15px', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '8px' }}>
                                                <div>
                                                    <strong style={{ fontSize: '16px', color: '#007bff' }}>Pedido #{pedido.id}</strong><br/>
                                                    <span style={{ fontSize: '11px', opacity: 0.6 }}>{new Date(pedido.fecha_creacion).toLocaleString()}</span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontWeight: 'bold', fontSize: '13px' }}>{pedido.cliente}</span>
                                                    <span style={{ fontSize: '11px', color: '#ffc107', fontWeight: 'bold' }}>{pedido.estado.replace('_', ' ').toUpperCase()}</span>
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '10px' }}>
                                                {misItems.map((item, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', margin: '4px 0' }}>
                                                        <img src={item.imagen} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} />
                                                        <span><strong style={{ color: '#007bff' }}>{item.cantidad}x</strong> {item.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div style={{ marginTop: '10px' }}>
                                                {pedido.estado === 'pendiente' && <button onClick={() => cambiarEstadoPedido(pedido.id, 'en_preparacion')} style={{ width: '100%', padding: '10px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>👨‍🍳 Empezar a Preparar</button>}
                                                {pedido.estado === 'en_preparacion' && <button onClick={() => cambiarEstadoPedido(pedido.id, 'listo_para_entrega')} style={{ width: '100%', padding: '10px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✅ Empacado y Listo</button>}
                                                {pedido.estado === 'listo_para_entrega' && <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e9ecef', color: '#555', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>⏳ Esperando al Domiciliario...</div>}
                                                {pedido.estado === 'llevando_tu_pedido' && <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#cce5ff', color: '#004085', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>🛵 En camino con el repartidor</div>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {subVistaVentas === 'historial' && (
                        <div>
                            {ventasEntregadas.length === 0 ? (
                                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', padding: '25px', borderRadius: '12px', textAlign: 'center', opacity: 0.7, border: '1px solid var(--border-color, #e0e0e0)' }}>
                                    Aún no hay ventas entregadas registradas.
                                </div>
                            ) : (
                                ventasEntregadas.map(pedido => {
                                    const misItems = obtenerDetalles(pedido.detalles).filter(d => Number(d.vendedor_id) === Number(usuarioInfo.id));
                                    const subtotalVendedor = misItems.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
                                    const tieneCalificacion = pedido.calificacion_tienda !== null && pedido.calificacion_tienda !== undefined;

                                    return (
                                        <div key={pedido.id} className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '6px', marginBottom: '6px' }}>
                                                <div>
                                                    <strong style={{ fontSize: '14px' }}>Pedido #{pedido.id}</strong>
                                                    <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>{new Date(pedido.fecha_creacion).toLocaleDateString()}</span>
                                                </div>
                                                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#28a745' }}>
                                                    +${(subtotalVendedor || Number(pedido.total)).toLocaleString()}
                                                </span>
                                            </div>

                                            <div className="vendedor-box-rating" style={{ backgroundColor: '#fff3cd', padding: '8px', borderRadius: '6px', border: '1px solid #ffeeba', fontSize: '12px', color: '#856404' }}>
                                                <span style={{ display: 'block', fontWeight: 'bold' }}>
                                                    ⭐ Calificación Recibida: {tieneCalificacion ? `${'⭐'.repeat(pedido.calificacion_tienda)} (${pedido.calificacion_tienda}/5)` : 'Sin calificar'}
                                                </span>
                                                {pedido.comentario_calificacion && (
                                                    <p style={{ margin: '2px 0 0 0', fontStyle: 'italic' }}>
                                                        💬 "{pedido.comentario_calificacion}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 💰 VISTA DE BILLETERA Y RECARGAS */}
            {vistaActiva === 'billetera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#28a745' }}>📥 Cuenta de Cobro</h3>
                        <p style={{ fontSize: '12px', opacity: 0.7 }}>Cuenta donde el Administrador te enviará tus ganancias acumuladas.</p>
                        <form onSubmit={guardarCuentaRetiro} style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Ej: Nequi 3001234567..." value={cuentaRetiro} onChange={e => setCuentaRetiro(e.target.value)} required style={{ padding: '10px', flex: 1, borderRadius: '8px', border: '1px solid #ccc' }} />
                            <button type="submit" style={{ padding: '10px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Guardar</button>
                        </form>
                    </div>

                    <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#007bff' }}>💳 Recargar Saldo Prepago</h3>
                        {bancos.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                {bancos.map(b => (
                                    <div key={b.id} className="vendedor-box-bank" style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#e2f3f5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #17a2b8' }}>
                                        {b.imagen ? <img src={b.imagen} alt="" style={{ height: '30px', width: '30px', borderRadius: '4px', objectFit: 'contain' }} /> : <span>🏦</span>}
                                        <div style={{ fontSize: '12px' }}>
                                            <strong style={{ display: 'block' }}>{b.nombre}</strong>
                                            <span>Número: {b.numero}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        <form onSubmit={solicitarRecarga} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <select value={formRecarga.banco_destino} onChange={e => setFormRecarga({...formRecarga, banco_destino: e.target.value})} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}>
                                <option value="">Selecciona Banco...</option>
                                {bancos.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
                            </select>
                            <input type="number" placeholder="Monto transferido" value={formRecarga.monto} onChange={e => setFormRecarga({...formRecarga, monto: e.target.value})} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                            <input type="text" placeholder="Referencia de pago" value={formRecarga.referencia} onChange={e => setFormRecarga({...formRecarga, referencia: e.target.value})} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                            <button type="submit" disabled={bancos.length === 0} style={{ padding: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Enviar Comprobante</button>
                        </form>
                    </div>
                </div>
            )}

            {/* 📸 VISTA DE SUBIR NUEVO PRODUCTO */}
            {vistaActiva === 'subir' && (
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                    <h3 style={{ marginTop: 0, fontSize: '16px' }}>Publicar Nuevo Producto 📸</h3>
                    <form onSubmit={subirProducto} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="text" placeholder="Nombre del producto" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                        <input type="number" placeholder="Precio al público ($)" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                        <div style={{ padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px dashed #ccc' }}>
                            <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px', opacity: 0.7 }}>Foto del Producto</strong>
                            <input type="file" accept="image/*" capture="environment" onChange={e => setArchivoFoto(e.target.files[0])} style={{ width: '100%', fontSize: '12px' }} />
                        </div>
                        <button type="submit" style={{ padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px' }}>Publicar Producto</button>
                    </form>
                </div>
            )}

            {/* 📦 VISTA DE PRODUCTOS PUBLICADOS */}
            {vistaActiva === 'productos' && (
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                    <h3 style={{ marginTop: 0, fontSize: '16px' }}>Mis Productos Publicados</h3>
                    {misProductos.length === 0 ? <p style={{ opacity: 0.7, fontSize: '13px' }}>Aún no has publicado nada.</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {misProductos.map(p => (
                                <div key={p.id} className="vendedor-subcard" style={{ border: '1px solid #eee', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <img src={p.imagen} alt="" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px', opacity: p.disponible ? 1 : 0.4 }} />
                                    <div style={{ flex: 1 }}>
                                        <strong style={{ display: 'block', fontSize: '14px', opacity: p.disponible ? 1 : 0.5 }}>{p.nombre}</strong>
                                        <span style={{ color: p.disponible ? '#28a745' : '#888', fontWeight: 'bold', fontSize: '13px' }}>${Number(p.precio).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => toggleDisp(p.id, p.disponible)} style={{ padding: '6px 10px', backgroundColor: p.disponible ? '#28a745' : '#6c757d', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>{p.disponible ? 'Pausar' : 'Activar'}</button>
                                        <button onClick={() => eliminar(p.id)} style={{ padding: '6px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>Borrar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 🏪 CONFIGURAR DATOS DE LA TIENDA */}
            {vistaActiva === 'tienda' && (
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                    <ConfigurarTienda usuarioId={usuarioInfo.id} />
                </div>
            )}

            {/* 💳 APROBAR PAGOS */}
            {vistaActiva === 'validar_pagos' && (
                <div className="vendedor-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                    <VendedorAprobarPago />
                </div>
            )}

            {/* 📌 BARRA DE NAVEGACIÓN FLOTANTE INFERIOR */}
            <div className="vendedor-dock" style={{
                position: 'fixed',
                bottom: '15px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'calc(100% - 30px)',
                maxWidth: '480px',
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e0e0e0)',
                borderRadius: '30px',
                padding: '6px 4px',
                display: 'flex',
                justify: 'space-evenly',
                alignItems: 'center',
                boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                zIndex: 1000
            }}>
                {opcionesNavegacion.map((item) => (
                    <button 
                        key={item.id}
                        onClick={() => setVistaActiva(item.id)} 
                        style={{ 
                            flex: 1,
                            background: 'none', 
                            border: 'none', 
                            color: vistaActiva === item.id ? '#007bff' : 'inherit', 
                            opacity: vistaActiva === item.id ? 1 : 0.6,
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justify: 'center',
                            textAlign: 'center',
                            fontSize: '10px', 
                            fontWeight: 'bold',
                            padding: '4px 0',
                            cursor: 'pointer' 
                        }}
                    >
                        <span style={{ fontSize: '18px', lineHeight: '1', marginBottom: '3px' }}>{item.icon}</span>
                        <span style={{ lineHeight: '1' }}>{item.label}</span>
                    </button>
                ))}
            </div>

        </div>
    );
}

export default Vendedor;
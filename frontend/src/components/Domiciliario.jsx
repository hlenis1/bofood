import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { BotonModoOscuro } from './BotonModoOscuro';

const socket = io('');

const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180); 
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
};

const obtenerDetalles = (d) => { 
    try { return typeof d === 'string' ? JSON.parse(d) : (d || []); } catch (e) { return []; } 
};

const parseDireccion = (dirRaw) => {
    if (!dirRaw) return { texto: 'Sin dirección registrada', gps: null };
    const str = String(dirRaw);
    if (str.includes(' |GPS| ')) return { texto: str.split(' |GPS| ')[0], gps: str.split(' |GPS| ')[1] };
    if (str.startsWith('http')) return { texto: 'Ubicación GPS', gps: str };
    return { texto: str, gps: null };
};

const extraerCoordsDeLink = (link) => {
    if (!link) return null; 
    const m = String(link).match(/\?q=([^,]+),([^&]+)/);
    return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null;
};

function Domiciliario() {
    const [pedidos, setPedidos] = useState([]);
    const [miUbicacion, setMiUbicacion] = useState(null); 
    const [modalCancelacion, setModalCancelacion] = useState(null); 
    const [motivoSelect, setMotivoSelect] = useState('');
    const [motivoTexto, setMotivoTexto] = useState('');
    const [usuarioInfo, setUsuarioInfo] = useState(null);
    const [miSaldo, setMiSaldo] = useState(0);
    const [errorFatal, setErrorFatal] = useState('');
    const [vistaActiva, setVistaActiva] = useState('pedidos'); 
    
    const [pedidosExpandidos, setPedidosExpandidos] = useState({});

    const [recargas, setRecargas] = useState([]);
    const [formRecarga, setFormRecarga] = useState({ monto: '', referencia: '', banco_destino: '' });
    const [bancos, setBancos] = useState([]);

    const navigate = useNavigate();
    const watchIdRef = useRef(null);
    const pedidosEnCaminoRef = useRef([]); 
    const audioNuevoViaje = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

    const togglePedido = (id) => {
        setPedidosExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const cargarMisDatos = async (id) => {
        try {
            const res = await axios.get('/api/usuarios');
            const yo = res.data.find(u => Number(u.id) === Number(id));
            if (yo) setMiSaldo(Number(yo.saldo || 0));
            
            const resBancos = await axios.get('/api/bancos');
            setBancos(resBancos.data);
            if(resBancos.data.length > 0) {
                setFormRecarga(prev => ({...prev, banco_destino: resBancos.data[0].nombre}));
            }
        } catch (error) { console.error(error); }
    };

    const cargarRecargas = async () => {
        try {
            const res = await axios.get('/api/recargas');
            setRecargas(res.data.filter(r => Number(r.usuario_id) === Number(usuarioInfo?.id)));
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        const infoStr = localStorage.getItem('usuario');
        if (!infoStr) return navigate('/login');
        try {
            const info = JSON.parse(infoStr);
            if (String(info.rol).trim().toLowerCase() !== 'domiciliario') {
                setErrorFatal(`La base de datos guardó tu rol como "${info.rol}". Inicia como Admin y corrige el usuario.`); 
                return;
            }
            setUsuarioInfo(info);
            cargarMisDatos(info.id);
        } catch (e) { setErrorFatal("Datos dañados. Cierra sesión."); }
    }, [navigate]);

    useEffect(() => {
        if (!usuarioInfo) return; 
        const cargarPedidos = () => {
            axios.get('/api/pedidos').then(res => setPedidos(res.data)).catch(console.error);
            cargarMisDatos(usuarioInfo.id);
            cargarRecargas();
        };

        const manejarActualizacionesCuenta = () => {
            cargarMisDatos(usuarioInfo.id);
            cargarRecargas();
        };

        const manejarNuevoMensaje = ({ pedidoId, chatCompleto }) => {
            setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, chat: JSON.stringify(chatCompleto) } : p));
        };

        cargarPedidos();

        socket.on('nuevo_pedido', cargarPedidos);
        socket.on('estado_actualizado', (data) => {
            cargarPedidos();
            if (data.estado === 'listo_para_entrega') audioNuevoViaje.play().catch(e=>console.log(e));
        });
        socket.on('pedido_eliminado', cargarPedidos);
        socket.on('recarga_actualizada', manejarActualizacionesCuenta);
        socket.on('usuario_actualizado', manejarActualizacionesCuenta);
        socket.on('catalogo_actualizado', manejarActualizacionesCuenta);
        socket.on('nuevo_mensaje_pedido', manejarNuevoMensaje);

        return () => {
            socket.off('nuevo_pedido', cargarPedidos); 
            socket.off('estado_actualizado'); 
            socket.off('pedido_eliminado', cargarPedidos);
            socket.off('recarga_actualizada', manejarActualizacionesCuenta);
            socket.off('usuario_actualizado', manejarActualizacionesCuenta);
            socket.off('catalogo_actualizado', manejarActualizacionesCuenta);
            socket.off('nuevo_mensaje_pedido', manejarNuevoMensaje);
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [usuarioInfo]);

    useEffect(() => {
        if (!Array.isArray(pedidos)) return;
        const enCamino = pedidos.filter(p => p.estado === 'llevando_tu_pedido' && Number(p.domiciliario_id) === Number(usuarioInfo?.id)).map(p => p.id);
        pedidosEnCaminoRef.current = enCamino;

        if (enCamino.length > 0 && !watchIdRef.current) iniciarTransmisionGPS();
        else if (enCamino.length === 0) detenerTransmisionGPS();
    }, [pedidos, usuarioInfo]);

    const iniciarTransmisionGPS = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }; 
                    setMiUbicacion(coords);
                    pedidosEnCaminoRef.current.forEach(pid => socket.emit('ubicacion_domiciliario', { pedidoId: pid, lat: coords.lat, lon: coords.lon }));
                }, (err) => console.error("Error GPS Inicial"), { enableHighAccuracy: true }
            );
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }; 
                    setMiUbicacion(coords);
                    pedidosEnCaminoRef.current.forEach(pid => socket.emit('ubicacion_domiciliario', { pedidoId: pid, lat: coords.lat, lon: coords.lon }));
                }, (err) => console.error("Error GPS"), { enableHighAccuracy: true, maximumAge: 0 }
            );
        }
    };

    const detenerTransmisionGPS = () => {
        if (watchIdRef.current) { 
            navigator.geolocation.clearWatch(watchIdRef.current); 
            watchIdRef.current = null; 
            setMiUbicacion(null); 
        }
    };

    const cambiarEstado = async (id, nuevoEstado, motivo = null) => {
        try {
            await axios.put(`/api/pedidos/${id}/estado`, { estado: nuevoEstado, motivo_cancelacion: motivo, domiciliario_id: usuarioInfo.id });
            if (nuevoEstado === 'llevando_tu_pedido') alert("¡Viaje iniciado! Tu ubicación se transmite al cliente.");
            else if (nuevoEstado === 'entregado' || nuevoEstado === 'cancelado_devuelto') {
                setModalCancelacion(null);
                alert(nuevoEstado === 'entregado' ? "¡Entrega exitosa! (Se descontó la comisión)" : "Devolución registrada.");
            }
            cargarMisDatos(usuarioInfo.id); 
        } catch (error) { alert(error.response?.data?.message || 'Error al actualizar estado'); }
    };

    const enviarNoEntregado = (id) => {
        const motivoFinal = motivoSelect === 'Otro' ? motivoTexto : motivoSelect;
        if (!motivoFinal) {
            alert("Por favor selecciona o escribe un motivo de devolución.");
            return;
        }
        cambiarEstado(id, 'cancelado_devuelto', motivoFinal);
    };

    const solicitarRecarga = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/recargas', { usuario_id: usuarioInfo.id, monto: formRecarga.monto, referencia: formRecarga.referencia, banco_destino: formRecarga.banco_destino });
            alert("Solicitud de recarga enviada. Espera a que el Admin la apruebe.");
            setFormRecarga({ monto: '', referencia: '', banco_destino: bancos[0]?.nombre || '' });
            cargarRecargas();
        } catch (error) { alert("Error al solicitar recarga"); }
    };

    const cerrarSesion = () => { detenerTransmisionGPS(); localStorage.clear(); navigate('/login'); };

    if (errorFatal) return (<div style={{ padding: '40px', textAlign: 'center' }}><h2>⚠️ ERROR</h2><p>{errorFatal}</p><button onClick={cerrarSesion}>Volver</button></div>);
    if (!usuarioInfo) return <div style={{ textAlign: 'center', padding: '50px' }}>Cargando... ⏳</div>;

    const pedidosActivos = Array.isArray(pedidos) ? pedidos.filter(p => p.estado === 'listo_para_entrega' || (p.estado === 'llevando_tu_pedido' && Number(p.domiciliario_id) === Number(usuarioInfo.id))) : [];
    const historialEntregas = Array.isArray(pedidos) ? pedidos.filter(p => p.estado === 'entregado' && Number(p.domiciliario_id) === Number(usuarioInfo.id)) : [];

    // ⭐ CÁLCULO DE CALIFICACIÓN PROMEDIO
    const entregadosConCalificacion = historialEntregas.filter(p => p.calificacion_domiciliario !== null && p.calificacion_domiciliario !== undefined);
    const promCalificacionDomi = entregadosConCalificacion.length > 0
        ? entregadosConCalificacion.reduce((acc, p) => acc + Number(p.calificacion_domiciliario), 0) / entregadosConCalificacion.length
        : 0;
    const cantCalificacionesDomi = entregadosConCalificacion.length;

    return (
        <div className="domi-app-wrapper" style={{ padding: '15px 15px 100px 15px', fontFamily: 'sans-serif', maxWidth: '520px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
            
            {/* 🎨 CSS INYECTADO PARA CORREGIR MODO OSCURO / MODO CLARO EN TODO ELEMENTO */}
            <style>{`
                body.dark .domi-card,
                body.dark-mode .domi-card,
                body.modo-oscuro .domi-card,
                [data-theme="dark"] .domi-card {
                    background-color: #1a1a2e !important;
                    border-color: #2e2e4a !important;
                    color: #ffffff !important;
                }

                body.dark .domi-chip,
                body.dark-mode .domi-chip,
                body.modo-oscuro .domi-chip,
                [data-theme="dark"] .domi-chip {
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

                body.dark .domi-subcard,
                body.dark-mode .domi-subcard,
                body.modo-oscuro .domi-subcard,
                [data-theme="dark"] .domi-subcard {
                    background-color: #21213b !important;
                    border-color: #323254 !important;
                    color: #ffffff !important;
                }

                body.dark .domi-box-rating,
                body.dark-mode .domi-box-rating,
                body.modo-oscuro .domi-box-rating,
                [data-theme="dark"] .domi-box-rating {
                    background-color: #3d3215 !important;
                    border-color: #ffc107 !important;
                    color: #fff3cd !important;
                }

                body.dark .domi-dock,
                body.dark-mode .domi-dock,
                body.modo-oscuro .domi-dock,
                [data-theme="dark"] .domi-dock {
                    background-color: #121224 !important;
                    border-color: #2e2e4a !important;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
                }
            `}</style>

            {/* 🏷️ BARRITA DE SALUDO Y MODO OSCURO */}
            <div className="domi-chip" style={{
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
                    <span>Hola, {usuarioInfo?.nombre || 'Repartidor'} 🛵☀️</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BotonModoOscuro />
                    <button onClick={cerrarSesion} style={{ padding: '5px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '15px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                        Salir
                    </button>
                </div>
            </div>

            {/* 🏪 TARJETA CENTRADA PRINCIPAL DE REPARTIDOR */}
            <div className="domi-card" style={{
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e0e0e0)',
                borderRadius: '16px',
                padding: '20px',
                textAlign: 'center',
                marginBottom: '15px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
            }}>
                <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 'bold', color: '#e83e8c' }}>
                    🛵 Portal de Repartidor
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="domi-subcard" style={{ backgroundColor: '#f8f9fa', border: '1px solid #e0e0e0', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '2px' }}>Mi Saldo Billetera:</span>
                        <strong style={{ fontSize: '16px', color: miSaldo < 2000 ? '#dc3545' : '#28a745' }}>${miSaldo.toLocaleString()}</strong>
                    </div>

                    <div className="domi-subcard" style={{ backgroundColor: '#f8f9fa', border: '1px solid #e0e0e0', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '2px' }}>⭐ Calificación:</span>
                        <strong style={{ fontSize: '15px', color: '#ffc107' }}>
                            {promCalificacionDomi > 0 ? `⭐ ${promCalificacionDomi.toFixed(1)} (${cantCalificacionesDomi})` : 'Sin reseñas'}
                        </strong>
                    </div>
                </div>
            </div>

            {/* 📦 PESTAÑA 1: PEDIDOS / ENTREGAS ACTIVAS */}
            {vistaActiva === 'pedidos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {pedidosActivos.length === 0 && (
                        <div className="domi-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '30px', borderRadius: '14px', textAlign: 'center', opacity: 0.7 }}>
                            No hay entregas pendientes en este momento. 🛵
                        </div>
                    )}
                    
                    {pedidosActivos.map(pedido => {
                        const dirTienda = parseDireccion(pedido.tienda_direccion);
                        const dirCliente = parseDireccion(pedido.direccion);
                        const esMiViaje = pedido.estado === 'llevando_tu_pedido';
                        const detallesCarrito = obtenerDetalles(pedido.detalles);
                        
                        const clienteCoords = extraerCoordsDeLink(dirCliente.gps);
                        const tiendaCoords = extraerCoordsDeLink(dirTienda.gps);

                        let distanciaKm = 0; 
                        let tiempoMinutos = 0;

                        if (esMiViaje && miUbicacion && clienteCoords) {
                            distanciaKm = calcularDistancia(miUbicacion.lat, miUbicacion.lon, clienteCoords.lat, clienteCoords.lon);
                            tiempoMinutos = Math.max(1, Math.round(distanciaKm * 2)); 
                        }

                        const estaExpandido = !!pedidosExpandidos[pedido.id];

                        return (
                        <div key={pedido.id} className="domi-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: esMiViaje ? '2px solid #007bff' : '1px solid var(--border-color, #e0e0e0)', borderRadius: '14px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            
                            {esMiViaje && (
                                <div style={{ backgroundColor: '#1e2d3d', padding: '10px 15px', borderBottom: '1px solid #17a2b8', display: 'flex', gap: '10px' }}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); cambiarEstado(pedido.id, 'entregado'); }} 
                                        style={{ flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
                                    >
                                        ✅ Entregado (Cobrar Comisión)
                                    </button>
                                </div>
                            )}

                            <div 
                                onClick={() => togglePedido(pedido.id)} 
                                style={{ padding: '15px', cursor: 'pointer', borderBottom: estaExpandido ? '1px solid #eee' : 'none', userSelect: 'none' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>Pedido #{pedido.id}</h3>
                                        <p style={{ margin: '2px 0', fontSize: '14px' }}>
                                            Cobrar: <strong style={{ color: '#28a745', fontSize: '15px' }}>${Number(pedido.total || 0).toLocaleString()}</strong> ({pedido.metodo_pago ? pedido.metodo_pago.toUpperCase() : 'N/A'})
                                        </p>
                                        <p style={{ margin: '2px 0', color: '#17a2b8', fontSize: '13px', fontWeight: 'bold' }}>
                                            Pago Domicilio: ${Number(pedido.costo_domicilio || 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <span style={{ backgroundColor: esMiViaje ? '#007bff' : '#6f42c1', color: 'white', padding: '5px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                                        {esMiViaje ? 'EN CAMINO 🛵' : 'LISTO PARA LLEVAR ⏱️'}
                                    </span>
                                </div>

                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                                    <span>🏬 <strong>{pedido.tienda_nombre || 'Tienda'}</strong></span>
                                    <span style={{ opacity: 0.5 }}>➔</span>
                                    <span>🏠 <strong>{pedido.cliente || 'Cliente'}</strong></span>
                                </div>

                                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#007bff', fontWeight: 'bold' }}>
                                    {estaExpandido ? '▲ Ocultar detalles del viaje' : '▼ Ver detalles y dirección'}
                                </div>
                            </div>

                            {estaExpandido && (
                                <div style={{ padding: '15px', borderTop: '1px solid #eee' }}>
                                    
                                    <div className="domi-subcard" style={{ border: '1px solid #e9ecef', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                                        <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                                            🛒 Productos ({detallesCarrito.reduce((acc, p) => acc + Number(p.cantidad || 1), 0)} ítems):
                                        </strong>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {detallesCarrito.length > 0 ? detallesCarrito.map((prod, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                                    <img src={prod.imagen || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500'} alt="" style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }} />
                                                    <span><strong>{prod.cantidad || 1}x</strong> {prod.nombre}</span>
                                                </div>
                                            )) : <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '12px' }}>Sin detalles</span>}
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeeba', padding: '10px', borderRadius: '8px', marginBottom: '12px', color: '#856404' }}>
                                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                                            🏬 1. Recogida (Tienda):
                                        </strong>
                                        <p style={{ margin: '2px 0', fontSize: '13px', fontWeight: 'bold' }}>{pedido.tienda_nombre || 'Tienda Principal'}</p>
                                        <p style={{ margin: '2px 0', fontSize: '12px' }}>📞 {pedido.tienda_telefono || 'Sin teléfono'}</p>
                                        <p style={{ margin: '2px 0', fontSize: '12px' }}>📍 {dirTienda.texto}</p>

                                        {dirTienda.gps && esMiViaje && miUbicacion && tiendaCoords ? (
                                            <a href={`https://www.google.com/maps/dir/?api=1&origin=${miUbicacion.lat},${miUbicacion.lon}&destination=${tiendaCoords.lat},${tiendaCoords.lon}&travelmode=driving`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '8px', backgroundColor: '#ffc107', color: '#212529', textAlign: 'center', padding: '8px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}>
                                                🗺️ Ir a la Tienda en Google Maps
                                            </a>
                                        ) : dirTienda.gps ? (
                                            <a href={dirTienda.gps} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', backgroundColor: '#ffc107', color: '#212529', padding: '6px 10px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}>
                                                🗺️ GPS Tienda
                                            </a>
                                        ) : null}
                                    </div>

                                    <div style={{ backgroundColor: '#e2f3f5', border: '1px solid #17a2b8', padding: '10px', borderRadius: '8px', marginBottom: '12px', color: '#0c5460' }}>
                                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                                            🏠 2. Entrega (Cliente):
                                        </strong>
                                        <p style={{ margin: '2px 0', fontSize: '13px', fontWeight: 'bold' }}>{pedido.cliente || 'Cliente'}</p>
                                        <p style={{ margin: '2px 0', fontSize: '12px' }}>📞 {pedido.telefono || 'Sin teléfono'}</p>
                                        <p style={{ margin: '2px 0', fontSize: '12px' }}>📍 {dirCliente.texto}</p>

                                        {dirCliente.gps && esMiViaje && miUbicacion && clienteCoords ? (
                                            <a href={`https://www.google.com/maps/dir/?api=1&origin=${miUbicacion.lat},${miUbicacion.lon}&destination=${clienteCoords.lat},${clienteCoords.lon}&travelmode=driving`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '8px', backgroundColor: '#17a2b8', color: 'white', textAlign: 'center', padding: '8px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}>
                                                🗺️ Navegar al Cliente en Google Maps
                                            </a>
                                        ) : dirCliente.gps ? (
                                            <a href={dirCliente.gps} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', backgroundColor: '#17a2b8', color: 'white', padding: '6px 10px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}>
                                                🗺️ GPS Cliente
                                            </a>
                                        ) : null}
                                    </div>

                                    {/* 💬 CHAT EN VIVO CON EL CLIENTE */}
                                    {esMiViaje && (
                                        <div style={{ backgroundColor: '#111827', border: '1px solid #17a2b8', padding: '12px', borderRadius: '10px', marginBottom: '12px' }}>
                                            <strong style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#17a2b8' }}>
                                                💬 Chat en Vivo con el Cliente:
                                            </strong>

                                            <div style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: '#000', padding: '8px', borderRadius: '6px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {(() => {
                                                    let chatList = [];
                                                    try { chatList = typeof pedido.chat === 'string' ? JSON.parse(pedido.chat || '[]') : (pedido.chat || []); } catch(e) {}
                                                    if (chatList.length === 0) return <span style={{ fontSize: '11px', color: '#777', textAlign: 'center' }}>Sin mensajes aún</span>;
                                                    return chatList.map((m, idx) => (
                                                        <div key={idx} style={{ 
                                                            alignSelf: m.emisor === 'domiciliario' ? 'flex-end' : 'flex-start',
                                                            backgroundColor: m.emisor === 'domiciliario' ? '#17a2b8' : '#333',
                                                            color: 'white',
                                                            padding: '5px 10px',
                                                            borderRadius: '10px',
                                                            fontSize: '11px',
                                                            maxWidth: '85%'
                                                        }}>
                                                            <span style={{ fontSize: '9px', opacity: 0.8, display: 'block' }}>{m.emisor === 'domiciliario' ? 'Tú (Repartidor)' : 'Cliente'}</span>
                                                            {m.texto}
                                                        </div>
                                                    ));
                                                })()}
                                            </div>

                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                {["🛵 Ya voy en camino", "📍 A 2 min de llegar", "🏠 ¡Estoy afuera!", "🚨 Hay tráfico"].map((est, idx) => (
                                                    <button 
                                                        key={idx}
                                                        type="button"
                                                        onClick={async () => {
                                                            try {
                                                                await axios.post(`/api/pedidos/${pedido.id}/mensaje`, { emisor: 'domiciliario', texto: est });
                                                            } catch(e) { console.error(e); }
                                                        }}
                                                        style={{ backgroundColor: '#1f2937', color: '#fff', border: '1px solid #17a2b8', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                                                    >
                                                        {est}
                                                    </button>
                                                ))}
                                            </div>

                                            <form onSubmit={async (e) => {
                                                e.preventDefault();
                                                const text = e.target.msg.value.trim();
                                                if (!text) return;
                                                try {
                                                    await axios.post(`/api/pedidos/${pedido.id}/mensaje`, { emisor: 'domiciliario', texto: text });
                                                    e.target.reset();
                                                } catch(err) { console.error(err); }
                                            }} style={{ display: 'flex', gap: '6px' }}>
                                                <input type="text" name="msg" placeholder="Mensaje..." style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', fontSize: '11px' }} />
                                                <button type="submit" style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>Enviar</button>
                                            </form>
                                        </div>
                                    )}

                                    {esMiViaje ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <button onClick={() => cambiarEstado(pedido.id, 'entregado')} style={{ width: '100%', padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>✅ Entregado</button>
                                            
                                            {modalCancelacion !== pedido.id ? (
                                                <button onClick={() => setModalCancelacion(pedido.id)} style={{ width: '100%', padding: '8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>❌ No Entregado (Devolver)</button>
                                            ) : (
                                                <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '8px', border: '1px solid #ffeeba' }}>
                                                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: '#856404', fontSize: '12px' }}>Motivo de devolución:</p>
                                                    <select value={motivoSelect} onChange={e => setMotivoSelect(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}>
                                                        <option value="">Seleccione...</option>
                                                        <option value="Cliente no estaba en la dirección">Cliente no estaba</option>
                                                        <option value="Cliente no contestó">Cliente no contestó</option>
                                                        <option value="Otro">Otro</option>
                                                    </select>
                                                    {motivoSelect === 'Otro' && <input type="text" placeholder="Escribe el motivo..." value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }} />}
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button onClick={() => enviarNoEntregado(pedido.id)} style={{ flex: 1, padding: '8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>Confirmar</button>
                                                        <button onClick={() => setModalCancelacion(null)} style={{ flex: 1, padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <button onClick={() => cambiarEstado(pedido.id, 'llevando_tu_pedido')} style={{ width: '100%', padding: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>🛵 Aceptar y Llevar Pedido</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )})}
                </div>
            )}

            {/* 💰 PESTAÑA 2: BILLETERA, RECARGAS Y RESEÑAS */}
            {vistaActiva === 'billetera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div className="domi-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#28a745' }}>Recargar Saldo Prepago</h3>
                        <p style={{ fontSize: '12px', opacity: 0.7 }}>Transfiere a alguna de estas cuentas y envía tu comprobante.</p>
                        
                        {bancos.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                {bancos.map(b => (
                                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#e2f3f5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #17a2b8' }}>
                                        {b.imagen ? <img src={b.imagen} alt="" style={{ height: '30px', width: '30px', borderRadius: '4px', objectFit: 'contain' }} /> : <span>🏦</span>}
                                        <div style={{ fontSize: '12px', color: '#0c5460' }}>
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
                            <input type="text" placeholder="Número de Referencia" value={formRecarga.referencia} onChange={e => setFormRecarga({...formRecarga, referencia: e.target.value})} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                            <button type="submit" disabled={bancos.length === 0} style={{ padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px' }}>Enviar Comprobante</button>
                        </form>
                    </div>

                    <div className="domi-card" style={{ backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e0e0e0)', padding: '15px', borderRadius: '14px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#007bff' }}>Historial de Ganancias y Reseñas</h3>
                        {historialEntregas.length === 0 ? <p style={{ fontSize: '13px', opacity: 0.7 }}>Aún no has completado entregas.</p> : (
                            historialEntregas.slice(0, 15).map(p => {
                                const neto = Number(p.costo_domicilio) - Number(p.comision_cobrada || 0);
                                const tieneCalificacion = p.calificacion_domiciliario !== null && p.calificacion_domiciliario !== undefined;
                                return (
                                <div key={p.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <strong>Pedido #{p.id}</strong>
                                        <span style={{ color: '#28a745', fontWeight: 'bold' }}>Ganancia Neta: ${neto.toLocaleString()}</span>
                                    </div>
                                    <span style={{ opacity: 0.6, fontSize: '11px', display: 'block', marginBottom: '6px' }}>
                                        Costo Domicilio: ${Number(p.costo_domicilio).toLocaleString()} | Comisión Plt: -${Number(p.comision_cobrada || 0).toLocaleString()}
                                    </span>

                                    {/* ⭐ RESEÑA DEL CLIENTE AL REPARTIDOR */}
                                    <div className="domi-box-rating" style={{ backgroundColor: '#fff3cd', padding: '8px', borderRadius: '6px', border: '1px solid #ffeeba', color: '#856404' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 'bold', display: 'block' }}>
                                            ⭐ Calificación Recibida: {tieneCalificacion ? `${'⭐'.repeat(p.calificacion_domiciliario)} (${p.calificacion_domiciliario}/5)` : 'Sin calificar'}
                                        </span>
                                        {p.comentario_calificacion && (
                                            <p style={{ margin: '2px 0 0 0', fontStyle: 'italic', fontSize: '11px' }}>
                                                💬 "{p.comentario_calificacion}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )})
                        )}
                    </div>
                </div>
            )}

            {/* 📌 BARRA DE NAVEGACIÓN FLOTANTE INFERIOR (FLOATING DOCK DEDICADO AL REPARTIDOR) */}
            <div className="domi-dock" style={{
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
                <button 
                    onClick={() => setVistaActiva('pedidos')} 
                    style={{ 
                        flex: 1,
                        background: 'none', 
                        border: 'none', 
                        color: vistaActiva === 'pedidos' ? '#007bff' : 'inherit', 
                        opacity: vistaActiva === 'pedidos' ? 1 : 0.6,
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        padding: '4px 0',
                        cursor: 'pointer' 
                    }}
                >
                    <span style={{ fontSize: '20px', lineHeight: '1', marginBottom: '3px' }}>📦</span>
                    <span style={{ lineHeight: '1' }}>Entregas ({pedidosActivos.length})</span>
                </button>

                <button 
                    onClick={() => setVistaActiva('billetera')} 
                    style={{ 
                        flex: 1,
                        background: 'none', 
                        border: 'none', 
                        color: vistaActiva === 'billetera' ? '#007bff' : 'inherit', 
                        opacity: vistaActiva === 'billetera' ? 1 : 0.6,
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        padding: '4px 0',
                        cursor: 'pointer' 
                    }}
                >
                    <span style={{ fontSize: '20px', lineHeight: '1', marginBottom: '3px' }}>💰</span>
                    <span style={{ lineHeight: '1' }}>Billetera y Reseñas</span>
                </button>
            </div>

        </div>
    );
}

export default Domiciliario;
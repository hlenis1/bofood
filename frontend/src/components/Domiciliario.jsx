import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io('');

const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180); 
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
};

const obtenerDetalles = (d) => { 
    try { return JSON.parse(d); } catch (e) { return []; } 
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
            const yo = res.data.find(u => u.id === id);
            if (yo) setMiSaldo(Number(yo.saldo));
            
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
            setRecargas(res.data.filter(r => r.usuario_id === usuarioInfo?.id));
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

        cargarPedidos();

        // 🚀 OYENTES DE SOCKET EN TIEMPO REAL PARA EL DOMICILIARIO
        socket.on('nuevo_pedido', cargarPedidos);
        socket.on('estado_actualizado', (data) => {
            cargarPedidos();
            if (data.estado === 'listo_para_entrega') audioNuevoViaje.play().catch(e=>console.log(e));
        });
        socket.on('pedido_eliminado', cargarPedidos);
        socket.on('recarga_actualizada', manejarActualizacionesCuenta);
        socket.on('usuario_actualizado', manejarActualizacionesCuenta);
        socket.on('catalogo_actualizado', manejarActualizacionesCuenta);

        return () => {
            socket.off('nuevo_pedido', cargarPedidos); 
            socket.off('estado_actualizado'); 
            socket.off('pedido_eliminado', cargarPedidos);
            socket.off('recarga_actualizada', manejarActualizacionesCuenta);
            socket.off('usuario_actualizado', manejarActualizacionesCuenta);
            socket.off('catalogo_actualizado', manejarActualizacionesCuenta);
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [usuarioInfo]);

    useEffect(() => {
        if (!Array.isArray(pedidos)) return;
        const enCamino = pedidos.filter(p => p.estado === 'llevando_tu_pedido' && p.domiciliario_id === usuarioInfo?.id).map(p => p.id);
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

    const pedidosActivos = Array.isArray(pedidos) ? pedidos.filter(p => p.estado === 'listo_para_entrega' || (p.estado === 'llevando_tu_pedido' && p.domiciliario_id === usuarioInfo.id)) : [];
    const historialEntregas = Array.isArray(pedidos) ? pedidos.filter(p => p.estado === 'entregado' && p.domiciliario_id === usuarioInfo.id) : [];

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', backgroundColor: '#343a40', padding: '15px', borderRadius: '8px', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: '#e83e8c' }}>🛵 Repartidor</h2>
                    <button onClick={cerrarSesion} style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Salir</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#212529', padding: '10px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '16px' }}>Mi Billetera / Saldo:</span>
                    <strong style={{ fontSize: '22px', color: miSaldo < 2000 ? '#dc3545' : '#28a745' }}>${miSaldo.toLocaleString()}</strong>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button onClick={() => setVistaActiva('pedidos')} style={{ flex: 1, padding: '12px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'pedidos' ? '#007bff' : '#ddd', color: vistaActiva === 'pedidos' ? 'white' : '#333', cursor: 'pointer' }}>📦 Entregas Activas</button>
                <button onClick={() => setVistaActiva('billetera')} style={{ flex: 1, padding: '12px', fontWeight: 'bold', borderRadius: '5px', border: 'none', backgroundColor: vistaActiva === 'billetera' ? '#28a745' : '#ddd', color: vistaActiva === 'billetera' ? 'white' : '#333', cursor: 'pointer' }}>💰 Billetera y Ganancias</button>
            </div>

            {vistaActiva === 'billetera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3 style={{ marginTop: 0, color: '#28a745' }}>Recargar Saldo</h3>
                        <p style={{ fontSize: '14px', color: '#555' }}>Transfiere a alguna de estas cuentas y reporta tu comprobante.</p>
                        
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
                            <p style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px' }}>
                                ⚠️ El administrador aún no ha configurado cuentas para recibir pagos.
                            </p>
                        )}

                        <form onSubmit={solicitarRecarga} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <select value={formRecarga.banco_destino} onChange={e => setFormRecarga({...formRecarga, banco_destino: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #007bff', fontWeight: 'bold', color: '#007bff' }}>
                                <option value="">Selecciona a qué cuenta transferiste...</option>
                                {bancos.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
                            </select>
                            
                            <input type="number" placeholder="Monto transferido (Ej: 10000)" value={formRecarga.monto} onChange={e => setFormRecarga({...formRecarga, monto: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <input type="text" placeholder="Número de Referencia" value={formRecarga.referencia} onChange={e => setFormRecarga({...formRecarga, referencia: e.target.value})} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <button type="submit" disabled={bancos.length === 0} style={{ padding: '12px', backgroundColor: bancos.length > 0 ? '#28a745' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: bancos.length > 0 ? 'pointer' : 'not-allowed' }}>Enviar Comprobante</button>
                        </form>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3 style={{ marginTop: 0 }}>Mis Recargas Recientes</h3>
                        {recargas.length === 0 ? <p style={{ fontSize: '14px', color: '#666' }}>No tienes historial de recargas.</p> : (
                            recargas.slice(0, 5).map(r => (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '8px 0', fontSize: '14px' }}>
                                    <span>Ref: {r.referencia}</span>
                                    <strong>${Number(r.monto).toLocaleString()}</strong>
                                    <span style={{ color: r.estado === 'aprobada' ? '#28a745' : r.estado === 'rechazada' ? '#dc3545' : '#ffc107', fontWeight: 'bold' }}>{r.estado.toUpperCase()}</span>
                                </div>
                            ))
                        )}
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3 style={{ marginTop: 0, color: '#007bff' }}>Historial de Ganancias (Entregados)</h3>
                        {historialEntregas.length === 0 ? <p style={{ fontSize: '14px', color: '#666' }}>Aún no has entregado pedidos.</p> : (
                            historialEntregas.slice(0, 10).map(p => {
                                const neto = Number(p.costo_domicilio) - Number(p.comision_cobrada || 0);
                                return (
                                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #eee', padding: '10px 0', fontSize: '14px' }}>
                                    <strong>Pedido #{p.id} <span style={{ float: 'right', color: '#28a745' }}>Ganancia Neta: ${neto.toLocaleString()}</span></strong>
                                    <span style={{ color: '#666', fontSize: '12px' }}>
                                        Costo Domicilio: ${Number(p.costo_domicilio).toLocaleString()} | Comisión Plt: -${Number(p.comision_cobrada || 0).toLocaleString()}
                                    </span>
                                </div>
                            )})
                        )}
                    </div>
                </div>
            )}

            {vistaActiva === 'pedidos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {pedidosActivos.length === 0 && <p style={{ textAlign: 'center', color: '#666', marginTop: '30px' }}>No hay entregas pendientes.</p>}
                    
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
                        <div key={pedido.id} style={{ border: esMiViaje ? '2px solid #007bff' : '1px solid #ddd', borderRadius: '8px', backgroundColor: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                            <div 
                                onClick={() => togglePedido(pedido.id)} 
                                style={{ padding: '15px', backgroundColor: esMiViaje ? '#f0f7ff' : '#ffffff', cursor: 'pointer', borderBottom: estaExpandido ? '1px solid #eee' : 'none', userSelect: 'none' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>Pedido #{pedido.id}</h3>
                                        <p style={{ margin: '2px 0', color: '#555', fontSize: '14px' }}>
                                            Cobrar: <strong style={{ color: '#28a745', fontSize: '15px' }}>${Number(pedido.total || 0).toLocaleString()}</strong> ({pedido.metodo_pago ? pedido.metodo_pago.toUpperCase() : 'N/A'})
                                        </p>
                                        <p style={{ margin: '2px 0', color: '#17a2b8', fontSize: '13px', fontWeight: 'bold' }}>
                                            Domicilio: ${Number(pedido.costo_domicilio || 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <span style={{ backgroundColor: esMiViaje ? '#007bff' : '#6f42c1', color: 'white', padding: '5px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                                        {esMiViaje ? 'EN CAMINO 🛵' : 'LISTO PARA LLEVAR ⏱️'}
                                    </span>
                                </div>

                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#333' }}>
                                    <span>🏬 <strong>{pedido.tienda_nombre || 'Tienda'}</strong></span>
                                    <span style={{ color: '#888' }}>➔</span>
                                    <span>🏠 <strong>{pedido.cliente || 'Cliente'}</strong></span>
                                </div>

                                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#007bff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                    <span>{estaExpandido ? '▲ Ocultar detalles del pedido' : '▼ Ver detalles completos'}</span>
                                </div>
                            </div>

                            {estaExpandido && (
                                <div style={{ padding: '15px', backgroundColor: '#fafafa', borderTop: '1px solid #eee' }}>
                                    
                                    <div style={{ border: '1px solid #e9ecef', padding: '10px', borderRadius: '6px', marginBottom: '15px', backgroundColor: 'white' }}>
                                        <strong style={{ fontSize: '14px', color: '#333', display: 'block', marginBottom: '8px' }}>
                                            🛒 Productos ({detallesCarrito.reduce((acc, p) => acc + Number(p.cantidad || 1), 0)} ítems):
                                        </strong>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {detallesCarrito.length > 0 ? detallesCarrito.map((prod, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                                    <img src={prod.imagen || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500'} alt={prod.nombre} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }} />
                                                    <span><strong>{prod.cantidad || 1}x</strong> {prod.nombre}</span>
                                                </div>
                                            )) : <span style={{ color: '#999', fontStyle: 'italic', fontSize: '13px' }}>Sin detalles</span>}
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeeba', padding: '12px', borderRadius: '6px', marginBottom: '15px' }}>
                                        <strong style={{ color: '#856404', display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                                            🏬 1. Punto de Recogida (Tienda):
                                        </strong>
                                        <p style={{ margin: '2px 0', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                                            {pedido.tienda_nombre || 'Tienda / Vendedor Principal'}
                                        </p>
                                        <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>
                                            📞 Teléfono Tienda: {pedido.tienda_telefono || 'Sin teléfono'}
                                        </p>
                                        <p style={{ margin: '2px 0', fontSize: '13px', color: '#333' }}>
                                            📍 Dirección Tienda: {dirTienda.texto}
                                        </p>

                                        {dirTienda.gps && esMiViaje && miUbicacion && tiendaCoords ? (
                                            <a 
                                                href={`https://www.google.com/maps/dir/?api=1&origin=${miUbicacion.lat},${miUbicacion.lon}&destination=${tiendaCoords.lat},${tiendaCoords.lon}&travelmode=driving`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ display: 'block', marginTop: '10px', backgroundColor: '#ffc107', color: '#212529', textAlign: 'center', padding: '10px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}
                                            >
                                                🗺️ Iniciar Navegación en Google Maps (A la Tienda)
                                            </a>
                                        ) : dirTienda.gps ? (
                                            <a 
                                                href={dirTienda.gps} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ display: 'inline-block', marginTop: '8px', backgroundColor: '#ffc107', color: '#212529', padding: '8px 12px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}
                                            >
                                                🗺️ Abrir GPS Tienda en Maps
                                            </a>
                                        ) : (
                                            <span style={{ display: 'block', marginTop: '5px', color: '#dc3545', fontSize: '12px', fontWeight: 'bold' }}>
                                                ⚠️ La tienda no tiene registrada su ubicación GPS.
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ backgroundColor: '#e9ecef', border: '1px solid #dee2e6', padding: '12px', borderRadius: '6px', marginBottom: '15px' }}>
                                        <strong style={{ color: '#0c5460', display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                                            🏠 2. Punto de Entrega (Cliente):
                                        </strong>
                                        <p style={{ margin: '2px 0', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                                            {pedido.cliente || 'Cliente Desconocido'}
                                        </p>
                                        <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>
                                            📞 Teléfono Cliente: {pedido.telefono || 'Sin teléfono'}
                                        </p>
                                        <p style={{ margin: '2px 0', fontSize: '13px', color: '#333' }}>
                                            📍 Dirección Cliente: {dirCliente.texto}
                                        </p>

                                        {dirCliente.gps && esMiViaje && miUbicacion && clienteCoords ? (
                                            <a 
                                                href={`https://www.google.com/maps/dir/?api=1&origin=${miUbicacion.lat},${miUbicacion.lon}&destination=${clienteCoords.lat},${clienteCoords.lon}&travelmode=driving`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ display: 'block', marginTop: '10px', backgroundColor: '#17a2b8', color: 'white', textAlign: 'center', padding: '10px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}
                                            >
                                                🗺️ Iniciar Navegación en Google Maps (Cliente)
                                            </a>
                                        ) : dirCliente.gps ? (
                                            <a 
                                                href={dirCliente.gps} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ display: 'inline-block', marginTop: '8px', backgroundColor: '#17a2b8', color: 'white', padding: '8px 12px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '12px' }}
                                            >
                                                🗺️ Abrir GPS Cliente en Maps
                                            </a>
                                        ) : (
                                            <span style={{ display: 'block', marginTop: '5px', color: '#dc3545', fontSize: '12px', fontWeight: 'bold' }}>
                                                ⚠️ El cliente no registró GPS.
                                            </span>
                                        )}
                                    </div>

                                    {esMiViaje && clienteCoords && miUbicacion && (
                                        <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#e2f3f5', borderRadius: '6px', border: '1px solid #17a2b8' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
                                                <span style={{ fontSize: '24px' }}>🛵</span>
                                                <div style={{ flex: 1, height: '6px', backgroundColor: '#17a2b8', borderRadius: '3px', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #17a2b8', color: '#17a2b8' }}>
                                                        {distanciaKm.toFixed(1)} km
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '24px' }}>🏠</span>
                                            </div>
                                            <p style={{ margin: 0, textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#0c5460' }}>
                                                ⏳ Tiempo de llegada estimado al cliente: {tiempoMinutos} min
                                            </p>
                                        </div>
                                    )}

                                    {dirCliente.gps && esMiViaje && !miUbicacion && (
                                        <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#17a2b8', fontSize: '13px', margin: '10px 0' }}>
                                            📡 Conectando antena GPS para calcular distancia...
                                        </p>
                                    )}

                                    {esMiViaje ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <button onClick={() => cambiarEstado(pedido.id, 'entregado')} style={{ width: '100%', padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>✅ Entregado (Se descontará comisión)</button>
                                            
                                            {modalCancelacion !== pedido.id ? (
                                                <button onClick={() => setModalCancelacion(pedido.id)} style={{ width: '100%', padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>❌ No Entregado (Devolver)</button>
                                            ) : (
                                                <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '6px', border: '1px solid #ffeeba' }}>
                                                    <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#856404' }}>Motivo de devolución:</p>
                                                    <select value={motivoSelect} onChange={e => setMotivoSelect(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                                                        <option value="">Seleccione...</option>
                                                        <option value="Cliente no estaba en la dirección">Cliente no estaba en la dirección</option>
                                                        <option value="Cliente no contestó">Cliente no contestó</option>
                                                        <option value="Otro">Otro</option>
                                                    </select>
                                                    {motivoSelect === 'Otro' && <input type="text" placeholder="Escribe el motivo..." value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />}
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <button onClick={() => enviarNoEntregado(pedido.id)} style={{ flex: 1, padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Confirmar</button>
                                                        <button onClick={() => setModalCancelacion(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <button onClick={() => cambiarEstado(pedido.id, 'llevando_tu_pedido')} style={{ width: '100%', padding: '15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>🛵 Aceptar y Llevar Pedido</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )})}
                </div>
            )}
        </div>
    );
}

export default Domiciliario;
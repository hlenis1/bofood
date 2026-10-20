import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { BotonModoOscuro } from './BotonModoOscuro';

const API_URL = '';
const socket = io(API_URL);

// 🎨 LOGOS E IMÁGENES POR DEFECTO
const LOGO_DEFAULT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23007bff'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='45' fill='white'%3E🏪%3C/text%3E%3C/svg%3E";
const PROD_DEFAULT = "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500";

const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180); 
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
};

const parseDireccion = (dirRaw) => {
    if (!dirRaw) return { texto: 'Sin dirección registrada', gps: null };
    if (String(dirRaw).includes(' |GPS| ')) return { texto: String(dirRaw).split(' |GPS| ')[0], gps: String(dirRaw).split(' |GPS| ')[1] };
    if (String(dirRaw).startsWith('http')) return { texto: 'Ubicación GPS', gps: dirRaw };
    return { texto: dirRaw, gps: null };
};

const extraerCoordsDeLink = (link) => {
    if (!link) return null; 
    const match = String(link).match(/\?q=([^,]+),([^&]+)/);
    return match ? { lat: parseFloat(match[1]), lon: parseFloat(match[2]) } : null;
};

function Tienda() {
    const [usuarioInfo, setUsuarioInfo] = useState(null);
    const [productos, setProductos] = useState([]);
    const [tiendas, setTiendas] = useState([]);
    const [tiendaSeleccionada, setTiendaSeleccionada] = useState(null);

    // 📱 PESTAÑA ACTIVA: 'tiendas' | 'carrito' | 'seguimiento' | 'historial'
    const [vistaActiva, setVistaActiva] = useState('tiendas');

    const [carrito, setCarrito] = useState([]);
    const [misPedidos, setMisPedidos] = useState([]);
    const [metodoPago, setMetodoPago] = useState('efectivo'); 
    const [referenciaPago, setReferenciaPago] = useState(''); 
    const [cantidades, setCantidades] = useState({});
    const [gpsDomiciliario, setGpsDomiciliario] = useState({});
    
    const [bancos, setBancos] = useState([]);
    const [miUbicacionCliente, setMiUbicacionCliente] = useState(null);
    const watchClienteRef = useRef(null);

    const navigate = useNavigate();
    
    const [direccionManual, setDireccionManual] = useState('');
    const [linkGPS, setLinkGPS] = useState('');
    const [costoDomicilio, setCostoDomicilio] = useState(4000);
    const [ubicacionPanaderia, setUbicacionPanaderia] = useState({ lat: 3.261200, lon: -76.539300 });
    const [esEmpresa, setEsEmpresa] = useState(false);

    useEffect(() => {
        const infoStr = localStorage.getItem('usuario');
        if (!infoStr) return navigate('/login');
        try {
            const info = JSON.parse(infoStr);
            if (String(info.rol || '').trim().toLowerCase() !== 'cliente') return navigate('/login');
            
            setUsuarioInfo(info);
            const esEmpresaStatus = info.es_empresa === 1 || info.es_empresa === true;
            setEsEmpresa(esEmpresaStatus); 
            setCostoDomicilio(esEmpresaStatus ? 0 : 4000);
            
            const dirTexto = (info.direccion || '').split(' |GPS| ')[0] || '';
            const dirGps = (info.direccion || '').split(' |GPS| ')[1] || '';
            setDireccionManual(dirTexto); 
            setLinkGPS(dirGps);
        } catch (e) { 
            navigate('/login'); 
        }
    }, [navigate]);

    useEffect(() => {
        if (!usuarioInfo) return;

        const cargarDatos = async () => {
            try {
                const [resTiendas, resProds, resPedidos, resConfig, resBancos] = await Promise.all([
                    axios.get(`${API_URL}/api/tiendas`),
                    axios.get(`${API_URL}/api/productos`),
                    axios.get(`${API_URL}/api/pedidos/cliente/${usuarioInfo.id}`),
                    axios.get(`${API_URL}/api/config-admin`),
                    axios.get(`${API_URL}/api/bancos`)
                ]);

                let listaTiendas = resTiendas.data || [];
                const existeAdminStore = listaTiendas.some(t => t.es_principal || t.rol === 'admin' || Number(t.usuario_id) === 1);
                if (!existeAdminStore) {
                    listaTiendas = [
                        {
                            usuario_id: 1,
                            nombre: 'Tienda Principal',
                            descripcion: 'Productos oficiales del establecimiento',
                            logo_url: null,
                            es_principal: true,
                            abierta: 1
                        },
                        ...listaTiendas
                    ];
                }

                setTiendas(listaTiendas);
                setProductos(resProds.data || []);
                setMisPedidos(resPedidos.data || []);
                
                if (resConfig.data?.latitud) {
                    setUbicacionPanaderia({ lat: resConfig.data.latitud, lon: resConfig.data.longitud });
                }

                setBancos(resBancos.data || []);
                if (resBancos.data && resBancos.data.length > 0) {
                    setMetodoPago(resBancos.data[0].nombre);
                } else {
                    setMetodoPago('efectivo');
                }
            } catch (err) {
                console.error("Error al cargar datos:", err);
            }
        };

        cargarDatos();

        socket.on('catalogo_actualizado', cargarDatos);
        socket.on('estado_actualizado', (data) => 
            setMisPedidos(prev => prev.map(p => p.id === data.id ? { ...p, estado: data.estado, estado_pago: data.estado_pago || p.estado_pago, motivo_cancelacion: data.motivo_cancelacion } : p))
        );
        socket.on('pedido_eliminado', (id) => setMisPedidos(prev => prev.filter(p => p.id !== Number(id))));
        socket.on('ubicacion_domiciliario', (data) => setGpsDomiciliario(prev => ({ ...prev, [data.pedidoId]: { lat: data.lat, lon: data.lon } })));
        socket.on('nuevo_mensaje_pedido', ({ pedidoId, chatCompleto }) => {
            setMisPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, chat: JSON.stringify(chatCompleto) } : p));
        });

        return () => { 
            socket.off('catalogo_actualizado'); 
            socket.off('estado_actualizado'); 
            socket.off('pedido_eliminado'); 
            socket.off('ubicacion_domiciliario'); 
            socket.off('nuevo_mensaje_pedido');
        };
    }, [usuarioInfo]);

    useEffect(() => {
        const enCamino = misPedidos.some(p => p.estado === 'llevando_tu_pedido');
        if (enCamino && !watchClienteRef.current && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => setMiUbicacionCliente({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => {});
            watchClienteRef.current = navigator.geolocation.watchPosition((pos) => setMiUbicacionCliente({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => {}, { enableHighAccuracy: true, maximumAge: 0 });
        } else if (!enCamino && watchClienteRef.current) {
            navigator.geolocation.clearWatch(watchClienteRef.current); 
            watchClienteRef.current = null; 
            setMiUbicacionCliente(null);
        }
        return () => { if (watchClienteRef.current) navigator.geolocation.clearWatch(watchClienteRef.current); };
    }, [misPedidos]);

    const handleCantidadChange = (id, valor) => { 
        const cant = parseInt(valor); 
        setCantidades(prev => ({ ...prev, [id]: cant > 0 ? cant : 1 })); 
    };

    const esTiendaAbierta = (t) => {
        if (!t) return true;
        return t.abierta !== 0 && t.abierta !== false && t.abierta !== '0';
    };

    const agregarAlCarrito = (producto) => {
        if (tiendaSeleccionada && !esTiendaAbierta(tiendaSeleccionada)) {
            return alert('🔴 La tienda se encuentra CERRADA en este momento.');
        }
        const cant = cantidades[producto.id] || 1;
        const existe = carrito.find(item => item.id === producto.id);
        if (existe) {
            setCarrito(carrito.map(item => item.id === producto.id ? { ...item, cantidad: item.cantidad + cant, subtotal: (item.cantidad + cant) * item.precio } : item));
        } else {
            setCarrito([...carrito, { ...producto, cantidad: cant, subtotal: cant * Number(producto.precio) }]);
        }
        setCantidades(prev => ({ ...prev, [producto.id]: 1 }));
    };
    
    const eliminarDelCarrito = (id) => setCarrito(carrito.filter(item => item.id !== id));
    
    const subtotalCarrito = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const totalFinal = subtotalCarrito + costoDomicilio;

    const obtenerUbicacion = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const latCliente = pos.coords.latitude; 
                    const lonCliente = pos.coords.longitude;
                    setLinkGPS(`https://maps.google.com/?q=${latCliente},${lonCliente}`);
                    const distanciaKm = calcularDistancia(ubicacionPanaderia.lat, ubicacionPanaderia.lon, latCliente, lonCliente);
                    let tarifa = esEmpresa ? 0 : (distanciaKm <= 2 ? 4000 : distanciaKm <= 4 ? 6000 : distanciaKm <= 10 ? 10000 : 15000);
                    alert(esEmpresa ? `¡GPS capturado!\n🏢 Cliente EMPRESA: Envío gratuito.` : `¡GPS capturado!\nEstás a ${distanciaKm.toFixed(1)} km.\nDomicilio: $${tarifa.toLocaleString()}`);
                    setCostoDomicilio(tarifa);
                }, () => alert("Error al capturar GPS.")
            );
        } else alert("Navegador sin soporte de geolocalización.");
    };

    const hacerPedido = async () => {
        if (carrito.length === 0) return alert('El carrito está vacío');
        if (tiendaSeleccionada && !esTiendaAbierta(tiendaSeleccionada)) {
            return alert('🔴 La tienda seleccionada está CERRADA.');
        }
        let direccionFinal = linkGPS ? `${direccionManual} |GPS| ${linkGPS}` : direccionManual;
        if (!direccionFinal.trim()) return alert('Por favor ingresa tu dirección.');

        if (metodoPago !== 'efectivo' && !referenciaPago.trim()) {
            return alert('Por favor ingresa el número de comprobante/referencia.');
        }

        try {
            await axios.put(`${API_URL}/api/usuarios/${usuarioInfo.id}/direccion`, { direccion: direccionFinal });
            localStorage.setItem('usuario', JSON.stringify({ ...usuarioInfo, direccion: direccionFinal }));

            await axios.post(`${API_URL}/api/pedidos`, { 
                usuario_id: usuarioInfo.id, 
                vendedor_id: tiendaSeleccionada?.usuario_id || null,
                total: totalFinal, 
                costo_domicilio: costoDomicilio,
                metodo_pago: metodoPago, 
                banco_destino: metodoPago !== 'efectivo' ? metodoPago : 'Efectivo',
                referencia_pago: referenciaPago,
                detalles: JSON.stringify(carrito) 
            });
            
            alert('🚀 ¡Pedido enviado exitosamente!'); 
            setCarrito([]); 
            setReferenciaPago('');
            setVistaActiva('seguimiento'); 

            axios.get(`${API_URL}/api/pedidos/cliente/${usuarioInfo.id}`).then(res => setMisPedidos(res.data));
        } catch (error) { 
            alert('Error al procesar el pedido'); 
        }
    };

    if (!usuarioInfo) return null;

    const bancoSeleccionado = bancos.find(b => b.nombre === metodoPago);

    const productosDeTienda = tiendaSeleccionada 
        ? productos.filter(p => {
            const prodVendedorId = p.vendedor_id ? Number(p.vendedor_id) : null;
            const tiendaId = tiendaSeleccionada.usuario_id ? Number(tiendaSeleccionada.usuario_id) : null;

            if (tiendaSeleccionada.es_principal || tiendaSeleccionada.rol === 'admin' || tiendaId === 1) {
                return prodVendedorId === tiendaId || prodVendedorId === null || prodVendedorId === 0;
            }
            return prodVendedorId === tiendaId;
        })
        : [];

    const pedidosActivos = misPedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado' && p.estado !== 'cancelado_devuelto');
    const historialPedidos = misPedidos.filter(p => p.estado === 'entregado' || p.estado === 'cancelado' || p.estado === 'cancelado_devuelto');

    return (
        <div style={{ padding: '15px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto', paddingBottom: '120px', minHeight: '100vh' }}>
            
            {/* 📌 ENCABEZADO SUPERIOR FIJO (STICKY HEADER) */}
            <div style={{ 
                position: 'sticky', 
                top: 0, 
                zIndex: 900, 
                backgroundColor: '#1a1a2e', 
                padding: '12px 15px', 
                marginTop: '-15px', 
                marginLeft: '-15px', 
                marginRight: '-15px', 
                marginBottom: '20px', 
                borderBottom: '1px solid #333', 
                display: 'flex', 
                justify: 'space-between', 
                alignItems: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#ffffff' }}>Hola, {usuarioInfo.nombre} 🥐</h3>
                    {esEmpresa && <span style={{ fontSize: '12px', color: '#17a2b8', fontWeight: 'bold' }}>🏢 Cuenta Empresa</span>}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <BotonModoOscuro />
                    <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Salir</button>
                </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* VISTA 1: TIENDAS Y PRODUCTOS */}
            {/* ------------------------------------------------------------- */}
            {vistaActiva === 'tiendas' && (
                <div>
                    {!tiendaSeleccionada ? (
                        <div>
                            <h3 style={{ marginTop: 0 }}>🏪 Selecciona una Tienda</h3>
                            {tiendas.length === 0 ? (
                                <p style={{ color: '#777' }}>No hay tiendas disponibles por el momento.</p>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
                                    {tiendas.map(tienda => {
                                        const dirTienda = parseDireccion(tienda.direccion);
                                        const estaAbierta = esTiendaAbierta(tienda);
                                        return (
                                            <div 
                                                key={tienda.usuario_id || tienda.nombre} 
                                                onClick={() => {
                                                    setTiendaSeleccionada(tienda);
                                                    if (!estaAbierta) alert(`🔴 La tienda "${tienda.nombre}" está CERRADA.`);
                                                }}
                                                style={{ 
                                                    border: estaAbierta ? '1px solid #444' : '2px solid #dc3545', 
                                                    padding: '15px', 
                                                    borderRadius: '12px', 
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    opacity: estaAbierta ? 1 : 0.75,
                                                    position: 'relative'
                                                }}
                                            >
                                                {!estaAbierta && (
                                                    <span style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#dc3545', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                                        🔴 CERRADO
                                                    </span>
                                                )}

                                                <img 
                                                    src={tienda.logo_url ? `${API_URL}${tienda.logo_url}` : LOGO_DEFAULT} 
                                                    alt={tienda.nombre} 
                                                    onError={(e) => { e.target.onerror = null; e.target.src = LOGO_DEFAULT; }}
                                                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '50%', marginBottom: '10px', border: estaAbierta ? '2px solid #007bff' : '2px solid #dc3545' }} 
                                                />
                                                <h4 style={{ margin: '5px 0' }}>{tienda.nombre}</h4>
                                                <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#888', height: '32px', overflow: 'hidden' }}>{tienda.descripcion || 'Sin descripción'}</p>
                                                <p style={{ margin: '2px 0 10px 0', fontSize: '11px' }}>📍 {dirTienda.texto}</p>

                                                <button style={{ width: '100%', padding: '8px', backgroundColor: estaAbierta ? '#007bff' : '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                    {estaAbierta ? 'Entrar a la tienda' : 'Ver catálogo (Cerrado)'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <button 
                                onClick={() => setTiendaSeleccionada(null)} 
                                style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px' }}
                            >
                                ← Volver a las Tiendas
                            </button>

                            {!esTiendaAbierta(tiendaSeleccionada) && (
                                <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontWeight: 'bold', textAlign: 'center' }}>
                                    🔴 ESTA TIENDA ESTÁ CERRADA EN ESTE MOMENTO.
                                </div>
                            )}

                            {(() => {
                                const dirTienda = parseDireccion(tiendaSeleccionada.direccion);
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #444' }}>
                                        <img 
                                            src={tiendaSeleccionada.logo_url ? `${API_URL}${tiendaSeleccionada.logo_url}` : LOGO_DEFAULT} 
                                            alt="Logo Tienda" 
                                            onError={(e) => { e.target.onerror = null; e.target.src = LOGO_DEFAULT; }}
                                            style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} 
                                        />
                                        <div>
                                            <h3 style={{ margin: 0 }}>{tiendaSeleccionada.nombre} {!esTiendaAbierta(tiendaSeleccionada) && <span style={{ color: '#dc3545', fontSize: '14px' }}>(🔴 Cerrado)</span>}</h3>
                                            <p style={{ margin: '2px 0', fontSize: '13px', color: '#aaa' }}>{tiendaSeleccionada.descripcion}</p>
                                            <p style={{ margin: '2px 0', fontSize: '12px' }}>📍 <strong>Dirección:</strong> {dirTienda.texto}</p>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' }}>
                                {productosDeTienda.length > 0 ? (
                                    productosDeTienda.map(prod => {
                                        const estaDisponible = prod.disponible && esTiendaAbierta(tiendaSeleccionada);
                                        return (
                                            <div key={prod.id} style={{ opacity: estaDisponible ? 1 : 0.6, border: '1px solid #444', padding: '12px', borderRadius: '8px' }}>
                                                <img 
                                                    src={prod.imagen ? `${API_URL}${prod.imagen}` : PROD_DEFAULT} 
                                                    alt={prod.nombre} 
                                                    onError={(e) => { e.target.onerror = null; e.target.src = PROD_DEFAULT; }}
                                                    style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} 
                                                />
                                                <h4 style={{ margin: '0 0 5px 0' }}>{prod.nombre}</h4>
                                                <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: estaDisponible ? '#28a745' : '#dc3545', fontSize: '16px' }}>
                                                    {estaDisponible ? `$${Number(prod.precio).toLocaleString()}` : !prod.disponible ? 'AGOTADO' : 'CERRADO'}
                                                </p>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <input type="number" min="1" value={cantidades[prod.id] || 1} onChange={(e) => handleCantidadChange(prod.id, e.target.value)} disabled={!estaDisponible} style={{ width: '45px', padding: '6px', borderRadius: '4px', border: '1px solid #666', textAlign: 'center' }} />
                                                    <button onClick={() => agregarAlCarrito(prod)} disabled={!estaDisponible} style={{ flex: 1, padding: '8px', backgroundColor: estaDisponible ? '#007bff' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: estaDisponible ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px' }}>
                                                        {estaDisponible ? 'Agregar' : 'N/A'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p style={{ gridColumn: '1 / -1', color: '#888', textAlign: 'center', padding: '20px' }}>Esta tienda aún no tiene productos disponibles.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VISTA 2: CARRITO DE COMPRAS Y PROCESO DE PAGO */}
            {/* ------------------------------------------------------------- */}
            {vistaActiva === 'carrito' && (
                <div>
                    <h3 style={{ marginTop: 0 }}>🛒 Tu Carrito de Compras</h3>
                    {carrito.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px' }}>
                            <span style={{ fontSize: '50px', display: 'block', marginBottom: '10px' }}>🛒</span>
                            <p style={{ color: '#888' }}>Tu carrito está vacío.</p>
                            <button onClick={() => setVistaActiva('tiendas')} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Explorar Tiendas</button>
                        </div>
                    ) : (
                        <div>
                            {carrito.map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #444', borderRadius: '8px', marginBottom: '10px' }}>
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '15px' }}>{item.cantidad}x {item.nombre}</strong>
                                        <span style={{ fontSize: '13px', color: '#17a2b8' }}>${item.subtotal.toLocaleString()}</span>
                                    </div>
                                    <button onClick={() => eliminarDelCarrito(item.id)} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer' }}>❌</button>
                                </div>
                            ))}

                            <div style={{ borderTop: '2px solid #444', paddingTop: '15px', marginTop: '15px' }}>
                                <p style={{ margin: '5px 0' }}>Subtotal: <strong style={{ float: 'right' }}>${subtotalCarrito.toLocaleString()}</strong></p>
                                <p style={{ margin: '5px 0', color: '#17a2b8' }}>Domicilio: <strong style={{ float: 'right' }}>${costoDomicilio.toLocaleString()}</strong></p>
                                <h3 style={{ margin: '10px 0', color: '#28a745', fontSize: '20px' }}>Total a Pagar: <span style={{ float: 'right' }}>${totalFinal.toLocaleString()}</span></h3>
                            </div>

                            <div style={{ padding: '15px', borderRadius: '8px', marginBottom: '15px', marginTop: '15px', border: '1px solid #444' }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>📍 Destino de entrega:</strong>
                                <textarea value={direccionManual} onChange={(e) => {setDireccionManual(e.target.value); if(!e.target.value.startsWith('http')) setCostoDomicilio(esEmpresa?0:4000);}} placeholder={esEmpresa ? "Detalles de entrega..." : "Detalles de entrega (Tarifa base $4,000)"} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #666', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box' }} />
                                
                                {linkGPS ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#d4edda', padding: '10px', borderRadius: '6px', marginTop: '10px' }}><span style={{ color: '#155724', fontWeight: 'bold' }}>✅ GPS Añadido</span><button onClick={() => {setLinkGPS(''); setCostoDomicilio(esEmpresa?0:4000);}} style={{ background: 'none', border: 'none', color: '#721c24', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>Quitar</button></div>
                                ) : (
                                    <button onClick={obtenerUbicacion} style={{ width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🗺️ Adjuntar mi GPS</button>
                                )}
                            </div>

                            <strong style={{ display: 'block', marginBottom: '8px' }}>💳 Método de Pago:</strong>
                            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ padding: '10px', width: '100%', marginBottom: '15px', borderRadius: '6px', border: '1px solid #007bff', fontWeight: 'bold', color: '#007bff' }}>
                                {bancos.map(b => (
                                    <option key={b.id} value={b.nombre}>Pago con {b.nombre}</option>
                                ))}
                                <option value="efectivo">Pago en Efectivo</option>
                            </select>

                            {metodoPago !== 'efectivo' && bancoSeleccionado && (
                                <div style={{ backgroundColor: '#e2f3f5', padding: '12px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #17a2b8' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                                        {bancoSeleccionado.imagen ? (
                                            <img src={bancoSeleccionado.imagen} alt="Banco" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'contain', backgroundColor: 'white', padding: '2px' }} />
                                        ) : (
                                            <span style={{ fontSize: '25px' }}>🏦</span>
                                        )}
                                        <div>
                                            <span style={{ display: 'block', fontSize: '13px', color: '#0c5460' }}>Transfiere a <strong>{bancoSeleccionado.nombre}</strong>:</span>
                                            <strong style={{ fontSize: '16px', color: '#0c5460' }}>{bancoSeleccionado.numero}</strong>
                                        </div>
                                    </div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#0c5460', marginBottom: '4px' }}>
                                        Nº de Referencia / Comprobante:
                                    </label>
                                    <input 
                                        type="text" 
                                        value={referenciaPago} 
                                        onChange={(e) => setReferenciaPago(e.target.value)} 
                                        placeholder="Ej: 123456789" 
                                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #17a2b8', boxSizing: 'border-box' }} 
                                    />
                                </div>
                            )}

                            <button onClick={hacerPedido} style={{ width: '100%', padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>Confirmar Pedido (${totalFinal.toLocaleString()})</button>
                        </div>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VISTA 3: SEGUIMIENTO EN TIEMPO REAL (PEDIDOS ACTIVOS) */}
            {/* ------------------------------------------------------------- */}
            {vistaActiva === 'seguimiento' && (
                <div>
                    <h3 style={{ marginTop: 0 }}>🛵 Seguimiento de Pedidos en Curso</h3>
                    {pedidosActivos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px' }}>
                            <span style={{ fontSize: '50px', display: 'block', marginBottom: '10px' }}>📦</span>
                            <p style={{ color: '#888' }}>No tienes pedidos activos en este momento.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {pedidosActivos.map(pedido => {
                                const dir = parseDireccion(pedido.direccion);
                                const enRuta = pedido.estado === 'llevando_tu_pedido';
                                const coordsRepartidor = gpsDomiciliario[pedido.id];
                                const destinoFinal = miUbicacionCliente || extraerCoordsDeLink(dir.gps);

                                let distanciaKm = 0; 
                                let tiempoMinutos = 0;
                                if (enRuta && coordsRepartidor && destinoFinal) {
                                    distanciaKm = calcularDistancia(coordsRepartidor.lat, coordsRepartidor.lon, destinoFinal.lat, destinoFinal.lon);
                                    tiempoMinutos = Math.max(1, Math.round(distanciaKm * 2)); 
                                }

                                return (
                                    <div key={pedido.id} style={{ padding: '15px', border: enRuta ? '2px solid #007bff' : '1px solid #444', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ fontSize: '16px' }}>Pedido #{pedido.id}</strong>
                                            <span style={{ fontSize: '12px', color: '#888' }}>{new Date(pedido.fecha_creacion).toLocaleTimeString()}</span>
                                        </div>

                                        <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                                            Total: <strong>${Number(pedido.total).toLocaleString()}</strong> | Pago: <strong style={{ color: '#007bff' }}>{pedido.metodo_pago.toUpperCase()}</strong>
                                        </p>

                                        {enRuta && (
                                            <div style={{ marginTop: '15px', backgroundColor: '#e2f3f5', padding: '12px', borderRadius: '8px', border: '1px solid #17a2b8' }}>
                                                <p style={{ margin: '0 0 10px 0', color: '#0c5460', fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>🛵 ¡Tu domiciliario está en camino!</p>
                                                {coordsRepartidor && destinoFinal ? (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
                                                            <span style={{ fontSize: '20px' }}>🛵</span>
                                                            <div style={{ flex: 1, height: '6px', backgroundColor: '#17a2b8', borderRadius: '3px', position: 'relative' }}>
                                                                <div style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #17a2b8', color: '#17a2b8' }}>{distanciaKm.toFixed(1)} km</div>
                                                            </div>
                                                            <span style={{ fontSize: '20px' }}>🏠</span>
                                                        </div>
                                                        <p style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#0c5460' }}>⏳ Llegada estimada: {tiempoMinutos} min</p>
                                                        <a href={`https://www.google.com/maps/dir/?api=1&origin=${coordsRepartidor.lat},${coordsRepartidor.lon}&destination=${destinoFinal.lat},${destinoFinal.lon}&travelmode=driving`} target="_blank" rel="noreferrer" style={{ display: 'block', backgroundColor: '#17a2b8', color: 'white', padding: '8px 12px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>🗺️ Abrir mapa en tiempo real</a>
                                                    </>
                                                ) : (
                                                    <p style={{ margin: 0, textAlign: 'center', fontSize: '13px', color: '#17a2b8', fontWeight: 'bold' }}>📡 Ubicando repartidor...</p>
                                                )}

                                                {/* 💬 SECCIÓN CHAT Y ESTADOS RÁPIDOS CLIENTE */}
                                                <div style={{ marginTop: '12px', borderTop: '1px solid #bce5eb', paddingTop: '10px' }}>
                                                    <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#0c5460' }}>
                                                        💬 Mensajes y Estados con el Repartidor:
                                                    </strong>

                                                    <div style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: '#ffffff', padding: '8px', borderRadius: '6px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '5px', border: '1px solid #bce5eb' }}>
                                                        {(() => {
                                                            let chatList = [];
                                                            try { chatList = typeof pedido.chat === 'string' ? JSON.parse(pedido.chat || '[]') : (pedido.chat || []); } catch(e) {}
                                                            if (chatList.length === 0) return <span style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>Sin mensajes aún</span>;
                                                            return chatList.map((m, idx) => (
                                                                <div key={idx} style={{ 
                                                                    alignSelf: m.emisor === 'cliente' ? 'flex-end' : 'flex-start',
                                                                    backgroundColor: m.emisor === 'cliente' ? '#007bff' : '#6c757d',
                                                                    color: 'white',
                                                                    padding: '5px 10px',
                                                                    borderRadius: '10px',
                                                                    fontSize: '11px',
                                                                    maxWidth: '85%'
                                                                }}>
                                                                    <span style={{ fontSize: '9px', opacity: 0.8, display: 'block' }}>{m.emisor === 'cliente' ? 'Tú' : 'Repartidor'}</span>
                                                                    {m.texto}
                                                                </div>
                                                            ));
                                                        })()}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                        {["👋 ¡Te espero abajo!", "🔑 Ya salgo", "⌛ 2 minutos porfa", "🚪 Dejar en portería"].map((est, idx) => (
                                                            <button 
                                                                key={idx}
                                                                onClick={async () => {
                                                                    await axios.post(`${API_URL}/api/pedidos/${pedido.id}/mensaje`, { emisor: 'cliente', texto: est });
                                                                }}
                                                                style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                                                            >
                                                                {est}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    <form onSubmit={async (e) => {
                                                        e.preventDefault();
                                                        const text = e.target.msg.value.trim();
                                                        if (!text) return;
                                                        await axios.post(`${API_URL}/api/pedidos/${pedido.id}/mensaje`, { emisor: 'cliente', texto: text });
                                                        e.target.reset();
                                                    }} style={{ display: 'flex', gap: '5px' }}>
                                                        <input type="text" name="msg" placeholder="Escribe al repartidor..." style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #17a2b8', fontSize: '11px' }} />
                                                        <button type="submit" style={{ backgroundColor: '#007bff', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>Enviar</button>
                                                    </form>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ marginTop: '12px', backgroundColor: enRuta ? '#007bff' : '#6c757d', color: 'white', padding: '6px 15px', borderRadius: '20px', fontWeight: 'bold', textAlign: 'center', fontSize: '12px', width: 'fit-content' }}>
                                            {pedido.estado.replace('_', ' ').toUpperCase()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VISTA 4: HISTORIAL DE COMPRAS */}
            {/* ------------------------------------------------------------- */}
            {vistaActiva === 'historial' && (
                <div>
                    <h3 style={{ marginTop: 0 }}>📜 Historial de Compras</h3>
                    {historialPedidos.length === 0 ? (
                        <p style={{ color: '#888', textAlign: 'center', padding: '30px' }}>Aún no tienes compras finalizadas.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {historialPedidos.map(pedido => {
                                const cancelado = pedido.estado === 'cancelado' || pedido.estado === 'cancelado_devuelto';
                                return (
                                    <div key={pedido.id} style={{ padding: '12px', border: cancelado ? '1px solid #dc3545' : '1px solid #444', borderRadius: '8px', opacity: 0.9 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <strong>Pedido #{pedido.id}</strong>
                                            <span style={{ fontSize: '12px', color: '#888' }}>{new Date(pedido.fecha_creacion).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ margin: '5px 0 0 0', fontSize: '13px' }}>
                                            Total: <strong>${Number(pedido.total).toLocaleString()}</strong> | Pago: {pedido.metodo_pago.toUpperCase()}
                                        </p>
                                        <div style={{ marginTop: '8px', backgroundColor: cancelado ? '#dc3545' : '#28a745', color: 'white', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', width: 'fit-content' }}>
                                            {pedido.estado.replace('_', ' ').toUpperCase()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 🔔 NOTIFICACIÓN FLOTANTE CUANDO HAY ITEMS EN EL CARRITO */}
            {/* ------------------------------------------------------------- */}
            {carrito.length > 0 && vistaActiva !== 'carrito' && (
                <div 
                    onClick={() => setVistaActiva('carrito')}
                    style={{
                        position: 'fixed',
                        bottom: '85px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '85%',
                        maxWidth: '500px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        padding: '12px 20px',
                        borderRadius: '30px',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        zIndex: 999,
                        fontWeight: 'bold'
                    }}
                >
                    <span>🛒 {carrito.length} producto(s) (${totalFinal.toLocaleString()})</span>
                    <span>Ir al Carrito ➔</span>
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 📱 BARRA FLOTANTE CENTRADA CON INSIGNIAS NUMÉRICAS DINÁMICAS */}
            {/* ------------------------------------------------------------- */}
            <div style={{
                position: 'fixed',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '92%',
                maxWidth: '600px',
                backgroundColor: '#1e1e2f',
                border: '1px solid #333',
                borderRadius: '25px',
                boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
                display: 'flex',
                justify: 'space-around',
                alignItems: 'center',
                padding: '8px 0',
                zIndex: 1000
            }}>
                <button 
                    onClick={() => setVistaActiva('tiendas')}
                    style={{ flex: 1, background: 'none', border: 'none', color: vistaActiva === 'tiendas' ? '#007bff' : '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: vistaActiva === 'tiendas' ? 'bold' : 'normal' }}
                >
                    <span style={{ fontSize: '20px', marginBottom: '2px' }}>🏪</span>
                    Tiendas
                </button>

                <button 
                    onClick={() => setVistaActiva('carrito')}
                    style={{ flex: 1, background: 'none', border: 'none', color: vistaActiva === 'carrito' ? '#007bff' : '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: vistaActiva === 'carrito' ? 'bold' : 'normal', position: 'relative' }}
                >
                    <span style={{ fontSize: '20px', marginBottom: '2px' }}>🛒</span>
                    Carrito
                    {carrito.length > 0 && (
                        <span style={{ position: 'absolute', top: '-2px', right: '22%', backgroundColor: '#dc3545', color: 'white', borderRadius: '50%', width: '17px', height: '17px', fontSize: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                            {carrito.length}
                        </span>
                    )}
                </button>

                <button 
                    onClick={() => setVistaActiva('seguimiento')}
                    style={{ flex: 1, background: 'none', border: 'none', color: vistaActiva === 'seguimiento' ? '#007bff' : '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: vistaActiva === 'seguimiento' ? 'bold' : 'normal', position: 'relative' }}
                >
                    <span style={{ fontSize: '20px', marginBottom: '2px' }}>🛵</span>
                    Seguimiento
                    {pedidosActivos.length > 0 && (
                        <span style={{ position: 'absolute', top: '-2px', right: '22%', backgroundColor: '#17a2b8', color: 'white', borderRadius: '50%', width: '17px', height: '17px', fontSize: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                            {pedidosActivos.length}
                        </span>
                    )}
                </button>

                <button 
                    onClick={() => setVistaActiva('historial')}
                    style={{ flex: 1, background: 'none', border: 'none', color: vistaActiva === 'historial' ? '#007bff' : '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: vistaActiva === 'historial' ? 'bold' : 'normal' }}
                >
                    <span style={{ fontSize: '20px', marginBottom: '2px' }}>📜</span>
                    Historial
                </button>
            </div>

        </div>
    );
}

export default Tienda;
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = '';
const socket = io(API_URL);

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
    
    const [perfilDireccion, setPerfilDireccion] = useState('');
    const [direccionManual, setDireccionManual] = useState('');
    const [linkGPS, setLinkGPS] = useState('');
    const [costoDomicilio, setCostoDomicilio] = useState(4000);
    const [ubicacionPanaderia, setUbicacionPanaderia] = useState({ lat: 3.261200, lon: -76.539300 });
    const [mostrarPedidos, setMostrarPedidos] = useState(false);
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
            setPerfilDireccion(dirTexto); 
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
                            descripcion: 'Productos oficiales de la panadería principal',
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

        return () => { 
            socket.off('catalogo_actualizado'); 
            socket.off('estado_actualizado'); 
            socket.off('pedido_eliminado'); 
            socket.off('ubicacion_domiciliario'); 
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
            return alert('🔴 La tienda se encuentra CERRADA en este momento. No es posible realizar compras.');
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
                    alert(esEmpresa ? `¡GPS capturado!\n🏢 Eres cliente EMPRESA: Envío gratuito.` : `¡GPS capturado!\nEstás a ${distanciaKm.toFixed(1)} km.\nCosto del domicilio: $${tarifa.toLocaleString()}`);
                    setCostoDomicilio(tarifa);
                }, () => alert("Error de GPS.")
            );
        } else alert("Tu navegador no soporta geolocalización.");
    };

    const hacerPedido = async () => {
        if (carrito.length === 0) return alert('El carrito está vacío');
        if (tiendaSeleccionada && !esTiendaAbierta(tiendaSeleccionada)) {
            return alert('🔴 La tienda seleccionada está CERRADA. No puedes completar el pedido.');
        }
        let direccionFinal = linkGPS ? `${direccionManual} |GPS| ${linkGPS}` : direccionManual;
        if (!direccionFinal.trim()) return alert('Por favor ingresa tu dirección.');

        if (metodoPago !== 'efectivo' && !referenciaPago.trim()) {
            return alert('Por favor ingresa el número de referencia / comprobante de la transferencia.');
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
            
            alert('¡Pedido enviado exitosamente!'); 
            setCarrito([]); 
            setReferenciaPago('');
            setMostrarPedidos(true); 
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

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>Bienvenido, {usuarioInfo.nombre} 🥐 {esEmpresa && <span style={{fontSize:'16px', color:'#17a2b8'}}>(🏢 Cuenta Empresa)</span>}</h2>
                <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar Sesión</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: '1 1 60%', minWidth: '300px' }}>
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
                                                    if (!estaAbierta) alert(`🔴 La tienda "${tienda.nombre}" está CERRADA en este momento.`);
                                                }}
                                                style={{ 
                                                    border: estaAbierta ? '1px solid #ccc' : '2px solid #dc3545', 
                                                    padding: '15px', 
                                                    borderRadius: '8px', 
                                                    backgroundColor: estaAbierta ? 'white' : '#fff5f5', 
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
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
                                                    src={tienda.logo_url ? `${API_URL}${tienda.logo_url}` : 'https://via.placeholder.com/80?text=Tienda'} 
                                                    alt={tienda.nombre} 
                                                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '50%', marginBottom: '10px', border: estaAbierta ? '2px solid #007bff' : '2px solid #dc3545' }} 
                                                />
                                                <h4 style={{ margin: '5px 0' }}>{tienda.nombre}</h4>
                                                <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666', height: '32px', overflow: 'hidden' }}>{tienda.descripcion || 'Sin descripción'}</p>
                                                
                                                <p style={{ margin: '2px 0 8px 0', fontSize: '11px', color: '#333' }}>
                                                    📍 {dirTienda.texto}
                                                </p>

                                                <button style={{ width: '100%', padding: '8px', backgroundColor: estaAbierta ? '#007bff' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                    {estaAbierta ? 'Entrar a la tienda' : 'Ver productos (Cerrado)'}
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
                                style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px' }}
                            >
                                ← Volver a las Tiendas
                            </button>

                            {!esTiendaAbierta(tiendaSeleccionada) && (
                                <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '12px 15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #f5c6cb', fontWeight: 'bold', textAlign: 'center' }}>
                                    🔴 ESTA TIENDA ESTÁ CERRADA EN ESTE MOMENTO. No se pueden realizar pedidos por el día de hoy.
                                </div>
                            )}

                            {(() => {
                                const dirTienda = parseDireccion(tiendaSeleccionada.direccion);
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: esTiendaAbierta(tiendaSeleccionada) ? '#e9ecef' : '#f8d7da', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                                        <img 
                                            src={tiendaSeleccionada.logo_url ? `${API_URL}${tiendaSeleccionada.logo_url}` : 'https://via.placeholder.com/60?text=Tienda'} 
                                            alt="Logo Tienda" 
                                            style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} 
                                        />
                                        <div>
                                            <h3 style={{ margin: 0 }}>{tiendaSeleccionada.nombre} {!esTiendaAbierta(tiendaSeleccionada) && <span style={{ color: '#dc3545', fontSize: '14px' }}>(🔴 Cerrado)</span>}</h3>
                                            <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>{tiendaSeleccionada.descripcion}</p>
                                            <p style={{ margin: '2px 0', fontSize: '12px', color: '#333' }}>
                                                📍 <strong>Dirección:</strong> {dirTienda.texto}
                                            </p>
                                            {dirTienda.gps && (
                                                <a href={dirTienda.gps} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '4px', color: '#007bff', fontSize: '12px', fontWeight: 'bold' }}>
                                                    🗺️ Ver ubicación de la tienda en Google Maps
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                                {productosDeTienda.length > 0 ? (
                                    productosDeTienda.map(prod => {
                                        const estaDisponible = prod.disponible && esTiendaAbierta(tiendaSeleccionada);
                                        return (
                                            <div key={prod.id} style={{ opacity: estaDisponible ? 1 : 0.6, border: '1px solid #ccc', padding: '15px', borderRadius: '8px', backgroundColor: 'white' }}>
                                                <img src={prod.imagen || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500'} alt={prod.nombre} style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
                                                
                                                <h4 style={{ margin: '0 0 5px 0' }}>{prod.nombre}</h4>

                                                <p style={{ margin: '0 0 15px 0', fontWeight: 'bold', color: estaDisponible ? '#28a745' : '#dc3545', fontSize: '18px' }}>
                                                    {estaDisponible ? `$${Number(prod.precio).toLocaleString()}` : !prod.disponible ? '¡AGOTADO!' : 'TIENDA CERRADA'}
                                                </p>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input type="number" min="1" value={cantidades[prod.id] || 1} onChange={(e) => handleCantidadChange(prod.id, e.target.value)} disabled={!estaDisponible} style={{ width: '50px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }} />
                                                    <button onClick={() => agregarAlCarrito(prod)} disabled={!estaDisponible} style={{ flex: 1, padding: '10px', backgroundColor: estaDisponible ? '#007bff' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: estaDisponible ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
                                                        {estaDisponible ? 'Agregar' : 'No disp.'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p style={{ gridColumn: '1 / -1', color: '#666', textAlign: 'center', padding: '20px' }}>Esta tienda aún no tiene productos publicados.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                <div style={{ flex: '1 1 30%', minWidth: '300px', border: '1px solid #eee', padding: '20px', borderRadius: '8px', backgroundColor: '#fdfdfd', height: 'fit-content' }}>
                    <h3 style={{ marginTop: 0 }}>Tu Carrito 🛒</h3>
                    {carrito.length === 0 ? (
                        <p style={{ color: '#888', fontSize: '14px' }}>El carrito está vacío.</p>
                    ) : (
                        carrito.map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'white', marginBottom: '10px' }}>
                                <div>
                                    <strong style={{ display: 'block' }}>{item.cantidad}x {item.nombre}</strong>
                                    <span style={{ color: '#555', fontSize: '12px' }}>${item.subtotal.toLocaleString()}</span>
                                </div>
                                <button onClick={() => eliminarDelCarrito(item.id)} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', width: '32px', height: '32px', cursor: 'pointer' }}>❌</button>
                            </div>
                        ))
                    )}
                    
                    <div style={{ borderTop: '2px solid #eee', paddingTop: '15px' }}>
                        <p style={{ margin: '5px 0', fontSize: '16px', color: '#555' }}>Subtotal: <strong style={{ float: 'right' }}>${subtotalCarrito.toLocaleString()}</strong></p>
                        <p style={{ margin: '5px 0', fontSize: '16px', color: '#17a2b8' }}>Domicilio: <strong style={{ float: 'right' }}>${costoDomicilio.toLocaleString()}</strong></p>
                        <h3 style={{ margin: '10px 0 0 0', color: '#28a745', fontSize: '22px' }}>Total a Pagar: <span style={{ float: 'right' }}>${totalFinal.toLocaleString()}</span></h3>
                    </div>
                    
                    <div style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '6px', marginBottom: '15px', marginTop: '15px' }}>
                        <strong style={{ display: 'block', marginBottom: '8px' }}>📍 Destino de entrega:</strong>
                        <textarea value={direccionManual} onChange={(e) => {setDireccionManual(e.target.value); if(!e.target.value.startsWith('http')) setCostoDomicilio(esEmpresa?0:4000);}} placeholder={esEmpresa ? "Detalles de entrega..." : "Detalles de entrega (Tarifa base $4,000)"} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box' }} />
                        
                        {linkGPS ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginTop: '10px' }}><span style={{ color: '#155724', fontWeight: 'bold' }}>✅ GPS Añadido</span><button onClick={() => {setLinkGPS(''); setCostoDomicilio(esEmpresa?0:4000);}} style={{ background: 'none', border: 'none', color: '#721c24', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>Quitar</button></div>
                        ) : (
                            <button onClick={obtenerUbicacion} style={{ width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🗺️ Adjuntar mi GPS</button>
                        )}
                    </div>

                    <strong style={{ display: 'block', marginBottom: '8px' }}>💳 Método de Pago:</strong>
                    
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ padding: '10px', width: '100%', marginBottom: '10px', borderRadius: '4px', border: '1px solid #007bff', fontWeight: 'bold', color: '#007bff' }}>
                        {bancos.map(b => (
                            <option key={b.id} value={b.nombre}>Pago con {b.nombre}</option>
                        ))}
                        <option value="efectivo">Pago en Efectivo</option>
                    </select>

                    {metodoPago !== 'efectivo' && bancoSeleccionado && (
                        <div style={{ backgroundColor: '#e2f3f5', padding: '12px', borderRadius: '6px', marginBottom: '15px', border: '1px solid #17a2b8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                                {bancoSeleccionado.imagen ? (
                                    <img src={bancoSeleccionado.imagen} alt="Banco" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'contain', backgroundColor: 'white', border: '1px solid #ccc', padding: '2px' }} />
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
                    
                    <button onClick={hacerPedido} style={{ width: '100%', padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>Confirmar Pedido (${totalFinal.toLocaleString()})</button>
                </div>
            </div>
            
            <hr style={{ margin: '30px 0', borderColor: '#eee' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: '15px 20px', borderRadius: '8px', border: '1px solid #ddd', cursor: 'pointer' }} onClick={() => setMostrarPedidos(!mostrarPedidos)}>
                <h3 style={{ margin: 0 }}>Tus Pedidos Realizados 📦</h3><span style={{ fontSize: '20px', fontWeight: 'bold', color: '#007bff' }}>{mostrarPedidos ? 'Ocultar 🔼' : 'Ver Historial 🔽'}</span>
            </div>

            {mostrarPedidos && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                    {misPedidos.map(pedido => {
                        const dir = parseDireccion(pedido.direccion);
                        const enRuta = pedido.estado === 'llevando_tu_pedido';
                        const cancelado = pedido.estado === 'cancelado_devuelto' || pedido.estado === 'cancelado';
                        const coordsRepartidor = gpsDomiciliario[pedido.id];
                        const destinoFinal = miUbicacionCliente || extraerCoordsDeLink(dir.gps);

                        let distanciaKm = 0; 
                        let tiempoMinutos = 0;
                        if (enRuta && coordsRepartidor && destinoFinal) {
                            distanciaKm = calcularDistancia(coordsRepartidor.lat, coordsRepartidor.lon, destinoFinal.lat, destinoFinal.lon);
                            tiempoMinutos = Math.max(1, Math.round(distanciaKm * 2)); 
                        }

                        return (
                        <div key={pedido.id} style={{ padding: '20px', border: enRuta ? '2px solid #007bff' : (cancelado ? '2px solid #dc3545' : '1px solid #ddd'), borderRadius: '8px', backgroundColor: cancelado ? '#fff5f5' : '#fff' }}>
                            <strong style={{ fontSize: '18px' }}>Pedido #{pedido.id}</strong> <span style={{ color: '#666', marginLeft: '10px' }}>{new Date(pedido.fecha_creacion).toLocaleString()}</span>
                            <p style={{ margin: '8px 0 0 0', fontSize: '15px' }}>
                                Total: <strong>${Number(pedido.total).toLocaleString()}</strong> | Pago: <strong style={{ color: '#007bff' }}>{pedido.metodo_pago.toUpperCase()}</strong>
                                {pedido.referencia_pago && <span style={{ marginLeft: '10px', fontSize: '13px', color: '#555' }}>(Ref: {pedido.referencia_pago})</span>}
                            </p>

                            {pedido.metodo_pago !== 'efectivo' && (
                                <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                                    Estado del Pago: {
                                        pedido.estado_pago === 'aprobado' ? <strong style={{ color: '#28a745' }}>✅ Pago Aprobado por Admin</strong> :
                                        pedido.estado_pago === 'rechazado' ? <strong style={{ color: '#dc3545' }}>❌ Pago Rechazado</strong> :
                                        <strong style={{ color: '#ffc107' }}>⏳ Verificando transferencia con el Admin...</strong>
                                    }
                                </p>
                            )}
                            
                            {enRuta && (
                                <div style={{ marginTop: '15px', backgroundColor: '#e2f3f5', padding: '15px', borderRadius: '6px', border: '1px solid #17a2b8' }}>
                                    <p style={{ margin: '0 0 10px 0', color: '#0c5460', fontWeight: 'bold', fontSize: '15px', textAlign: 'center' }}>🛵 ¡Tu domiciliario está en camino!</p>
                                    {coordsRepartidor && destinoFinal ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
                                                <span style={{ fontSize: '24px' }}>🛵</span>
                                                <div style={{ flex: 1, height: '6px', backgroundColor: '#17a2b8', borderRadius: '3px', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #17a2b8', color: '#17a2b8' }}>{distanciaKm.toFixed(1)} km</div>
                                                </div>
                                                <span style={{ fontSize: '24px' }}>🏠</span>
                                            </div>
                                            <p style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', color: '#0c5460' }}>⏳ Llegada estimada: {tiempoMinutos} min</p>
                                            <a href={`https://www.google.com/maps/dir/?api=1&origin=${coordsRepartidor.lat},${coordsRepartidor.lon}&destination=${destinoFinal.lat},${destinoFinal.lon}&travelmode=driving`} target="_blank" rel="noreferrer" style={{ display: 'block', backgroundColor: '#17a2b8', color: 'white', padding: '10px 15px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>🗺️ Abrir ruta en Google Maps</a>
                                        </>
                                    ) : (
                                        <p style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: '14px', color: '#17a2b8', fontWeight: 'bold' }}>📡 Conectando con la moto...</p>
                                    )}
                                </div>
                            )}
                            <div style={{ marginTop: '15px', backgroundColor: enRuta ? '#007bff' : (cancelado ? '#dc3545' : '#6c757d'), color: 'white', padding: '8px 20px', borderRadius: '25px', fontWeight: 'bold', textAlign: 'center', fontSize: '14px', width: 'fit-content' }}>
                                {pedido.estado.replace('_', ' ').toUpperCase()}
                            </div>
                        </div>
                    )})}
                </div>
            )}
        </div>
    );
}

export default Tienda;
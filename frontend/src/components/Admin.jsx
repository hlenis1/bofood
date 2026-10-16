import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const socket = io('');

function Admin() {
    const navigate = useNavigate();
    const [usuarioInfo, setUsuarioInfo] = useState(null);
    const [pestana, setPestana] = useState('pedidos'); // 'pedidos', 'usuarios', 'recargas', 'productos', 'tiendas', 'bancos', 'configuracion'

    // ESTADOS DE DATOS
    const [pedidos, setPedidos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [recargas, setRecargas] = useState([]);
    const [productos, setProductos] = useState([]);
    const [tiendas, setTiendas] = useState([]);
    const [bancos, setBancos] = useState([]);

    // ESTADOS PARA FILTRO DE FECHAS DE PAGOS/PEDIDOS
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    
    // FORMULARIOS DE CREACIÓN Y EDICIÓN
    const [configAdmin, setConfigAdmin] = useState({ latitud: '', longitud: '', comision_domicilio: 15, comision_vendedor: 10 });
    
    // Formulario Crear Usuario
    const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', email: '', password: '', direccion: '', gps: '', telefono: '', rol: 'cliente', es_empresa: false });
    const [usuarioEditando, setUsuarioEditando] = useState(null);

    // Formulario Crear Producto
    const [nuevoProducto, setNuevoProducto] = useState({ nombre: '', categoria: 'panaderia', precio: '', vendedor_id: '', imagen: null });
    const [productoEditando, setProductoEditando] = useState(null);

    // Formulario Tienda Admin
    const [tiendaAdmin, setTiendaAdmin] = useState({ nombre: '', descripcion: '', direccion: '', gps: '', telefono: '', logo: null });

    // Formulario Editar Cualquier Tienda
    const [tiendaEditando, setTiendaEditando] = useState(null);

    // Formulario Crear Banco & Banco Admin
    const [nuevoBanco, setNuevoBanco] = useState({ nombre: '', numero: '', imagen: null });
    const [bancoAdmin, setBancoAdmin] = useState({ banco_nombre: '', banco_numero: '', imagen: null });

    // CAPTURAR GPS EN TIEMPO REAL
    const capturarGPS = (setTargetState) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    const link = `https://maps.google.com/?q=${lat},${lon}`;
                    setTargetState(prev => ({ ...prev, gps: link }));
                    alert("📍 ¡Ubicación GPS capturada con éxito!");
                },
                (error) => alert("No se pudo obtener la ubicación GPS: " + error.message)
            );
        } else {
            alert("Tu navegador no soporta geolocalización.");
        }
    };

    useEffect(() => {
        const infoStr = localStorage.getItem('usuario');
        if (!infoStr) return navigate('/login');
        try {
            const info = JSON.parse(infoStr);
            if (String(info.rol || '').trim().toLowerCase() !== 'admin') return navigate('/login');
            setUsuarioInfo(info);
        } catch (e) {
            navigate('/login');
        }
    }, [navigate]);

    const cargarTodo = () => {
        axios.get('/api/pedidos').then(res => setPedidos(res.data)).catch(() => {});
        axios.get('/api/usuarios').then(res => setUsuarios(res.data)).catch(() => {});
        axios.get('/api/recargas').then(res => setRecargas(res.data)).catch(() => {});
        axios.get('/api/productos').then(res => setProductos(res.data)).catch(() => {});
        axios.get('/api/tiendas').then(res => setTiendas(res.data)).catch(() => {});
        axios.get('/api/bancos').then(res => setBancos(res.data)).catch(() => {});
        
        axios.get('/api/config-admin').then(res => {
            if (res.data) {
                setConfigAdmin({
                    latitud: res.data.latitud || '',
                    longitud: res.data.longitud || '',
                    comision_domicilio: res.data.comision_domicilio || 15,
                    comision_vendedor: res.data.comision_vendedor || 10
                });
                setBancoAdmin({
                    banco_nombre: res.data.banco_nombre || '',
                    banco_numero: res.data.banco_numero || '',
                    imagen: null
                });
            }
        }).catch(() => {});
    };

    useEffect(() => {
        if (!usuarioInfo) return;
        cargarTodo();

        axios.get(`/api/vendedor/tienda/${usuarioInfo.id}`)
            .then(res => {
                if (res.data) {
                    let dirTexto = res.data.direccion || '';
                    let gpsLink = '';
                    if (dirTexto.includes(' |GPS| ')) {
                        const partes = dirTexto.split(' |GPS| ');
                        dirTexto = partes[0];
                        gpsLink = partes[1];
                    }
                    setTiendaAdmin({
                        nombre: res.data.nombre || '',
                        descripcion: res.data.descripcion || '',
                        direccion: dirTexto,
                        gps: gpsLink,
                        telefono: res.data.telefono || '',
                        logo: null
                    });
                }
            })
            .catch(() => {});

        socket.on('nuevo_pedido', cargarTodo);
        socket.on('estado_actualizado', cargarTodo);
        socket.on('catalogo_actualizado', cargarTodo);
        socket.on('pedido_eliminado', cargarTodo);

        return () => {
            socket.off('nuevo_pedido');
            socket.off('estado_actualizado');
            socket.off('catalogo_actualizado');
            socket.off('pedido_eliminado');
        };
    }, [usuarioInfo]);

    // ==========================================
    // 📦 PEDIDOS & APROBACIÓN DE PAGO
    // ==========================================
    const aprobarPagoAdmin = async (pedidoId, estadoPago) => {
        try {
            await axios.put(`/api/pedidos/${pedidoId}/aprobar-pago`, { estado_pago: estadoPago });
            alert(estadoPago === 'aprobado' ? '✅ ¡Pago verificado y aprobado!' : '❌ Pago rechazado.');
            cargarTodo();
        } catch (error) {
            alert('Error al verificar el pago');
        }
    };

    const cambiarEstadoPedido = async (id, nuevoEstado) => {
        try {
            await axios.put(`/api/pedidos/${id}/estado`, { estado: nuevoEstado });
            cargarTodo();
        } catch (error) {
            alert('Error al actualizar el estado del pedido');
        }
    };

    const eliminarPedido = async (id) => {
        if (!window.confirm('¿Seguro de eliminar este pedido del historial?')) return;
        try {
            await axios.delete(`/api/pedidos/${id}`);
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    // ==========================================
    // 👥 GESTIÓN DE USUARIOS
    // ==========================================
    const crearUsuario = async (e) => {
        e.preventDefault();
        const direccionFinal = nuevoUsuario.gps 
            ? `${nuevoUsuario.direccion} |GPS| ${nuevoUsuario.gps}` 
            : nuevoUsuario.direccion;

        try {
            await axios.post('/api/usuarios', {
                ...nuevoUsuario,
                direccion: direccionFinal
            });
            alert('¡Usuario/Tienda creado con éxito!');
            setNuevoUsuario({ nombre: '', email: '', password: '', direccion: '', gps: '', telefono: '', rol: 'cliente', es_empresa: false });
            cargarTodo();
        } catch (error) {
            alert(error.response?.data?.message || 'Error al crear usuario');
        }
    };

    const guardarEdicionUsuario = async (e) => {
        e.preventDefault();
        const direccionFinal = usuarioEditando.gps 
            ? `${usuarioEditando.direccion} |GPS| ${usuarioEditando.gps}` 
            : usuarioEditando.direccion;

        try {
            await axios.put(`/api/usuarios/${usuarioEditando.id}`, {
                ...usuarioEditando,
                direccion: direccionFinal
            });
            alert('¡Usuario actualizado!');
            setUsuarioEditando(null);
            cargarTodo();
        } catch (error) {
            alert('Error al actualizar usuario');
        }
    };

    const eliminarUsuario = async (id) => {
        if (!window.confirm('¿Eliminar usuario y todos sus pedidos asociados?')) return;
        try {
            await axios.delete(`/api/usuarios/${id}`);
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar usuario');
        }
    };

    const pagarDeudaVendedor = async (vendedorId) => {
        if (!window.confirm('¿Confirmas que le has saldado las ganancias a este vendedor?')) return;
        try {
            await axios.put(`/api/usuarios/${vendedorId}/pagar-deuda`);
            alert('¡Deuda marcada como pagada!');
            cargarTodo();
        } catch (error) {
            alert('Error al procesar el pago');
        }
    };

    // ==========================================
    // 🥖 GESTIÓN DE PRODUCTOS
    // ==========================================
    const crearProducto = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('nombre', nuevoProducto.nombre);
        formData.append('categoria', nuevoProducto.categoria);
        formData.append('precio', nuevoProducto.precio);
        formData.append('vendedor_id', nuevoProducto.vendedor_id || usuarioInfo.id);
        if (nuevoProducto.imagen) formData.append('imagen', nuevoProducto.imagen);

        try {
            await axios.post('/api/productos', formData);
            alert('¡Producto publicado con éxito!');
            setNuevoProducto({ nombre: '', categoria: 'panaderia', precio: '', vendedor_id: '', imagen: null });
            cargarTodo();
        } catch (error) {
            alert(error.response?.data?.message || 'Error al crear producto');
        }
    };

    const toggleDisponibilidad = async (id, estadoActual) => {
        try {
            await axios.put(`/api/productos/${id}/disponibilidad`, { disponible: !estadoActual });
            cargarTodo();
        } catch (error) {
            alert(error.response?.data?.message || 'Error al cambiar disponibilidad');
        }
    };

    const guardarEdicionProducto = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`/api/productos/${productoEditando.id}`, {
                nombre: productoEditando.nombre,
                precio: productoEditando.precio
            });
            alert('¡Producto actualizado!');
            setProductoEditando(null);
            cargarTodo();
        } catch (error) {
            alert('Error al editar producto');
        }
    };

    const eliminarProducto = async (id) => {
        if (!window.confirm('¿Seguro de eliminar este producto?')) return;
        try {
            await axios.delete(`/api/productos/${id}`);
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar producto');
        }
    };

    // ==========================================
    // 🏪 GESTIÓN DE TIENDAS Y ESTADO
    // ==========================================
    const toggleEstadoTiendaAdmin = async (usuarioId, estadoActual) => {
        const nuevoEstado = estadoActual !== 0 ? 0 : 1;
        try {
            await axios.put(`/api/vendedor/tienda/${usuarioId}/estado`, { abierta: nuevoEstado });
            cargarTodo();
        } catch (error) {
            alert('Error al cambiar el estado de la tienda');
        }
    };

    const guardarTiendaAdmin = async (e) => {
        e.preventDefault();
        const direccionFinal = tiendaAdmin.gps 
            ? `${tiendaAdmin.direccion} |GPS| ${tiendaAdmin.gps}` 
            : tiendaAdmin.direccion;

        const formData = new FormData();
        formData.append('usuario_id', usuarioInfo.id);
        formData.append('nombre', tiendaAdmin.nombre);
        formData.append('descripcion', tiendaAdmin.descripcion);
        formData.append('direccion', direccionFinal);
        formData.append('telefono', tiendaAdmin.telefono);
        if (tiendaAdmin.logo) formData.append('logo', tiendaAdmin.logo);

        try {
            await axios.post('/api/vendedor/tienda', formData);
            alert('¡Perfil de la tienda principal guardado!');
            cargarTodo();
        } catch (error) {
            alert('Error al guardar la tienda');
        }
    };

    const abrirEdicionTienda = (t) => {
        let dirTexto = t.direccion || '';
        let gpsLink = '';
        if (dirTexto.includes(' |GPS| ')) {
            const partes = dirTexto.split(' |GPS| ');
            dirTexto = partes[0];
            gpsLink = partes[1];
        }
        setTiendaEditando({
            usuario_id: t.usuario_id,
            nombre: t.nombre || '',
            descripcion: t.descripcion || '',
            direccion: dirTexto,
            gps: gpsLink,
            telefono: t.telefono || '',
            logo: null
        });
    };

    const guardarEdicionTienda = async (e) => {
        e.preventDefault();
        const direccionFinal = tiendaEditando.gps 
            ? `${tiendaEditando.direccion} |GPS| ${tiendaEditando.gps}` 
            : tiendaEditando.direccion;

        const formData = new FormData();
        formData.append('usuario_id', tiendaEditando.usuario_id);
        formData.append('nombre', tiendaEditando.nombre);
        formData.append('descripcion', tiendaEditando.descripcion);
        formData.append('direccion', direccionFinal);
        formData.append('telefono', tiendaEditando.telefono || '');
        if (tiendaEditando.logo) formData.append('logo', tiendaEditando.logo);

        try {
            await axios.post('/api/vendedor/tienda', formData);
            alert('¡Tienda actualizada con éxito!');
            setTiendaEditando(null);
            cargarTodo();
        } catch (error) {
            alert('Error al actualizar la tienda');
        }
    };

    const eliminarTienda = async (usuarioId) => {
        if (!window.confirm('¿Seguro que deseas eliminar esta tienda del registro?')) return;
        try {
            await axios.delete(`/api/vendedor/tienda/${usuarioId}`);
            alert('¡Tienda eliminada!');
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar la tienda');
        }
    };

    // ==========================================
    // 🏦 GESTIÓN DE BANCOS
    // ==========================================
    const agregarBanco = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('nombre', nuevoBanco.nombre);
        formData.append('numero', nuevoBanco.numero);
        if (nuevoBanco.imagen) formData.append('imagen', nuevoBanco.imagen);

        try {
            await axios.post('/api/bancos', formData);
            alert('¡Cuenta bancaria agregada!');
            setNuevoBanco({ nombre: '', numero: '', imagen: null });
            cargarTodo();
        } catch (error) {
            alert('Error al agregar banco');
        }
    };

    const eliminarBanco = async (id) => {
        if (!window.confirm('¿Eliminar esta cuenta bancaria?')) return;
        try {
            await axios.delete(`/api/bancos/${id}`);
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const guardarBancoAdmin = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('banco_nombre', bancoAdmin.banco_nombre);
        formData.append('banco_numero', bancoAdmin.banco_numero);
        if (bancoAdmin.imagen) formData.append('imagen', bancoAdmin.imagen);

        try {
            await axios.post('/api/config-banco', formData);
            alert('¡Cuenta Principal del Admin actualizada!');
            cargarTodo();
        } catch (error) {
            alert('Error al guardar datos bancarios del Admin');
        }
    };

    const eliminarBancoAdmin = async () => {
        if (!window.confirm('¿Eliminar cuenta bancaria principal del Admin?')) return;
        try {
            await axios.delete('/api/config-banco');
            cargarTodo();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    // ==========================================
    // 💰 RECARGAS & CONFIGURACIÓN
    // ==========================================
    const cambiarEstadoRecarga = async (id, estado) => {
        try {
            await axios.put(`/api/recargas/${id}/estado`, { estado });
            alert(`Recarga ${estado}`);
            cargarTodo();
        } catch (error) {
            alert('Error al procesar la recarga');
        }
    };

    const guardarConfigAdmin = async (e) => {
        e.preventDefault();
        try {
            await axios.put('/api/config-admin', configAdmin);
            alert('¡Parámetros del sistema actualizados!');
            cargarTodo();
        } catch (error) {
            alert('Error al guardar configuración');
        }
    };

    // ==========================================
    // 📅 FILTRADO, RESUMEN FINANCIERO Y EXPORTACIÓN PDF
    // ==========================================
    const pedidosFiltrados = pedidos.filter(p => {
        if (!p.fecha_creacion) return true;
        const fechaPedido = new Date(p.fecha_creacion).toLocaleDateString('sv');
        if (fechaInicio && fechaPedido < fechaInicio) return false;
        if (fechaFin && fechaPedido > fechaFin) return false;
        return true;
    });

    // CÁLCULOS DE GANANCIAS PARA EL RECUADRO INFORMATIVO
    const gananciasProductos = pedidosFiltrados.reduce((sum, p) => sum + Number(p.comision_productos_cobrada || 0), 0);
    const gananciasDomicilio = pedidosFiltrados.reduce((sum, p) => sum + Number(p.comision_cobrada || 0), 0);
    const gananciasTotales = gananciasProductos + gananciasDomicilio;

    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('Reporte Maestro de Pedidos y Comisiones', 14, 20);
        doc.setFontSize(10);
        doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 14, 28);
        if (fechaInicio || fechaFin) {
            doc.text(`Filtro de fechas: ${fechaInicio || 'Inicio'} hasta ${fechaFin || 'Hoy'}`, 14, 34);
        }

        const tableColumn = ["# Pedido", "Fecha", "Cliente", "Total", "Domicilio", "Comisión Domicilio", "Comisión Ventas", "Estado"];
        const tableRows = [];

        pedidosFiltrados.forEach(p => {
            const pedidoData = [
                `#${p.id}`,
                new Date(p.fecha_creacion).toLocaleDateString(),
                p.cliente || 'Desconocido',
                `$${Number(p.total).toLocaleString()}`,
                `$${Number(p.costo_domicilio || 0).toLocaleString()}`,
                `+$${Number(p.comision_cobrada || 0).toLocaleString()}`,
                `+$${Number(p.comision_productos_cobrada || 0).toLocaleString()}`,
                p.estado.toUpperCase()
            ];
            tableRows.push(pedidoData);
        });

        autoTable(doc, { head: [tableColumn], body: tableRows, startY: (fechaInicio || fechaFin) ? 40 : 35 });
        doc.save(`reporte_pedidos_${Date.now()}.pdf`);
    };

    if (!usuarioInfo) return null;

    const vendedores = usuarios.filter(u => u.rol === 'vendedor');

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1300px', margin: '0 auto', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
            
            {/* ENCABEZADO */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#343a40', color: 'white', padding: '15px 20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Panel de Administración 👑</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={exportarPDF} style={{ padding: '8px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>📄 Exportar Reporte PDF</button>
                    <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar Sesión</button>
                </div>
            </div>

            {/* MENÚ DE PESTAÑAS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #dee2e6', paddingBottom: '10px', overflowX: 'auto' }}>
                {[
                    { id: 'pedidos', label: '📦 Pedidos' },
                    { id: 'usuarios', label: '👥 Usuarios & Billeteras' },
                    { id: 'recargas', label: '💰 Recargas Prepago' },
                    { id: 'productos', label: '🥖 Productos' },
                    { id: 'tiendas', label: '🏪 Tiendas Registradas' },
                    { id: 'bancos', label: '🏦 Cuentas Bancarias' },
                    { id: 'configuracion', label: '⚙️ Configuración' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setPestana(tab.id)}
                        style={{
                            padding: '10px 18px',
                            backgroundColor: pestana === tab.id ? '#007bff' : '#e9ecef',
                            color: pestana === tab.id ? 'white' : '#495057',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* PESTAÑA 1: HISTORIAL DE PEDIDOS Y METRICAS DE GANANCIA */}
            {pestana === 'pedidos' && (
                <div>
                    {/* RECUADROS DE RESUMEN FINANCIERO */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                        <div style={{ backgroundColor: '#ffffff', padding: '15px 20px', borderRadius: '8px', borderLeft: '5px solid #007bff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'bold', textTransform: 'uppercase' }}>🛒 Ganancias por Ventas (Comisión)</span>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff', marginTop: '5px' }}>
                                ${gananciasProductos.toLocaleString()}
                            </div>
                            <span style={{ fontSize: '11px', color: '#a0a0a0' }}>Obtenido de las tiendas/vendedores</span>
                        </div>

                        <div style={{ backgroundColor: '#ffffff', padding: '15px 20px', borderRadius: '8px', borderLeft: '5px solid #28a745', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'bold', textTransform: 'uppercase' }}>🛵 Ganancias por Domicilios (Comisión)</span>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745', marginTop: '5px' }}>
                                ${gananciasDomicilio.toLocaleString()}
                            </div>
                            <span style={{ fontSize: '11px', color: '#a0a0a0' }}>Porcentaje cobrado sobre los envíos</span>
                        </div>

                        <div style={{ backgroundColor: '#ffffff', padding: '15px 20px', borderRadius: '8px', borderLeft: '5px solid #ffc107', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <span style={{ fontSize: '12px', color: '#856404', fontWeight: 'bold', textTransform: 'uppercase' }}>💎 Ganancia Total Plataforma</span>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#856404', marginTop: '5px' }}>
                                ${gananciasTotales.toLocaleString()}
                            </div>
                            <span style={{ fontSize: '11px', color: '#a0a0a0' }}>Ingresos netos consolidados</span>
                        </div>
                    </div>

                    {/* FILTRO DE FECHAS */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0 }}>Historial Maestro de Pedidos 📦</h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '10px 15px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#495057' }}>📅 Filtrar por fecha:</span>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <label style={{ fontSize: '12px', color: '#6c757d' }}>Desde:</label>
                                <input 
                                    type="date" 
                                    value={fechaInicio} 
                                    onChange={(e) => setFechaInicio(e.target.value)} 
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #ced4da', fontSize: '13px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <label style={{ fontSize: '12px', color: '#6c757d' }}>Hasta:</label>
                                <input 
                                    type="date" 
                                    value={fechaFin} 
                                    onChange={(e) => setFechaFin(e.target.value)} 
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #ced4da', fontSize: '13px' }}
                                />
                            </div>

                            {(fechaInicio || fechaFin) && (
                                <button 
                                    onClick={() => { setFechaInicio(''); setFechaFin(''); }}
                                    style={{ padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                >
                                    Limpiar Filtro
                                </button>
                            )}
                        </div>
                    </div>

                    {/* TABLA DE PEDIDOS */}
                    <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#343a40', color: 'white' }}>
                                    <th style={{ padding: '12px' }}>ID / Fecha</th>
                                    <th style={{ padding: '12px' }}>Cliente</th>
                                    <th style={{ padding: '12px' }}>Productos</th>
                                    <th style={{ padding: '12px' }}>Financiero</th>
                                    <th style={{ padding: '12px' }}>Estado Actual</th>
                                    <th style={{ padding: '12px' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidosFiltrados.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#6c757d', fontWeight: 'bold' }}>
                                            No se encontraron registros de pagos/pedidos para el rango de fechas seleccionado.
                                        </td>
                                    </tr>
                                ) : (
                                    pedidosFiltrados.map(p => {
                                        let items = [];
                                        try { items = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles || []; } catch(e){}

                                        return (
                                            <tr key={p.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                                                    <strong>#{p.id}</strong>
                                                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                                                        {new Date(p.fecha_creacion).toLocaleDateString()}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                                                    <strong style={{ display: 'block', color: '#495057' }}>{p.cliente || 'Anónimo'}</strong>
                                                    <div style={{ fontSize: '12px', color: '#6c757d' }}>{p.telefono}</div>
                                                </td>

                                                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                                                    {items.map((it, idx) => (
                                                        <div key={idx} style={{ fontSize: '13px', marginBottom: '2px' }}>
                                                            <span style={{ fontWeight: 'bold' }}>{it.cantidad}x</span> {it.nombre}
                                                            {it.vendedor_nombre && <span style={{ color: '#17a2b8', fontSize: '11px', marginLeft: '4px' }}>({it.vendedor_nombre})</span>}
                                                        </div>
                                                    ))}
                                                </td>

                                                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                                                    <div style={{ fontSize: '13px', color: '#6c757d' }}>
                                                        Cobrar Cliente: <strong style={{ color: '#28a745' }}>${Number(p.total).toLocaleString()}</strong>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#6c757d' }}>
                                                        Valor Domicilio: <span style={{ color: '#007bff' }}>${Number(p.costo_domicilio || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#6c757d' }}>
                                                        Plat. Domicilio: <span style={{ color: '#28a745', fontWeight: 'bold' }}>+${Number(p.comision_cobrada || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '8px' }}>
                                                        Plat. Ventas: <span style={{ color: '#28a745', fontWeight: 'bold' }}>+${Number(p.comision_productos_cobrada || 0).toLocaleString()}</span>
                                                    </div>

                                                    <div style={{ backgroundColor: '#f8f9fa', padding: '8px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>
                                                            💳 Método: {p.metodo_pago || 'Efectivo'}
                                                        </div>

                                                        {p.metodo_pago !== 'efectivo' && (
                                                            <>
                                                                <div style={{ fontSize: '12px', color: '#0c5460', marginTop: '3px' }}>
                                                                    🏦 Banco: <strong>{p.banco_destino || p.metodo_pago}</strong>
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: '#17a2b8', marginTop: '2px', wordBreak: 'break-all' }}>
                                                                    🔑 Ref: <strong style={{ backgroundColor: '#fff', padding: '2px 4px', borderRadius: '3px', border: '1px solid #17a2b8' }}>
                                                                        {p.referencia_pago || 'Sin referencia'}
                                                                    </strong>
                                                                </div>

                                                                <div style={{ marginTop: '8px' }}>
                                                                    {p.estado_pago === 'aprobado' ? (
                                                                        <span style={{ display: 'inline-block', backgroundColor: '#28a745', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                                                            ✅ Pago Aprobado
                                                                        </span>
                                                                    ) : p.estado_pago === 'rechazado' ? (
                                                                        <span style={{ display: 'inline-block', backgroundColor: '#dc3545', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                                                            ❌ Pago Rechazado
                                                                        </span>
                                                                    ) : (
                                                                        <div>
                                                                            <span style={{ display: 'block', color: '#856404', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                                                                                ⏳ Pendiente por Aceptar:
                                                                            </span>
                                                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                                                <button 
                                                                                    onClick={() => aprobarPagoAdmin(p.id, 'aprobado')}
                                                                                    style={{ flex: 1, backgroundColor: '#28a745', color: 'white', border: 'none', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                                                                                    Aprobar
                                                                                </button>
                                                                                <button 
                                                                                    onClick={() => aprobarPagoAdmin(p.id, 'rechazado')}
                                                                                    style={{ flex: 1, backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                                                                                    Rechazar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '12px', verticalAlign: 'top', minWidth: '160px' }}>
                                                    <select 
                                                        value={p.estado} 
                                                        onChange={(e) => cambiarEstadoPedido(p.id, e.target.value)}
                                                        style={{ 
                                                            padding: '8px 10px', 
                                                            borderRadius: '6px', 
                                                            border: '1px solid #343a40', 
                                                            fontWeight: 'bold', 
                                                            backgroundColor: '#282c34', 
                                                            color: '#3399ff',           
                                                            width: '100%',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                        }}
                                                    >
                                                        <option value="pendiente">🟡 Pendiente</option>
                                                        <option value="en_preparacion">🟠 En Preparación</option>
                                                        <option value="listo_para_entrega">🔵 Listo p/ Entrega</option>
                                                        <option value="llevando_tu_pedido">🟣 En Camino (Domi)</option>
                                                        <option value="entregado">🟢 Entregado</option>
                                                        <option value="cancelado">🔴 Cancelado</option>
                                                    </select>
                                                </td>

                                                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                                                    <button onClick={() => eliminarPedido(p.id)} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>❌</button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PESTAÑA 2: USUARIOS Y BILLETERAS */}
            {pestana === 'usuarios' && (
                <div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px' }}>
                        <form onSubmit={crearUsuario} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', flex: '1 1 350px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ marginTop: 0 }}>👤 Crear Nuevo Usuario o Tienda</h4>
                            <input type="text" placeholder="Nombre completo o Nombre de Tienda" value={nuevoUsuario.nombre} onChange={(e) => setNuevoUsuario({...nuevoUsuario, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="email" placeholder="Correo electrónico" value={nuevoUsuario.email} onChange={(e) => setNuevoUsuario({...nuevoUsuario, email: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="password" placeholder="Contraseña" value={nuevoUsuario.password} onChange={(e) => setNuevoUsuario({...nuevoUsuario, password: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="text" placeholder="Teléfono" value={nuevoUsuario.telefono} onChange={(e) => setNuevoUsuario({...nuevoUsuario, telefono: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <input type="text" placeholder="Dirección física (Ej: Calle 10 # 5-20)" value={nuevoUsuario.direccion} onChange={(e) => setNuevoUsuario({...nuevoUsuario, direccion: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => capturarGPS(setNuevoUsuario)} 
                                    style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                    🗺️ Capturar GPS Actual
                                </button>
                                {nuevoUsuario.gps && <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>✅ GPS Vinculado</span>}
                            </div>

                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Rol de Usuario:</label>
                            <select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({...nuevoUsuario, rol: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #007bff', fontWeight: 'bold' }}>
                                <option value="cliente">Cliente</option>
                                <option value="vendedor">Vendedor / Tienda</option>
                                <option value="domiciliario">Domiciliario / Repartidor</option>
                            </select>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', cursor: 'pointer', fontSize: '14px' }}>
                                <input type="checkbox" checked={nuevoUsuario.es_empresa} onChange={(e) => setNuevoUsuario({...nuevoUsuario, es_empresa: e.target.checked})} />
                                🏢 ¿Cuenta de Empresa? (Envío gratuito)
                            </label>

                            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Registrar Usuario</button>
                        </form>

                        {usuarioEditando && (
                            <form onSubmit={guardarEdicionUsuario} style={{ backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', flex: '1 1 350px', border: '1px solid #ffeeba' }}>
                                <h4 style={{ marginTop: 0, color: '#856404' }}>✏ Editar Usuario #{usuarioEditando.id}</h4>
                                <input type="text" value={usuarioEditando.nombre} onChange={(e) => setUsuarioEditando({...usuarioEditando, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <input type="email" value={usuarioEditando.email} onChange={(e) => setUsuarioEditando({...usuarioEditando, email: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <input type="password" placeholder="Nueva Contraseña" value={usuarioEditando.password || ''} onChange={(e) => setUsuarioEditando({...usuarioEditando, password: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <input type="text" value={usuarioEditando.telefono || ''} onChange={(e) => setUsuarioEditando({...usuarioEditando, telefono: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                
                                <input type="text" value={usuarioEditando.direccion || ''} onChange={(e) => setUsuarioEditando({...usuarioEditando, direccion: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => capturarGPS(setUsuarioEditando)} 
                                        style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                        🗺️ Capturar GPS Actual
                                    </button>
                                    {usuarioEditando.gps && <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>✅ GPS Vinculado</span>}
                                </div>

                                <select value={usuarioEditando.rol} onChange={(e) => setUsuarioEditando({...usuarioEditando, rol: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #856404' }}>
                                    <option value="cliente">Cliente</option>
                                    <option value="vendedor">Vendedor / Tienda</option>
                                    <option value="domiciliario">Domiciliario / Repartidor</option>
                                </select>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Guardar Cambios</button>
                                    <button type="button" onClick={() => setUsuarioEditando(null)} style={{ padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
                                </div>
                            </form>
                        )}
                    </div>

                    <h3>Directorio de Usuarios y Billeteras</h3>
                    <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#343a40', color: 'white' }}>
                                    <th style={{ padding: '12px' }}>ID</th>
                                    <th style={{ padding: '12px' }}>Usuario / Dirección</th>
                                    <th style={{ padding: '12px' }}>Rol</th>
                                    <th style={{ padding: '12px' }}>Saldo Prepago</th>
                                    <th style={{ padding: '12px' }}>Dinero a Favor (Vendedores)</th>
                                    <th style={{ padding: '12px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usuarios.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                        <td style={{ padding: '12px' }}>#{u.id}</td>
                                        <td style={{ padding: '12px' }}>
                                            <strong>{u.nombre}</strong>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>{u.email} | {u.telefono}</div>
                                            <div style={{ fontSize: '11px', color: '#17a2b8', marginTop: '2px' }}>📍 {u.direccion || 'Sin dirección'}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: u.rol === 'vendedor' ? '#e2e3e5' : u.rol === 'domiciliario' ? '#d1ecf1' : '#d4edda', fontSize: '12px', fontWeight: 'bold' }}>
                                                {u.rol.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', color: Number(u.saldo) <= 0 ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                                            ${Number(u.saldo || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {u.rol === 'vendedor' ? (
                                                <div>
                                                    <strong style={{ color: '#007bff' }}>${Number(u.dinero_a_favor || 0).toLocaleString()}</strong>
                                                    {u.cuenta_retiro && <div style={{ fontSize: '11px', color: '#6c757d' }}>Cuenta: {u.cuenta_retiro}</div>}
                                                    {Number(u.dinero_a_favor) > 0 && (
                                                        <button onClick={() => pagarDeudaVendedor(u.id)} style={{ display: 'block', marginTop: '5px', padding: '4px 8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
                                                            Pagar Ganancia
                                                        </button>
                                                    )}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <button onClick={() => setUsuarioEditando(u)} style={{ backgroundColor: '#ffc107', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' }}>✏️</button>
                                            <button onClick={() => eliminarUsuario(u.id)} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>❌</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PESTAÑA 3: RECARGAS PREPAGO */}
            {pestana === 'recargas' && (
                <div>
                    <h3 style={{ marginTop: 0 }}>Solicitudes de Recarga Prepago 💰</h3>
                    <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#343a40', color: 'white' }}>
                                    <th style={{ padding: '12px' }}>ID / Fecha</th>
                                    <th style={{ padding: '12px' }}>Usuario</th>
                                    <th style={{ padding: '12px' }}>Monto</th>
                                    <th style={{ padding: '12px' }}>Detalles de Pago</th>
                                    <th style={{ padding: '12px' }}>Estado</th>
                                    <th style={{ padding: '12px' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recargas.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                        <td style={{ padding: '12px' }}>
                                            #{r.id}
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>{new Date(r.fecha).toLocaleDateString()}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <strong>{r.usuario}</strong>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>{r.rol}</div>
                                        </td>
                                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#28a745' }}>
                                            ${Number(r.monto).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <div>Ref: <strong>{r.referencia}</strong></div>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>Banco: {r.banco_destino || 'N/A'}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: r.estado === 'aprobada' ? '#d4edda' : r.estado === 'rechazada' ? '#f8d7da' : '#fff3cd', color: r.estado === 'aprobada' ? '#155724' : r.estado === 'rechazada' ? '#721c24' : '#856404', fontWeight: 'bold', fontSize: '12px' }}>
                                                {r.estado.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {r.estado === 'pendiente' && (
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button onClick={() => cambiarEstadoRecarga(r.id, 'aprobada')} style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Aprobar</button>
                                                    <button onClick={() => cambiarEstadoRecarga(r.id, 'rechazada')} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Rechazar</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PESTAÑA 4: GESTIÓN DE PRODUCTOS */}
            {pestana === 'productos' && (
                <div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px' }}>
                        <form onSubmit={crearProducto} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', flex: '1 1 350px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ marginTop: 0 }}>🥖 Publicar Nuevo Producto</h4>
                            <input type="text" placeholder="Nombre del Producto" value={nuevoProducto.nombre} onChange={(e) => setNuevoProducto({...nuevoProducto, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <select value={nuevoProducto.categoria} onChange={(e) => setNuevoProducto({...nuevoProducto, categoria: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                                <option value="panaderia">Panadería</option>
                                <option value="reposteria">Repostería</option>
                                <option value="bebidas">Bebidas</option>
                                <option value="combos">Combos</option>
                            </select>

                            <input type="number" placeholder="Precio ($)" value={nuevoProducto.precio} onChange={(e) => setNuevoProducto({...nuevoProducto, precio: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Tienda / Vendedor Propietario:</label>
                            <select value={nuevoProducto.vendedor_id} onChange={(e) => setNuevoProducto({...nuevoProducto, vendedor_id: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #007bff' }}>
                                <option value="">👑 Tienda Oficial (Admin)</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nombre} (ID: {v.id})</option>
                                ))}
                            </select>

                            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Imagen del producto:</label>
                            <input type="file" onChange={(e) => setNuevoProducto({...nuevoProducto, imagen: e.target.files[0]})} style={{ marginBottom: '15px' }} />

                            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Publicar Producto</button>
                        </form>

                        {productoEditando && (
                            <form onSubmit={guardarEdicionProducto} style={{ backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', flex: '1 1 350px', border: '1px solid #ffeeba' }}>
                                <h4 style={{ marginTop: 0, color: '#856404' }}>✏ Edit Producto #{productoEditando.id}</h4>
                                <input type="text" value={productoEditando.nombre} onChange={(e) => setProductoEditando({...productoEditando, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <input type="number" value={productoEditando.precio} onChange={(e) => setProductoEditando({...productoEditando, precio: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Guardar Cambios</button>
                                    <button type="button" onClick={() => setProductoEditando(null)} style={{ padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
                                </div>
                            </form>
                        )}
                    </div>

                    <h3>Catálogo Activo de Productos</h3>
                    <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#343a40', color: 'white' }}>
                                    <th style={{ padding: '12px' }}>Imagen</th>
                                    <th style={{ padding: '12px' }}>Producto</th>
                                    <th style={{ padding: '12px' }}>Tienda / Vendedor</th>
                                    <th style={{ padding: '12px' }}>Precio</th>
                                    <th style={{ padding: '12px' }}>Disponibilidad</th>
                                    <th style={{ padding: '12px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productos.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                        <td style={{ padding: '12px' }}>
                                            <img src={p.imagen} alt={p.nombre} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} />
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <strong>{p.nombre}</strong>
                                            <div style={{ fontSize: '12px', color: '#6c757d' }}>{p.categoria}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {p.tienda_nombre ? (
                                                <strong style={{ color: '#007bff' }}>{p.tienda_nombre}</strong>
                                            ) : (
                                                <span style={{ color: '#28a745', fontWeight: 'bold' }}>👑 Tienda Principal (Admin)</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                                            ${Number(p.precio).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <button 
                                                onClick={() => toggleDisponibilidad(p.id, p.disponible)}
                                                style={{ padding: '5px 10px', borderRadius: '4px', border: 'none', backgroundColor: p.disponible ? '#d4edda' : '#f8d7da', color: p.disponible ? '#155724' : '#721c24', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                {p.disponible ? '🟢 Disponible' : '🔴 Agotado'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <button onClick={() => setProductoEditando(p)} style={{ backgroundColor: '#ffc107', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' }}>✏️</button>
                                            <button onClick={() => eliminarProducto(p.id)} style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>❌</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PESTAÑA 5: TIENDAS REGISTRADAS */}
            {pestana === 'tiendas' && (
                <div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px' }}>
                        <form onSubmit={guardarTiendaAdmin} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', flex: '1 1 350px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ marginTop: 0 }}>👑 Configurar Tienda Principal (Admin)</h4>
                            <input type="text" placeholder="Nombre de la Tienda Principal" value={tiendaAdmin.nombre} onChange={(e) => setTiendaAdmin({...tiendaAdmin, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <textarea placeholder="Descripción del establecimiento" value={tiendaAdmin.descripcion} onChange={(e) => setTiendaAdmin({...tiendaAdmin, descripcion: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <input type="text" placeholder="Dirección física del local/tienda" value={tiendaAdmin.direccion} onChange={(e) => setTiendaAdmin({...tiendaAdmin, direccion: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="text" placeholder="📞 Teléfono de la Tienda (Ej: 3001234567)" value={tiendaAdmin.telefono} onChange={(e) => setTiendaAdmin({...tiendaAdmin, telefono: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => capturarGPS(setTiendaAdmin)} 
                                    style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                    🗺️ Capturar GPS Tienda Principal
                                </button>
                                {tiendaAdmin.gps && <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>✅ GPS Vinculado</span>}
                            </div>

                            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Logo de la Tienda:</label>
                            <input type="file" onChange={(e) => setTiendaAdmin({...tiendaAdmin, logo: e.target.files[0]})} style={{ marginBottom: '15px' }} />

                            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Tienda Principal</button>
                        </form>

                        {tiendaEditando && (
                            <form onSubmit={guardarEdicionTienda} style={{ backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', flex: '1 1 350px', border: '1px solid #ffeeba' }}>
                                <h4 style={{ marginTop: 0, color: '#856404' }}>✏️ Editar Tienda: {tiendaEditando.nombre}</h4>
                                <input type="text" placeholder="Nombre de la Tienda" value={tiendaEditando.nombre} onChange={(e) => setTiendaEditando({...tiendaEditando, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <textarea placeholder="Descripción" value={tiendaEditando.descripcion} onChange={(e) => setTiendaEditando({...tiendaEditando, descripcion: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                
                                <input type="text" placeholder="Dirección física" value={tiendaEditando.direccion} onChange={(e) => setTiendaEditando({...tiendaEditando, direccion: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                <input type="text" placeholder="📞 Teléfono de contacto" value={tiendaEditando.telefono || ''} onChange={(e) => setTiendaEditando({...tiendaEditando, telefono: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => capturarGPS(setTiendaEditando)} 
                                        style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                        🗺️ Capturar GPS Actual
                                    </button>
                                    {tiendaEditando.gps && <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>✅ GPS Vinculado</span>}
                                </div>

                                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Actualizar Logo (Opcional):</label>
                                <input type="file" onChange={(e) => setTiendaEditando({...tiendaEditando, logo: e.target.files[0]})} style={{ marginBottom: '15px' }} />

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Cambios</button>
                                    <button type="button" onClick={() => setTiendaEditando(null)} style={{ padding: '8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
                                </div>
                            </form>
                        )}
                    </div>

                    <h3>Todas las Tiendas Registradas (Vendedores y Admin)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                        {tiendas.map(t => {
                            const abierta = t.abierta !== 0 && t.abierta !== false && t.abierta !== '0';
                            return (
                                <div key={t.usuario_id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: abierta ? '1px solid #eee' : '2px solid #dc3545' }}>
                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '12px' }}>
                                        {t.logo_url ? (
                                            <img src={`${t.logo_url}`} alt={t.nombre} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🏪</div>
                                        )}
                                        <div>
                                            <h4 style={{ margin: '0 0 5px 0' }}>{t.nombre}</h4>
                                            <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#6c757d' }}>{t.descripcion || 'Sin descripción'}</p>
                                            {t.direccion && <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#17a2b8' }}>📍 {t.direccion.split(' |GPS| ')[0]}</p>}
                                            {t.telefono && <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#28a745', fontWeight: 'bold' }}>📞 {t.telefono}</p>}
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: t.rol === 'admin' ? '#d4edda' : '#e2e3e5', color: t.rol === 'admin' ? '#155724' : '#383d41', fontWeight: 'bold', marginRight: '6px' }}>
                                                    {t.rol === 'admin' ? '👑 Principal (Admin)' : `Propietario: ${t.propietario}`}
                                                </span>
                                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: abierta ? '#d4edda' : '#f8d7da', color: abierta ? '#155724' : '#721c24', fontWeight: 'bold' }}>
                                                    {abierta ? '🟢 ABIERTA' : '🔴 CERRADA'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                                        <button onClick={() => toggleEstadoTiendaAdmin(t.usuario_id, t.abierta)} style={{ flex: 1, padding: '6px', backgroundColor: abierta ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                                            {abierta ? '🔴 Cerrar Tienda' : '🟢 Abrir Tienda'}
                                        </button>
                                        <button onClick={() => abrirEdicionTienda(t)} style={{ padding: '6px 12px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                                            ✏️ Editar / GPS
                                        </button>
                                        <button onClick={() => eliminarTienda(t.usuario_id)} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                                            ❌ Eliminar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* PESTAÑA 6: CUENTAS BANCARIAS */}
            {pestana === 'bancos' && (
                <div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px' }}>
                        <form onSubmit={guardarBancoAdmin} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', flex: '1 1 350px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ marginTop: 0 }}>👑 Cuenta Bancaria Principal de Recargas</h4>
                            <input type="text" placeholder="Ej: Nequi / Bancolombia" value={bancoAdmin.banco_nombre} onChange={(e) => setBancoAdmin({...bancoAdmin, banco_nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="text" placeholder="Número de cuenta o celular" value={bancoAdmin.banco_numero} onChange={(e) => setBancoAdmin({...bancoAdmin, banco_numero: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Código QR de Recarga:</label>
                            <input type="file" onChange={(e) => setBancoAdmin({...bancoAdmin, imagen: e.target.files[0]})} style={{ marginBottom: '15px' }} />

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Cuenta Principal</button>
                                <button type="button" onClick={eliminarBancoAdmin} style={{ padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                            </div>
                        </form>

                        <form onSubmit={agregarBanco} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', flex: '1 1 350px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                            <h4 style={{ marginTop: 0 }}>🏦 Agregar Cuenta Bancaria Adicional</h4>
                            <input type="text" placeholder="Nombre del Banco" value={nuevoBanco.nombre} onChange={(e) => setNuevoBanco({...nuevoBanco, nombre: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            <input type="text" placeholder="Número de Cuenta" value={nuevoBanco.numero} onChange={(e) => setNuevoBanco({...nuevoBanco, numero: e.target.value})} required style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            
                            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Imagen o QR (Opcional):</label>
                            <input type="file" onChange={(e) => setNuevoBanco({...nuevoBanco, imagen: e.target.files[0]})} style={{ marginBottom: '15px' }} />

                            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Agregar Banco</button>
                        </form>
                    </div>

                    <h3>Listado de Cuentas Auxiliares</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                        {bancos.map(b => (
                            <div key={b.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', position: 'relative' }}>
                                <button onClick={() => eliminarBanco(b.id)} style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>❌</button>
                                <h4 style={{ margin: '0 0 5px 0' }}>{b.nombre}</h4>
                                <p style={{ margin: 0, color: '#6c757d', fontWeight: 'bold' }}>{b.numero}</p>
                                {b.imagen && <img src={b.imagen} alt={b.nombre} style={{ width: '100%', height: '120px', objectFit: 'contain', marginTop: '10px' }} />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PESTAÑA 7: CONFIGURACIÓN GENERAL */}
            {pestana === 'configuracion' && (
                <div>
                    <form onSubmit={guardarConfigAdmin} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ marginTop: 0 }}>⚙️ Parámetros Globales del Sistema</h3>
                        
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Comisión Domiciliarios (%):</label>
                        <input type="number" value={configAdmin.comision_domicilio} onChange={(e) => setConfigAdmin({...configAdmin, comision_domicilio: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Comisión Vendedores / Tiendas (%):</label>
                        <input type="number" value={configAdmin.comision_vendedor} onChange={(e) => setConfigAdmin({...configAdmin, comision_vendedor: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Ubicación Base (Latitud):</label>
                        <input type="text" value={configAdmin.latitud} onChange={(e) => setConfigAdmin({...configAdmin, latitud: e.target.value})} placeholder="Ej: 3.4516" style={{ width: '100%', padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Ubicación Base (Longitud):</label>
                        <input type="text" value={configAdmin.longitud} onChange={(e) => setConfigAdmin({...configAdmin, longitud: e.target.value})} placeholder="Ej: -76.5320" style={{ width: '100%', padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />

                        <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Parámetros</button>
                    </form>
                </div>
            )}
        </div>
    );
}

export default Admin;
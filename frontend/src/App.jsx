import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import Login from './components/Login';
import Admin from './components/Admin';
import Tienda from './components/Tienda';
import Domiciliario from './components/Domiciliario';
import Vendedor from './components/Vendedor';
import { ConfigurarTienda } from './components/ConfigurarTienda';
import { MenuTiendas } from './components/MenuTiendas';
import { DetalleTiendaProductos } from './components/DetalleTiendaProductos';
import { ClienteEnviarPago } from './components/ClienteEnviarPago';
import { VendedorAprobarPago } from './components/VendedorAprobarPago';
import './notificaciones'; // Esto reemplaza window.alert automáticamente en toda la app

/* =======================================================
   ENVOLTORIOS PARA NAVEGACIÓN Y PARÁMETROS DE RUTA
   ======================================================= */

function MenuTiendasWrapper() {
    const navigate = useNavigate();
    return <MenuTiendas onSeleccionarTienda={(id) => navigate(`/tiendas/${id}`)} />;
}

function DetalleTiendaWrapper() {
    const { id } = useParams();
    const navigate = useNavigate();
    return (
        <DetalleTiendaProductos
            tiendaId={id}
            onVolver={() => navigate('/tiendas')}
            onAgregarProducto={(prod) => {
                alert(`Producto "${prod.nombre}" agregado.`);
            }}
        />
    );
}

function ConfigurarTiendaWrapper() {
    // Obtiene el ID del usuario autenticado guardado en localStorage
    const usuarioId = localStorage.getItem('usuario_id') || 1;
    return <ConfigurarTienda usuarioId={usuarioId} />;
}

function ClienteEnviarPagoWrapper() {
    const { pedidoId } = useParams();
    const navigate = useNavigate();
    return (
        <ClienteEnviarPago
            pedidoId={pedidoId}
            onFinalizado={() => navigate('/tienda')}
        />
    );
}

/* =======================================================
   ENRUTADOR PRINCIPAL
   ======================================================= */

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Redirección inicial */}
                <Route path="/" element={<Navigate to="/login" />} />
                
                {/* Rutas Principales */}
                <Route path="/login" element={<Login />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/tienda" element={<Tienda />} />
                <Route path="/domiciliario" element={<Domiciliario />} />
                <Route path="/vendedor" element={<Vendedor />} />

                {/* Rutas de Tiendas y Catálogo */}
                <Route path="/tiendas" element={<MenuTiendasWrapper />} />
                <Route path="/tiendas/:id" element={<DetalleTiendaWrapper />} />

                {/* Rutas del Vendedor */}
                <Route path="/vendedor/configurar-tienda" element={<ConfigurarTiendaWrapper />} />
                <Route path="/vendedor/aprobar-pagos" element={<VendedorAprobarPago />} />

                {/* Ruta del Cliente para Adjuntar Pago */}
                <Route path="/cliente/enviar-pago/:pedidoId" element={<ClienteEnviarPagoWrapper />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
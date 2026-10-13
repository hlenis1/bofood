import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Login() {
    const [esRegistro, setEsRegistro] = useState(false);
    const [form, setForm] = useState({ nombre: '', email: '', password: '', direccion: '', telefono: '' });
    const [isHovered, setIsHovered] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (esRegistro) {
                await axios.post('http://localhost:3000/api/registro', form);
                alert('¡Registro exitoso! Ahora puedes iniciar sesión.');
                setEsRegistro(false);
            } else {
                const res = await axios.post('http://localhost:3000/api/login', { email: form.email, password: form.password });
                
                if (res.data.success) {
                    localStorage.setItem('usuario', JSON.stringify(res.data.user));
                    const rolUsuario = String(res.data.user.rol || '').trim().toLowerCase();
                    
                    if (rolUsuario === 'admin') {
                        navigate('/admin');
                    } else if (rolUsuario === 'domiciliario') {
                        navigate('/domiciliario');
                    } else if (rolUsuario === 'vendedor') {
                        navigate('/vendedor');
                    } else if (rolUsuario === 'cliente') {
                        navigate('/tienda'); 
                    } else {
                        alert(`🛑 ERROR DE BASE DE DATOS: Tu rol actual es "${rolUsuario}". El sistema no reconoce este rol. Inicia sesión como Admin, borra este usuario y créalo de nuevo.`);
                        localStorage.clear();
                    }
                }
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Error en la solicitud. Verifica tus datos.');
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Branding / Logo Header */}
                <div style={styles.brandContainer}>
                    <div style={styles.logoBadge}>🍔</div>
                    <h1 style={styles.brandTitle}>
                        bo<span style={{ color: '#ff6b35' }}>food</span>
                    </h1>
                    <p style={styles.brandSubtitle}>
                        {esRegistro ? 'Crea tu cuenta y empieza a pedir' : 'Tus platillos favoritos a un clic'}
                    </p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} style={styles.form}>
                    {esRegistro && (
                        <>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Nombre completo</label>
                                <input
                                    type="text"
                                    name="nombre"
                                    placeholder="Ej. Juan Pérez"
                                    value={form.nombre}
                                    onChange={handleChange}
                                    required
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Dirección de entrega</label>
                                <input
                                    type="text"
                                    name="direccion"
                                    placeholder="Ej. Calle 10 #45-22"
                                    value={form.direccion}
                                    onChange={handleChange}
                                    required
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Teléfono</label>
                                <input
                                    type="tel"
                                    name="telefono"
                                    placeholder="Ej. 3001234567"
                                    value={form.telefono}
                                    onChange={handleChange}
                                    required
                                    style={styles.input}
                                />
                            </div>
                        </>
                    )}

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Correo electrónico</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="tu@email.com"
                            value={form.email}
                            onChange={handleChange}
                            required
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Contraseña</label>
                        <input
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={handleChange}
                            required
                            style={styles.input}
                        />
                    </div>

                    <button
                        type="submit"
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                        style={{
                            ...styles.submitButton,
                            backgroundColor: esRegistro 
                                ? (isHovered ? '#1b8a3e' : '#22c55e') 
                                : (isHovered ? '#e85d04' : '#ff6b35'),
                            transform: isHovered ? 'translateY(-1px)' : 'none'
                        }}
                    >
                        {esRegistro ? 'Registrarse 🚀' : 'Ingresar 🍕'}
                    </button>
                </form>

                {/* Alternar vista */}
                <div style={styles.toggleContainer}>
                    <p style={styles.toggleText}>
                        {esRegistro ? '¿Ya tienes una cuenta?' : '¿Aún no tienes cuenta?'}
                    </p>
                    <button
                        type="button"
                        onClick={() => setEsRegistro(!esRegistro)}
                        style={styles.toggleButton}
                    >
                        {esRegistro ? 'Iniciar Sesión' : 'Regístrate gratis'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Objeto de estilos limpios e integrados
const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#faf7f2',
        backgroundImage: 'radial-gradient(#ff6b3512 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: '20px',
        boxSizing: 'border-box'
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        padding: '36px 30px',
        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.06), 0 5px 15px rgba(0, 0, 0, 0.04)',
        width: '100%',
        maxWidth: '420px',
        border: '1px solid #f1e9dd'
    },
    brandContainer: {
        textAlign: 'center',
        marginBottom: '28px'
    },
    logoBadge: {
        fontSize: '38px',
        backgroundColor: '#fff3eb',
        width: '64px',
        height: '64px',
        lineHeight: '64px',
        borderRadius: '50%',
        margin: '0 auto 12px auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px #ffe1d0'
    },
    brandTitle: {
        fontSize: '28px',
        fontWeight: '800',
        color: '#2d3142',
        margin: '0 0 6px 0',
        letterSpacing: '-0.5px'
    },
    brandSubtitle: {
        fontSize: '14px',
        color: '#6c757d',
        margin: 0
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
    },
    label: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#495057'
    },
    input: {
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        fontSize: '14px',
        outline: 'none',
        backgroundColor: '#f8fafc',
        color: '#1e293b',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box'
    },
    submitButton: {
        marginTop: '8px',
        padding: '14px',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        fontSize: '15px',
        boxShadow: '0 4px 12px rgba(255, 107, 53, 0.25)',
        transition: 'all 0.2s ease'
    },
    toggleContainer: {
        textAlign: 'center',
        marginTop: '24px',
        paddingTop: '20px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px'
    },
    toggleText: {
        fontSize: '14px',
        color: '#64748b',
        margin: 0
    },
    toggleButton: {
        background: 'none',
        border: 'none',
        color: '#ff6b35',
        fontWeight: '700',
        cursor: 'pointer',
        fontSize: '14px',
        padding: 0
    }
};

export default Login;
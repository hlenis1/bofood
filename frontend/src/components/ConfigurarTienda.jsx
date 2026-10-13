import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function ConfigurarTienda({ usuarioId }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [logo, setLogo] = useState(null);
  const [logoActual, setLogoActual] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!usuarioId) return;

    fetch(`${API_URL}/api/vendedor/tienda/${usuarioId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setNombre(data.nombre || '');
          setDescripcion(data.descripcion || '');
          setLogoActual(data.logo_url || '');
        }
      })
      .catch((err) => console.error('Error al obtener datos de la tienda:', err));
  }, [usuarioId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!usuarioId) {
        alert("Error: No se ha detectado el ID del usuario. Por favor recarga la página.");
        return;
    }

    const formData = new FormData();
    
    // Aquí enviamos 'usuario_id' para que coincida con tu base de datos y backend
    formData.append('usuario_id', usuarioId); 
    formData.append('nombre', nombre);
    formData.append('descripcion', descripcion);
    
    if (logo) formData.append('logo', logo);

    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/api/vendedor/tienda`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.mensaje || 'Tienda actualizada correctamente');
        if (data.logo_url) setLogoActual(data.logo_url);
      } else {
        alert(data.error || 'Error al actualizar la tienda.');
      }
    } catch (err) {
      alert('Error de conexión con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '20px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Configuración de Mi Tienda</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Nombre de la Tienda:</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Descripción:</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows="3"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Logo de la Tienda:</label>
          {logoActual && (
            <div style={{ margin: '10px 0' }}>
              <img
                src={`${API_URL}${logoActual}`}
                alt="Logo Actual"
                style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover' }}
              />
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} />
        </div>

        <button
          type="submit"
          disabled={cargando}
          style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {cargando ? 'Guardando...' : 'Guardar Datos'}
        </button>
      </form>
    </div>
  );
}
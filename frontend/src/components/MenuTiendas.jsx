import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export function MenuTiendas({ onSeleccionarTienda }) {
  const [tiendas, setTiendas] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/tiendas`)
      .then((res) => res.json())
      .then((data) => setTiendas(data))
      .catch((err) => console.error('Error al listar las tiendas:', err));
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Directorio de Tiendas</h2>
      <p>Selecciona una tienda para explorar sus productos:</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {tiendas.map((item) => (
          <div
            key={item.id}
            onClick={() => onSeleccionarTienda(item.id)}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '15px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <img
              src={item.logo_url ? `${API_URL}${item.logo_url}` : 'https://via.placeholder.com/100'}
              alt={item.nombre}
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '10px' }}
            />
            <h3 style={{ margin: '5px 0' }}>{item.nombre}</h3>
            <p style={{ color: '#666', fontSize: '13px' }}>{item.descripcion || 'Sin descripción'}</p>
            <p style={{ fontSize: '12px', color: '#888' }}>Propietario: {item.propietario}</p>
            <span style={{ color: '#007bff', fontWeight: 'bold', fontSize: '14px' }}>Ver Productos →</span>
          </div>
        ))}
      </div>
    </div>
  );
}
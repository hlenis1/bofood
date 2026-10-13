import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function DetalleTiendaProductos({ tiendaId, onVolver, onAgregarProducto }) {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/tiendas/${tiendaId}/productos`)
      .then((res) => res.json())
      .then((data) => setDatos(data))
      .catch((err) => console.error('Error al obtener productos:', err));
  }, [tiendaId]);

  if (!datos) return <p style={{ padding: '20px' }}>Cargando catálogo...</p>;

  const { tienda, productos } = datos;

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={onVolver} style={{ padding: '8px 16px', marginBottom: '15px', cursor: 'pointer' }}>
        ← Regresar a las Tiendas
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '15px', backgroundColor: '#f4f4f4', borderRadius: '8px', marginBottom: '20px' }}>
        <img
          src={tienda.logo_url ? `${API_URL}${tienda.logo_url}` : 'https://via.placeholder.com/100'}
          alt={tienda.nombre}
          style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <div>
          <h2 style={{ margin: 0 }}>{tienda.nombre}</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>{tienda.descripcion}</p>
        </div>
      </div>

      <h3>Catálogo de Productos</h3>
      {productos.length === 0 ? (
        <p>Esta tienda aún no posee productos disponibles.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {productos.map((prod) => (
            <div key={prod.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
              <img src={prod.imagen} alt={prod.nombre} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }} />
              <h4 style={{ margin: '10px 0 5px 0' }}>{prod.nombre}</h4>
              <p style={{ fontWeight: 'bold', color: '#28a745', fontSize: '16px' }}>${prod.precio}</p>
              <button
                onClick={() => onAgregarProducto(prod)}
                disabled={!prod.disponible}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: prod.disponible ? '#28a745' : '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: prod.disponible ? 'pointer' : 'not-allowed'
                }}
              >
                {prod.disponible ? 'Agregar al Pedido' : 'Agotado'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
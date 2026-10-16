import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export function VendedorAprobarPago() {
  const [pendientes, setPendientes] = useState([]);

  const cargarPagos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/vendedor/pagos-pendientes`);
      const data = await res.json();
      setPendientes(data);
    } catch (err) {
      console.error('Error al obtener pagos pendientes:', err);
    }
  };

  useEffect(() => {
    cargarPagos();
  }, []);

  const resolverPago = async (id, aprobado) => {
    let motivo = '';
    if (!aprobado) {
      motivo = prompt('Escribe el motivo del rechazo:');
      if (!motivo) return;
    }

    try {
      const res = await fetch(`${API_URL}/api/vendedor/pedidos/${id}/evaluar-pago`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobado, motivo_cancelacion: motivo }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        cargarPagos();
      } else {
        alert(data.error || 'Error al procesar la solicitud.');
      }
    } catch (err) {
      alert('Error de conexión.');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Validación de Pagos Pendientes</h2>

      {pendientes.length === 0 ? (
        <p>No hay revisiones de pago pendientes.</p>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {pendientes.map((pago) => (
            <div key={pago.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4>Pedido #{pago.id} - Cliente: {pago.cliente}</h4>
                <p><strong>Monto Total:</strong> ${pago.total}</p>
                <p><strong>Banco Destino:</strong> {pago.banco_destino}</p>
                <p><strong>Referencia:</strong> {pago.referencia_pago}</p>
                <a href={`${API_URL}${pago.comprobante_url}`} target="_blank" rel="noreferrer" style={{ color: '#007bff', fontWeight: 'bold' }}>
                  Ver Comprobante 🔗
                </a>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => resolverPago(pago.id, true)}
                  style={{ padding: '10px 15px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Aprobar Pago y Activar
                </button>
                <button
                  onClick={() => resolverPago(pago.id, false)}
                  style={{ padding: '10px 15px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
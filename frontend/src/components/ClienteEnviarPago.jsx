import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export function ClienteEnviarPago({ pedidoId, onFinalizado }) {
  const [bancos, setBancos] = useState([]);
  const [bancoDestino, setBancoDestino] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/bancos`)
      .then((res) => res.json())
      .then((data) => setBancos(data))
      .catch((err) => console.error('Error al consultar bancos:', err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bancoDestino || !referenciaPago || !comprobante) {
      alert('Todos los campos son obligatorios.');
      return;
    }

    const formData = new FormData();
    formData.append('banco_destino', bancoDestino);
    formData.append('referencia_pago', referenciaPago);
    formData.append('comprobante', comprobante);

    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/api/cliente/pedidos/${pedidoId}/enviar-comprobante`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        if (onFinalizado) onFinalizado();
      } else {
        alert(data.error || 'Error al enviar el comprobante.');
      }
    } catch (err) {
      alert('Error al conectar con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '20px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h3>Adjuntar Comprobante de Pago</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Banco / Medio de Destino:</label>
          <select value={bancoDestino} onChange={(e) => setBancoDestino(e.target.value)} required style={{ width: '100%', padding: '8px' }}>
            <option value="">-- Seleccionar Banco --</option>
            {bancos.map((b) => (
              <option key={b.id} value={b.nombre}>{b.nombre} {b.numero ? `(${b.numero})` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Número de Referencia:</label>
          <input
            type="text"
            value={referenciaPago}
            onChange={(e) => setReferenciaPago(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Comprobante (Imagen/PDF):</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setComprobante(e.target.files[0])} required />
        </div>

        <button
          type="submit"
          disabled={enviando}
          style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {enviando ? 'Subiendo...' : 'Enviar Comprobante'}
        </button>
      </form>
    </div>
  );
}
import { useState, useEffect } from 'react';

export function BotonModoOscuro() {
    const [modoOscuro, setModoOscuro] = useState(() => {
        return localStorage.getItem('tema_bofood') === 'oscuro';
    });

    useEffect(() => {
        if (modoOscuro) {
            document.body.classList.add('dark-theme');
            localStorage.setItem('tema_bofood', 'oscuro');
        } else {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('tema_bofood', 'claro');
        }
    }, [modoOscuro]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                {modoOscuro ? '🌙 Nocturno' : '☀️ Claro'}
            </span>
            <label className="switch-tema">
                <input 
                    type="checkbox" 
                    checked={modoOscuro} 
                    onChange={() => setModoOscuro(!modoOscuro)} 
                />
                <span className="slider-modo"></span>
            </label>
        </div>
    );
}
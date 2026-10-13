import Swal from 'sweetalert2';

// 1. Sobrescribir el alert() nativo para que TODAS las alertas de la app sean elegantes
window.alert = (mensaje, icono = 'info') => {
    // Detectar íconos o emojis en el texto para ajustar automáticamente el tipo
    let type = icono;
    if (typeof mensaje === 'string') {
        if (mensaje.includes('✅') || mensaje.toLowerCase().includes('éxito')) type = 'success';
        else if (mensaje.includes('❌') || mensaje.includes('🔴') || mensaje.toLowerCase().includes('error')) type = 'error';
        else if (mensaje.includes('⚠️') || mensaje.includes('⏳')) type = 'warning';
    }

    Swal.fire({
        title: type === 'error' ? '¡Atención!' : type === 'success' ? '¡Éxito!' : 'Información',
        text: mensaje.replace(/[✅❌🔴⚠️📍💎🛒🛵👑]/g, '').trim(), // Limpia emojis si lo deseas
        icon: type,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#007bff',
        background: '#ffffff',
        color: '#333333',
        customClass: {
            popup: 'swal2-styled-popup'
        }
    });
};

// 2. Función helper para reemplazar los confirm() de confirmación/eliminación
export const confirmarAccion = async (titulo, texto) => {
    const res = await Swal.fire({
        title: titulo,
        text: texto,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, confirmar',
        cancelButtonText: 'Cancelar'
    });
    return res.isConfirmed;
};

// 3. Notificaciones tipo "Toast" (mensajes flotantes pequeños que se cierran solos)
export const mostrarToast = (mensaje, icono = 'success') => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
    });

    Toast.fire({
        icon: icono,
        title: mensaje
    });
};
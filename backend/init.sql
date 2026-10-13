CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    rol ENUM('cliente', 'admin') DEFAULT 'cliente'
);

CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    categoria ENUM('panaderia', 'gaseosa'),
    precio DECIMAL(10,2)
);

CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    total DECIMAL(10,2),
    metodo_pago ENUM('llave', 'nequi'),
    estado ENUM('pendiente', 'en_preparacion', 'despachado', 'entregado', 'cancelado') DEFAULT 'pendiente',
    comentario_admin TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE detalle_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT,
    producto_id INT,
    cantidad INT,
    subtotal DECIMAL(10,2),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

INSERT INTO usuarios (nombre, email, password, rol) VALUES 
('Administrador', 'admin@panaderia.com', 'admin123', 'admin'),
('Juan Cliente', 'juan@correo.com', '1234', 'cliente');

INSERT INTO productos (nombre, categoria, precio) VALUES 
('Pan de Queso', 'panaderia', 2500.00),
('Croissant', 'panaderia', 3500.00),
('Coca Cola 1.5L', 'gaseosa', 5000.00),
('Jugo Hit Mora', 'gaseosa', 3000.00);

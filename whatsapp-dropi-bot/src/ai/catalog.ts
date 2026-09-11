/**
 * Catálogo de productos que Lucía puede vender. Texto libre — no hace falta
 * estructura fija, Claude lo usa como contexto para responder preguntas y
 * persuadir la compra. Para agregar o modificar un producto, pedíselo a
 * Claude en el chat (pegá las specs) y lo suma acá.
 */
export const PRODUCT_CATALOG = `
### Ducha Eléctrica Instantánea 3500W — Agua Caliente al Instante
Olvídate de las duchas frías y los calefones costosos. Esta ducha eléctrica
calienta el agua en segundos, ahorra energía y se instala en minutos sin
necesidad de plomero.

Beneficios:
- Agua caliente en 3 segundos — sin esperar, sin tanque
- Temperatura ajustable — controla el calor con un solo toque
- 3500W de potencia real — agua bien caliente incluso en invierno
- Ducha de alta presión — masaje relajante en cada baño
- Instalación fácil — se instala uno mismo en menos de 15 minutos
- Ahorra hasta 70% en gas/luz — solo calienta el agua que se usa
- Protección anti-fugas y sobrecarga — segura para toda la familia

Ideal para:
- Departamentos sin calefón
- Casas en construcción o renta
- Lugares con agua fría todo el año
- Reemplazar calefones viejos o dañados
- Suites, baños extra y lavanderías

Precio: $43.99 (unidad).

### Slim Patch — Parches Corporales
Apoya tu rutina de bienestar de forma práctica y cómoda con Slim Patch, un
parche corporal diseñado para complementar un estilo de vida saludable. Su
formato discreto permite usarlo durante el día sin interferir con las
actividades diarias.

Beneficios:
- Fácil y cómodo de usar
- Diseño discreto y ligero
- Ideal para complementar una alimentación equilibrada y el ejercicio
- Adhesión cómoda para uso diario
- Práctico para llevar a cualquier lugar

Importante: es un producto de bienestar/complemento, no un tratamiento
médico ni una solución garantizada para bajar de peso — nunca prometas
resultados de pérdida de peso ni hagas afirmaciones médicas sobre este
producto; hablá solo de estos beneficios tal como están.

Se vende en paquetes de cantidad fija (no unidad suelta) — ofrecé estas
opciones y dejá que el cliente elija cuál le conviene:
- Paquete de 30 unidades: $18.99
- Paquete de 60 unidades: $22.99
- Paquete de 90 unidades: $26.99
`.trim();

/**
 * Cuenta bancaria (Banco Pichincha) para el abono del 10% cuando el cliente
 * elige retirar en agencia en vez de envío a domicilio. TODO: completar con
 * los datos reales (banco, tipo de cuenta, número, titular, cédula/RUC).
 */
export const PICKUP_BANK_ACCOUNT = "";

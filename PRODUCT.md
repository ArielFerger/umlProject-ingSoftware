# UML Studio

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Ariel usa el editor principalmente para diagramar visualmente y consultar o editar el código Mermaid cuando lo necesita. El proyecto también contiene material de Ingeniería de Software II para estudiar y resolver ejercicios.

## Product Purpose
Crear, comprender y modificar diagramas UML en un espacio de trabajo claro, con herramientas accesibles y un lienzo amplio. El diagrama y su código representan el mismo documento.

## Operating Context
Aplicación en español usada en el navegador. La vista inicial prioriza el lienzo. El código Mermaid sigue disponible mediante los controles de vista. El módulo de estudio se conserva en `/estudio`.

El sector `/git` permite aprender Git con un simulador visual confirmado por el usuario: repositorios remoto y local arriba, cambios de archivos en vivo y consola de comandos abajo. También permite crear una carpeta vacía, inicializar su repositorio y practicar hasta el primer push, con autocompletado opcional. Los ejercicios deben comprobar el estado del repositorio simulado; los comandos no actúan sobre archivos o cuentas reales.

## Capabilities and Constraints
- Mermaid es el motor canónico: siete tipos de diagramas, importación y exportación de Mermaid, JSON, SVG y PNG.
- Se conservan movimiento de clases, conexiones, menú contextual, deshacer/rehacer, notas, versiones y guardado automático.
- Las posiciones y ajustes se guardan en el comentario `%% uml-studio: `; las operaciones no deben destruirlo.
- El sitio original usa identidad de Sites y Cloudflare D1. Docker ofrece un espacio local de un solo usuario, con almacenamiento persistente separado del sitio publicado.
- Se conservan los documentos, ejercicios y progreso del módulo de estudio. No se modifica ni publica el sitio remoto como parte de este trabajo.

## Brand Commitments
Nombre existente: UML Studio. Interfaz en español y símbolos UML familiares. El usuario solicita una sustitución completa del diseño, colores sobrios, tipografía legible y movimiento sutil orientado a la productividad.

El usuario pidió modo oscuro y otros temas: Claro, Grafito, Noche azul y Papel, compartidos entre UML, Estudio y Git. Su imagen de referencia fija cuatro zonas de Git con colores funcionales azul, naranja, verde y amarillo.

## Evidence on Hand
`README.md`, `AGENTS.md`, `lib/diagrams.ts`, `lib/study-data.json`, pruebas en `tests/` y materiales originales en `public/estudio/`. Las plantillas son ejemplos; no representan datos de usuarios.

## Product Principles
1. El lienzo y el diagrama son la tarea principal.
2. Toda edición visual debe conservar su representación editable en Mermaid.
3. Mostrar el estado de guardado y ofrecer recuperación de errores.
4. Revelar los ajustes y el código sin saturar el espacio de trabajo.
5. Mantener intactos los datos personales y el contenido del curso.

## Accessibility & Inclusion
Conservar operación con teclado, nombres accesibles, foco visible, contraste legible, adaptación a pantallas pequeñas y la preferencia de movimiento reducido solicitada para las microinteracciones.

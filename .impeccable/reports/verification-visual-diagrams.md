# Verificación de edición visual de diagramas UML

Fecha: 2026-10-11. Extensión del editor existente en modo Operate. Disposición del revisor independiente comunicada en el paquete de cierre: **ship**, sobre las capturas actuales indicadas abajo.

## Alcance y evidencia comprobada

Se inspeccionaron `components/diagram-preview.tsx`, `components/studio.tsx`, `app/canvas-interactions.css`, `lib/visual-diagrams.ts`, `lib/visual-svg.ts` y `lib/svg-canvas.ts`; el contrato `.impeccable/surfaces/components-studio-tsx.md`; `PRODUCT.md`, `DESIGN.md` y `.impeccable/design.json`; las pruebas de mutaciones visuales y los scripts/resultados de QA. Se muestrearon también las reglas compartidas de `app/globals.css` para contrastar controles, tipografía y estructura.

Las siete familias actuales —clases, secuencia, estados, actividades, casos de uso, componentes y entidad-relación— conservan Mermaid como representación editable. Los cambios de formularios y lienzo llegan al mismo editor e historial que el código. Las clases conservan su formulario e inspector de miembros; las otras seis familias incorporan formularios de elementos y conexiones.

El formulario de elemento ofrece tipo e identificador; el identificador queda bloqueado al editar. Las familias distintas de ER ofrecen texto visible; ER ofrece atributos, con formato de tipo, nombre y clave opcional. Las conexiones ofrecen origen, destino, tipo y etiqueta. En secuencia, el texto del mensaje es obligatorio y los mensajes nuevos se agregan al final. Arrastrar participantes reordena sus declaraciones, conservando el orden de los mensajes; no representa una posición libre en dos dimensiones. El doble clic abre la edición del elemento o relación. El código conserva las otras declaraciones y los metadatos `%% uml-studio:` mediante mutaciones dirigidas.

Los actores de casos de uso se dibujan con cabeza circular, cuerpo, brazos y piernas, con el nombre debajo. Su espacio de disposición y geometría de conexión se calculan para la figura; el área transparente de interacción no define el extremo de la línea. El SVG generado conserva atributos de trazo de la figura para su uso independiente. El render Mermaid usa un identificador UUID por render; el paquete de cierre identifica esta corrección como solución del SVG vacío tras HMR.

## Verificación funcional y sus límites

- El responsable de implementación informó **40 pruebas aprobadas**, más la prueba del gateway Docker. El documenter inspeccionó el alcance de `tests/visual-diagrams.test.mjs` y `tests/docker-gateway.test.mjs`, pero no volvió a ejecutar la suite. Las seis pruebas visuales cubren conservación de participantes y mensajes, creación en las seis familias no-clase, edición/eliminación de conexiones con declaraciones inline, reconocimiento de actores y límites de sistema, eliminación selectiva de elementos con metadatos y validación de atributos ER. La prueba del gateway trata identidad local, origen, host, redirecciones y salud; no verifica el diseño visual.
- `.sites-runtime/visual-qa.json` registra agregar, conectar con el mouse y editar por doble clic/formulario en **seis familias no-clase**, con guardado comprobado y `errors: []`. No se presenta este archivo como una nueva ejecución de agregar/conectar/editar clases.
- `.sites-runtime/movement-qa.json` registra arrastre, deshacer y rehacer en **las siete familias**, con `errors: []`. El script comprueba posición persistida o reordenamiento de secuencia y compara el resultado guardado antes y después de rehacer.
- Ambos scripts usan documentos temporales creados para QA y contemplan su eliminación con la revisión vigente. Este pase documental no accedió a documentos personales ni modificó datos del usuario.
- Las capturas son evidencia de composición y del caso de uso visible; no representan una matriz visual completa de siete familias, cuatro temas o todos los estados de formulario. La lectura directa del código complementa esa evidencia sin convertirla en una prueba de navegador adicional.

## Inspección visual

Se abrieron las capturas actuales `.impeccable/review/desktop.png` (**1440 × 960**) y `.impeccable/review/mobile.png` (**390 × 844**), y se comprobaron sus dimensiones en el encabezado PNG. Estas son las capturas del caso de uso generadas por el QA de movimiento; las imágenes antiguas homónimas de `.sites-runtime/` no sustentan este cierre.

En escritorio, el lienzo conserva su protagonismo entre explorador y propiedades. Los dos actores visibles aparecen como figuras UML; las conexiones alcanzan sus brazos/cuerpo y los casos de uso permanecen dentro del límite del sistema. Las herramientas de elemento, movimiento y conexión usan la barra compacta existente. En móvil, los paneles laterales se retiran de la composición visible; la barra conserva acciones con iconos y el diagrama se ajusta al lienzo. El ajuste muestra el conjunto a menor escala, con zoom disponible para inspeccionar el texto.

## Consistencia con el sistema existente

**No changes** en `PRODUCT.md`, `DESIGN.md` ni `.impeccable/design.json`. Se preserva el mundo «La mesa de diagramado» y el contrato Operate: esta entrega amplía una capacidad del editor y no cambia la identidad ni los tokens compartidos.

- Paleta: navegación grafito azulado, superficies minerales y acento petróleo para acción, selección y foco.
- Tipografía: Source Sans 3 para la interfaz y los nombres; IBM Plex Mono para código y contenido técnico.
- Escala: controles compactos de 12–14 px y cuerpo de 16 px; la extensión usa los patrones existentes de formulario y barra.
- Forma y profundidad: radios compartidos de 6–8 px, separación tonal y bordes finos; sombras reservadas a superficies flotantes.
- Reglas: «Color con función», «Dos voces» y «Plano en reposo» siguen siendo las decisiones vigentes, sin una nueva regla global derivada del actor o del formulario.

No canonizado ni reparado: el paquete de cierre reporta cuatro avisos mecánicos sobre colores y tamaños tipográficos preexistentes, además de deriva previamente comunicada del sidecar. Se conservan como observaciones heredadas; una extensión funcional no autoriza refrescar el sistema ni legitimar esos residuos como reglas nuevas. Los informes antiguos del detector permanecen como evidencia de sus pases originales y no se presentan como una ejecución nueva de esta extensión.

Este pase escribió únicamente `.impeccable/reports/verification-visual-diagrams.md`; no modificó fuentes, tokens, sidecar ni datos del usuario.

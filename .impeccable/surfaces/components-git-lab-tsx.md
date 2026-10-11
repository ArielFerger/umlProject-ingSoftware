---
version: 1
slug: "components-git-lab-tsx"
primary_target: "components/git-lab.tsx"
related_targets: ["app/git.css","lib/git-simulator.ts","app/git/page.tsx"]
---

# Laboratorio Git — Operate

## Direction contract
THESIS: Aprender Git viendo cómo un comando modifica archivos, referencias y el historial. El usuario fijó la composición: cambios y grafos arriba, consola abajo.

OWN-WORLD: Hereda el sistema mineral, grafito y petróleo del editor UML; Source Sans 3 para lectura e IBM Plex Mono para comandos y hashes. La imagen aportada por el usuario fija cuatro colores funcionales: azul para trabajo, naranja para índice, verde para local y amarillo para remoto, con tonos sobrios y contraste legible.

STORY: Elegir un ejercicio, observar remoto y local, preparar archivos, ejecutar comandos y comprobar el resultado. Un commit seleccionado explica padres y archivos; fetch cambia la referencia remota sin mover HEAD.

FIRST VIEWPORT: Cabecera compartida; ejercicios en una columna de 240 px; cuatro zonas paralelas de Working directory, Staging area, Local repository y Remote repository arriba. Trabajo e índice muestran archivos; local y remoto muestran grafos. Flechas identifican add, commit, push, fetch y pull; consola con prompt editable abajo. Nuevo repositorio crea una carpeta vacía para practicar git init, primer commit, remote add y primer push; el autocompletado opcional propone comandos, archivos y referencias sin ejecutarlos. En móvil las zonas se disponen en dos columnas y la consola sigue accesible mediante scroll normal.

FORM: Extensión del mundo existente. Estructura especificada por el usuario, sin nueva semilla ni torneo de identidad. Simulador seguro confirmado en la consulta.

SIGNATURE: Cada comando conecta la explicación de su efecto con el cambio del grafo y el movimiento de archivos entre trabajo, índice y commit; el nodo nuevo aparece con un breve cambio de trazo, sin animación de carga escalonada.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

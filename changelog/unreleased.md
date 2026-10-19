---
# Release notes of the next version. Add an entry in every pull request that changes what users see or do,
# then run `npm run release` (see changelog/README.md).
summary:
  en: Thesis verification samples, and fixes for other units, generic sections in PyNite and a crash on opening
  es: Ejemplos de verificación de la tesis y arreglos de unidades, secciones genéricas en PyNite y un fallo al abrir
entries:
  - id: verification-samples
    type: feature
    area: [samples]
    title:
      en: Thesis verification models in the samples
      es: Modelos de verificación de la tesis en los ejemplos
    description:
      en: A simply supported beam, a cantilever column with a trapezoidal lateral load, a multi-span plane frame, a rectangular plate supported along its edges, a skewed box culvert on soil, a retaining wall on piles and a 5 storey building with shear walls and an elevator core. They solve with Pynite and SkyCiv with the same results (in the building, the members along the walls differ by a few percent).
      es: Una viga simplemente apoyada, una columna en voladizo con carga lateral trapezoidal, un pórtico plano de varias luces, una placa rectangular apoyada en sus bordes, un box-culvert con esviaje sobre el suelo, un muro de contención sobre pilotes y un edificio de 5 niveles con muros y núcleo de ascensores. Se resuelven con Pynite y SkyCiv con los mismos resultados (en el edificio, los elementos en los bordes de los muros difieren unos pocos por ciento).
  - id: pynite-distributed-loads-any-direction
    type: feature
    area: [analysis]
    title:
      en: Pynite solves distributed loads in any direction and over part of a member
      es: Pynite resuelve cargas distribuidas en cualquier dirección y tramo
    description:
      en: Loads along X and Y no longer stop the solve, and the start and end positions of the load are taken into account, with the same results as SkyCiv.
      es: Las cargas en X y Y ya no detienen el análisis, y se tienen en cuenta las posiciones de inicio y fin de la carga, con los mismos resultados que SkyCiv.
  - id: open-models-with-empty-fields
    type: fix
    severity: critical
    area: [files, ui]
    title:
      en: Models with empty fields open instead of leaving a blank page
      es: Los modelos con campos vacíos se abren en vez de dejar la página en blanco
    description:
      en: Opening a model where a box had an empty field (such as the simple beam sample file) crashed the app. Open it again; nothing in the model was lost.
      es: Abrir un modelo con un campo vacío en alguna caja (como el archivo de ejemplo de la viga simple) bloqueaba la app. Vuelve a abrirlo; no se perdió nada del modelo.
  - id: support-symbols-model-units
    type: fix
    severity: normal
    area: [units, ui]
    title:
      en: Supports and axes keep their size in models in mm, cm or imperial units
      es: Los apoyos y los ejes mantienen su tamaño en modelos en mm, cm o imperiales
    description:
      en: They were drawn as if the model were in meters, so in mm they were a thousand times smaller and the variants could overlap.
      es: Se dibujaban como si el modelo estuviera en metros, así que en mm eran mil veces más pequeños y las variantes podían superponerse.
  - id: grid-follows-units
    type: fix
    severity: normal
    area: [units, modeling]
    title:
      en: The drawing grid and the drawing tool values follow the model units
      es: La grilla y los valores de las herramientas de dibujo siguen las unidades
    description:
      en: A grid of 1 m becomes 1000 mm when you switch to mm, and so do the plane offset, the plate thickness and the load magnitudes. Before, the grid stayed at 1, which is 1 mm in a model in mm.
      es: Una grilla de 1 m pasa a 1000 mm al cambiar a mm, y lo mismo el desfase del plano, el espesor de las placas y las magnitudes de las cargas. Antes la grilla quedaba en 1, que es 1 mm en un modelo en mm.
  - id: variant-labels-size
    type: fix
    severity: normal
    area: [ui]
    title:
      en: Variant labels keep their size however long their value is
      es: Las etiquetas de las variantes mantienen su tamaño aunque su valor sea largo
    description:
      en: Long labels, such as L = 12000 in a model in mm, were drawn at half the size of short ones.
      es: Las etiquetas largas, como L = 12000 en un modelo en mm, se dibujaban a la mitad del tamaño de las cortas.
  - id: drawing-view-fits-everything
    type: fix
    severity: normal
    area: [modeling, ui]
    title:
      en: The drawing tools no longer cut off supports, loads or variant frames
      es: Las herramientas de dibujo ya no recortan apoyos, cargas ni marcos de variantes
    description:
      en: The view of the drawing tools only fitted the nodes, so whatever stuck out of them, such as the frames and labels of the variants, was hidden.
      es: La vista de las herramientas de dibujo solo abarcaba los nodos, así que lo que sobresalía de ellos, como los marcos y etiquetas de las variantes, quedaba oculto.
  - id: import-converts-settings
    type: fix
    severity: normal
    area: [import-export, units]
    title:
      en: Importing a file in other units keeps the mesh size and the load arrows
      es: Importar un archivo en otras unidades mantiene la malla y las flechas de carga
    description:
      en: The settings that are lengths kept their number in the new units, so a mesh of 0.5 m became 0.5 ft.
      es: Los ajustes que son longitudes mantenían su número en las nuevas unidades, así que una malla de 0,5 m pasaba a 0,5 ft.
  - id: unit-round-trips
    type: fix
    severity: normal
    area: [units]
    title:
      en: Switching units and back gives you the same numbers
      es: Cambiar de unidades y volver te devuelve los mismos números
    description:
      en: Converted values are written short (1.640419948 ft for 0.5 m) and land exactly on the original value when you switch back, instead of drifting to 0.5000000002.
      es: Los valores convertidos se escriben cortos (1,640419948 ft para 0,5 m) y vuelven exactamente al valor original al regresar, en vez de derivar a 0,5000000002.
  - id: units-blocked-by-unit-errors
    type: fix
    severity: normal
    area: [units]
    title:
      en: Units can't change while links have unit errors
      es: Las unidades no cambian mientras haya conexiones con errores de unidades
    description:
      en: A link between different quantities (drawn red) made the conversion guess wrong. Settings now tells you how many there are, so you can fix them first.
      es: Una conexión entre magnitudes distintas (en rojo) hacía que la conversión se equivocara. Ahora Ajustes te dice cuántas hay para que las corrijas primero.
  - id: fixed-unit-labels
    type: fix
    severity: normal
    area: [units, ui]
    title:
      en: Links to angle inputs read ° → rad
      es: Las conexiones a entradas de ángulo muestran ° → rad
    description:
      en: Radians, degrees and percentages showed no unit, so a conversion from degrees to radians read as an empty label.
      es: Los radianes, grados y porcentajes no mostraban unidad, así que una conversión de grados a radianes se veía como una etiqueta vacía.
  - id: pynite-generic-sections
    type: fix
    severity: normal
    area: [analysis]
    title:
      en: PyNite solves models with unused generic sections and reports the others
      es: PyNite resuelve modelos con secciones genéricas sin usar y avisa de las demás
    description:
      en: PyNite builds its sections from their shape (rectangular or circular). A generic section in the model, even if no member used it, made the solve fail without a message. Now only members that use one stop the solve, with a notice that lists those sections.
      es: PyNite construye sus secciones a partir de su forma (rectangular o circular). Una sección genérica en el modelo, aunque ninguna barra la usara, hacía fallar el cálculo sin mensaje. Ahora solo lo detienen las barras que usan una, con un aviso que lista esas secciones.
  - id: pynite-circular-sections
    type: feature
    area: [analysis]
    title:
      en: Pynite solves members with circular sections
      es: Pynite resuelve elementos con secciones circulares
    description:
      en: Circular sections no longer stop the solve with Pynite, with the same results as SkyCiv.
      es: Las secciones circulares ya no detienen el análisis con Pynite, con los mismos resultados que SkyCiv.
  - id: spring-supports
    type: feature
    area: [modeling, analysis]
    title:
      en: Spring supports, solved with Pynite and SkyCiv
      es: Apoyos elásticos, resueltos con Pynite y SkyCiv
    description:
      en: The new Spring support box takes a stiffness for each direction where its restraint code has an S (kN/m for translations, kN·m/rad for rotations).
      es: La nueva caja Apoyo elástico recibe una rigidez en cada dirección donde su código de restricción tiene una S (kN/m para traslaciones, kN·m/rad para rotaciones).
  - id: mesh-box-surface-supports
    type: feature
    area: [modeling, analysis]
    title:
      en: Mesh box and surface spring supports for plates on soil
      es: Caja de malla y apoyos elásticos de superficie para placas sobre el suelo
    description:
      en: The new Mesh box meshes its plates with its own size, whatever Structure > Mesh plates is, and gives the list of their mesh nodes. The new Surface spring support box puts a plate of that mesh on soil (a Winkler foundation) from its modulus of subgrade reaction ks (kN/m³), a spring k = ks · A on each mesh node along the directions with an S in its restraint code. Solved with Pynite and SkyCiv with the same results.
      es: La nueva caja Malla malla sus placas con su propio tamaño, sin importar Estructura > Mallar placas, y entrega la lista de sus nodos. La nueva caja Apoyo elástico de superficie apoya una placa de esa malla sobre el suelo (fundación de Winkler) a partir de su módulo de balasto ks (kN/m³), con un resorte k = ks · A en cada nodo de la malla en las direcciones con S en su código de restricción. Se resuelve con Pynite y SkyCiv con los mismos resultados.
  - id: skyciv-unsmoothed-plate-results
    type: fix
    severity: normal
    area: [analysis]
    title:
      en: Plate forces from SkyCiv agree with Pynite's
      es: Las fuerzas en placas de SkyCiv coinciden con las de Pynite
    description:
      en: SkyCiv averaged the plate results at each node over the elements around it, Pynite gives each element its own values. Now SkyCiv gives them per element too, so the plate forces of both engines agree, also next to point loads, supports and plates meeting at an angle.
      es: SkyCiv promediaba los resultados de las placas en cada nodo entre los elementos que lo rodean, Pynite da a cada elemento sus propios valores. Ahora SkyCiv también los da por elemento, así que las fuerzas en placas de ambos motores coinciden, también junto a cargas puntuales, apoyos y placas que se encuentran en ángulo.
---

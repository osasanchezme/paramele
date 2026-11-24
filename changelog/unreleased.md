---
# Release notes of the next version. Add an entry in every pull request that changes what users see or do,
# then run `npm run release` (see changelog/README.md).
# summary: { en: One line for the timeline card, es: Una línea para la tarjeta de la línea de tiempo }
entries:
  - id: thin-thick-plates-sample
    type: feature
    area: [samples]
    title:
      en: Thin and thick plate verification sample
      es: Ejemplo de verificación de placa delgada y gruesa
    description:
      en: One model with two square plates simply supported on their four edges under a uniform pressure, one thin (a/t = 100) and one thick (a/t = 5). Check them against Navier's solutions for Kirchhoff and Reissner-Mindlin plates.
      es: Un modelo con dos placas cuadradas con apoyos simples en sus cuatro bordes y presión uniforme, una delgada (a/t = 100) y una gruesa (a/t = 5). Compáralas con las soluciones de Navier para placas de Kirchhoff y de Reissner-Mindlin.
  - id: verification-sample-posts
    type: improvement
    area: [samples]
    title:
      en: Verification samples link to their blog posts
      es: Los ejemplos de verificación enlazan a su entrada del blog
    description:
      en: Each verification sample in File > Samples links to its post in the Verification category of the blog, with the reference solution and the results.
      es: Cada ejemplo de verificación en Archivo > Ejemplos enlaza a su entrada en la categoría Verificación del blog, con la solución de referencia y los resultados.
  - id: pynite-linear-loads-on-split-members
    type: fix
    severity: normal
    area: [analysis]
    title:
      en: Correct linearly varying loads in Pynite on members crossed by other nodes
      es: Cargas lineales correctas en Pynite sobre elementos que cruzan otros nodos
    description:
      en: A member with nodes along it (such as a column at the edge of a meshed wall) is split into segments, and a distributed load that varies along it came out slightly larger than the one applied. Uniform loads were not affected.
      es: Un elemento con nodos a lo largo (como una columna en el borde de un muro mallado) se divide en tramos, y una carga distribuida que varía a lo largo de él salía un poco mayor que la aplicada. Las cargas uniformes no se veían afectadas.
---

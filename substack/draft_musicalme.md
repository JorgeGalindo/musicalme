# musicalme: 16 años de música, tres días de trabajo, y un algoritmo propio

*Subtítulo sugerido: Cómo construí mi propia herramienta de análisis y descubrimiento musical con Claude Code durante la Semana Santa*

---

Llevo años queriendo hacer esto.

Tengo media vida musical en Spotify (2009–2021) y media en Apple Music (2021–hoy). Entre ambas plataformas, 226.000 reproducciones, 14.000 artistas, 66.000 canciones. Dieciséis años de escucha documentada al milisegundo. Y sin embargo, cada vez que quería entender qué escucho realmente, o descubrir música nueva de manera no algorítmica, me encontraba con lo mismo: Spotify Wrapped te da confeti una vez al año; Apple Music Replay te cuenta lo que ya sabes; Pitchfork te da una nota pero no sabe quién eres.

Ninguna de las tres cosas me satisfacía. Ni por separado ni juntas. Y juntar las dos plataformas —el historial de Spotify con el de Apple Music en un solo sitio— siempre me parecía un lío que no compensaba el esfuerzo.

Esta Semana Santa, con Claude Code y unos días de familia y sol, por fin lo hice.

## Lo que hice (y cómo)

El resultado es **musicalme**: una web personal de análisis musical y recomendaciones. Tres secciones. Todo en local, todo mío, todo vivo.

No es un proyecto terminado —sigue evolucionando mientras escribo esto—, pero ya funciona, y quiero contaros cómo ha sido construirlo porque creo que ilustra algo que me importa mucho: **la diferencia entre delegar la ejecución y mantener el criterio**.

En mi artículo anterior sobre Claude Code hablaba de cómo el coste de cada nuevo análisis tiende a cero. Este proyecto es la versión extrema de esa idea: no solo el coste de *un* análisis, sino el de *un sistema entero* —scraping, procesamiento, visualización, algoritmo de recomendaciones— cae en picado cuando puedes describir lo que quieres y que alguien (algo) lo ejecute.

Pero —y aquí viene lo importante— el criterio sobre qué construir, cómo debería verse, qué métrica captura lo que sientes, qué datos están mal y por qué… eso sigue siendo profundamente humano.

## La parte de análisis

[CAPTURA: vista general del dashboard con todos los años]

La primera sección es un **dashboard interactivo** que visualiza mis patrones de escucha. Los grandes números: horas totales, reproducciones, artistas únicos. Pero también cosas más sutiles:

**La línea de tiempo mensual** muestra cuánto he escuchado cada mes desde julio de 2009, con una media móvil de seis meses en trazo sólido que suaviza los picos. Es clickable: puedo aislar un mes concreto y todo el dashboard se filtra a ese periodo.

[CAPTURA: timeline con la MA y los años seleccionables]

**Los años se multi-seleccionan**. Si elijo 2019 y 2023, todo se convierte en comparación: líneas superpuestas en la timeline, dot-range plots para artistas, columnas paralelas para canciones con las coincidencias destacadas en colores. No todo violeta monótono: cada canción que aparece en ambos años tiene su propio color, para que puedas rastrearla visualmente.

[CAPTURA: modo comparación con 2-3 años, mostrando canciones con colores]

**Top artistas** por horas o por reproducciones (toggle). Clickable: al seleccionar uno, el dashboard se transforma. Desaparece la timeline general (el artista tiene la suya propia), aparecen sus canciones más escuchadas, sus artistas similares según Last.fm divididos en "los que también escucho" y "los que no conozco", y su nota media en las publicaciones de crítica musical.

**Top álbumes** con una métrica propia que me costó diseñar: no son los álbumes con más reproducciones (eso premiaría tener una canción en bucle), sino los que escucho *en profundidad*. Un "album session" es un día en el que escucho 3 o más canciones distintas del mismo disco. La puntuación es la suma de canciones únicas en cada sesión. Así, escuchar 8 de 12 canciones de un disco tres veces puntúa más que escuchar una canción 50 veces. Vetusta Morla — *Mapas* lidera con 83 sesiones.

[CAPTURA: top álbumes con los ring gauges]

**Géneros** en burbujas empaquetadas, no en barras. Clickables: al seleccionar "electronic" todo filtra — artistas, canciones, álbumes, loops, día de la semana. **País de origen** en donut, también clickable. **Década de inicio del artista** en histograma. **Hora del día** con gradiente de colores del amanecer a la noche, en hora local de donde estuviera escuchando (Colombia entre 2016 y 2022, Madrid el resto).

**Canciones en loop**: las que escuché más de una vez el mismo día. Filtros dinámicos: "todas", "3x", "5x", "9x"... hasta "16x". Los botones se generan solos según lo que haya en los datos.

**Nota media en reviews**: un heatmap por año mostrando la nota media ponderada de lo que escucho según Pitchfork, NME, Resident Advisor y Uncut. Cuando selecciono un artista, muestra su nota individual.

Todo filtra todo. Año + artista + género + país + mes se componen. Es la parte que más iteré con Claude: cada vez que algo no filtraba como esperaba, lo decía, y se arreglaba.

## Recuperar

[CAPTURA: sección recuperar con el slider]

La segunda sección se llama **recuperar**. Un slider de rango temporal con precisión mensual, desde 2008 hasta hoy, que muestra artistas y canciones que escuchaba mucho en el periodo seleccionado pero que ya no escucho. La pregunta que responde: *¿qué música amaba en 2014 que he olvidado?*

Con los datos de Spotify, esto funciona de verdad. Puedo poner el rango entre junio de 2012 y diciembre de 2013 y ver qué artistas dominaban mis tardes en Bogotá. Algunos los reconozco inmediatamente; otros son redescubrimientos genuinos.

## Descubrir

[CAPTURA: sección descubrir con los filtros y los 4 dots]

La tercera sección es la más ambiciosa: un **motor de recomendaciones multi-dimensional**. Cuatro dimensiones de afinidad:

1. **Similitud directa**: artistas que Last.fm considera parecidos a los que escucho, pesados por cuántas horas les dedico.
2. **Segundo grado**: similares de mis similares. Señal más débil pero alcanza artistas que la similitud directa no llega.
3. **Influencias**: cadenas de influencia de Wikidata. Si escucho mucho a alguien que fue influenciado por Kate Bush, Kate Bush sube.
4. **Afinidad de género**: solapamiento entre el perfil de géneros del candidato y el mío.

Cada recomendación tiene un indicador visual: cuatro puntitos en cuadrícula 2×2, cada uno de un color y un tamaño proporcional a la fuerza de esa dimensión. De un vistazo sabes *por qué* te lo recomienda.

Cuatro modos preconfigurados cambian los pesos: **mix** (equilibrado), **familiar** (heavy en similitud directa), **explorar** (2º grado + género), **sorprender** (influencias). Filtrable por género (AND/OR), artistas semilla, fuerza de afinidad mínima, y grado de familiaridad: "nunca escuchado", "1–4 veces", "5–20 veces" — para redescubrir artistas a los que di una oportunidad fugaz.

Cada resultado tiene un botón **sí** (lo probé, me gusta) y **no** (lo probé, no me interesa). Persisten entre sesiones. Los "no" desaparecen para siempre.

## La granja de datos

Bajo el capó hay ocho fuentes de datos externas que alimentan todo esto:

- **MusicBrainz**: géneros, país, tipo (grupo/solista), periodo activo. 14.000 artistas.
- **Last.fm**: tags, artistas similares, número de listeners. Expandido a segundo y tercer grado: 37.000 artistas en el grafo de similitud.
- **Wikidata**: influencias musicales ("quién influyó a quién"). La única fuente con este dato.
- **Discogs**: géneros y estilos por álbum. La taxonomía más limpia.
- **Pitchfork**: ~9.000 reviews con nota 0–10, scrapeadas desde 2017 hasta 2026.
- **NME**: ~1.800 reviews con nota.
- **Resident Advisor**: ~5.800 reviews vía GraphQL, con géneros y sellos.
- **Uncut**: reviews con nota (archivo limitado).

Todos los scrapers son incrementales: si los relanzas, solo procesan lo nuevo. **Ninguno usa IA ni gasta tokens**: son scripts Python puros con `requests` y regex. Los dejé corriendo durante los días de Semana Santa mientras estaba con mi familia. Al volver, tenía decenas de miles de reviews y metadatos listos.

Esto es lo que más me ha gustado de la experiencia: **la combinación de trabajo supervisado (diseño, criterio, iteración visual) con procesos autónomos (scraping, enrichment)**. Los scrapers no necesitan que estés delante. El diseño sí.

## Lo que aprendí sobre construir con Claude Code

Unas cuantas lecciones que complementan las que escribí en febrero:

**El criterio es la constante.** Claude Code ejecuta. Yo decido. Cada vez que algo no me cuadraba visualmente —el ranking al revés, una barra donde debería haber burbujas, un color que no distinguía nada— lo decía y se corregía. Pero *detectar* que está mal requiere saber qué quieres. Ningún prompt sustituye eso.

**Iterar es barato, pero la dirección no es obvia.** Pasé de barras a treemaps, de treemaps a burbujas empaquetadas para los géneros. Cada cambio costó un minuto de ejecución. Pero saber que las burbujas eran mejor que el treemap fue un juicio estético que la herramienta no puede hacer por ti.

**El scraping masivo es el trabajo perfecto para delegar.** Los scrapers de Pitchfork, NME y RA fueron diseñados en una sesión, probados con 5 reviews, y luego lanzados para miles. Mientras cenaba con mi familia, se iban acumulando. Eso antes requería un servidor; ahora basta con tu portátil y `nohup`.

**Los datos siempre están un poco sucios.** "Kanye West" en tu historial es "Ye" en MusicBrainz. "Channel ORANGE" y "channel ORANGE" son el mismo disco desde dos plataformas. Ryan Adams hizo un cover entero de Oasis y eso confunde al algoritmo. Cada uno de estos problemas se resuelve en segundos, pero *encontrarlos* requiere ojos humanos que miran los datos y dicen "esto no cuadra".

**Lo personal no escala, y eso está bien.** Este proyecto solo sirve para mí. Las notas medias de Pitchfork reflejan mi gusto porque yo escucho artistas que Pitchfork reviewea. El filtro de "iPad a horas raras" es mío. El override de "La Perla" de Sofia Kourtesis que se quedó en loop un día de abril de 2022 es mío. Y eso es precisamente lo que lo hace útil: no pretende ser universal.

## Lo que falta

Esto es un proyecto vivo. Algunas cosas que quiero añadir:

- **Integrar las notas de reviews en el motor de descubrimiento** — ahora mismo Pitchfork y co. alimentan el análisis pero no las recomendaciones directamente.
- **Los géneros de Discogs** (más limpios que MusicBrainz) aún no están en el dashboard — el scraping sigue en marcha.
- **Un input de lenguaje natural** en la sección de descubrir: "algo como Radiohead pero más electrónico" → Claude traduce eso a filtros.
- **Más datos de Apple Music** sin explorar: el campo `shuffle` de Spotify (¿escucha intencional o aleatorio?), el `reason_start/end` (¿le diste play o fue autoplay?).

---

*musicalme es un proyecto personal construido con Claude Code (Opus), Next.js, Recharts, Python y datos de Apple Music, Spotify, Pitchfork, NME, Resident Advisor, MusicBrainz, Last.fm, Wikidata y Discogs. El código y los datos son privados, pero el enfoque es replicable: cualquiera puede pedir sus datos a Apple/Spotify y construir algo parecido.*

[CAPTURA FINAL: vista general con todo visible]

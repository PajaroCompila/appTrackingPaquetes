from pathlib import Path
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

BASE = Path(__file__).resolve().parent
CAPTURAS = BASE / "manual-capturas-anotadas"
SALIDA = BASE / "Manual de usuario - Pedidos Bodega - Trato formal revisado.docx"
LOGO = BASE.parent / "frontend" / "public" / "imagenes" / "logo-pajaro-azul.png"
AZUL, MEDIO, CLARO, GRIS, AVISO = "123568", "235A96", "EAF2FB", "54667A", "FFF4D6"
GRIS_CLARO, VERDE, BLANCO, NEGRO = "F4F7FA", "E5F5EC", "FFFFFF", "17212B"

def rgb(valor): return RGBColor.from_string(valor)

def fuente(run, tamano=10.5, negrita=False, color=NEGRO, cursiva=False):
    run.font.name = "Segoe UI"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Segoe UI")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Segoe UI")
    run.font.size, run.font.bold, run.font.italic = Pt(tamano), negrita, cursiva
    run.font.color.rgb = rgb(color)

def sombrear(celda, color):
    propiedades = celda._tc.get_or_add_tcPr()
    relleno = propiedades.find(qn("w:shd"))
    if relleno is None:
        relleno = OxmlElement("w:shd"); propiedades.append(relleno)
    relleno.set(qn("w:fill"), color)

def margenes_celda(celda, arriba=110, inicio=150, abajo=110, fin=150):
    propiedades = celda._tc.get_or_add_tcPr()
    margenes = propiedades.first_child_found_in("w:tcMar")
    if margenes is None:
        margenes = OxmlElement("w:tcMar"); propiedades.append(margenes)
    for nombre, valor in (("top", arriba), ("start", inicio), ("bottom", abajo), ("end", fin)):
        nodo = margenes.find(qn(f"w:{nombre}"))
        if nodo is None:
            nodo = OxmlElement(f"w:{nombre}"); margenes.append(nodo)
        nodo.set(qn("w:w"), str(valor)); nodo.set(qn("w:type"), "dxa")

def bordes_tabla(tabla, color="D6E0EA", tamano="6"):
    propiedades = tabla._tbl.tblPr
    bordes = propiedades.first_child_found_in("w:tblBorders")
    if bordes is None:
        bordes = OxmlElement("w:tblBorders"); propiedades.append(bordes)
    for lado in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borde = bordes.find(qn(f"w:{lado}"))
        if borde is None:
            borde = OxmlElement(f"w:{lado}"); bordes.append(borde)
        borde.set(qn("w:val"), "single"); borde.set(qn("w:sz"), tamano); borde.set(qn("w:color"), color)

def ancho_tabla(tabla, anchos):
    tabla.autofit = False
    total = sum(anchos)
    propiedades = tabla._tbl.tblPr
    ancho = propiedades.first_child_found_in("w:tblW")
    if ancho is None:
        ancho = OxmlElement("w:tblW"); propiedades.append(ancho)
    ancho.set(qn("w:w"), str(total)); ancho.set(qn("w:type"), "dxa")
    grid = tabla._tbl.tblGrid
    for elemento in list(grid): grid.remove(elemento)
    for valor in anchos:
        columna = OxmlElement("w:gridCol"); columna.set(qn("w:w"), str(valor)); grid.append(columna)
    for fila in tabla.rows:
        for indice, celda in enumerate(fila.cells):
            valor = anchos[min(indice, len(anchos) - 1)]
            celda.width = Inches(valor / 1440)
            ancho_celda = celda._tc.get_or_add_tcPr().first_child_found_in("w:tcW")
            ancho_celda.set(qn("w:w"), str(valor)); ancho_celda.set(qn("w:type"), "dxa")

def configurar_documento(doc):
    seccion = doc.sections[0]
    seccion.page_width, seccion.page_height = Inches(8.5), Inches(11)
    seccion.top_margin = seccion.bottom_margin = Inches(0.62)
    seccion.left_margin = seccion.right_margin = Inches(0.68)
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size, normal.font.color.rgb = "Segoe UI", Pt(10.5), rgb(NEGRO)
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Segoe UI"); normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Segoe UI")
    normal.paragraph_format.space_after, normal.paragraph_format.line_spacing = Pt(5), 1.15
    for nombre, tamano, color, antes, despues in (("Title",30,AZUL,0,8),("Subtitle",14,GRIS,0,12),("Heading 1",20,AZUL,14,7),("Heading 2",14,MEDIO,10,5),("Heading 3",11.5,AZUL,7,3)):
        estilo = doc.styles[nombre]
        estilo.font.name, estilo.font.size, estilo.font.bold, estilo.font.color.rgb = "Segoe UI", Pt(tamano), nombre != "Subtitle", rgb(color)
        estilo._element.rPr.rFonts.set(qn("w:ascii"), "Segoe UI"); estilo._element.rPr.rFonts.set(qn("w:hAnsi"), "Segoe UI")
        estilo.paragraph_format.space_before, estilo.paragraph_format.space_after, estilo.paragraph_format.keep_with_next = Pt(antes), Pt(despues), True
    encabezado = seccion.header.paragraphs[0]; encabezado.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    fuente(encabezado.add_run("PEDIDOS BODEGA  |  MANUAL DE USUARIO"), 8, True, GRIS)
    pie = seccion.footer.paragraphs[0]; pie.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fuente(pie.add_run("Todos los derechos reservados. 2026© Almacén Pájaro Azul."), 8, False, GRIS)

def salto(doc): doc.add_page_break()

def titulo_seccion(doc, numero, titulo, bajada=None):
    parrafo = doc.add_paragraph(style="Heading 1")
    fuente(parrafo.add_run(f"{numero}. "), 20, True, MEDIO); fuente(parrafo.add_run(titulo), 20, True, AZUL)
    if bajada:
        p = doc.add_paragraph(bajada); p.paragraph_format.space_after = Pt(9)
        for run in p.runs: fuente(run, 11, False, GRIS)

def nota(doc, titulo, texto, tipo="info"):
    color = {"info": CLARO, "cuidado": AVISO, "bien": VERDE}[tipo]
    tabla = doc.add_table(rows=1, cols=1); tabla.alignment = WD_TABLE_ALIGNMENT.CENTER; ancho_tabla(tabla, [10080])
    celda = tabla.cell(0, 0); sombrear(celda, color); margenes_celda(celda, 150, 190, 150, 190)
    p = celda.paragraphs[0]; fuente(p.add_run(f"{titulo}\n"), 10.5, True, AZUL); fuente(p.add_run(texto), 10.2)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)

def paso(doc, numero, titulo, texto):
    tabla = doc.add_table(rows=1, cols=2); tabla.alignment = WD_TABLE_ALIGNMENT.CENTER; ancho_tabla(tabla, [620, 9460])
    for celda in tabla.rows[0].cells:
        celda.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER; margenes_celda(celda, 125, 150, 125, 150)
    sombrear(tabla.cell(0, 0), MEDIO); sombrear(tabla.cell(0, 1), GRIS_CLARO)
    p = tabla.cell(0, 0).paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER; fuente(p.add_run(str(numero)), 13, True, BLANCO)
    p = tabla.cell(0, 1).paragraphs[0]; fuente(p.add_run(f"{titulo}. "), 10.5, True, AZUL); fuente(p.add_run(texto), 10.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def captura(doc, nombre, leyenda):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next = True; p.paragraph_format.space_after = Pt(3)
    imagen = p.add_run().add_picture(str(CAPTURAS / f"{nombre}.png"), width=Inches(7.02))
    imagen._inline.docPr.set("descr", leyenda)
    p = doc.add_paragraph(leyenda); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_after = Pt(7)
    for run in p.runs: fuente(run, 8.5, False, GRIS, True)

def referencias(doc, elementos):
    tabla = doc.add_table(rows=0, cols=2); tabla.alignment = WD_TABLE_ALIGNMENT.CENTER; ancho_tabla(tabla, [5040, 5040]); bordes_tabla(tabla)
    for indice in range(0, len(elementos), 2):
        fila = tabla.add_row()
        for columna in range(2):
            celda = fila.cells[columna]; margenes_celda(celda, 105, 150, 105, 150); sombrear(celda, BLANCO if len(tabla.rows) % 2 else GRIS_CLARO)
            posicion = indice + columna
            if posicion < len(elementos):
                numero, texto = elementos[posicion]; p = celda.paragraphs[0]
                fuente(p.add_run(f"{numero}  "), 10, True, "D97706"); fuente(p.add_run(texto), 9.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)

def tabla_simple(doc, encabezados, filas, anchos):
    tabla = doc.add_table(rows=1, cols=len(encabezados)); tabla.alignment = WD_TABLE_ALIGNMENT.CENTER; ancho_tabla(tabla, anchos); bordes_tabla(tabla)
    propiedades_fila = tabla.rows[0]._tr.get_or_add_trPr()
    encabezado_repetido = OxmlElement("w:tblHeader"); encabezado_repetido.set(qn("w:val"), "true"); propiedades_fila.append(encabezado_repetido)
    for indice, texto in enumerate(encabezados):
        celda = tabla.rows[0].cells[indice]; sombrear(celda, AZUL); margenes_celda(celda, 120, 150, 120, 150); fuente(celda.paragraphs[0].add_run(texto), 9.5, True, BLANCO)
    for numero_fila, fila in enumerate(filas):
        celdas = tabla.add_row().cells
        for indice, texto in enumerate(fila):
            celda = celdas[indice]; sombrear(celda, BLANCO if numero_fila % 2 == 0 else GRIS_CLARO); margenes_celda(celda, 120, 150, 120, 150)
            fuente(celda.paragraphs[0].add_run(texto), 9.5, indice == 0)
    doc.add_paragraph()

def aplicar_tratamiento_formal(doc):
    reemplazos = (
        ("Este manual es para vos", "Este manual es para usted"),
        ("No trabajés", "No trabaje"), ("No compartás", "No comparta"),
        ("No cerrés", "No cierre"), ("No transfirás", "No transfiera"),
        ("No agregués", "No agregue"), ("No guardés", "No guarde"),
        ("No creés", "No cree"), ("No usés", "No use"),
        ("No marqués", "No marque"), ("detenete", "deténgase"),
        ("no transfirás", "no transfiera"), ("No repitás", "No repita"),
        ("Podés", "Puede"), ("podés", "puede"),
        ("Buscá", "Busque"), ("buscá", "busque"),
        ("Mirá", "Mire"), ("mirá", "mire"),
        ("Repetí", "Repita"), ("repetí", "repita"),
        ("Entrá", "Ingrese"), ("entrar", "ingresar"),
        ("Revisá", "Revise"), ("revisá", "revise"),
        ("Confirmá", "Confirme"), ("confirmá", "confirme"),
        ("Dejá", "Deje"), ("dejá", "deje"),
        ("Consultá", "Consulte"), ("consultá", "consulte"),
        ("Usá", "Use"), ("usá", "use"),
        ("Escribí", "Escriba"), ("escribí", "escriba"),
        ("Presioná", "Presione"), ("presioná", "presione"),
        ("Pedí", "Pida"), ("pedí", "pida"),
        ("Elegí", "Elija"), ("elegí", "elija"),
        ("Aplicá", "Aplique"), ("aplicá", "aplique"),
        ("Avisale", "Avise"), ("avisale", "avise"),
        ("Leé", "Lea"), ("leé", "lea"),
        ("Hacé", "Haga"), ("hacé", "haga"),
        ("Cerrá", "Cierre"), ("cerrá", "cierre"),
        ("Regresá", "Regrese"), ("regresá", "regrese"),
        ("Marcá", "Marque"), ("marcá", "marque"),
        ("Imprimí", "Imprima"), ("imprimí", "imprima"),
        ("Transferí", "Transfiera"), ("transferí", "transfiera"),
        ("Hacelo", "Hágalo"), ("hacelo", "hágalo"),
        ("Anotá", "Anote"), ("anotá", "anote"),
        ("enviáselo", "envíelo"), ("Usalo", "Úselo"), ("usalo", "úselo"),
        ("Entregala", "Entréguela"), ("entregala", "entréguela"),
        ("Giralo", "Gírelo"), ("giralo", "gírelo"),
        ("Mové", "Mueva"), ("mové", "mueva"),
        ("Esperá", "Espere"), ("esperá", "espere"),
        ("avisá", "avise"), ("Ampliá", "Amplíe"), ("ampliá", "amplíe"),
        ("Probá", "Pruebe"), ("probá", "pruebe"),
        ("Abrí", "Abra"), ("abrí", "abra"),
        ("Filtrá", "Filtre"), ("filtrá", "filtre"),
        ("Editá", "Edite"), ("editá", "edite"),
        ("Activá", "Active"), ("activá", "active"),
        ("Desactivá", "Desactive"), ("desactivá", "desactive"),
        ("Cancelá", "Cancele"), ("cancelá", "cancele"),
        ("Limpiá", "Limpie"), ("limpiá", "limpie"),
        ("Restablecé", "Restablezca"), ("restablecé", "restablezca"),
        ("Ajustá", "Ajuste"), ("ajustá", "ajuste"),
        ("Desplazá", "Desplace"), ("desplazá", "desplace"),
        ("desplazala", "desplácela"), ("seleccioná", "seleccione"),
        ("llevás", "lleva"), ("atendés", "atiende"),
        ("presionés", "presione"), ("repitás", "repita"),
        ("pidás", "pida"), ("enviá", "envíe"),
        ("presionaste", "presionó"), ("conocés", "conoce"),
        ("SeguÍ", "Siga"), ("Seguí", "Siga"), ("seguí", "siga"),
        ("reportá", "reporte"), ("preparés", "prepare"),
        ("tenés", "tiene"), ("necesitás", "necesita"),
        ("navegás", "navega"), ("estás", "está"), ("estés", "esté"),
        ("Vas a ver", "Verá"), ("vas a ver", "verá"),
        ("que te entregó", "que le entregó"),
        ("te deja", "le permite"), ("te dio", "le dio"), ("te da", "le da"),
        ("tu propio usuario", "su propio usuario"),
        ("tu usuario", "su usuario"), ("tu contraseña", "su contraseña"),
        ("tu bodega", "su bodega"), ("Tus filtros", "Sus filtros"), ("tus filtros", "sus filtros"),
        ("tus datos", "sus datos"), ("tu selección", "su selección"),
    )
    partes = [doc]
    for seccion in doc.sections:
        partes.extend((seccion.header, seccion.footer))
    for parte in partes:
        parrafos = list(parte.paragraphs)
        for tabla in parte.tables:
            for fila in tabla.rows:
                for celda in fila.cells:
                    parrafos.extend(celda.paragraphs)
        for parrafo in parrafos:
            for run in parrafo.runs:
                texto_original = run.text
                texto = texto_original
                for origen, destino in reemplazos:
                    texto = texto.replace(origen, destino)
                if texto != texto_original:
                    run.text = texto

doc = Document(); configurar_documento(doc)
doc.add_paragraph().paragraph_format.space_after = Pt(28)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
imagen_logo = p.add_run().add_picture(str(LOGO), width=Inches(3.55)); imagen_logo._inline.docPr.set("descr", "Logotipo de Almacén Pájaro Azul")
doc.add_paragraph().paragraph_format.space_after = Pt(16)
p = doc.add_paragraph(style="Title"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; fuente(p.add_run("Manual de usuario"), 30, True, AZUL)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; fuente(p.add_run("PEDIDOS BODEGA"), 20, True, MEDIO)
p = doc.add_paragraph("Cómo buscar, preparar y revisar pedidos, paso a paso"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in p.runs: fuente(run, 13, False, GRIS)
doc.add_paragraph().paragraph_format.space_after = Pt(18)
nota(doc, "Este manual es para vos", "Podés seguirlo aunque sea la primera vez que usás la aplicación. Buscá la pantalla que necesitás, mirá los números naranjas de la imagen y repetí los pasos en el mismo orden.", "bien")
p = doc.add_paragraph("Versión: 28 de agosto de 2026"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in p.runs: fuente(run, 10, True, GRIS)

salto(doc); titulo_seccion(doc, "1", "Antes de empezar", "Tres reglas sencillas evitan errores y protegen el trabajo de bodega.")
paso(doc,1,"Entrá con tu propio usuario","No trabajés con la cuenta de otra persona. El sistema guarda quién realizó cada despacho.")
paso(doc,2,"Revisá el número y la bodega","Antes de marcar un artículo, confirmá que pertenece al pedido y a la bodega que estás atendiendo.")
paso(doc,3,"Si tenés duda, no transfirás","Dejá el artículo sin marcar y consultá con el encargado de bodega.")
nota(doc,"La aplicación se actualiza sola","La lista busca cambios en segundo plano. Tus filtros y selecciones se conservan mientras navegás.")
doc.add_heading("El recorrido de un pedido",level=2)
tabla_simple(doc,["Etapa","Qué significa"],[("Pedidos pendientes","Bodega todavía debe revisar o preparar uno o más artículos."),("Pedidos despachados","Bodega ya preparó los artículos seleccionados y espera la entrega al cliente."),("Historial","El pedido ya aparece como entregado.")],[3000,7080])
nota(doc,"Importante","Una fila representa un artículo. Varias filas pueden llevar el mismo número de pedido.","cuidado")

salto(doc); titulo_seccion(doc,"2","Iniciar sesión","Usá el usuario y la contraseña que te entregó Sistemas.")
captura(doc,"01-inicio-sesion","Los números naranjas señalan dónde escribir y qué botón presionar.")
referencias(doc,[(1,"Escribí tu usuario."),(2,"Escribí tu contraseña."),(3,"Presioná Iniciar sesión."),(4,"Revisá que estés en la página oficial de Pedidos Bodega.")])
paso(doc,1,"Escribí el usuario","No agregués espacios antes ni después."); paso(doc,2,"Escribí la contraseña","Si necesitás revisarla, presioná Mostrar contraseña."); paso(doc,3,"Entrá","Presioná Iniciar sesión una sola vez y esperá a que abra la pantalla.")
nota(doc,"Si no te deja entrar","Revisá mayúsculas, minúsculas y espacios. Si sigue igual, pedí ayuda a Sistemas. No compartás tu contraseña por mensaje.","cuidado")

salto(doc); titulo_seccion(doc,"3","Conocer el menú","El menú azul está siempre al lado izquierdo.")
tabla_simple(doc,["Opción","Para qué sirve","Quién la usa"],[("Dashboard","Muestra el movimiento de las sucursales.","Administrador"),("Pedidos pendientes","Permite buscar, seleccionar, imprimir y transferir artículos.","Bodega y administrador"),("Pedidos despachados","Muestra lo preparado que todavía espera entrega.","Bodega y administrador"),("Historial","Permite revisar pedidos y artículos ya entregados.","Usuarios autorizados"),("Usuarios","Crea, edita, activa o desactiva accesos.","Administrador"),("Cerrar sesión","Sale de la aplicación de forma segura.","Todos")],[2500,5000,2580])
paso(doc,1,"Ver el nombre de un ícono","Dejá el puntero encima del ícono. Aparecerá una etiqueta con su nombre."); paso(doc,2,"Abrir una pantalla","Presioná una vez el ícono correspondiente."); paso(doc,3,"Salir","Al terminar, presioná el último ícono del menú. No cerrés solamente la pestaña.")
nota(doc,"Si no ves Dashboard o Usuarios","No es una falla. Esas pantallas aparecen únicamente en las cuentas autorizadas.")

salto(doc); titulo_seccion(doc,"4","Dashboard","Esta pantalla le da al administrador una vista rápida del día.")
captura(doc,"02-dashboard","Resumen real de pedidos por sucursal.")
referencias(doc,[(1,"Elegí la fecha inicial."),(2,"Aplicá o limpiá los filtros."),(3,"Revisá los totales generales."),(4,"La franja amarilla avisa si una sucursal no respondió."),(5,"Cada tarjeta muestra pendientes y entregados por sucursal.")])
paso(doc,1,"Elegí las fechas","Usá el mismo día en ambos campos para revisar solamente hoy."); paso(doc,2,"Elegí la tienda","Podés dejar Todas las tiendas o escoger una sucursal."); paso(doc,3,"Aplicá los filtros","Esperá a que cambien los números y luego revisá las tarjetas.")
nota(doc,"Sucursal no disponible","Los datos de las demás sucursales siguen siendo útiles. Avisale a Sistemas cuál sucursal aparece sin conexión.","cuidado")

salto(doc); titulo_seccion(doc,"5","Buscar pedidos pendientes","Usá los filtros para encontrar rápido el trabajo de tu bodega.")
captura(doc,"03-pedidos-pendientes","Cada artículo se muestra en su propia fila.")
referencias(doc,[(1,"Buscá por número o fecha."),(2,"Presioná Buscar."),(3,"Marcá el artículo que vas a preparar."),(4,"Transferí solamente lo seleccionado."),(5,"Abrí el pedido completo con Ver detalle.")])
paso(doc,1,"Elegí la fecha","Revisá que Fecha desde y Fecha hasta tengan el período correcto."); paso(doc,2,"Elegí uno o varios almacenes","Abrí la lista y marcá únicamente las bodegas que atendés."); paso(doc,3,"Buscá","Presioná Buscar. La página vuelve al inicio de la lista."); paso(doc,4,"Leé la fila completa","Confirmá pedido, código, descripción, cantidad, bodega, fecha y vendedor.")
nota(doc,"Tus filtros quedan guardados","Podés entrar al detalle, cambiar de pantalla y regresar. La aplicación conserva la selección hasta que presionés Limpiar filtros.")

salto(doc); titulo_seccion(doc,"6","Revisar un artículo","El código, la descripción, la cantidad y la bodega deben corresponder a la misma fila.")
doc.add_heading("Consultar inventario",level=2)
paso(doc,1,"Abrí la información","Hacé doble clic sobre el código o sobre la descripción del artículo."); paso(doc,2,"Revisá la existencia","El cuadro muestra las bodegas donde hay inventario disponible."); paso(doc,3,"Mirá el color","Una existencia menor de 10 unidades aparece con rojo suave para llamar la atención."); paso(doc,4,"Cerrá el cuadro","Presioná Cerrar o la X para regresar a la lista.")
nota(doc,"Si dice que no fue posible consultar","Anotá el código del artículo, cerrá el cuadro y probá otra vez. Si continúa, enviá el código a Sistemas.","cuidado")
doc.add_heading("Ver el pedido completo",level=2)
paso(doc,1,"Presioná Ver detalle","Podés hacerlo desde cualquiera de las filas del pedido."); paso(doc,2,"Revisá todos los artículos","Confirmá que no falte ninguna línea del pedido."); paso(doc,3,"Regresá","Usá Regresar. Los filtros y la página quedan como los dejaste.")

salto(doc); titulo_seccion(doc,"7","Seleccionar e imprimir","Marcá solamente los artículos que tu bodega va a preparar.")
paso(doc,1,"Marcá el círculo","El círculo está al inicio de cada fila. La fila queda señalada cuando está seleccionada."); paso(doc,2,"Revisá el total","El botón Imprimir seleccionados muestra cuántos artículos llevás marcados."); paso(doc,3,"Imprimí una sola vez","Se abre una vista con código, descripción, cantidad y bodega."); paso(doc,4,"Elegí la impresora","En la ventana del navegador, seleccioná la impresora POS autorizada y confirmá.")
nota(doc,"Antes de imprimir","La impresión incluye únicamente las filas marcadas. Si falta una, cancelá, regresá y marcala.","cuidado")
doc.add_heading("Qué debe aparecer en el papel",level=2)
tabla_simple(doc,["Código","Descripción","Cantidad","Bodega"],[("Código real","Nombre completo del artículo","Unidades","Código de la bodega")],[2200,4700,1400,1780])

salto(doc); titulo_seccion(doc,"8","Transferir a despachados","Esta acción mueve únicamente los artículos que marcaste.")
paso(doc,1,"Revisá la bodega","No transfirás artículos de tienda si tu bodega no los va a preparar."); paso(doc,2,"Revisá el contador","El número del botón debe coincidir con la cantidad de filas seleccionadas."); paso(doc,3,"Presioná Transferir a despachados","Hacelo una sola vez y esperá la confirmación."); paso(doc,4,"Confirmá el resultado","Las líneas transferidas dejan de estar pendientes y aparecen en Pedidos despachados.")
nota(doc,"La transferencia es por artículo","Podés preparar una parte del pedido. Las demás líneas siguen pendientes hasta que otra bodega las atienda.")
nota(doc,"No repitás el botón","Si la pantalla tarda, esperá. Presionar varias veces no acelera el proceso.","cuidado")

salto(doc); titulo_seccion(doc,"9","Pedidos despachados","Aquí aparece lo que bodega ya preparó y todavía espera la entrega al cliente.")
captura(doc,"04-pedidos-despachados","La lista conserva una fila por artículo despachado.")
referencias(doc,[(1,"Confirmá el número y el artículo."),(2,"Revisá el estado de entrega."),(3,"Mirá quién realizó el despacho."),(4,"Abrí el pedido completo.")])
paso(doc,1,"Buscá el pedido","Usá el número, las fechas o los almacenes."); paso(doc,2,"Revisá el estado","Pendiente de entregar al cliente significa que bodega ya preparó el artículo."); paso(doc,3,"Abrí Ver detalle","Vas a ver todas las líneas despachadas del pedido.")
nota(doc,"El movimiento es automático","Cuando se confirma la entrega, el pedido deja esta pantalla y pasa al historial. No necesitás moverlo a mano.","bien")

salto(doc); titulo_seccion(doc,"10","Historial","Usalo para confirmar pedidos y artículos que ya fueron entregados.")
captura(doc,"05-historial","El historial tiene dos formas de revisar la información: Pedido y Artículos.")
referencias(doc,[(1,"Filtrá por número, fecha o almacén."),(2,"Pedido muestra una fila por pedido."),(3,"Artículos muestra una fila por producto."),(4,"Ver detalle abre el pedido completo.")])
paso(doc,1,"Buscá por número","Es la forma más rápida cuando el cliente o el encargado te da el número del pedido."); paso(doc,2,"Ajustá las fechas","El historial usa la fecha del pedido. Ampliá el período si no aparece."); paso(doc,3,"Elegí almacenes","Podés marcar una o varias bodegas."); paso(doc,4,"Elegí la pestaña","Usá Pedido para el resumen y Artículos para revisar cada producto.")
nota(doc,"Estado Entregado","La entrega ya fue confirmada. Los pedidos cerrados o anulados no se muestran.")

salto(doc); titulo_seccion(doc,"11","Trabajar en la pestaña Artículos","Esta vista sirve para localizar un producto dentro del historial.")
paso(doc,1,"Abrí Artículos","La lista cambia, pero conserva los mismos filtros."); paso(doc,2,"Buscá la fila","Revisá pedido, código, descripción, cantidad, bodega, fecha, estado y vendedor."); paso(doc,3,"Consultá el inventario","Hacé doble clic en el código o la descripción para abrir la existencia por bodega."); paso(doc,4,"Abrí el pedido","Presioná Ver detalle para revisar todas sus líneas.")
nota(doc,"Una misma compra puede ocupar varias filas","Eso ocurre cuando el pedido tiene varios artículos. No significa que el pedido esté duplicado.")

salto(doc); titulo_seccion(doc,"12","Administrar usuarios","Esta pantalla es exclusiva para administradores.")
captura(doc,"06-usuarios","Desde aquí se crean y administran los accesos.")
referencias(doc,[(1,"Abrí el formulario para crear un usuario."),(2,"Buscá por nombre, usuario, rol o estado."),(3,"Revisá quién está activo."),(4,"Editá, activá, desactivá o restablecé la contraseña.")])
paso(doc,1,"Crear usuario","Escribí el nombre completo, el usuario, la contraseña y elegí el rol correcto."); paso(doc,2,"Elegir el rol","Administrador ve todas las pantallas. Operador de bodega y Consulta no ven el Dashboard."); paso(doc,3,"Desactivar","Usalo cuando una persona ya no debe entrar. El registro no se borra."); paso(doc,4,"Restablecer contraseña","Usalo cuando el usuario olvidó su clave. Entregala de forma privada.")
nota(doc,"Un usuario por persona","No creés cuentas compartidas. Así queda claro quién hizo cada despacho.","cuidado")

salto(doc); titulo_seccion(doc,"13","Usar la aplicación en celular","Las mismas pantallas se acomodan al ancho del teléfono.")
paso(doc,1,"Abrí el enlace","Usá Chrome o Edge y escribí la dirección que te entregó Sistemas."); paso(doc,2,"Giralo si hace falta","Para revisar tablas anchas, usá el teléfono de lado."); paso(doc,3,"Desplazá con calma","Mové la pantalla hacia abajo. Si una tabla es ancha, desplazala hacia los lados."); paso(doc,4,"No guardés la contraseña en equipos ajenos","Cerrá sesión al terminar.")
nota(doc,"Conexión externa","Si estás fuera de la red de la empresa, el enlace puede cambiar. Pedí a Sistemas el enlace vigente.")

salto(doc); titulo_seccion(doc,"14","Qué hacer cuando algo falla","Probá primero la solución corta. Si no funciona, anotá el dato y avisá a Sistemas.")
tabla_simple(doc,["Lo que ves","Qué hacer"],[("Usuario o contraseña incorrectos","Revisá espacios y mayúsculas. Si continúa, pedí que restablezcan tu contraseña."),("No fue posible cargar la información","Esperá unos segundos y presioná Buscar una vez. Si continúa, avisá a Sistemas."),("Sucursal no disponible","Seguí con las demás y reportá el nombre de la sucursal."),("No aparece un pedido","Ampliá las fechas, revisá los almacenes y buscá también en Despachados e Historial."),("No aparece el inventario","Anotá el código del artículo y enviáselo a Sistemas."),("El botón está desactivado","Revisá si marcaste al menos un artículo y si tu usuario tiene permiso.")],[3400,6680])
doc.add_heading("Cuando pidás ayuda, enviá estos datos",level=2)
for texto in ("La pantalla donde ocurrió el problema.","El número de pedido o el código del artículo.","El nombre del botón que presionaste.","Una captura donde no aparezca tu contraseña."):
    p = doc.add_paragraph(style="List Bullet"); fuente(p.add_run(texto),10.5)

salto(doc); titulo_seccion(doc,"15","Guía rápida para bodega","Si ya conocés la aplicación, seguí esta lista cada vez que preparés pedidos.")
for numero, (titulo, texto) in enumerate((("Entrá con tu usuario","No usés el acceso de otra persona."),("Abrí Pedidos pendientes","Revisá la fecha y elegí las bodegas que atendés."),("Presioná Buscar","Esperá a que termine la carga."),("Revisá cada fila","Confirmá código, descripción, cantidad y bodega."),("Marcá lo que vas a preparar","No marqués artículos que corresponden a otra área."),("Imprimí si necesitás la guía","Comprobá que estén todos los artículos seleccionados."),("Transferí a despachados","Revisá el contador antes de confirmar."),("Consultá el historial","Ahí aparecerá cuando la entrega quede confirmada.")),start=1): paso(doc,numero,titulo,texto)
nota(doc,"Regla final","Si algo no coincide, detenete y consultá. Es mejor revisar una vez más que mover un artículo equivocado.","cuidado")
p = doc.add_paragraph("Contacto de Sistemas: ______________________________________________"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in p.runs: fuente(run,11,True,AZUL)

aplicar_tratamiento_formal(doc)
doc.save(SALIDA)
print(SALIDA)

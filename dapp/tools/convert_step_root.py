# -*- coding: utf-8 -*-
# Convierte el archivo STEP del ESP32-S3-Touch-AMOLED-1.43 a OBJ.
#
# Uso:  freecadcmd tools/convert_step_root.py
# Requiere: FreeCAD 1.0+  (sudo apt install freecad)
#
# Solo tesela el ensamblaje RAIZ del STEP. Los ensamblajes intermedios
# (_ASM) ya contienen a sus piezas hijas: si se teselan todos los objetos
# del documento, la geometria se duplica varias veces.
import FreeCAD as App
import Import
import MeshPart
import os

# Ajusta estas rutas si mueves los archivos
STP = os.path.expanduser(
    "~/Descargas/ESP32-S3-Touch-AMOLED-1.43-3DFile/"
    "ESP32-S3-Touch-AMOLED-1.43/ESP32-S3-Touch-AMOLED-1_43.stp"
)
OUT = os.path.expanduser("~/esp32_root.obj")
ROOT_NAME = "ESP32_S3_TOUCH_AMOLED_1_43_ASM"

print("Importando STEP (puede tardar)...")
doc = App.newDocument("esp32")
Import.insert(STP, doc.Name)
doc.recompute()
print("Objetos en el documento: %d" % len(doc.Objects))

root = None
for obj in doc.Objects:
    if obj.Name == ROOT_NAME:
        root = obj
        break

if root is None:
    candidates = [
        o for o in doc.Objects
        if hasattr(o, "Shape") and o.Shape and not o.Shape.isNull()
    ]
    root = candidates[-1]
    print("AVISO: raiz '%s' no encontrada, usando '%s'" % (ROOT_NAME, root.Name))

print("Raiz seleccionada: %s" % root.Name)

m = MeshPart.meshFromShape(
    Shape=root.Shape,
    LinearDeflection=0.1,   # mm de precision lineal (menor = mas detalle)
    AngularDeflection=0.5,   # radianes (menor = mas detalle)
    Relative=False,
)
print("Malla raiz: %d puntos, %d facetas" % (m.CountPoints, m.CountFacets))

bb = root.Shape.BoundBox
print("Tamano del dispositivo: %.2f x %.2f x %.2f mm" % (
    bb.XLength, bb.YLength, bb.ZLength))

m.write(OUT)
print("OBJ escrito en %s (%.1f MB)" % (OUT, os.path.getsize(OUT) / 1e6))

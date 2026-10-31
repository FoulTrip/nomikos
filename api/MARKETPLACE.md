# Marketplace MCP de NomikOS

El marketplace publica servidores MCP remotos. NomikOS conserva el directorio,
la configuración por cuenta y el gateway de pago; el publisher aloja el servidor
MCP. Cada llamada remota pasa por una tool con precio x402 explícito.

## Publicar un servidor

`POST /api/marketplace/apps` requiere un Bearer de cuenta. El cuerpo es un
manifiesto firmado por una clave Ed25519; `publisher_pubkey` debe ser la clave
Solana en Base58 correspondiente a esa firma. Para cada tool, `price.pay_to`
debe ser exactamente esa clave, de modo que el registro no pueda anunciar un
destinatario distinto al publisher.

El manifiesto incluye:

- `namespace`, `name`, `version`, `description` y `endpoint` HTTPS público.
- `tools[]`, con esquemas MCP, clase de riesgo declarada, permisos, esquema de
  salida opcional y precio exacto (`scheme: "exact"`, `asset: "SOL"`,
  `network` y `amount_atomic`). `amount_atomic` se expresa en lamports
  (1 SOL = 1.000.000.000 lamports).
- `legal.terms_url`, `legal.terms_sha256`, `legal.privacy_url` y
  `legal.privacy_sha256`. Las URLs deben ser HTTPS o IPFS y los hashes SHA-256
  hexadecimales en minúsculas.
- `signature`, firma Ed25519 en Base64 sobre el JSON canónico del resto del
  objeto, sin el campo `signature`, precedido por los bytes UTF-8
  `nomikos-app-manifest-v1\n`.

Para canonicalizar, ordenar lexicográficamente las claves de cada objeto,
preservar el orden de los arrays y serializar JSON sin espacios. La firma cubre
el publisher, el endpoint, todos los esquemas y precios, las declaraciones de
permisos y los enlaces/hashes legales. El API comprueba la firma, valida el
endpoint contra DNS privado/SSRF, inicializa MCP y compara `tools/list` con las
tools anunciadas antes de activar la versión. No sigue redirecciones. En
producción el endpoint debe usar HTTPS y resolver solo a direcciones públicas.

El publisher debe aumentar `version` al cambiar el manifiesto. Una cuenta que
instaló la versión anterior debe revisar y aceptar la nueva versión antes de
que el agente pueda invocar sus tools.

## Instalar y fijar permisos

El catálogo público está en `GET /api/marketplace/apps`. Para instalar,
`POST /api/marketplace/apps/{namespace}/install` recibe `mode: "all"` o
`mode: "selected"`, `device_ids`, políticas por tool y `legal_consent`. La
primera petición sin consentimiento devuelve `409 LEGAL_CONSENT_REQUIRED` con
el hash del manifiesto, versión, enlaces y hashes que debe mostrar el cliente.
La aceptación se registra por cuenta, namespace, versión, hash del manifiesto y
hashes legales. Una firma de publisher nueva invalida el consentimiento
anterior. Solo una sesión humana puede instalar y cambiar políticas.

Las tools empiezan desactivadas en la instalación. El cliente debe enviar la
selección de cada tool y un límite máximo igual o menor a su precio. Las tools
remotas requieren confirmación humana por defecto, independientemente de la
clase de riesgo que declare el publisher. Las llamadas se pueden restringir a
toda la flota o a dispositivos concretos de la cuenta.

## Ejecución y pagos x402

`POST /api/marketplace/apps/{namespace}/tools/{tool}/call` verifica cuenta y
dispositivo, consentimiento vigente, política activa, límite de precio y red
Solana de la cuenta. La primera llamada devuelve `402` con una factura que
congela herramienta, argumentos, versión, precio y `pay_to`. El API rechaza
facturas pendientes, de otra cuenta, con argumentos distintos o ya consumidas.
Solo después de confirmar y consumir la factura una vez, el gateway llama al
servidor MCP y le adjunta un recibo de pago verificable. Cada llamada incluye
`invoice_id` en los eventos de uso.

Las invocaciones de tools requieren aprobación humana por defecto. El panel consulta
`GET /api/accounts/me/marketplace/approvals` para mostrar argumentos y coste;
`POST /api/accounts/me/marketplace/approvals/{id}` aprueba o rechaza esa acción.
Las aprobaciones están aisladas por cuenta, args, versión y dispositivo, y
caducan a los dos minutos.

## Reportes y cuarentena

Una cuenta puede reportar una app solo vinculando el reporte a una factura
consumida de una llamada propia y aportando una categoría, detalle y hash de
evidencia. Los detalles quedan cifrados. Tres reporteros distintos en 24 horas
activan cuarentena preventiva. También se vigilan fallos recientes de llamadas;
el publisher puede pedir revalidación cuando los indicadores dejan de estar
activos. El detalle de reportes solo es visible al publisher.

La reputación y los reportes son señales de moderación, no una prueba de fraude
ni un veredicto jurídico. El sistema no quema ni confisca fondos. No se ha
desplegado un contrato de staking, gobernanza, registro on-chain ni slashing;
estas funciones necesitan un diseño económico y un programa Solana auditado.

## Verificación y auditoría de documentos legales

Al publicar, la API descarga los documentos de términos y privacidad, limita
cada respuesta a 512 KiB, calcula SHA-256 sobre los bytes recibidos y rechaza
la publicación si alguno no coincide con el manifiesto firmado. Se permiten
URLs HTTPS y `ipfs://`; HTTP solo se acepta para hosts internos habilitados en
la configuración de pruebas. La API no sigue redirecciones, fija las
direcciones DNS públicas resueltas para evitar SSRF/rebinding y no envía
credenciales al publisher.

La API conserva en SQLite una copia inmutable por versión del documento que
pasó la comprobación. El panel abre esa copia como texto plano mediante
`GET /api/marketplace/apps/{namespace}/legal/{terms|privacy}`, por lo que el
navegador no ejecuta HTML proporcionado por el publisher ni depende de que el
CDN siga sirviendo los mismos bytes.

Un worker revisa las versiones activas al arrancar y vuelve a descargar sus
documentos cada 15 minutos. Un hash distinto o una URL que no se puede verificar
marca la versión (`hash_mismatch` o `unavailable`) y pone la app en cuarentena.
La cuarentena bloquea catálogo, instalación y ejecución. El worker no reactiva
una app automáticamente; su publisher debe usar `POST
/api/marketplace/apps/{namespace}/revalidate`, que vuelve a comprobar ambos
documentos y el endpoint MCP antes de retirar la cuarentena.

Esta verificación demuestra que los bytes actuales coinciden con los valores
firmados y permite al usuario revisar exactamente la copia verificada. No
determina si los términos son legales, suficientes o verdaderos, ni sustituye
una revisión jurídica.

## Pruebas de integración

Desde `tests/`:

```sh
npm run test:e2e:marketplace
```

La suite levanta una fixture MCP y documentos legales editables dentro de
Compose. Prueba firma, takeover de namespace, discrepancias MCP, SSRF,
validación del hash legal al publicar, snapshots verificadas, detección de
cambios, cuarentena, recuperación, cuentas/dispositivos, consentimiento y
reconsentimiento, aprobaciones, precios x402, replay y reportes. También
verifica que la API del Compose esté conectada a su MCP local y ejecute la tool
`echo`. El runner configura temporalmente `MARKETPLACE_INTERNAL_HOSTS` para
alcanzar esa fixture y restaura/recrea `api` al finalizar. No configures esa
allowlist en producción.

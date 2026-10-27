# GUION — Presentación NomikOS (3:00, con fondo `backdrop_16x9.mp4`)

El video es mudo y sigue estos 8 bloques. Habla despacio (~130 palabras/min):
cada bloque trae su texto medido al tiempo. Las marcas [PANTALLA] te dicen
qué se ve para que gestures o pauses con el video.

## 0:00–0:15 · Portada: el logo, luego el nombre (15s)

[PANTALLA] Fondo negro. Esquinas de calibración que convergen como una
lente (0–3s), la marca circular en el centro, después "NomikOS"
escribiéndose a su derecha (3–7s) y el subtítulo debajo.

> "Hola, soy [TU NOMBRE]. Los agentes de IA razonan, pero no pueden pagar
> por lo que usan: cada API, cada servicio, exige que un humano saque la
> tarjeta. Eso los deja fuera de la economía real."
> — Dilo mientras aparece el nombre. Pausa de 1s al terminar.

## 0:15–0:40 · Tesis: el flujo de 5 nodos (25s)

[PANTALLA] Cinco nodos que se encienden en cadena: Meta LLM → Guard →
x402 → dPaaS → Solana, con pulsos de luz viajando y lluvia de código
Rust procesándose detrás.

> "NomikOS es el sistema económico autónomo para agentes de IA. El modelo
> razona, Llama Guard protege, el protocolo x402 cobra micro-peajes y un
> firmante delegado paga en Solana. Todo invisible, en milisegundos, sin
> que el usuario firme nada."
> — Sigue los nodos con la mano o el cursor, uno por frase.

## 0:40–1:10 · Shields: el haz verde barriendo (30s)

[PANTALLA] Pantalla dividida: a la izquierda una terminal tipeando los
escaneos (`guard scan --in/--out`); a la derecha una tarjeta de estado
con anillo de progreso y tres checks (INPUT, POLICY, OUTPUT). Tinte verde.

> "La seguridad primero. A la izquierda veis el filtro en acción: cada
> petición atraviesa Llama Guard 3 a la entrada y a la salida. Nada
> inseguro llega al modelo y ninguna respuesta sale sin validar."
> — Tienes 30 segundos: ve MUY despacio. Di "…sin validar" cuando se
> encienda el tercer check OUTPUT SCAN (~0:58).

## 1:10–1:40 · Peaje: la firma que vuela a devnet (30s, EL MOMENTO CLAVE)

[PANTALLA] Una tarjeta-factura 402 en 3D cuya firma ed25519 se escribe
hex a hex; luego la tarjeta vuela hacia la derecha hasta el beacon
verde de Solana devnet, que la sella. Tinte ámbar.

> "Y este es el corazón. El agente pide un recurso y el servidor responde
> 402 con una factura de microcentavos. La wallet cifrada se descifra en
> memoria, firma —ved el hash escribiéndose— y el paquete vuela a
> Solana devnet, que lo confirma en verde."
> — Sube la energía aquí. Marca los tres tiempos: "factura" (tarjeta),
> "firma" (hex), "confirma" (beacon verde). Es lo que los jueces deben
> recordar.

## 1:40–2:00 · Settlement: el sello dibujándose (20s)

[PANTALLA] Un anillo verde que se dibuja, check central y tres líneas de
ledger: settled, consumed_at, replay → 409.

> "Cada pago se consume una sola vez: el sistema marca settled y bloquea
> cualquier reintento con un 409. Sin dobles cobros, sin estados
> ambiguos. El recurso se ejecuta solo cuando el dinero está confirmado."
> — Di "bloquea cualquier reintento" justo cuando aparezca la línea 409.

## 2:00–2:20 · Stack: las 3 capas (20s)

[PANTALLA] Tres capas glass apiladas — panel, brain, api — con partículas
subiendo por una columna de luz. Tinte azul.

> "La arquitectura: Rust con Axum como fuente única de verdad y llaves
> cifradas con XChaCha20; cerebro Python con Llama Stack; y un panel
> Next con visor 3D. Tres capas, un solo flujo."
> — Señala de abajo arriba: api, brain, panel.

## 2:20–2:40 · Límites: el gauge (20s)

[PANTALLA] Manómetro con aguja elástica que sube hasta el tope diario
mientras tres contadores slot giran (tx settled, replays blocked,
wallets) y una órbita 24/7 gira alrededor.

> "Y el control: cada cuenta fija su techo de gasto diario —mirad los
> contadores—. El agente opera veinticuatro siete, pero jamás supera
> el límite. Autonomía con correa."
> — "Jamás supera el límite" cuando la aguja toque el tope (~72%).

## 2:40–3:00 · Cierre: el logo otra vez (20s)

[PANTALLA] Vuelve el lockup completo con repo y "BUILT FOR META
HACKATHON" debajo, con un lento acercamiento.

> "NomikOS: agentes que pagan solos, usuarios que solo hablan. Código
> abierto y settlement real en devnet. Gracias."
> — Lento, sonriendo. Deja 3–4 segundos de silencio con el logo antes
> de abrir preguntas.

## Reglas de oro

1. Los primeros 15 segundos deciden: problema en UNA frase, sin rodeos.
2. Nunca hables más rápido que el video: si te adelantas, pausa y respira.
3. Señala la pantalla en: nodos (0:15), tercer check OUTPUT (0:58),
   tarjeta→firma→beacon (1:10–1:40), línea 409 (1:50), aguja al tope (2:30).
4. Si te sobran segundos en un bloque, calla y deja respirar el visual.
5. Ensaya 2 veces con cronómetro: 3:00 clavados, ni uno más.

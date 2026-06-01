# Contexto del proyecto Cerno

Estoy trabajando en un proyecto llamado **Cerno**, ubicado en `C:\Users\pablo\Desktop\Cerno`.

## Qué es

Cerno es un backend en Python/FastAPI para un **coach de ajedrez con IA**. La idea es que el usuario pueda pedir análisis de sus partidas de Lichess, que el sistema use Stockfish para detectar errores y fases débiles, y que luego un agente con OpenAI recomiende entrenamiento concreto usando teoría indexada desde estudios de Lichess en una base vectorial.

## Stack actual

- Python
- FastAPI
- Uvicorn
- Pydantic
- httpx
- python-chess
- Stockfish vía `chess.engine.SimpleEngine`
- OpenAI Python SDK
- ChromaDB para RAG
- dotenv para cargar variables de entorno

Archivo de dependencias: `requirements.txt`.

## Estructura actual

```text
app/
  __init__.py
  main.py
  routers/
    __init__.py
    games.py
    agent.py
  schemas/
    __init__.py
    game.py
  services/
    __init__.py
    lichess.py
    stockfish.py
    rag.py
    agent.py
requirements.txt
```

## API principal

### `app/main.py`

Crea la app FastAPI:

- Título: `Cerno`
- Descripción: `Chess coaching agent`
- Versión: `0.1.0`

Incluye dos routers:

- `games`
- `agent`

También expone:

```http
GET /health
```

Respuesta:

```json
{"status": "ok", "service": "cerno"}
```

## Rutas de partidas

Archivo: `app/routers/games.py`

### Obtener partidas de Lichess

```http
GET /games/{username}?limit=10
```

Usa `fetch_games(username, limit)` y devuelve un `GamesResponse`.

Si falla la llamada a Lichess, lanza `HTTPException` con status `502`, aunque ahora mismo `fetch_games` devuelve `[]` si el status no es 200, no `None`, así que ese `502` casi nunca se activa.

### Analizar PGN

```http
POST /games/analyze
```

Recibe `pgn: str` como parámetro y llama a `analyze_game(pgn)`.

Posible mejora: convertirlo en un body Pydantic en vez de parámetro suelto, para que sea más cómodo desde clientes HTTP.

## Rutas del agente

Archivo: `app/routers/agent.py`

### Chat con el coach

```http
POST /agent/chat
```

Body:

```json
{"message": "mensaje del usuario"}
```

Llama a `run_agent(message)` y devuelve:

```json
{"response": "..."}
```

### Indexar estudio de Lichess

```http
POST /agent/index-study
```

Body:

```json
{"study_id": "id_del_estudio"}
```

Llama a `index_study(study_id)` y devuelve:

```json
{"indexed_chunks": 3, "study_id": "id_del_estudio"}
```

## Modelos de datos

Archivo: `app/schemas/game.py`

```python
class Player(BaseModel):
    username: str
    rating: Optional[int] = None
    rating_diff: Optional[int] = None

class Game(BaseModel):
    id: str
    speed: str
    rated: bool
    winner: Optional[str] = None
    status: str
    white: Player
    black: Player
    moves: str
    pgn: str

class GamesResponse(BaseModel):
    username: str
    total: int
    games: list[Game]
```

## Servicio de Lichess

Archivo: `app/services/lichess.py`

Función principal:

```python
async def fetch_games(username: str, limit: int = 10) -> list[Game]
```

Llama a:

```text
https://lichess.org/api/games/user/{username}
```

Headers:

```python
{"Accept": "application/x-ndjson"}
```

Params:

```python
{"max": limit, "pgnInJson": True}
```

Parsea la respuesta NDJSON de Lichess y devuelve una lista de `Game`.

Posibles riesgos actuales:

- Asume que `raw["players"]["white"]["user"]["name"]` y `raw["players"]["black"]["user"]["name"]` existen. Puede fallar con usuarios anónimos, bots raros, partidas importadas o datos incompletos.
- Si Lichess devuelve status distinto de 200, devuelve `[]`, lo que hace difícil distinguir entre "no hay partidas" y "hubo error".
- Importa `json` dentro del bucle.
- No hay timeout explícito.

## Servicio de Stockfish

Archivo: `app/services/stockfish.py`

Ruta actual del engine:

```python
STOCKFISH_PATH = Path("engines/stockfish.exe")
```

Función principal:

```python
async def analyze_game(pgn: str, depth: int = 15) -> dict
```

Flujo:

1. Lee el PGN con `chess.pgn.read_game`.
2. Si el PGN no es válido, devuelve `{"error": "PGN inválido"}`.
3. Recorre los movimientos principales.
4. Tras cada movimiento, analiza la posición con Stockfish a profundidad 15.
5. Guarda:
   - movimiento en UCI
   - evaluación desde el punto de vista de blancas
   - CPL aproximado como diferencia absoluta contra la evaluación anterior
   - fase: opening, middlegame o endgame
6. Devuelve total, lista de movimientos y resumen por fase.

Resumen por fase:

- `avg_cpl`
- `blunders`: CPL > 300
- `mistakes`: 100 < CPL <= 300
- `inaccuracies`: 50 < CPL <= 100

Posibles riesgos actuales:

- `analyze_game` es async, pero ejecuta Stockfish de forma bloqueante.
- No comprueba si existe `engines/stockfish.exe`.
- El CPL actual usa diferencia absoluta de evaluación desde blancas, lo que puede no medir correctamente la pérdida de calidad según el jugador que mueve.
- Puede ser lento con muchas partidas o depth 15.
- El texto `"PGN inválido"` aparece con problemas de codificación en la salida actual del archivo.

## Servicio RAG

Archivo: `app/services/rag.py`

Usa Chroma persistente en:

```text
data/chromadb
```

Colección:

```python
chess_theory
```

Embedding:

```python
embedding_functions.DefaultEmbeddingFunction()
```

Funciones:

```python
async def fetch_lichess_study(study_id: str) -> list[dict]
async def index_study(study_id: str) -> int
def search_theory(query: str, n_results: int = 3) -> list[str]
```

`fetch_lichess_study` descarga:

```text
https://lichess.org/study/{study_id}.pgn
```

Luego intenta dividir el PGN por capítulos y genera chunks con:

```python
{"text": text, "study_id": study_id}
```

`index_study` agrega documentos a Chroma con ids:

```python
f"{study_id}_{i}"
```

Posibles riesgos actuales:

- Si se indexa dos veces el mismo estudio, `collection.add` puede fallar por IDs duplicados.
- El chunking por capítulos puede no ser robusto para todos los PGN de estudios de Lichess.
- No se guarda título del estudio, capítulo ni metadatos ricos.
- No hay endpoint para listar qué se indexó.

## Servicio del agente

Archivo: `app/services/agent.py`

Cliente OpenAI:

```python
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
```

Modelo actual:

```python
gpt-4o-mini
```

Herramientas disponibles para el modelo:

1. `fetch_games`
   - obtiene últimas partidas de un usuario de Lichess
2. `analyze_game`
   - analiza PGN con Stockfish
3. `search_theory`
   - busca teoría relevante en ChromaDB

Prompt del sistema:

El agente se presenta como Cerno, un coach de ajedrez experto y analítico. Debe:

1. Usar `fetch_games`.
2. Usar `analyze_game` para analizar cada partida.
3. Identificar debilidades concretas basadas en CPL y errores por fase.
4. Usar siempre `search_theory`.
5. Generar recomendaciones concretas citando recursos encontrados.

Debe hablar siempre en español, ser directo y evitar recomendaciones genéricas.

El loop de herramientas:

- Envía mensajes a OpenAI con tools.
- Si el modelo pide tool calls, ejecuta las funciones locales.
- Añade resultados como mensajes `tool`.
- Repite hasta que el modelo devuelva contenido final.

Posibles riesgos actuales:

- El modelo puede pedir analizar muchas partidas y bloquear mucho tiempo.
- No hay límite de iteraciones en el while.
- `analyze_game` solo acepta `pgn`, aunque internamente tiene `depth`; el agente no puede controlar profundidad.
- `search_theory` es síncrono y se llama dentro del loop async.
- No hay manejo robusto de errores de OpenAI, Stockfish, Chroma o Lichess.
- El archivo muestra problemas de codificación en acentos, por ejemplo `Ãºltimas`, `NÃºmero`, `mÃ©tricas`.

## Estado general

El proyecto parece estar en fase inicial/prototipo. Ya tiene las piezas principales:

- API FastAPI.
- Integración con Lichess.
- Análisis local con Stockfish.
- RAG con ChromaDB.
- Agente OpenAI con tool calling.

Lo más importante ahora sería robustecerlo para uso real.

## Prioridades recomendadas

1. Arreglar codificación UTF-8 en los archivos con textos en español.
2. Añadir configuración centralizada con variables de entorno:
   - `OPENAI_API_KEY`
   - `STOCKFISH_PATH`
   - `CHROMA_PATH`
   - modelo OpenAI
   - timeouts
3. Mejorar errores HTTP y validación de input.
4. Convertir `/games/analyze` a body Pydantic.
5. Hacer más robusto `fetch_games` ante partidas sin usuario o datos incompletos.
6. Comprobar existencia de Stockfish antes de analizar.
7. Evitar que el análisis de Stockfish bloquee el event loop.
8. Añadir límite de iteraciones al loop del agente.
9. Mejorar cálculo de CPL para reflejar pérdida desde la perspectiva del jugador que mueve.
10. Añadir tests básicos para:
    - parsing de Lichess
    - análisis de PGN inválido
    - resumen por fases
    - endpoints principales
11. Mejorar RAG:
    - upsert en vez de add
    - metadatos de estudio/capítulo
    - endpoint para buscar teoría directamente
    - evitar duplicados

## Preguntas útiles para continuar el proyecto

- ¿El objetivo es una API backend solamente o también habrá frontend?
- ¿El usuario final será un jugador casual, club player o jugador competitivo?
- ¿Se quiere analizar una partida puntual, varias partidas recientes o un perfil completo?
- ¿Stockfish debe correr localmente siempre o se aceptaría un servicio externo?
- ¿El agente debe poder recordar historiales de usuarios?
- ¿Se quiere login con Lichess OAuth o basta con usernames públicos?
- ¿Los estudios de Lichess serán curados manualmente o indexados automáticamente?
- ¿Qué formato final debe tener el plan de entrenamiento: texto, ejercicios, calendario, exportable?

## Cómo correr probablemente el proyecto

Instalar dependencias:

```powershell
pip install -r requirements.txt
```

Definir `.env` con:

```text
OPENAI_API_KEY=...
```

Asegurar que exista:

```text
engines/stockfish.exe
```

Arrancar API:

```powershell
uvicorn app.main:app --reload
```

Probar health:

```http
GET http://localhost:8000/health
```

## Prompt sugerido para ChatGPT

Quiero que actúes como arquitecto senior/backend engineer y me ayudes a evolucionar este proyecto. Es un backend FastAPI llamado Cerno, un coach de ajedrez con IA que integra Lichess, Stockfish, ChromaDB y OpenAI tool calling. Analiza el contexto anterior, detecta riesgos técnicos, propón una hoja de ruta y ayúdame a implementar mejoras paso a paso priorizando robustez, buen diseño y una experiencia útil para jugadores de ajedrez.

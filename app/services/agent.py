import json

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.lichess import fetch_games
from app.services.rag import search_theory
from app.services.stockfish import analyze_game


def _get_openai_client() -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for /agent/chat.")
    return AsyncOpenAI(api_key=settings.openai_api_key)

tools = [
    {
        "type": "function",
        "function": {
            "name": "fetch_games",  #TOOL 1
            "description": "Obtiene las últimas partidas de un usuario de Lichess",
            "parameters": {
                "type": "object",
                "properties": {
                    "username": {
                        "type": "string",
                        "description": "Nombre de usuario de Lichess"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Número de partidas a obtener",
                        "default": 10
                    }
                },
                "required": ["username"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_game", #TOOL 2
            "description": "Analiza una partida de ajedrez en formato PGN con Stockfish y devuelve métricas por fase del juego",
            "parameters": {
                "type": "object",
                "properties": {
                    "pgn": {
                        "type": "string",
                        "description": "La partida en formato PGN"
                    }
                },
                "required": ["pgn"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_theory",  #TOOL 3
            "description": "Busca teoría de ajedrez y recursos de estudio relevantes según la debilidad detectada",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Tema a buscar, por ejemplo: finales de torre, táctica defensiva, gambito de dama"
                    }
                },
                "required": ["query"]
            }
        }
    }
]

async def run_agent(message: str) -> str:
    client = _get_openai_client()
    messages = [
       {
            "role": "system",
            "content": """Eres Cerno, un coach de ajedrez experto y analítico.

        Tu flujo de trabajo es siempre este:
        1. Usa fetch_games para obtener las partidas del usuario
        2. Usa analyze_game para analizar cada partida con Stockfish
        3. Identifica las debilidades concretas basándote en los datos de CPL y errores por fase
        4. SIEMPRE usa search_theory para buscar recursos específicos sobre las debilidades detectadas
        5. Genera recomendaciones concretas citando los recursos encontrados

        Nunca des recomendaciones genéricas. Siempre basa tus recomendaciones en:
        - Los datos reales del análisis de Stockfish
        - Los recursos encontrados con search_theory

        Habla siempre en español y sé directo y específico."""
        },
        {
            "role": "user",
            "content": message
        }
    ]

    while True:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )

        msg = response.choices[0].message

        if msg.tool_calls:
            messages.append(msg)

            for tool_call in msg.tool_calls:
                name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)

                if name == "fetch_games":
                    games = await fetch_games(**args)
                    result = [g.model_dump() for g in games]
                elif name == "analyze_game":
                    result = await analyze_game(**args)
                elif name == "search_theory":
                    result = search_theory(**args)
                else:
                    result = {"error": "herramienta desconocida"}

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
        else:
            return msg.content

from openai import AsyncOpenAI
from app.services.lichess import fetch_games
from app.services.stockfish import analyze_game
import json
import os

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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
    }
]

async def run_agent(message: str) -> str:
    messages = [
        {
            "role": "system",
            "content": """Eres Cerno, un coach de ajedrez experto. 
            Analizas las partidas del usuario con herramientas reales y das recomendaciones 
            concretas y accionables basadas en los datos. 
            Habla siempre en español, sé directo y específico."""
        },
        {
            "role": "user",
            "content": message
        }
    ]

    while True:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
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
                else:
                    result = {"error": "herramienta desconocida"}

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
        else:
            return msg.content
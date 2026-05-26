import chromadb
from chromadb.utils import embedding_functions
import httpx

client = chromadb.PersistentClient(path="data/chromadb")

embedding_fn = embedding_functions.DefaultEmbeddingFunction()

collection = client.get_or_create_collection(
    name="chess_theory",
    embedding_function=embedding_fn
)

async def fetch_lichess_study(study_id: str) -> list[dict]:
    url = f"https://lichess.org/study/{study_id}.pgn"
    headers = {"Accept": "application/x-chess-pgn"}

    async with httpx.AsyncClient() as http:
        response = await http.get(url, headers=headers)

    if response.status_code != 200:
        return []

    chunks = []
    current_chunk = []

    for line in response.text.split("\n"):
        current_chunk.append(line)
        if line.strip() == "" and any(l.startswith("[Chapter") for l in current_chunk):
            text = "\n".join(current_chunk).strip()
            if text:
                chunks.append({
                    "text": text,
                    "study_id": study_id
                })
            current_chunk = []

    if current_chunk:
        text = "\n".join(current_chunk).strip()
        if text:
            chunks.append({
                "text": text,
                "study_id": study_id
            })

    return chunks

async def index_study(study_id: str) -> int:
    chunks = await fetch_lichess_study(study_id)
    if not chunks:
        return 0

    documents = [c["text"] for c in chunks]
    ids = [f"{study_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"study_id": c["study_id"]} for c in chunks]

    collection.add(
        documents=documents,
        ids=ids,
        metadatas=metadatas
    )

    return len(chunks)

def search_theory(query: str, n_results: int = 3) -> list[str]:
    results = collection.query(
        query_texts=[query],
        n_results=n_results
    )
    return results["documents"][0] if results["documents"] else []
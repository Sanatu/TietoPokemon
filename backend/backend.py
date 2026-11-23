from functools import lru_cache
import requests
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

FRONTEND_HOSTNAME = "http://localhost:3000"

POKEMON_API_URL = "https://pokeapi.co/api/v2/pokemon/"

TRANSIENT = {500, 502, 503, 504}


def get_with_retry(url):
    for attempt in (1, 2):
        print(f"[API]   request to PokeAPI (attempt {attempt}): {url}")
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code not in TRANSIENT:
                resp.raise_for_status()
                return resp
        except (requests.ConnectionError, requests.Timeout):
            pass

        if attempt == 2:
            raise RuntimeError(f"Request failed after retry: {url}")
        time.sleep(1)


app = FastAPI()

origins = [
    FRONTEND_HOSTNAME,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def call_logged(cached_func, *args):
    hits_before = cached_func.cache_info().hits
    result = cached_func(*args)
    if cached_func.cache_info().hits > hits_before:
        print(f"[CACHE] hit: {cached_func.__name__}{args}")
    return result

@app.get("/pokemon-names")
async def handle_get_pokemon_names():
    return call_logged(get_pokemon_names)

@lru_cache(maxsize=1)
def get_pokemon_names() -> tuple:
    response = get_with_retry(f"{POKEMON_API_URL}?limit=10000")
    data = response.json()
    return tuple(pokemon["name"] for pokemon in data["results"])

@lru_cache(maxsize=1)
def get_pokemon_name_set() -> frozenset:
    return frozenset(get_pokemon_names())

def clean_query(query: str) -> str | None:
    """Return the normalized name if it's a known pokemon, else None."""
    cleaned = query.strip().lower()
    return cleaned if cleaned in get_pokemon_name_set() else None

class SearchRequest(BaseModel):
    query: str

@app.post("/search")
async def handle_search(search_request: SearchRequest):
    name = clean_query(search_request.query)
    if name is None:
        raise HTTPException(status_code=404, detail="Pokemon not found")
    pokemon_data = call_logged(get_pokemon, name)
    return pokemon_data

@lru_cache(maxsize=512)
def get_pokemon(name: str) -> dict:
    response = get_with_retry(f"{POKEMON_API_URL}{name.lower()}")
    return response.json()



if __name__ == "__main__":
    uvicorn.run("backend:app", host="localhost", port=8000, reload=True)
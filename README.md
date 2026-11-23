# Pokédex

Pokédex-sovellus: haku pokemonin nimellä, automaattitäydennys ja Pokémonin tiedot (statsit, kyvyt, liikkeet, spritet).

## Ajaminen

Vaatimukset: Kehitetty ja testattu Python 3.13

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Käynnistä backend ja frontend omissa terminaaleissaan:

```powershell
python backend/backend.py     # http://localhost:8000
python frontend/frontend.py   # http://localhost:3000
```

Avaa selaimessa http://localhost:3000. Backendin on oltava käynnissä ennen hakua.

## Rakenne

- `backend/backend.py` – FastAPI-backend (portti 8000)
- `frontend/frontend.py` – FastAPI-palvelin, joka tarjoilee staattiset tiedostot (portti 3000)
- `frontend/static/` – `index.html`, `style.css`, `app.js` (vanilla JS, ei build-vaihetta)
- `exampleresponse.json` – esimerkkivastaus pokemon/(pokemon) api:lta (Käytin tekoälyn kontekstina frontendin devaukseen)

## Pääratkaisut

- **Backend välittäjänä:** selain kutsuu vain omaa backendiä (`GET /pokemon-names`, `POST /search`), joka kutsuu PokéAPI:a. CORS sallittu vain frontendin osoitteelle.
- **Välimuisti:** `lru_cache` nimilistalle ja yksittäisille Pokémoneille; välimuistiosumat näkyvät lokissa.
- **Uudelleenyritys:** PokéAPI-kutsu yritetään kerran uudelleen aikakatkaisun, yhteysvirheen tai 5xx-virheen jälkeen.
- **Validointi:** hakusana tarkistetaan tunnettujen nimien joukkoa vasten ennen API-kutsua; tuntematon nimi palauttaa 404.
- **Frontend:** automaattitäydennys (nuolinäppäimet, Enter, Esc), "Tarkoititko…"-ehdotukset, satunnaishaku, kiiltävä (shiny) -vaihto, huuto, liikkeiden suodatus ja ryhmittely opetustavan mukaan, URL-hash (`#pikachu`) jaettavaksi linkiksi.

## Tunnetut puutteet

- Abilityistä näytetään vain nimi ja "Hidden"-merkintä, ei kuvausta.
- Osoitteet ja portit (`localhost:8000/3000`) on kovakoodattu; ei konfiguraatiota.
- Välimuisti on vain muistissa ja katoaa uudelleenkäynnistyksessä; ei vanhenemisaikaa.
- Nimilistaa ei voi päivittää ilman backendin uudelleenkäynnistystä.
- Pokémonit haetaan vain nimellä, ei ID:llä.
- Liikkeistä näytetään vain nimi ja taso (ei tyyppiä, voimaa tai kuvausta).
- Ei automaattisia testejä.

## Jatkokehitys

- **Abilities API** (`/api/v2/ability/{name}`): haetaan kyvyille yksityiskohtaiset kuvaukset (`effect_entries`, `flavor_text_entries`) ja näytetään ne esim. tooltipinä tai laajennettavana rivinä.
- Liikkeiden tiedot (`/move/{name}`): tyyppi, voima, tarkkuus, PP.
- Kehitysketjut (`/evolution-chain`) ja lajitiedot (`/pokemon-species`, kuvaus, elinympäristö).
- Tyyppivahvuudet ja -heikkoudet (`/type`).
- Haku ID:llä, ja Pokémon-selaus/sivutus.
- Asetukset ympäristömuuttujilla, testit (pytest), Docker-ajo ja pysyvä välimuisti (esim. Redis tai levy).
- Monikielisyys (PokéAPI tarjoaa käännökset).

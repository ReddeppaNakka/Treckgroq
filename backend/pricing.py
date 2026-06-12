"""
Live travel pricing via the Amadeus Self-Service API (free tier), plus live
USD->INR FX. Everything here is best-effort: any missing credentials, network
error, timeout, or unknown route falls back to the static estimate in
destinations.py, so the app keeps working even with no API access.

Enable by putting your free Amadeus keys in backend/.env:
    AMADEUS_CLIENT_ID=your_api_key
    AMADEUS_CLIENT_SECRET=your_api_secret
    # AMADEUS_HOSTNAME=test          # "test" (default, free test data) or "production"
Get free keys at https://developers.amadeus.com -> register -> Self-Service app.

Notes on the free TEST environment:
  - It serves *cached test data*, so many routes/months return nothing
    (we fall back to estimates for those) and prices aren't fully real-time.
  - Switch AMADEUS_HOSTNAME=production once your app is approved for real data.
"""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from typing import Any, Dict, Optional

import requests

CLIENT_ID = (os.getenv("AMADEUS_CLIENT_ID") or "").strip()
CLIENT_SECRET = (os.getenv("AMADEUS_CLIENT_SECRET") or "").strip()
_HOST = (os.getenv("AMADEUS_HOSTNAME") or "test").strip().lower()
BASE = "https://api.amadeus.com" if _HOST.startswith("prod") else "https://test.api.amadeus.com"

_HTTP_TIMEOUT = 6.0          # seconds per external call (Amadeus can be slow)
_CACHE_TTL = 6 * 60 * 60     # 6 hours
_FX_TTL = 12 * 60 * 60       # 12 hours
_FX_FALLBACK = float(os.getenv("USD_TO_INR", "83"))

# Simple in-process TTL cache: key -> (expires_at, value)
_cache: Dict[str, tuple] = {}


def enabled() -> bool:
    """Live pricing is only attempted when Amadeus credentials are configured."""
    return bool(CLIENT_ID and CLIENT_SECRET)


# ---------------------------------------------------------------------------
# Destination -> (IATA city/airport code, human city name). The IATA code is
# used both as the flight destination and the hotel cityCode.
# ---------------------------------------------------------------------------
ROUTE: Dict[str, tuple] = {
    # ----- Asia -----
    "Bali": ("DPS", "Bali"), "Bangkok": ("BKK", "Bangkok"),
    "Chiang Mai": ("CNX", "Chiang Mai"), "Phuket": ("HKT", "Phuket"),
    "Hanoi": ("HAN", "Hanoi"), "Ha Long Bay": ("HAN", "Ha Long Bay"),
    "Siem Reap": ("REP", "Siem Reap"), "Singapore": ("SIN", "Singapore"),
    "Kuala Lumpur": ("KUL", "Kuala Lumpur"), "Tokyo": ("TYO", "Tokyo"),
    "Kyoto": ("KIX", "Kyoto"), "Seoul": ("SEL", "Seoul"),
    "Hong Kong": ("HKG", "Hong Kong"), "Beijing": ("BJS", "Beijing"),
    "Jaipur": ("JAI", "Jaipur"), "Goa": ("GOI", "Goa"),
    "Kerala Backwaters": ("COK", "Alleppey"), "Rishikesh": ("DED", "Rishikesh"),
    "Manali": ("KUU", "Manali"), "Udaipur": ("UDR", "Udaipur"),
    "Varanasi": ("VNS", "Varanasi"), "Agra": ("AGR", "Agra"),
    "Munnar": ("COK", "Munnar"), "Hampi": ("HBX", "Hampi"),
    "Pondicherry": ("MAA", "Pondicherry"), "Leh Ladakh": ("IXL", "Leh"),
    "Darjeeling": ("IXB", "Darjeeling"), "Jaisalmer": ("JSA", "Jaisalmer"),
    "Andaman Islands": ("IXZ", "Port Blair"), "Maldives": ("MLE", "Maldives"),
    "Colombo & South Coast": ("CMB", "Colombo"),
    "Kathmandu & Pokhara": ("KTM", "Kathmandu"), "Dubai": ("DXB", "Dubai"),
    "Petra & Wadi Rum": ("AMM", "Petra"), "Istanbul": ("IST", "Istanbul"),
    "Cappadocia": ("NAV", "Goreme"),
    # ----- Europe -----
    "Paris": ("PAR", "Paris"), "Nice & French Riviera": ("NCE", "Nice"),
    "Rome": ("ROM", "Rome"), "Venice": ("VCE", "Venice"),
    "Amalfi Coast": ("NAP", "Amalfi"), "Florence & Tuscany": ("FLR", "Florence"),
    "Barcelona": ("BCN", "Barcelona"), "Madrid": ("MAD", "Madrid"),
    "Seville": ("SVQ", "Seville"), "Lisbon": ("LIS", "Lisbon"),
    "Porto": ("OPO", "Porto"), "Santorini": ("JTR", "Santorini"),
    "Athens": ("ATH", "Athens"), "Crete": ("HER", "Crete"),
    "London": ("LON", "London"), "Edinburgh": ("EDI", "Edinburgh"),
    "Amsterdam": ("AMS", "Amsterdam"), "Berlin": ("BER", "Berlin"),
    "Munich & Bavaria": ("MUC", "Munich"), "Prague": ("PRG", "Prague"),
    "Vienna": ("VIE", "Vienna"), "Hallstatt & Salzburg": ("SZG", "Salzburg"),
    "Swiss Alps (Interlaken)": ("ZRH", "Interlaken"), "Zurich": ("ZRH", "Zurich"),
    "Reykjavik & Ring Road": ("REK", "Reykjavik"),
    "Norwegian Fjords (Bergen)": ("BGO", "Bergen"), "Tromso": ("TOS", "Tromso"),
    "Copenhagen": ("CPH", "Copenhagen"), "Stockholm": ("STO", "Stockholm"),
    "Dubrovnik": ("DBV", "Dubrovnik"),
    "Split & Dalmatian Coast": ("SPU", "Split"), "Budapest": ("BUD", "Budapest"),
    "Krakow": ("KRK", "Krakow"),
    # ----- Africa -----
    "Marrakech": ("RAK", "Marrakech"), "Cape Town": ("CPT", "Cape Town"),
    "Serengeti & Ngorongoro": ("JRO", "Serengeti"), "Maasai Mara": ("NBO", "Maasai Mara"),
    "Zanzibar": ("ZNZ", "Zanzibar"), "Victoria Falls": ("VFA", "Victoria Falls"),
    "Cairo & the Pyramids": ("CAI", "Cairo"), "Chefchaouen": ("TNG", "Chefchaouen"),
    "Seychelles": ("SEZ", "Seychelles"), "Mauritius": ("MRU", "Mauritius"),
    # ----- North America -----
    "New York City": ("NYC", "New York"), "San Francisco": ("SFO", "San Francisco"),
    "Las Vegas": ("LAS", "Las Vegas"),
    "Grand Canyon & Utah Parks": ("LAS", "Grand Canyon"),
    "Hawaii (Maui)": ("OGG", "Maui"), "Miami": ("MIA", "Miami"),
    "New Orleans": ("MSY", "New Orleans"), "Banff & the Rockies": ("YYC", "Banff"),
    "Vancouver": ("YVR", "Vancouver"), "Quebec City": ("YQB", "Quebec City"),
    "Mexico City": ("MEX", "Mexico City"), "Cancun & Riviera Maya": ("CUN", "Cancun"),
    "Oaxaca": ("OAX", "Oaxaca"), "Havana": ("HAV", "Havana"),
    "Costa Rica (Arenal & Manuel Antonio)": ("SJO", "La Fortuna"),
    # ----- South America -----
    "Rio de Janeiro": ("RIO", "Rio de Janeiro"),
    "Machu Picchu & Cusco": ("CUZ", "Cusco"), "Buenos Aires": ("BUE", "Buenos Aires"),
    "Patagonia (Torres del Paine)": ("PUQ", "Puerto Natales"),
    "Cartagena": ("CTG", "Cartagena"), "Galapagos Islands": ("GPS", "Galapagos"),
    # ----- Oceania -----
    "Sydney": ("SYD", "Sydney"), "Great Barrier Reef (Cairns)": ("CNS", "Cairns"),
    "Melbourne": ("MEL", "Melbourne"), "Queenstown": ("ZQN", "Queenstown"),
    "Fiji": ("NAN", "Nadi"), "Bora Bora": ("BOB", "Bora Bora"),
    "Auckland & Bay of Islands": ("AKL", "Auckland"),
    # ----- extras -----
    "Osaka": ("OSA", "Osaka"), "Ubud": ("DPS", "Ubud"), "Hoi An": ("DAD", "Hoi An"),
    "Boracay": ("KLO", "Boracay"), "Palawan": ("PPS", "Puerto Princesa"),
    "Bagan": ("NYU", "Bagan"), "Tbilisi": ("TBS", "Tbilisi"),
    "Milan & the Lakes": ("MIL", "Milan"), "Andalusia (Granada)": ("AGP", "Granada"),
    "Bruges": ("BRU", "Bruges"), "Scottish Highlands": ("INV", "Inverness"),
    "Faroe Islands": ("FAE", "Torshavn"),
    "Yellowstone & Grand Teton": ("BZN", "Bozeman"), "Tulum": ("CUN", "Tulum"),
    "Medellin": ("MDE", "Medellin"), "Iguazu Falls": ("IGR", "Puerto Iguazu"),
    "Atacama Desert": ("CJC", "San Pedro de Atacama"),
}


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def _cache_put(key: str, value, ttl: int):
    _cache[key] = (time.time() + ttl, value)


# ---------------------------------------------------------------------------
# Amadeus OAuth2 (client-credentials). Token cached until shortly before expiry.
# ---------------------------------------------------------------------------
def _access_token() -> Optional[str]:
    cached = _cache_get("amadeus:token")
    if cached:
        return cached
    try:
        resp = requests.post(
            f"{BASE}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_HTTP_TIMEOUT,
        )
        body = resp.json()
        token = body.get("access_token")
        ttl = int(body.get("expires_in", 1799)) - 60
        if token:
            _cache_put("amadeus:token", token, max(60, ttl))
            return token
    except Exception:
        pass
    return None


def _amadeus_get(path: str, params: Dict[str, Any]) -> Optional[dict]:
    token = _access_token()
    if not token:
        return None
    try:
        resp = requests.get(
            f"{BASE}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=_HTTP_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Live FX
# ---------------------------------------------------------------------------
def usd_to_inr_rate() -> float:
    """Live USD->INR rate (cached), falling back to the static ~83."""
    cached = _cache_get("fx:usd_inr")
    if cached:
        return cached
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=_HTTP_TIMEOUT)
        rate = float(r.json()["rates"]["INR"])
        if rate > 0:
            _cache_put("fx:usd_inr", rate, _FX_TTL)
            return rate
    except Exception:
        pass
    return _FX_FALLBACK


# ---------------------------------------------------------------------------
# Travel dates: pick a representative trip in the requested month.
# ---------------------------------------------------------------------------
def _trip_dates(month: Optional[int], days: int):
    today = date.today()
    m = month or ((today.month % 12) + 1)
    year = today.year if m >= today.month else today.year + 1
    check_in = date(year, m, 15)
    out_day = min(28, 15 + max(1, days))
    check_out = date(year, m, out_day)
    return check_in, check_out


# ---------------------------------------------------------------------------
# Flights (Amadeus Flight Offers Search, cheapest round-trip)
# ---------------------------------------------------------------------------
def _flight_usd(origin: str, dest_iata: str, check_in: date, check_out: date) -> Optional[float]:
    key = f"flt:{origin}:{dest_iata}:{check_in:%Y-%m-%d}"
    cached = _cache_get(key)
    if cached is not None:
        return cached or None
    body = _amadeus_get("/v2/shopping/flight-offers", {
        "originLocationCode": origin,
        "destinationLocationCode": dest_iata,
        "departureDate": f"{check_in:%Y-%m-%d}",
        "returnDate": f"{check_out:%Y-%m-%d}",
        "adults": 1,
        "currencyCode": "USD",
        "max": 1,
    })
    price = 0.0
    try:
        offers = (body or {}).get("data") or []
        if offers:
            price = float(offers[0]["price"]["total"])
    except Exception:
        price = 0.0
    _cache_put(key, price, _CACHE_TTL)
    return price or None


# ---------------------------------------------------------------------------
# Hotels (Amadeus: list hotels by city, then cheapest offer for the dates)
# ---------------------------------------------------------------------------
def _hotel_ids(city_code: str) -> list:
    key = f"htlids:{city_code}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    body = _amadeus_get("/v1/reference-data/locations/hotels/by-city", {
        "cityCode": city_code,
    })
    ids = []
    try:
        for h in (body or {}).get("data", [])[:20]:
            hid = h.get("hotelId")
            if hid:
                ids.append(hid)
    except Exception:
        ids = []
    _cache_put(key, ids, _CACHE_TTL)
    return ids


def _hotel_nightly_usd(city_code: str, check_in: date, check_out: date) -> Optional[float]:
    key = f"htl:{city_code}:{check_in:%Y-%m-%d}"
    cached = _cache_get(key)
    if cached is not None:
        return cached or None
    ids = _hotel_ids(city_code)
    if not ids:
        _cache_put(key, 0.0, _CACHE_TTL)
        return None
    body = _amadeus_get("/v3/shopping/hotel-offers", {
        "hotelIds": ",".join(ids),
        "checkInDate": f"{check_in:%Y-%m-%d}",
        "checkOutDate": f"{check_out:%Y-%m-%d}",
        "adults": 1,
        "currency": "USD",
        "bestRateOnly": "true",
    })
    nights = max(1, (check_out - check_in).days)
    per_night = []
    try:
        for entry in (body or {}).get("data", []):
            for offer in entry.get("offers", []):
                total = offer.get("price", {}).get("total")
                if total:
                    per_night.append(float(total) / nights)
    except Exception:
        per_night = []
    if not per_night:
        _cache_put(key, 0.0, _CACHE_TTL)
        return None
    per_night.sort()
    median = per_night[len(per_night) // 2]
    _cache_put(key, median, _CACHE_TTL)
    return median


# ---------------------------------------------------------------------------
# Public: live estimate for one / many destinations.
# ---------------------------------------------------------------------------
def live_estimate(dest_name: str, origin: Optional[str], month: Optional[int],
                  days: int) -> Optional[Dict[str, Any]]:
    """Return {flight_usd?, per_night_usd?} from live sources, or None if nothing
    could be fetched. Caller merges with its static estimate."""
    if not enabled():
        return None
    route = ROUTE.get(dest_name)
    if not route:
        return None
    dest_iata, _city = route
    check_in, check_out = _trip_dates(month, days)

    out: Dict[str, Any] = {}
    if origin:
        flight = _flight_usd(origin.upper(), dest_iata, check_in, check_out)
        if flight:
            out["flight_usd"] = round(flight)
    nightly = _hotel_nightly_usd(dest_iata, check_in, check_out)
    if nightly:
        out["per_night_usd"] = round(nightly)
    return out or None


def live_estimates(dests: list, origin: Optional[str], month: Optional[int],
                   days: int) -> Dict[str, Dict[str, Any]]:
    """Fetch live estimates for several destinations in parallel. Returns
    {dest_name: {...}} for those that returned data."""
    if not enabled():
        return {}
    results: Dict[str, Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(6, max(1, len(dests)))) as pool:
        futs = {
            pool.submit(live_estimate, name, origin, month, days): name
            for name in dests
        }
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                got = fut.result()
            except Exception:
                got = None
            if got:
                results[name] = got
    return results

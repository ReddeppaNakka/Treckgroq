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

# Open-Meteo (climate/geocoding) is free, key-less and unlimited, so it stays on
# unless explicitly disabled. Geocodes and monthly climate normals barely change,
# so we cache them for weeks.
_CLIMATE_ON = (os.getenv("CLIMATE_ENABLED", "1").strip().lower() not in ("0", "false", "no"))
_GEO_TTL = 30 * 24 * 60 * 60      # 30 days
_CLIMATE_TTL = 14 * 24 * 60 * 60  # 14 days

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
    # ----- India (budget & student favourites) -----
    "Delhi": ("DEL", "Delhi"), "Mumbai": ("BOM", "Mumbai"),
    "Amritsar": ("ATQ", "Amritsar"),
    "McLeod Ganj (Dharamshala)": ("DHM", "Dharamshala"),
    "Kasol & Parvati Valley": ("KUU", "Kullu"), "Spiti Valley": ("KUU", "Kaza"),
    "Gokarna": ("GOI", "Gokarna"), "Coorg (Kodagu)": ("IXE", "Madikeri"),
    "Meghalaya (Shillong & Cherrapunji)": ("SHL", "Shillong"),
    "Gangtok & Sikkim": ("IXB", "Gangtok"), "Rann of Kutch": ("BHJ", "Bhuj"),
    "Varkala": ("TRV", "Varkala"),
    # ----- Neighbours & nearby -----
    "Everest Base Camp Trek": ("KTM", "Lukla"),
    "Bhutan (Thimphu & Paro)": ("PBH", "Paro"),
    "Ella & Kandy (Sri Lanka)": ("CMB", "Ella"),
    # ----- More SE / Central Asia -----
    "Luang Prabang": ("LPQ", "Luang Prabang"), "Krabi & Railay": ("KBV", "Krabi"),
    "Ho Chi Minh City": ("SGN", "Ho Chi Minh City"), "Pai": ("CNX", "Pai"),
    "Almaty": ("ALA", "Almaty"), "Baku": ("GYD", "Baku"),
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
# Climate (Open-Meteo — free, key-less). Tells the traveller what the weather is
# actually like in the month they're going, so they can pick a cheaper, equally
# pleasant shoulder month instead of an expensive peak one. Best-effort: any
# failure just drops the climate block and the card falls back to best_months.
# ---------------------------------------------------------------------------
def climate_enabled() -> bool:
    return _CLIMATE_ON


# Authoritative coordinates for destinations the free geocoder gets wrong — either
# because the label is a region/state with no matching city ("Goa" fuzzy-matches
# Genoa, Italy) or because the name is ambiguous ("Manali" resolves to a Chennai
# suburb, not the Himalayan town). India is our priority market, so every Indian
# destination is pinned here; a few notoriously ambiguous global names too.
_COORDS: Dict[str, tuple] = {
    # ----- India (all pinned) -----
    "Jaipur": (26.9124, 75.7873), "Goa": (15.4909, 73.8278),
    "Kerala Backwaters": (9.4981, 76.3388), "Rishikesh": (30.0869, 78.2676),
    "Manali": (32.2396, 77.1887), "Udaipur": (24.5854, 73.7125),
    "Varanasi": (25.3176, 82.9739), "Agra": (27.1767, 78.0081),
    "Munnar": (10.0889, 77.0595), "Hampi": (15.3350, 76.4600),
    "Pondicherry": (11.9416, 79.8083), "Leh Ladakh": (34.1526, 77.5771),
    "Darjeeling": (27.0360, 88.2627), "Jaisalmer": (26.9157, 70.9083),
    "Andaman Islands": (11.6234, 92.7265),
    "Delhi": (28.6139, 77.2090), "Mumbai": (19.0760, 72.8777),
    "Amritsar": (31.6340, 74.8723),
    "McLeod Ganj (Dharamshala)": (32.2427, 76.3234),
    "Kasol & Parvati Valley": (32.0100, 77.3150),
    "Spiti Valley": (32.2270, 78.0710), "Gokarna": (14.5479, 74.3188),
    "Coorg (Kodagu)": (12.4244, 75.7382),
    "Meghalaya (Shillong & Cherrapunji)": (25.5788, 91.8933),
    "Gangtok & Sikkim": (27.3389, 88.6065),
    "Rann of Kutch": (23.9000, 69.1000), "Varkala": (8.7379, 76.7163),
    # ----- Neighbours & nearby -----
    "Everest Base Camp Trek": (27.6869, 86.7314),
    "Bhutan (Thimphu & Paro)": (27.4305, 89.4133),
    "Ella & Kandy (Sri Lanka)": (6.8667, 81.0466),
    "Krabi & Railay": (8.0863, 98.9063), "Pai": (19.3583, 98.4410),
    # ----- Ambiguous global names -----
    "Kuala Lumpur": (3.1390, 101.6869),
    "Cappadocia": (38.6431, 34.8289), "Amalfi Coast": (40.6340, 14.6027),
    "Swiss Alps (Interlaken)": (46.6863, 7.8632),
    "Norwegian Fjords (Bergen)": (60.3913, 5.3221),
    "Serengeti & Ngorongoro": (-2.3333, 34.8333),
    "Maasai Mara": (-1.5000, 35.1500), "Patagonia (Torres del Paine)": (-51.0, -73.0),
    "Grand Canyon & Utah Parks": (36.1069, -112.1129),
    "Great Barrier Reef (Cairns)": (-16.9186, 145.7781),
    "Yellowstone & Grand Teton": (44.4280, -110.5885),
    "Ha Long Bay": (20.9101, 107.1839), "Marrakech": (31.6295, -7.9811),
    "Quebec City": (46.8139, -71.2080), "Galapagos Islands": (-0.7419, -90.3138),
}

# City names that geocode better than the destination label (which may be a
# region/experience like "Kerala Backwaters" rather than a place a gazetteer knows).
_GEO_ALIAS: Dict[str, str] = {
    "Kerala Backwaters": "Alleppey", "Leh Ladakh": "Leh",
    "Kathmandu & Pokhara": "Kathmandu", "Colombo & South Coast": "Colombo",
    "Petra & Wadi Rum": "Petra", "Nice & French Riviera": "Nice",
    "Florence & Tuscany": "Florence", "Munich & Bavaria": "Munich",
    "Hallstatt & Salzburg": "Salzburg", "Swiss Alps (Interlaken)": "Interlaken",
    "Reykjavik & Ring Road": "Reykjavik", "Norwegian Fjords (Bergen)": "Bergen",
    "Split & Dalmatian Coast": "Split", "Serengeti & Ngorongoro": "Arusha",
    "Cairo & the Pyramids": "Cairo", "Grand Canyon & Utah Parks": "Grand Canyon",
    "Hawaii (Maui)": "Kahului", "Banff & the Rockies": "Banff",
    "Cancun & Riviera Maya": "Cancun", "Costa Rica (Arenal & Manuel Antonio)": "La Fortuna",
    "Machu Picchu & Cusco": "Cusco", "Patagonia (Torres del Paine)": "Puerto Natales",
    "Great Barrier Reef (Cairns)": "Cairns", "Auckland & Bay of Islands": "Auckland",
    "Milan & the Lakes": "Milan", "Andalusia (Granada)": "Granada",
    "Scottish Highlands": "Inverness", "Yellowstone & Grand Teton": "Jackson",
    "Iguazu Falls": "Puerto Iguazu", "Atacama Desert": "San Pedro de Atacama",
    "Victoria Falls": "Victoria Falls", "Maasai Mara": "Narok",
}


def _geocode(name: str, country: str) -> Optional[tuple]:
    """Resolve a destination to (lat, lon). Pinned coordinates win (authoritative);
    otherwise fall back to Open-Meteo's free geocoder, preferring a same-country
    result and, among those, the most populous — so 'Paris' picks France's capital,
    not Paris, Texas. Cached long since coordinates never move."""
    if name in _COORDS:
        return _COORDS[name]
    query = _GEO_ALIAS.get(name, name)
    key = f"geo:{query}:{country}"
    cached = _cache_get(key)
    if cached is not None:
        return cached or None
    coords = None
    try:
        r = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query, "count": 10, "language": "en", "format": "json"},
            timeout=_HTTP_TIMEOUT,
        )
        results = (r.json() or {}).get("results") or []
        in_country = [x for x in results if (x.get("country") or "").lower() == country.lower()]
        pool = in_country or results
        if pool:
            best = max(pool, key=lambda x: x.get("population") or 0)
            coords = (float(best["latitude"]), float(best["longitude"]))
    except Exception:
        coords = None
    _cache_put(key, coords or (), _GEO_TTL)
    return coords


def _verdict(high_c: float, rain_mm: float) -> tuple[str, bool]:
    """Turn avg daytime high + monthly rainfall into a short, honest verdict and a
    'pleasant?' flag. Tuned so shoulder-season warmth reads as ideal."""
    if rain_mm >= 180:
        return "Wet season", False
    if high_c >= 36:
        return "Very hot", False
    if high_c <= 6:
        return "Freezing", False
    wet = rain_mm >= 110
    if 18 <= high_c <= 32:
        return ("Warm, some rain" if wet else "Warm & pleasant"), not wet
    if 6 < high_c < 18:
        return ("Cool & wet" if wet else "Cool & crisp"), not wet
    # 32-36C
    return ("Hot & humid" if wet else "Hot but dry"), False


def climate_for(name: str, country: str, month: int) -> Optional[Dict[str, Any]]:
    """Typical weather for a destination in a given month, from Open-Meteo's
    historical archive (previous year, days 1-28 of that month). Returns
    {month, high_c, low_c, rain_mm, verdict, pleasant} or None on any failure."""
    if not _CLIMATE_ON or not (1 <= int(month) <= 12):
        return None
    coords = _geocode(name, country)
    if not coords:
        return None
    lat, lon = coords
    key = f"clim:{lat:.2f}:{lon:.2f}:{month}"
    cached = _cache_get(key)
    if cached is not None:
        return cached or None

    # Two complete past years (no archive-delay edge cases), then average just the
    # target month across both — smooths out a single freak-weather year.
    month = int(month)
    end_year = date.today().year - 1
    start = date(end_year - 1, 1, 1)
    end = date(end_year, 12, 31)
    result = None
    try:
        r = requests.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": lat, "longitude": lon,
                "start_date": f"{start:%Y-%m-%d}", "end_date": f"{end:%Y-%m-%d}",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                "timezone": "auto",
            },
            timeout=_HTTP_TIMEOUT,
        )
        daily = (r.json() or {}).get("daily") or {}
        times = daily.get("time") or []
        tmax = daily.get("temperature_2m_max") or []
        tmin = daily.get("temperature_2m_min") or []
        prcp = daily.get("precipitation_sum") or []
        # Keep only days that fall in the target month, across both years.
        idx = [i for i, t in enumerate(times) if len(t) >= 7 and int(t[5:7]) == month]
        highs = [tmax[i] for i in idx if i < len(tmax) and tmax[i] is not None]
        lows = [tmin[i] for i in idx if i < len(tmin) and tmin[i] is not None]
        rains = [prcp[i] for i in idx if i < len(prcp) and prcp[i] is not None]
        n_years = len({times[i][:4] for i in idx}) or 1
        if highs and lows:
            avg_high = sum(highs) / len(highs)
            avg_low = sum(lows) / len(lows)
            rain_mm = sum(rains) / n_years   # per-month average, not the multi-year total
            verdict, pleasant = _verdict(avg_high, rain_mm)
            result = {
                "month": int(month),
                "high_c": round(avg_high),
                "low_c": round(avg_low),
                "rain_mm": round(rain_mm),
                "verdict": verdict,
                "pleasant": pleasant,
            }
    except Exception:
        result = None
    _cache_put(key, result or {}, _CLIMATE_TTL)
    return result


_COND_TTL = 60 * 60  # live conditions cache: 1 hour


def _aqi_label(aqi: Optional[float]) -> Optional[str]:
    """US AQI band -> short label."""
    if aqi is None:
        return None
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Poor (sensitive groups)"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very unhealthy"
    return "Hazardous"


def live_conditions(name: str, country: str) -> Optional[Dict[str, Any]]:
    """Best-effort live on-the-ground conditions for a destination: US air-quality
    index, today's sunrise/sunset, and rain probability — all from Open-Meteo
    (free, key-less). Returns {} keys that resolved, or None on total failure.
    Cached for an hour."""
    if not _CLIMATE_ON:
        return None
    coords = _geocode(name, country)
    if not coords:
        return None
    lat, lon = coords
    key = f"cond:{lat:.2f}:{lon:.2f}"
    cached = _cache_get(key)
    if cached is not None:
        return cached or None

    out: Dict[str, Any] = {}
    try:
        r = requests.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={"latitude": lat, "longitude": lon, "current": "us_aqi", "timezone": "auto"},
            timeout=_HTTP_TIMEOUT,
        )
        aqi = ((r.json() or {}).get("current") or {}).get("us_aqi")
        if aqi is not None:
            out["aqi"] = int(round(aqi))
            out["aqi_label"] = _aqi_label(aqi)
    except Exception:
        pass
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat, "longitude": lon,
                "daily": "sunrise,sunset,precipitation_probability_max",
                "timezone": "auto", "forecast_days": 1,
            },
            timeout=_HTTP_TIMEOUT,
        )
        daily = (r.json() or {}).get("daily") or {}
        sr = (daily.get("sunrise") or [None])[0]
        ss = (daily.get("sunset") or [None])[0]
        rp = (daily.get("precipitation_probability_max") or [None])[0]
        if sr:
            out["sunrise"] = sr[-5:]   # "HH:MM" tail of the ISO timestamp
        if ss:
            out["sunset"] = ss[-5:]
        if rp is not None:
            out["rain_prob"] = int(rp)
    except Exception:
        pass

    _cache_put(key, out or {}, _COND_TTL)
    return out or None


def climate_estimates(reqs: list) -> Dict[str, Dict[str, Any]]:
    """Fetch climate for several (name, country, month) triples in parallel.
    Returns {dest_name: {...}} for those that resolved."""
    if not _CLIMATE_ON or not reqs:
        return {}
    results: Dict[str, Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(6, max(1, len(reqs)))) as pool:
        futs = {pool.submit(climate_for, n, c, m): n for (n, c, m) in reqs}
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                got = fut.result()
            except Exception:
                got = None
            if got:
                results[name] = got
    return results


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

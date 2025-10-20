import os
import re
import json
import time
import uuid
import queue
import threading
from typing import Dict, List, Set, Optional, Tuple

from flask import Flask, request, Response, jsonify, send_from_directory
from flask_cors import CORS
from bs4 import BeautifulSoup
import requests
import tldextract
import dns.resolver
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT_S = 15

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", GOOGLE_API_KEY)

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
OBFUSCATED_PATTERNS = [
    (re.compile(r"\[?\s*at\s*\]?", re.IGNORECASE), "@"),
    (re.compile(r"\(\s*at\s*\)", re.IGNORECASE), "@"),
    (re.compile(r"\[?\s*dot\s*\]?", re.IGNORECASE), "."),
    (re.compile(r"\(\s*dot\s*\)", re.IGNORECASE), "."),
]
BLOCKLIST_DOMAINS = {"example.com", "example.org", "test.com", "invalid", "localhost"}


class SessionState:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.city: str = ""
        self.service: str = ""
        self.continuous: bool = False
        self.target_count: int = 700
        self.batch_size: int = 25
        self.is_running: bool = False
        self.stop_flag: bool = False

        self.result_queue: "queue.Queue[dict]" = queue.Queue()
        self.results: List[dict] = []  # {email, source}
        self.emails_seen: Set[str] = set()
        self.urls_visited: Set[str] = set()

        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()

    def reset(self):
        with self.lock:
            self.results.clear()
            self.emails_seen.clear()
            # Do not clear urls_visited; keep it to avoid re-hitting the same pages unnecessarily


class SearchManager:
    def __init__(self):
        self.sessions: Dict[str, SessionState] = {}
        self.global_lock = threading.Lock()

    def create_session(self) -> SessionState:
        session_id = str(uuid.uuid4())
        st = SessionState(session_id)
        with self.global_lock:
            self.sessions[session_id] = st
        return st

    def get_session(self, session_id: str) -> Optional[SessionState]:
        return self.sessions.get(session_id)

    def stop_session(self, session_id: str):
        st = self.get_session(session_id)
        if not st:
            return
        st.stop_flag = True
        st.is_running = False


manager = SearchManager()


def normalize_email(text: str) -> List[str]:
    # Replace obfuscated patterns
    cleaned = text
    for pat, repl in OBFUSCATED_PATTERNS:
        cleaned = pat.sub(repl, cleaned)
    # Extract emails
    candidates = set(EMAIL_REGEX.findall(cleaned))
    normalized = []
    for e in candidates:
        # Lowercase local and domain parts for consistency
        normalized.append(e.strip())
    return normalized


def domain_has_mx(domain: str) -> bool:
    try:
        # dns.resolver.resolve may throw; treat failures as invalid
        answers = dns.resolver.resolve(domain, "MX")
        return len(list(answers)) > 0
    except Exception:
        return False


def is_valid_email(email: str) -> bool:
    try:
        local, domain = email.rsplit("@", 1)
    except ValueError:
        return False
    domain = domain.strip().lower()
    if not domain or domain in BLOCKLIST_DOMAINS:
        return False
    # Quick sanity checks
    if any(x in domain for x in ["..", " "]):
        return False
    return domain_has_mx(domain)


def request_get(url: str, params: Optional[dict] = None) -> Optional[requests.Response]:
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "ar,en;q=0.9"}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT_S)
        if resp.status_code == 200:
            return resp
        return None
    except Exception:
        return None


def fetch_html(url: str) -> Optional[str]:
    resp = request_get(url)
    if not resp:
        return None
    ct = resp.headers.get("Content-Type", "")
    if "text/html" not in ct and "application/xhtml+xml" not in ct:
        return None
    return resp.text


def extract_site_candidate_links(base_url: str, html: str) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a.get("href").strip()
        if href.startswith("mailto:"):
            links.append(href)
            continue
        # Prefer contact/about/support pages
        lower = href.lower()
        if any(key in lower for key in ["contact", "about", "support", "help", "اتصل", "تواصل", "من نحن"]):
            links.append(requests.compat.urljoin(base_url, href))
    # Always include base url last
    links.append(base_url)
    # Deduplicate while preserving order
    seen = set()
    ordered = []
    for u in links:
        if u not in seen:
            seen.add(u)
            ordered.append(u)
    return ordered


def crawl_for_emails(st: SessionState, url: str, max_pages_per_site: int = 10):
    if st.stop_flag:
        return
    if url in st.urls_visited:
        return
    st.urls_visited.add(url)

    html = fetch_html(url)
    if not html:
        return

    # First capture mailto emails
    for mailto in re.findall(r"mailto:([^\"'>\s]+)", html, flags=re.IGNORECASE):
        for em in normalize_email(mailto):
            maybe_emit_email(st, em, url)
            if st.stop_flag:
                return

    # Find emails in text
    for em in normalize_email(html):
        maybe_emit_email(st, em, url)
        if st.stop_flag:
            return

    # Follow candidate links
    links = extract_site_candidate_links(url, html)[:max_pages_per_site]
    for link in links:
        if st.stop_flag:
            return
        if link.startswith("mailto:"):
            for em in normalize_email(link):
                maybe_emit_email(st, em, url)
            continue
        if link in st.urls_visited:
            continue
        crawl_for_emails(st, link, max_pages_per_site=0)  # only fetch the candidate page once


def maybe_emit_email(st: SessionState, email: str, source_url: str):
    if st.stop_flag:
        return
    email_norm = email.strip().lower()
    if email_norm in st.emails_seen:
        return
    if not is_valid_email(email_norm):
        return
    with st.lock:
        if email_norm in st.emails_seen:
            return
        st.emails_seen.add(email_norm)
        record = {"email": email_norm, "source": source_url}
        st.results.append(record)
        st.result_queue.put(record)


# ---------------- Google Integrations -----------------

def google_cse_search(query: str, start_index: int = 1) -> List[str]:
    if not GOOGLE_API_KEY or not GOOGLE_CSE_ID:
        return []
    base = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "start": start_index,
        "num": 10,
        "hl": "ar",
        "safe": "off",
    }
    resp = request_get(base, params=params)
    if not resp:
        return []
    try:
        data = resp.json()
    except Exception:
        return []
    urls = []
    for item in data.get("items", []) or []:
        link = item.get("link")
        if link:
            urls.append(link)
    return urls


def places_text_search(query: str, pagetoken: Optional[str] = None) -> Tuple[List[str], Optional[str]]:
    if not GOOGLE_PLACES_API_KEY:
        return [], None
    base = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "key": GOOGLE_PLACES_API_KEY,
        "query": query,
        "language": "ar",
        "region": "sa",
    }
    if pagetoken:
        params["pagetoken"] = pagetoken
    resp = request_get(base, params=params)
    if not resp:
        return [], None
    try:
        data = resp.json()
    except Exception:
        return [], None
    place_ids = [r.get("place_id") for r in data.get("results", []) if r.get("place_id")]
    next_token = data.get("next_page_token")
    return place_ids, next_token


def place_details_website(place_id: str) -> Optional[str]:
    if not GOOGLE_PLACES_API_KEY:
        return None
    base = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "key": GOOGLE_PLACES_API_KEY,
        "place_id": place_id,
        "fields": "name,website,url",
        "language": "ar",
    }
    resp = request_get(base, params=params)
    if not resp:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    website = data.get("result", {}).get("website")
    return website


# ---------------- Search Orchestration -----------------

def build_query_variants(service: str, city: str) -> List[str]:
    base_terms = [
        f"{service} {city} email",
        f"{service} {city} contact",
        f"{service} {city} تواصل",
        f"{service} {city} بريد إلكتروني",
        f"{service} {city} ايميل",
        f"{service} in {city} email",
        f"contact {service} {city}",
    ]
    # De-duplicate and return
    seen = set()
    variants = []
    for q in base_terms:
        if q not in seen:
            seen.add(q)
            variants.append(q)
    return variants


def run_search_loop(st: SessionState):
    st.is_running = True
    st.stop_flag = False

    try:
        while not st.stop_flag:
            batch_found = 0
            query_variants = build_query_variants(st.service, st.city)

            # 1) Google CSE pages up to ~100 results per variant
            for q in query_variants:
                if st.stop_flag:
                    break
                for start_idx in range(1, 100, 10):
                    if st.stop_flag:
                        break
                    urls = google_cse_search(q, start_index=start_idx)
                    if not urls:
                        break
                    for url in urls:
                        if st.stop_flag:
                            break
                        crawl_for_emails(st, url)
                        # Check progress
                        if len(st.results) >= st.target_count:
                            st.stop_flag = True
                            break
                        if st.batch_size and (len(st.results) % st.batch_size == 0):
                            batch_found = st.batch_size
                            # Allow UI to breathe
                            time.sleep(0.2)
                    # If batch reached and not continuous, pause batches
                    if not st.continuous and batch_found:
                        break
                if not st.continuous and batch_found:
                    break

            if st.stop_flag:
                break

            # 2) Google Maps Places: gather websites and crawl
            maps_query = f"{st.service} in {st.city}"
            next_token = None
            for _ in range(5):  # up to ~100-120 results (5 pages)
                if st.stop_flag:
                    break
                place_ids, next_token = places_text_search(maps_query, pagetoken=next_token)
                for pid in place_ids:
                    if st.stop_flag:
                        break
                    site = place_details_website(pid)
                    if site:
                        crawl_for_emails(st, site)
                        # Check progress
                        if len(st.results) >= st.target_count:
                            st.stop_flag = True
                            break
                        if st.batch_size and (len(st.results) % st.batch_size == 0):
                            batch_found = st.batch_size
                            time.sleep(0.2)
                if not next_token:
                    break
                # Google may need a short delay before next_page_token becomes valid
                time.sleep(2)
                if not st.continuous and batch_found:
                    break

            if not st.continuous:
                # One cycle done
                break

            # In continuous mode, loop again and try to expand further (sleep briefly)
            time.sleep(3)
    finally:
        st.is_running = False
        # Signal done
        try:
            st.result_queue.put({"done": True})
        except Exception:
            pass


# ----------------------- Routes -----------------------

@app.route("/")
def root_index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/start", methods=["POST"])
def start_search():
    data = request.get_json(force=True, silent=True) or {}
    city = (data.get("city") or "").strip()
    service = (data.get("service") or "").strip()
    continuous = bool(data.get("continuous") or False)

    if not city or not service:
        return jsonify({"error": "يرجى إدخال المدينة والخدمة"}), 400

    st = manager.create_session()
    st.city = city
    st.service = service
    st.continuous = continuous

    # Start background thread
    worker = threading.Thread(target=run_search_loop, args=(st,), daemon=True)
    st.thread = worker
    worker.start()

    return jsonify({"session_id": st.session_id})


@app.route("/stop", methods=["POST"])
def stop_search():
    data = request.get_json(force=True, silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    st = manager.get_session(session_id)
    if not st:
        return jsonify({"error": "جلسة غير موجودة"}), 404
    manager.stop_session(session_id)
    return jsonify({"ok": True})


@app.route("/reset", methods=["POST"])
def reset_results():
    data = request.get_json(force=True, silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    st = manager.get_session(session_id)
    if not st:
        return jsonify({"error": "جلسة غير موجودة"}), 404
    st.reset()
    return jsonify({"ok": True})


@app.route("/results", methods=["GET"])
def get_results():
    session_id = (request.args.get("session_id") or "").strip()
    st = manager.get_session(session_id)
    if not st:
        return jsonify({"error": "جلسة غير موجودة"}), 404
    return jsonify({"results": st.results, "count": len(st.results)})


@app.route("/stream")
def stream():
    session_id = (request.args.get("session_id") or "").strip()
    st = manager.get_session(session_id)
    if not st:
        return Response("", status=404)

    def event_stream():
        # Immediately send a hello so the UI knows we are connected
        yield f"data: {json.dumps({'hello': True})}\n\n"
        while True:
            try:
                item = st.result_queue.get(timeout=1.0)
            except queue.Empty:
                if not st.is_running and st.result_queue.empty():
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break
                continue
            if "done" in item:
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            yield f"data: {json.dumps(item)}\n\n"

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # for proxies that buffer
    }
    return Response(event_stream(), headers=headers)


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "7860"))
    app.run(host=host, port=port, debug=True, threaded=True)

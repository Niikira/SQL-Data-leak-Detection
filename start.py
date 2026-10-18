#!/usr/bin/env python3
"""
start.py — Orquestrador Unificado: Inicia Backend + Frontend juntos em Tempo Real.

Comando único:
    python start.py

O que ele faz:
  1. Detecta Node/npm e Python, garantindo dependências necessárias.
  2. Conecta ao MySQL (suporta senhas '1234', 'root' ou DB_PASS) e prepara o banco banco_teste.
  3. Inicia o Backend API (Flask + SSE na porta 5000).
  4. Inicia a Varredura Contínua IDS/IPS (monitoramento.py em background).
  5. Inicia o Frontend (Vite na porta 5173).
  6. Ctrl+C encerra backend e frontend juntos de forma limpa.

Opções:
  --interval N   segundos entre varreduras do monitoramento (padrão: 30)
  --reseed       apaga e recria as tabelas com dados de teste (resetBank + fillBank)
  --no-backend   sobe só o frontend
  --no-frontend  sobe só o backend
"""
import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"

# Configura encoding UTF-8 no terminal Windows para evitar UnicodeEncodeError
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Garante que o Node.js padrão do Windows esteja no PATH de forma limpa (sem aspas corrompidas)
if IS_WIN:
    clean_path = os.environ.get("PATH", "").replace('"', '')
    for node_candidate in [r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"]:
        if os.path.exists(node_candidate):
            clean_path = node_candidate + os.pathsep + clean_path
    os.environ["PATH"] = clean_path
    NPM = shutil.which("npm.cmd") or shutil.which("npm") or os.path.join(r"C:\Program Files\nodejs", "npm.cmd")
else:
    NPM = shutil.which("npm") or "npm"

VENV = ROOT / ".venv"
VENV_PY = VENV / ("Scripts/python.exe" if IS_WIN else "bin/python")

# Usa .venv se existir, senão usa o python atual se tiver as dependências
if VENV_PY.exists():
    PY = str(VENV_PY)
else:
    PY = sys.executable

COLORS = {
    "backend":  "\033[96m",
    "frontend": "\033[95m",
    "monitor":  "\033[93m",
    "start":    "\033[92m",
    "warn":     "\033[91m",
}
RESET = "\033[0m"

procs: list[subprocess.Popen] = []
stopping = threading.Event()


def log(tag, msg):
    print(f"{COLORS.get(tag, '')}[{tag}]{RESET} {msg}", flush=True)


def spawn(cmd, cwd, tag):
    """Inicia um processo filho e repassa a saída com prefixo e cor."""
    kwargs = {}
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        if str(cmd[0]).lower().endswith((".cmd", ".bat")):
            kwargs["shell"] = True
    else:
        kwargs["start_new_session"] = True
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "FORCE_COLOR": "1"}
    p = subprocess.Popen(
        cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", **kwargs,
    )
    procs.append(p)

    def pump():
        for line in p.stdout:
            print(f"{COLORS.get(tag, '')}[{tag}]{RESET} {line.rstrip()}", flush=True)

    threading.Thread(target=pump, daemon=True).start()
    return p


def run_blocking(cmd, cwd, tag):
    p = spawn(cmd, cwd, tag)
    p.wait()
    return p.returncode


def kill_tree(p):
    if p.poll() is not None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
    except Exception:
        pass


def shutdown(*_):
    if stopping.is_set():
        return
    stopping.set()
    log("start", "Encerrando todos os processos (Backend + Frontend)...")
    for p in procs:
        kill_tree(p)


# --------------------------------------------------------------------------- Dependências
def ensure_python_deps():
    global PY
    check = subprocess.run([PY, "-c", "import sqlalchemy, pymysql, cryptography, flask, flask_cors"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if check.returncode == 0:
        return

    # Se não funcionou no python atual, tenta criar ou usar .venv
    if not VENV_PY.exists():
        log("start", "Criando ambiente virtual Python (.venv)...")
        if run_blocking([sys.executable, "-m", "venv", str(VENV)], ROOT, "start") != 0:
            sys.exit("Falha ao criar o .venv (verifique python3-venv).")
    PY = str(VENV_PY)

    log("start", "Instalando dependências Python (requirements.txt)...")
    if run_blocking([PY, "-m", "pip", "install", "-q", "-r", "requirements.txt"], ROOT, "start") != 0:
        sys.exit("Falha ao instalar dependências Python.")


def ensure_frontend_deps():
    if (FRONTEND / "node_modules").exists():
        return
    log("start", "Rodando npm install no frontend (primeira vez)...")
    if run_blocking([NPM, "install"], FRONTEND, "start") != 0:
        sys.exit("Falha no npm install.")


# --------------------------------------------------------------------------- Banco de Dados
def check_and_prepare_database(reseed):
    """Verifica e inicializa o banco MySQL usando o db_config centralizado."""
    probe_script = """
import sys
from db_config import get_db_engine, get_db_url
from sqlalchemy import text
try:
    engine = get_db_engine()
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        res = conn.execute(text("SHOW TABLES LIKE 'users'")).fetchone()
        if res is None:
            print("STATE:empty")
        else:
            cnt = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
            print("STATE:seeded" if cnt > 0 else "STATE:empty")
        print("URL:" + get_db_url())
except Exception as e:
    print("ERRO:", e)
    sys.exit(2)
"""
    r = subprocess.run([PY, "-c", probe_script], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log("warn", f"Não foi possível conectar ao MySQL: {r.stdout.strip() or r.stderr.strip()}")
        return False

    seeded = "STATE:seeded" in r.stdout
    for line in r.stdout.splitlines():
        if line.startswith("URL:"):
            log("backend", f"Conectado ao MySQL via {line.replace('URL:', '').split('@')[-1]}")

    if reseed and seeded:
        log("backend", "Resetando o banco (resetBank.py)...")
        run_blocking([PY, "resetBank.py"], ROOT, "backend")
        seeded = False

    if not seeded:
        log("backend", "Populando banco com dados de teste (fillBank.py)...")
        if run_blocking([PY, "fillBank.py"], ROOT, "backend") != 0:
            log("warn", "fillBank.py falhou.")
            return False
    else:
        log("backend", "Banco de dados já pronto com tabelas e dados.")
    return True


def monitor_loop(interval):
    """Executa a rotina de detecção IDS periodicamente no terminal."""
    time.sleep(2)  # aguarda a API subir
    while not stopping.is_set():
        run_blocking([PY, "monitoramento.py"], ROOT, "monitor")
        for _ in range(interval):
            if stopping.is_set():
                return
            time.sleep(1)


# --------------------------------------------------------------------------- Main
def main():
    ap = argparse.ArgumentParser(description="Sobe Backend + Frontend juntos em Tempo Real.")
    ap.add_argument("--interval", type=int, default=30, help="Intervalo em segundos entre varreduras IDS no terminal (padrão: 30)")
    ap.add_argument("--reseed", action="store_true", help="Apaga e recria tabelas com dados de teste")
    ap.add_argument("--no-backend", action="store_true", help="Executa somente o frontend")
    ap.add_argument("--no-frontend", action="store_true", help="Executa somente o backend")
    args = ap.parse_args()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("\n" + "=" * 76)
    print("   SISTEMA DE DETECÇÃO DE VAZAMENTO SQL (IDS/IPS) — INTEGRADO AO VIVO")
    print("=" * 76)

    if not args.no_backend:
        ensure_python_deps()
    if not args.no_frontend:
        ensure_frontend_deps()

    db_ready = False
    if not args.no_backend:
        db_ready = check_and_prepare_database(args.reseed)
        if not db_ready:
            log("warn", "Aviso: MySQL não acessível. O frontend usará modo de contingência (mock).")

    # 1. Inicia o Backend HTTP / SSE API (Porta 5000)
    backend_proc = None
    if not args.no_backend:
        backend_proc = spawn([PY, "api.py"], ROOT, "backend")
        log("start", "[OK] Backend API Flask + SSE ativo em http://localhost:5000")

        # 2. Inicia o monitoramento de auditoria em background (terminal)
        if db_ready:
            threading.Thread(target=monitor_loop, args=(args.interval,), daemon=True).start()

    # 3. Inicia o Frontend Vite (Porta 5173)
    frontend_proc = None
    if not args.no_frontend:
        frontend_proc = spawn([NPM, "run", "dev"], FRONTEND, "frontend")
        log("start", "[OK] Frontend Dashboard ativo em http://localhost:5173")

    print("=" * 76)
    print(" [+] Backend e Frontend rodando JUNTOS e integrados em TEMPO REAL.")
    print(" [+] Acesse no navegador: http://localhost:5173")
    print(" [+] Pressione Ctrl+C para encerrar ambos.")
    print("=" * 76 + "\n")

    try:
        while not stopping.is_set():
            time.sleep(0.5)
            # Se qualquer processo principal cair prematuramente
            if frontend_proc and frontend_proc.poll() is not None:
                log("warn", "Frontend encerrou.")
                break
            if backend_proc and backend_proc.poll() is not None:
                log("warn", "Backend API encerrou.")
                break
    except KeyboardInterrupt:
        pass
    finally:
        shutdown()


if __name__ == "__main__":
    main()

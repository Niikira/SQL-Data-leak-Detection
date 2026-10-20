#!/usr/bin/env python3
"""
Sobe backend + frontend com um único comando:

    python start.py

O que ele faz:
  1. Instala dependências Python (requirements.txt) e do frontend (npm install) se faltarem.
  2. Backend: verifica o MySQL, cria o banco `banco_teste` se preciso, popula com
     dados de teste (fillBank.py, só na primeira vez) e roda o monitoramento
     (monitoramento.py) em loop.
  3. Frontend: inicia o Vite (http://localhost:5173).
  4. Ctrl+C encerra tudo.

Opções:
  --interval N   segundos entre varreduras do monitoramento (padrão: 30)
  --reseed       apaga e recria as tabelas com dados de teste (resetBank + fillBank)
  --no-backend   sobe só o frontend
  --no-frontend  sobe só o backend
"""
import argparse
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"
NPM = "npm.cmd" if IS_WIN else "npm"
VENV = ROOT / ".venv"
PY = str(VENV / ("Scripts/python.exe" if IS_WIN else "bin/python"))

# Mesmos dados de conexão usados nos scripts do projeto.
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME = "localhost", 3306, "root", "root", "banco_teste"

COLORS = {"backend": "\033[96m", "frontend": "\033[95m", "start": "\033[92m", "api": "\033[93m"}
RESET = "\033[0m"

procs: list[subprocess.Popen] = []
stopping = threading.Event()


def log(tag, msg):
    print(f"{COLORS.get(tag, '')}[{tag}]{RESET} {msg}", flush=True)


def spawn(cmd, cwd, tag):
    """Inicia um processo filho e repassa a saída com prefixo."""
    kwargs = {}
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
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
    log("start", "Encerrando tudo...")
    for p in procs:
        kill_tree(p)


# --------------------------------------------------------------------------- setup
def ensure_python_deps():
    if not Path(PY).exists():
        log("start", "Criando ambiente virtual Python (.venv)...")
        if run_blocking([sys.executable, "-m", "venv", str(VENV)], ROOT, "start") != 0:
            sys.exit("Falha ao criar o .venv (no Debian/Ubuntu: sudo apt install python3-venv).")
    check = subprocess.run([PY, "-c", "import sqlalchemy, pymysql, cryptography, flask, flask_cors"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if check.returncode == 0:
        return
    log("start", "Instalando dependências Python no .venv...")
    if run_blocking([PY, "-m", "pip", "install", "-q", "-r", "requirements.txt"], ROOT, "start") != 0:
        sys.exit("Falha ao instalar dependências Python (veja a saída acima).")


def ensure_frontend_deps():
    if (FRONTEND / "node_modules").exists():
        return
    log("start", "Rodando npm install no frontend (primeira vez)...")
    if run_blocking([NPM, "install"], FRONTEND, "start") != 0:
        sys.exit("Falha no npm install (veja a saída acima).")


def mysql_up():
    try:
        with socket.create_connection((DB_HOST, DB_PORT), timeout=2):
            return True
    except OSError:
        return False


DB_PROBE = """
import sys, pymysql
try:
    c = pymysql.connect(host=%r, port=%d, user=%r, password=%r, autocommit=True)
except Exception as e:
    print("ERRO:", e); sys.exit(2)
cur = c.cursor()
cur.execute("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4")
cur.execute("USE `%s`")
cur.execute("SHOW TABLES LIKE 'users'")
if cur.fetchone() is None:
    print("STATE:empty")
else:
    cur.execute("SELECT COUNT(*) FROM users")
    print("STATE:seeded" if cur.fetchone()[0] > 0 else "STATE:empty")
""" % (DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_NAME)


def prepare_database(reseed):
    """Cria o banco se faltar e popula com dados de teste. Retorna True se pronto."""
    r = subprocess.run([PY, "-c", DB_PROBE], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log("backend", f"Não consegui conectar ao MySQL ({DB_USER}@{DB_HOST}): {r.stdout.strip() or r.stderr.strip()}")
        return False
    seeded = "STATE:seeded" in r.stdout

    if reseed and seeded:
        log("backend", "Resetando o banco (resetBank.py)...")
        run_blocking([PY, "resetBank.py"], ROOT, "backend")
        seeded = False

    if not seeded:
        log("backend", "Populando banco com dados de teste (fillBank.py)...")
        if run_blocking([PY, "fillBank.py"], ROOT, "backend") != 0:
            log("backend", "fillBank.py falhou.")
            return False
    else:
        log("backend", "Banco já populado — pulando seed (use --reseed para refazer).")
    return True


def monitor_loop(interval):
    while not stopping.is_set():
        run_blocking([PY, "monitoramento.py"], ROOT, "backend")
        for _ in range(interval):
            if stopping.is_set():
                return
            time.sleep(1)


# --------------------------------------------------------------------------- main
def main():
    # No Windows o console costuma usar cp1252; a saída dos filhos (Vite, etc.)
    # traz caracteres UTF-8 (➜, acentos) que quebrariam o print. Força UTF-8.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="Sobe backend + frontend com um comando.")
    ap.add_argument("--interval", type=int, default=30)
    ap.add_argument("--reseed", action="store_true")
    ap.add_argument("--no-backend", action="store_true")
    ap.add_argument("--no-frontend", action="store_true")
    args = ap.parse_args()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    if not args.no_backend:
        ensure_python_deps()
    if not args.no_frontend:
        ensure_frontend_deps()

    if not args.no_backend:
        if not mysql_up():
            log("backend", f"MySQL não está respondendo em {DB_HOST}:{DB_PORT}. "
                           "Inicie o serviço do MySQL (usuário root / senha 1234). "
                           "Seguindo só com o frontend.")
            args.no_backend = True
        elif not prepare_database(args.reseed):
            log("backend", "Backend desativado; seguindo só com o frontend.")
            args.no_backend = True

    if not args.no_backend:
        threading.Thread(target=monitor_loop, args=(args.interval,), daemon=True).start()
        # Sobe a API de alertas (porta 5000) — é o que faz o botão de pentest
        # e os dados reais do dashboard funcionarem.
        spawn([PY, "api.py"], ROOT, "api")
        log("start", "API de alertas em http://localhost:5000")

    fe = None
    if not args.no_frontend:
        fe = spawn([NPM, "run", "dev"], FRONTEND, "frontend")
        log("start", "Frontend em http://localhost:5173  (Ctrl+C para parar)")

        # Abre o navegador sozinho assim que o frontend responder.
        def abrir_navegador():
            for _ in range(40):
                if stopping.is_set():
                    return
                try:
                    with socket.create_connection(("localhost", 5173), timeout=1):
                        break
                except OSError:
                    time.sleep(1)
            if not stopping.is_set():
                webbrowser.open("http://localhost:5173")

        threading.Thread(target=abrir_navegador, daemon=True).start()

    try:
        if fe:
            fe.wait()
            shutdown()
        else:
            while not stopping.is_set():
                time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()

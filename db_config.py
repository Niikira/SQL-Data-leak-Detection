"""
db_config.py — Configuração e conexão centralizada com o MySQL.
Tenta conectar usando a senha informada em variável de ambiente (DB_PASS / DB_URL),
ou testa automaticamente senhas comuns ('1234', 'root', '') para evitar falhas de autenticação.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", 3306))
DB_USER = os.environ.get("DB_USER", "root")
DB_NAME = os.environ.get("DB_NAME", "banco_teste")

_CACHED_URL = None
_CACHED_ENGINE = None


def get_db_url():
    global _CACHED_URL
    if _CACHED_URL:
        return _CACHED_URL

    # Se DATABASE_URL estiver definida no ambiente, usa diretamente
    env_url = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
    if env_url:
        _CACHED_URL = env_url
        return _CACHED_URL

    # Lista de senhas para testar
    passwords_to_try = []
    if "DB_PASS" in os.environ:
        passwords_to_try.append(os.environ["DB_PASS"])
    for p in ["1234", "root", ""]:
        if p not in passwords_to_try:
            passwords_to_try.append(p)

    import pymysql
    working_pass = "1234"
    for pwd in passwords_to_try:
        try:
            conn = pymysql.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=pwd,
                connect_timeout=2
            )
            conn.close()
            working_pass = pwd
            break
        except Exception:
            continue

    _CACHED_URL = f"mysql+pymysql://{DB_USER}:{working_pass}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return _CACHED_URL


def get_db_engine():
    global _CACHED_ENGINE
    if _CACHED_ENGINE is None:
        url = get_db_url()
        _CACHED_ENGINE = create_engine(url, pool_pre_ping=True, pool_recycle=3600)
    return _CACHED_ENGINE


def get_db_session():
    engine = get_db_engine()
    Session = sessionmaker(bind=engine)
    return Session()

"""
db_config.py — Configuração do banco de dados em UM lugar só.

Se o seu MySQL tem usuário/senha diferentes, mude abaixo (ou defina as
variáveis de ambiente correspondentes). Todos os scripts do projeto
(api.py, monitoramento.py, pentest.py, fillBank.py, resetBank.py,
auth_demo.py e start.py) leem a conexão daqui.

Exemplo: se a senha do seu root for "1234", troque a linha de DB_PASSWORD
para  DB_PASSWORD = os.getenv("MYSQL_PASSWORD", "1234")
ou rode com a variável de ambiente:  set MYSQL_PASSWORD=1234  (Windows)
"""
import os

# ───────── Mude aqui se precisar ─────────
DB_USER     = os.getenv("MYSQL_USER",     "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")        # <<< troque "root" pela senha do seu MySQL
DB_HOST     = os.getenv("MYSQL_HOST",     "localhost")
DB_PORT     = int(os.getenv("MYSQL_PORT", "3306"))
DB_NAME     = os.getenv("MYSQL_DATABASE", "banco_teste")
# ─────────────────────────────────────────

# String de conexão pronta (usada pelo SQLAlchemy em todos os scripts).
DB_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

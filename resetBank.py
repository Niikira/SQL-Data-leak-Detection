from db_config import get_db_engine
from criarTabelas import Base

print("Conectando ao banco de dados...")
engine = get_db_engine()

print("Apagando tabelas antigas (resetando o banco)...")
Base.metadata.drop_all(engine)

print("Banco resetado com sucesso!")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from criarTabelas import User
from security import descriptografar_dado

# URL de conexão com o banco MySQL usado para os testes de autenticação.
from db_config import DB_URL
engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)


def simular_acesso(username_requisitante, username_alvo):
    # Cria uma sessão com o banco para consultar os usuários envolvidos na simulação.
    session = Session()
    try:
        # Busca o usuário que está tentando acessar o dado sensível.
        requisitante = session.query(User).filter_by(username=username_requisitante).first()
        # Busca o usuário cujo dado será acessado.
        alvo = session.query(User).filter_by(username=username_alvo).first()

        # Caso o requisitante não exista, a simulação é encerrada imediatamente.
        if not requisitante:
            print(f"[NEGADO] Usuário requisitante '{username_requisitante}' não encontrado.")
            return

        # Caso o alvo não exista, não há como continuar a verificação.
        if not alvo:
            print(f"[ERRO] Usuário alvo '{username_alvo}' não encontrado.")
            return

        print(f"\n--- Simulação de Acesso ---")
        print(f"Requisitante: {requisitante.username} (Role: {requisitante.role})")
        print(f"Alvo: {alvo.username}")

        # Regra de negócio: apenas administradores podem visualizar dados sensíveis
        # de outros usuários. O mesmo usuário consegue acessar seu próprio dado.
        if requisitante.role != 'admin' and requisitante.id != alvo.id:
            print("[ALERTA] Acesso Negado: Você não tem permissão para visualizar este dado sensível.")
            return

        # Se o alvo possuir dado sensível armazenado, o código tenta descriptografá-lo.
        if alvo.dado_sensivel_aes:
            try:
                dado_aberto = descriptografar_dado(alvo.dado_sensivel_aes)
                print(f"[SUCESSO] Dado sensível acessado: {dado_aberto}")
            except Exception as e:
                print(f"[ERRO] Falha ao descriptografar: {e}")
        else:
            # Usuário alvo sem dado sensível cadastrado.
            print("[AVISO] O usuário alvo não possui dado sensível cadastrado.")

    finally:
        # Garante que a sessão seja fechada mesmo se houver erro.
        session.close()


if __name__ == "__main__":
    print("Testando Acesso a Dados Criptografados (AES-GCM)\n")

    # Primeira simulação: usuário com privilégio de administrador tenta acessar um alvo.
    # Este cenário representa um atacante com papel administrativo tentando consultar dados de outro usuário.
    simular_acesso("hacker_admin", "admin_falso")

    # Segunda simulação: usuário comum tenta acessar um dado que não deveria ver.
    # Neste caso, a validação de permissões deve bloquear o acesso.
    simular_acesso("vitima_ataque", "admin_falso")

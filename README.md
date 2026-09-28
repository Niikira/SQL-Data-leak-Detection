# Detecção de Vazamento de Dados via SQL

## Sobre o Projeto

Este é um Produto Mínimo Viável (MVP) desenvolvido para a disciplina de Gestão Ágil de Projetos da Pontifícia Universidade Católica de São Paulo (PUC-SP). O sistema atua como um monitor de segurança corporativa para bancos de dados relacionais, focando na identificação de acessos suspeitos e na prevenção contra a exfiltração de dados sensíveis.

O projeto opera em três frentes:

1. **Proteção de Dados (Prevenção):** criptografia forte (AES-256-GCM) para dados confidenciais e hashes seguros (bcrypt) para senhas antes da persistência no banco.
2. **Monitoramento e Auditoria (Detecção):** consultas SQL táticas (segurança defensiva / Blue Team) aplicadas sobre uma trilha de auditoria contínua para flagrar anomalias como ataques de força bruta, escalação de privilégios, exportação massiva de dados e acessos simultâneos irregulares.
3. **Visualização (Dashboard):** interface web que exibe os alertas gerados pela detecção, com filtros por severidade, tipo e busca.

Os padrões de ataque que o sistema sabe detectar hoje:

| Padrão | Severidade | O que dispara o alerta |
|---|---|---|
| Movimentação Lateral / Exfiltração | ALTA | Mesmo usuário logando de 3+ IPs distintos em 1h |
| Força Bruta / Password Spray | ALTA | 10+ falhas de login ou 5+ contas alvo por IP em 30min |
| Exportação Massiva | ALTA | Mais de 50 medições recebidas por uma loja em 24h |
| Enumeração de Tokens | MÉDIA | 8+ tentativas de token inválido por IP em 1h, testando várias lojas |
| Bloqueio de Conta | MÉDIA | Conta com `locked_until` ainda no futuro |
| SQL Injection | ALTA | Payloads suspeitos (`union`, `select`, `drop`, `--`, `;`) em campos de log |
| Escalação de Privilégio | MÉDIA | Usuário promovido a `admin` nas últimas 24h |

## Equipe e Gestão Ágil (Scrum)

O desenvolvimento deste MVP foi guiado pelos princípios da metodologia ágil, com as entregas divididas em Sprints e a seguinte distribuição de papéis:

* **Nícolas Okamoto Celestrino:** Product Owner (PO) / Gerente do Projeto
* **Matheus Carvalho Reis:** Scrum Master
* **Gabriel Azevedo Cruz:** Desenvolvedor (UX Designer)
* **Gabriel Mechi Lima:** Desenvolvedor (Database Engineer)
* **Lucas Ferri:** Desenvolvedor (QA - Quality Assurance)

## Arquitetura

```
┌────────────────┐      lê/escreve      ┌───────────┐
│  fillBank.py    │ ───────────────────▶ │           │
│  pentest.py     │                      │   MySQL   │
│  (geram dados)  │                      │ banco_teste│
└────────────────┘                      └─────┬─────┘
                                               │ consulta
                        ┌──────────────────────┼──────────────────────┐
                        ▼                      ▼                      ▼
              monitoramento.py          api.py (Flask)                │
              (imprime no terminal)     GET /api/alerts               │
                                               │                      │
                                               ▼                      │
                                    frontend (Vite/React) ◀───────────┘
                                    http://localhost:5173
```

- **`monitoramento.py`** roda as mesmas consultas de detecção direto no terminal, em loop (via `start.py`).
- **`api.py`** expõe essas mesmas regras como um endpoint HTTP (`/api/alerts`), para o frontend consumir dados reais em vez de dados mockados.
- **`frontend/`** é o dashboard (React + Vite). Se a API não estiver no ar, ele cai de volta para dados de exemplo fixos (`mockData.js`), para a tela não ficar vazia — e avisa isso na própria página.

## Tecnologias Utilizadas

* **Python:** roteiros de conexão, simulação de ataques, geração de massa de dados e API.
* **MySQL:** banco relacional para as tabelas de auditoria e credenciais.
* **SQLAlchemy:** ORM para mapeamento das tabelas e bloqueio nativo contra SQL Injection (via *bind parameters*).
* **Cryptography (AES-GCM):** criptografia bidirecional dos dados sensíveis.
* **Flask + Flask-CORS:** API HTTP que expõe os alertas para o frontend.
* **React + Vite:** dashboard web.

## Pré-requisitos

- Python 3.10+ instalado
- Node.js e npm instalados
- MySQL Server rodando em `localhost:3306`, com usuário `root` e senha `1234` (é o que os scripts esperam; se sua senha for outra, veja [Solução de problemas](#solução-de-problemas))

## Como rodar

### 1. Instalar dependências Python

Na primeira vez, o próprio `start.py` cria um ambiente virtual (`.venv`) e instala tudo sozinho. Se quiser fazer isso manualmente:

```
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

### 2. Subir o projeto principal (backend de monitoramento + frontend)

```
python start.py
```

Isso faz tudo de uma vez:
- cria o banco `banco_teste` se não existir e popula com dados de teste (`fillBank.py`), só na primeira vez;
- roda `monitoramento.py` em loop, imprimindo os alertas detectados no terminal a cada 30s;
- sobe o frontend em **http://localhost:5173**.

Opções úteis:
```
python start.py --reseed         # apaga e recria o banco com dados de teste do zero
python start.py --interval 10    # varredura a cada 10s em vez de 30s
python start.py --no-frontend    # só o backend
python start.py --no-backend     # só o frontend
```

### 3. Subir a API dos alertas (para o dashboard mostrar dados reais)

Em um **segundo terminal**, na mesma pasta:

```
.venv\Scripts\activate
python api.py
```

Sobe em `http://localhost:5000`. Com ela no ar, a tela "Alertas" do dashboard passa a mostrar `🟢 dados reais (api/alerts)` em vez de dados mockados.

### 4. (Opcional) Simular um ataque para testar a detecção na prática

Em um terceiro terminal, com o `api.py` já rodando:

```
python pentest.py
```

Isso insere no banco, com timestamps recentes, os padrões de ataque da tabela acima e já roda `monitoramento.py` no final para mostrar o que foi pego. Recarregue o dashboard depois — os novos alertas aparecem na Tabela de Alertas.

Use `python pentest.py --clean` para limpar `auth_logs` e `measurements` antes de injetar os ataques.

### 5. Resetar o banco

```
python resetBank.py
```

Apaga todas as tabelas. Rode `python start.py` de novo (ou `fillBank.py`) para recriá-las e popular.

## Estrutura do projeto

```
├── start.py            # orquestra backend (monitoramento) + frontend
├── api.py               # API Flask: expõe /api/alerts para o dashboard
├── monitoramento.py      # regras de detecção (roda no terminal)
├── pentest.py            # simula ataques para testar a detecção
├── criarTabelas.py       # schema das tabelas (SQLAlchemy)
├── fillBank.py            # popula o banco com dados de teste (cenários normais e maliciosos)
├── resetBank.py           # apaga as tabelas
├── security.py            # criptografia AES-GCM
├── auth_demo.py            # exemplo de fluxo de autenticação
├── deteccao-vazamento.sql   # consultas SQL de referência
├── requirements.txt
└── frontend/                # dashboard React + Vite
    └── src/
        ├── pages/            # Dashboard, Alertas, Contas Bloqueadas, Investigar IP, Medições
        └── data/mockData.js   # dados de exemplo (fallback quando a API está fora do ar)
```

## Solução de problemas

**`Access denied for user 'root'@'localhost'`** — a senha do MySQL na sua máquina não é `1234`. Ou troque a senha do root para `1234` (`ALTER USER 'root'@'localhost' IDENTIFIED BY '1234'; FLUSH PRIVILEGES;`), ou ajuste a senha em `start.py`, `api.py`, `fillBank.py`, `monitoramento.py`, `resetBank.py` e `auth_demo.py` (todos têm a conexão declarada separadamente).

**`ModuleNotFoundError: No module named 'flask'`** — o `.venv` não está ativado, ou o `pip install` foi rodado em outra pasta/ambiente. Confirme que o prompt mostra `(.venv)` antes de instalar e rodar.

**`http proxy error: /api/alerts` / `ECONNREFUSED`** — o `api.py` não está rodando. Ele é um processo separado do `start.py`; precisa estar de pé em outro terminal.

**Alertas somem depois de um tempo** — as regras usam janelas de tempo (última 1h, 30min, 24h). Dados antigos saem da janela e param de aparecer. Rode `python pentest.py` para gerar eventos novos, ou `python start.py --reseed` para repopular do zero.

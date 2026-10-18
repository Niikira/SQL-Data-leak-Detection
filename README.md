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

### 2. Subir tudo com um único comando (Backend API + SSE + Monitoramento + Frontend)

```bash
python start.py
```
*(ou simplesmente `npm start` na raiz do projeto)*

Isso executa **Backend e Frontend integrados e rodando juntos**:
- Verifica e conecta ao MySQL (porta `3306`, usuário `root`, senha `1234` ou `root` com fallback automático);
- Prepara o banco `banco_teste` e popula com dados de teste (`fillBank.py`), se necessário;
- Sobe o **Backend API** (Flask + Server-Sent Events na porta `5000`);
- Sobe o **Frontend Dashboard** (React + Vite na porta `5173`);
- Roda a auditoria contínua de segurança (IDS/IPS) em loop;
- **Ctrl+C** encerra ambos simultaneamente de forma limpa.

Opções úteis:
```bash
python start.py --reseed         # Apaga e recria o banco com dados de teste do zero
python start.py --interval 10    # Varredura IDS no terminal a cada 10s em vez de 30s
python start.py --no-frontend    # Sobe apenas o backend
python start.py --no-backend     # Sobe apenas o frontend
```

### 3. Operação em Tempo Real (Real-Time)

O sistema opera com streaming de eventos e sincronização contínua:
- **Server-Sent Events (SSE)** em `/api/stream`: o backend empurra novas anomalias e estatísticas em tempo real para o dashboard web;
- **Polling Fallback**: garantia de continuidade mesmo em oscilações de rede;
- **Indicador Ao Vivo na barra superior**: exibe status de conexão (`AO VIVO`, `POLLING`, `PAUSADO`), hora da última sincronização e botões de controle;
- **Botão "⚡ Simular Ataque" na UI**: permite disparar ataques de teste (Força Bruta, Movimentação Lateral, SQL Injection, Lockout, Exportação Massiva) diretamente pelo navegador e assistir à detecção ocorrendo **ao vivo** sem precisar recarregar a página!

### 4. (Opcional) Simular ataques via terminal

Além do botão na interface web, você também pode disparar os ataques pelo terminal:

```bash
python pentest.py
```

Use `python pentest.py --clean` para limpar os logs antes de uma nova demonstração.

### 5. Resetar o banco

```bash
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

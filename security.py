import os
import base64
from importlib import import_module

# Tenta importar o algoritmo AES-GCM da biblioteca cryptography.
# Se a biblioteca não estiver instalada, o código falha com uma mensagem clara
# indicando que a dependência precisa ser adicionada ao ambiente.
try:
    AESGCM = import_module("cryptography.hazmat.primitives.ciphers.aead").AESGCM
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "Instale a dependência 'cryptography' para usar AES-GCM."
    ) from exc

# Chave AES em base64. A variável de ambiente AES_KEY é usada quando disponível.
# Caso contrário, gera uma chave aleatória em tempo de execução, o que não é ideal
# em produção, mas é suficiente para ambiente de demonstração.
CHAVE_AES_B64 = os.environ.get("AES_KEY", base64.b64encode(os.urandom(32)).decode('utf-8'))

# Criptografa uma string em texto claro usando AES-GCM.
# O nonce é gerado aleatoriamente para cada chamada e precisa ser preservado
# junto com o dado criptografado para que a descriptografia funcione corretamente.
def criptografar_dado(texto_claro: str) -> str:
    chave = base64.b64decode(CHAVE_AES_B64)
    aesgcm = AESGCM(chave)

    # nonce: valor único usado em cada criptografia para evitar padrões repetidos.
    nonce = os.urandom(12)

    # Criptografa o conteúdo e concatena nonce + ciphertext.
    texto_cifrado = aesgcm.encrypt(nonce, texto_claro.encode("utf-8"), None)
    resultado = nonce + texto_cifrado

    # Converte o resultado para string em base64 para armazenamento em banco ou arquivo.
    return base64.b64encode(resultado).decode("utf-8")

# Descriptografa um valor que foi previamente gerado pela função acima.
# Primeiro decodifica o base64, depois separa o nonce do payload cifrado e
# aplica a descriptografia com a mesma chave AES.
def descriptografar_dado(dado_criptografado: str) -> str:
    chave = base64.b64decode(CHAVE_AES_B64)
    aesgcm = AESGCM(chave)

    # Decodifica o blob para recuperar nonce + texto cifrado.
    blob = base64.b64decode(dado_criptografado)

    # Os primeiros 12 bytes são o nonce, o restante é o conteúdo cifrado.
    nonce = blob[:12]
    texto_cifrado = blob[12:]

    # Decripta e retorna o texto original em UTF-8.
    texto_claro = aesgcm.decrypt(nonce, texto_cifrado, None)
    return texto_claro.decode("utf-8")
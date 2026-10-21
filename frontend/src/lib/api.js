// Chamadas à API (Flask, via proxy do Vite). Tratam resposta vazia/HTML —
// o que acontece quando a API está fora do ar — sem estourar "JSON.parse".

async function lerJson(r) {
  const txt = await r.text()
  if (!r.ok || !txt.trim()) throw new Error('API-OFFLINE')
  let data
  try { data = JSON.parse(txt) } catch { throw new Error('API-OFFLINE') }
  if (data && !Array.isArray(data) && data.error) throw new Error(data.error)
  return data
}

export async function getJson(url) {
  return lerJson(await fetch(url))
}

export async function postJson(url, body) {
  const opt = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'POST' }
  return lerJson(await fetch(url, opt))
}

// Transforma qualquer falha de rede/parse numa dica acionável.
export function msgErro(e) {
  const m = String((e && e.message) || e)
  if (m === 'API-OFFLINE' || m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('JSON')) {
    return 'Não consegui falar com a API. Confira se o MySQL está ligado (usuário e senha do db_config.py) e reinicie pelo iniciar.bat.'
  }
  return m
}

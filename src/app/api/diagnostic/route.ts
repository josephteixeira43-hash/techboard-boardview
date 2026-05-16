import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { symptom, device } = await req.json()

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `Você é especialista em manutenção de smartphones Samsung Galaxy A12 (SM-A125F).
Responda APENAS com JSON válido, sem texto antes ou depois, sem markdown, sem explicações.
Formato obrigatório exato:
{
  "diagnostico": "análise técnica do problema",
  "componentes": ["U2002", "U5003"],
  "tensoes": [{"ponto": "C2000", "valor": "1.8V"}],
  "procedimento": ["Passo 1", "Passo 2"],
  "solucao_comum": "o que geralmente resolve o problema"
}

Componentes reais do Samsung A12 SM-A125F:
- U5003 = MAIN PMIC (MT6357)
- U2002 = Transceiver RF (MT6177MV)
- PAM1000 = MMMB PA (SKY77621-31)
- PAM1001 = HB PA (WIPS33232-01)
- U3001 = BT/WIFI (MT6631N)
- U3002 = NFC (S3NRN4VXS1)
- U6002 = Speaker Amplifier
- U6000 = BLIC (LM36274)
- U400 = AP/CP (MT6765V)
- MIC6000 = Sub Microfone
- MIC1000 = Microfone Principal
- LED5000 = Flash LED
- U5007 = eMCP (memória)
- U4000 = OVP
- U1000 = HB FEMID`
        },
        {
          role: 'user',
          content: `Dispositivo: ${device}. Problema: ${symptom}`
        }
      ]
    })
  })

  const data = await response.json()

  if (!data.choices || !data.choices[0]) {
    return NextResponse.json({
      diagnostico: 'Erro ao conectar com a IA. Verifique a chave GROQ_API_KEY.',
      componentes: [],
      tensoes: [],
      procedimento: [],
      solucao_comum: ''
    })
  }

  const text = data.choices[0].message.content

  try {
    // Extrai JSON do texto usando regex
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : null

    if (!jsonStr) throw new Error('JSON não encontrado')

    const parsed = JSON.parse(jsonStr)
    return NextResponse.json(parsed)
  } catch {
    // Fallback: retorna o texto bruto no campo diagnostico
    return NextResponse.json({
      diagnostico: text,
      componentes: [],
      tensoes: [],
      procedimento: [],
      solucao_comum: ''
    })
  }
}

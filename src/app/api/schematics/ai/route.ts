import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages, deviceName, fileContext } = await req.json();

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY não configurada" },
        { status: 500 }
      );
    }

    const systemPrompt = `Você é um técnico especialista em reparo de smartphones, com foco no ${deviceName}.
Você está analisando esquemas elétricos e documentos de troubleshooting profissionais.
${fileContext ? fileContext : ""}

Suas respostas devem ser:
- Técnicas e precisas para um técnico de celular
- Em português brasileiro
- Com referências a componentes reais (ICs, resistores, capacitores, tensões)
- Incluir valores de tensão quando relevante (ex: VBAT 3.7V-4.35V, VSYS 4.0V, etc.)
- Formatadas com **negrito** para termos técnicos importantes
- Concisas mas completas

Dispositivo: ${deviceName}
Chipset: MediaTek MT6765 (Helio P35)
Bateria: 5000mAh, Li-Ion
Carregamento: 15W`;

    const groqMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...groqMessages,
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Groq error:", error);
      return NextResponse.json(
        { error: "Erro na API Groq", details: error },
        { status: 500 }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "Sem resposta da IA.";

    return NextResponse.json({ response: aiResponse });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

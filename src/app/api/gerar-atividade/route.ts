import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequisicaoSchema = z.object({
  turma: z.enum(["4º Ano", "5º Ano"]),
  disciplina: z.string().min(2),
  conteudo: z.string().min(2),
});

const QuestaoSchema = z.object({
  enunciado: z.string().min(5),
  alternativas: z.array(z.string().min(1)).length(4),
  correta: z.enum(["A", "B", "C", "D"]),
});

const TabelaSchema = z.object({
  titulo: z.string().optional(),
  colunas: z.array(z.string()),
  linhas: z.array(z.array(z.string())),
}).optional().nullable();

const GraficoSchema = z.object({
  titulo: z.string().optional(),
  dados: z.array(z.object({
    rotulo: z.string(),
    valor: z.number(),
  })),
}).optional().nullable();

const AtividadeSchema = z.object({
  titulo: z.string().min(3),
  objetivos: z.array(z.string().min(3)).min(2).max(3),
  textoApoio: z.string().min(50),
  tabela: TabelaSchema,
  grafico: GraficoSchema,
  questoes: z.array(QuestaoSchema).length(10),
});

const MODELOS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validacao = RequisicaoSchema.safeParse(body);

    if (!validacao.success) {
      return NextResponse.json(
        { erro: "Parâmetros inválidos fornecidos.", detalhes: validacao.error.format() },
        { status: 400 }
      );
    }

    const { turma, disciplina, conteudo } = validacao.data;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { erro: "Chave da API do Gemini (GEMINI_API_KEY) não configurada no servidor." },
        { status: 500 }
      );
    }

    // DIRETRIZES PEDAGÓGICAS ESPECÍFICAS
    let diretrizDisciplina = "";
    const ehGraficosTabelas = conteudo.toLowerCase().includes("gráfico") || conteudo.toLowerCase().includes("tabela") || conteudo.toLowerCase().includes("estatística");

    if (disciplina === "Matemática") {
      if (ehGraficosTabelas) {
        diretrizDisciplina = `ESPECÍFICO DE MATEMÁTICA (GRÁFICOS E TABELAS):
- Você DEVE obrigatoriamente fornecer 'grafico' e 'tabela' estruturados com dados quantitativos reais no JSON.
- No 'grafico': forneça título e de 4 a 6 dados com 'rotulo' e 'valor' (número inteiro de 5 a 100).
- Na 'tabela': forneça 'titulo', 'colunas' e matriz de 'linhas' com valores reais.
- Pelo menos 4 das 10 questões devem exigir cálculo, comparação ou leitura dos números do gráfico/tabela.`;
      } else {
        diretrizDisciplina = `ESPECÍFICO DE MATEMÁTICA:
- Traga problemas com situações do cotidiano, cálculos claros e precisos. Se oportuno, inclua uma 'tabela' para resolução dos problemas.`;
      }
    } else if (disciplina === "Língua Portuguesa") {
      diretrizDisciplina = `ESPECÍFICO DE LÍNGUA PORTUGUESA:
- O 'textoApoio' deve conter um texto literário ou informativo completo (conto curto, poema com estrofes ou notícia).
- Questões com inferência, localização de dados explícitos e identificação gramatical.`;
    } else if (disciplina === "Inglês") {
      diretrizDisciplina = `ESPECÍFICO DE LÍNGUA INGLESA:
- Forneça texto contextual bilíngue com vocabulário prático e útil para a série escolar.`;
    } else if (disciplina === "História" || disciplina === "Geografia" || disciplina === "Ciências") {
      diretrizDisciplina = `ESPECÍFICO DE ${disciplina.toUpperCase()}:
- Apresente dados e fatos históricos/científicos/geográficos claros. Se oportuno, inclua uma 'tabela' comparativa com dados reais.`;
    }

    // DIRETRIZES DE CALIBRAÇÃO PEDAGÓGICA POR NÍVEL ESCOLAR (4º vs 5º ANO)
    const eh4Ano = turma.includes("4º");
    let calibracaoAno = "";

    if (eh4Ano) {
      calibracaoAno = `DIRETRIZ PEDAGÓGICA E LIMITES COGNITIVOS DO 4º ANO (BNCC):
- Linguagem e Leitura: Vocabulário acessível, frases diretas e narrativas lineares. Texto de apoio com 90 a 130 palavras.
- Matemática & Gráficos: Números até 10.000. Cálculos de adição e subtração com reagrupamento, multiplicação por 1 dígito e divisões exatas simples.
- Em Gráficos/Tabelas: Gráficos de colunas simples com escala amigável (de 1 em 1, 5 em 5 ou 10 em 10). Dados inteiros com temas familiares (brinquedos, frutas, votos da turma). Tabelas simples de entrada única (duas colunas: Item e Quantidade).
- Questões: Focadas em identificação direta de dados, comparações diretas de maior/menor e operações fundamentais sem pegadinhas.`;
    } else {
      calibracaoAno = `DIRETRIZ PEDAGÓGICA E LIMITES COGNITIVOS DO 5º ANO (BNCC - TRANSIÇÃO PARA ANOS FINAIS):
- Linguagem e Leitura: Maior aprofundamento textual, relações de causa/efeito, pequenos textos de divulgação científica, crônicas ou notícias. Texto de apoio com 130 a 180 palavras.
- Matemática & Gráficos: Números até centenas de milhar e milhões. Multiplicação por 2 dígitos, divisão com resto, noções de frações equivalentes, números decimais do cotidiano (R$ e medidas) e porcentagens âncora (10%, 25%, 50%).
- Em Gráficos/Tabelas: Gráficos de barras comparativos com escalas maiores (dezenas ou centenas). Tabelas de dupla entrada (ex: Categoria x Gênero/Período) exigindo cruzamento de linhas e colunas.
- Questões: Exigem inferência, cálculo de diferença entre totais, análise de tabelas compostas e justificativa de raciocínio lógico.`;
    }

    const prompt = `Você é professor(a) especialista no Ensino Fundamental brasileiro e na BNCC.
Crie uma atividade avaliativa oficial de ${disciplina} para a turma de ${turma}, dedicada exclusivamente ao conteúdo: "${conteudo}".

${calibracaoAno}

${diretrizDisciplina}

Regras pedagógicas obrigatórias:
- Dê um título específico, claro e formal, sem clichês.
- Inclua 2 ou 3 objetivos de aprendizagem observáveis, perfeitamente adequados às habilidades da BNCC do ${turma}.
- Respeite rigorosamente o nível cognitivo e os limites matemáticos estipulados para o ${turma}.
- Exatamente 10 questões de múltipla escolha com 4 alternativas cada (A, B, C, D).
- Apenas uma resposta correta, variando equilibradamente as letras corretas (A, B, C, D) entre as 10 questões.
- Distribuição equilibrada: 3 fáceis (compreensão direta), 4 médias (aplicação prática) e 3 que estimulem o raciocínio analítico adequado à idade.
- Sem ambiguidades e sem pegadinhas.

Responda em JSON rigoroso seguindo o schema requerido.`;

    const schemaFormatado = {
      type: "object",
      properties: {
        titulo: { type: "string" },
        objetivos: { type: "array", items: { type: "string" } },
        textoApoio: { type: "string" },
        tabela: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            colunas: { type: "array", items: { type: "string" } },
            linhas: { type: "array", items: { type: "array", items: { type: "string" } } },
          },
        },
        grafico: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            dados: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rotulo: { type: "string" },
                  valor: { type: "number" },
                },
                required: ["rotulo", "valor"],
              },
            },
          },
        },
        questoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              enunciado: { type: "string" },
              alternativas: { type: "array", items: { type: "string" } },
              correta: { type: "string", enum: ["A", "B", "C", "D"] },
            },
            required: ["enunciado", "alternativas", "correta"],
          },
        },
      },
      required: ["titulo", "objetivos", "textoApoio", "questoes"],
    };

    let respostaJson = null;
    let ultimoErro = null;

    for (const modelo of MODELOS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "application/json",
              responseSchema: schemaFormatado,
            },
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          console.warn(`[GEMINI FALLBACK] Modelo ${modelo} retornou HTTP ${resp.status}: ${txt}`);
          ultimoErro = `HTTP ${resp.status}`;
          continue; // Tenta o próximo modelo
        }

        const dados = await resp.json();
        const textoResposta = dados?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (textoResposta) {
          const parseado = JSON.parse(textoResposta);
          const validado = AtividadeSchema.safeParse(parseado);
          if (validado.success) {
            // Sanitiza alternativas para remover duplicidade de prefixos (ex: 'A) 54' -> '54')
            const questoesLimpos = validado.data.questoes.map((q) => ({
              ...q,
              alternativas: q.alternativas.map((alt) =>
                alt.replace(/^[A-Da-d][)\.\-\s]\s*/, "").trim()
              ) as [string, string, string, string],
            }));

            respostaJson = {
              ...validado.data,
              questoes: questoesLimpos,
            };
            break; // Sucesso absoluto
          } else {
            console.warn(`[GEMINI SCHEMA MISMATCH] Dados não conferem com Zod:`, validado.error);
          }
        }
      } catch (err: unknown) {
        console.error(`Erro na chamada do modelo ${modelo}:`, err);
        ultimoErro = err instanceof Error ? err.message : String(err);
      }
    }

    if (!respostaJson) {
      return NextResponse.json(
        { erro: `Não foi possível gerar a atividade após tentar todos os modelos disponíveis. Detalhe: ${ultimoErro}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      turma,
      disciplina,
      conteudo,
      ...respostaJson,
      criadoEm: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("Erro interno na rota /api/gerar-atividade:", error);
    return NextResponse.json(
      { erro: "Erro interno no servidor ao processar requisição." },
      { status: 500 }
    );
  }
}

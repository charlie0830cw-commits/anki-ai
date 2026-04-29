import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

type AiCard = {
  en?: string
  zh?: string
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

function extractJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim()

  const start = cleaned.indexOf("[")
  const end = cleaned.lastIndexOf("]")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 回傳不是 JSON 陣列")
  }

  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY 沒有設定" },
        { status: 500 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("image")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "沒有收到圖片" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString("base64")
    const mimeType = file.type || "image/jpeg"

    const prompt = `
你是一個解剖學字卡整理助手。
請從圖片中擷取可見的英文解剖構造名稱與繁體中文翻譯。

規則：
1. 只保留解剖構造名稱，不要保留章節標題、區域標題、頁碼、圖片說明。
2. 如果圖片有中文，使用圖片中的中文。
3. 如果中文看不清楚，請依照常見繁體中文解剖學用語補上。
4. 只回傳 JSON 陣列，不要解釋，不要 markdown。

格式：
[
  { "en": "英文名稱", "zh": "繁體中文" }
]
`

    const response = await client.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
            },
          ],
        },
      ],
    })

    const raw = response.output_text.trim()
    const parsed = extractJson(raw)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "AI 回傳格式不是陣列", raw },
        { status: 422 }
      )
    }

    const cards = parsed
      .map((item: AiCard) => ({
        en: String(item.en ?? "").trim(),
        zh: String(item.zh ?? "").trim(),
        status: "new" as const,
      }))
      .filter((card) => card.en && card.zh)

    if (cards.length === 0) {
      return NextResponse.json(
        { error: "沒有擷取到可用卡片", raw },
        { status: 422 }
      )
    }

    return NextResponse.json({ cards, raw })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 擷取失敗",
      },
      { status: 500 }
    )
  }
}

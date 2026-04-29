"use client"

import { useEffect, useState } from "react"

type Mode = "英翻中" | "中翻英" | "雙向混合"
type Direction = null | "red" | "orange" | "green" | "blue"
type CardStatus = "new" | "learning" | "review" | "mastered"

type Card = {
  en: string
  zh: string
  level?: 1 | 2 | 3 | 4
  dueAt?: number
  status: CardStatus
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [screen, setScreen] = useState<"upload" | "study">("upload")

  const [mode, setMode] = useState<Mode>("雙向混合")
  const [cards, setCards] = useState<Card[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [side, setSide] = useState<"en" | "zh">("en")

  const [loading, setLoading] = useState(false)
  const [detectError, setDetectError] = useState("")
  const [detected, setDetected] = useState(false)
  const [showCardPreview, setShowCardPreview] = useState(false)
  const [cardPreviewMode, setCardPreviewMode] = useState<"afterDetect" | "csv">("afterDetect")
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [showAnswer, setShowAnswer] = useState(false)
  const [flipping, setFlipping] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [direction, setDirection] = useState<Direction>(null)

  const [showSettings, setShowSettings] = useState(false)
  const [showNextCard, setShowNextCard] = useState(true)
  const [showTip, setShowTip] = useState(false)

  const [showComplete, setShowComplete] = useState(false)

  const card = cards[cardIndex]
  const nextCard = cards[(cardIndex + 1) % cards.length]

  const newCount = cards.filter((c) => c.status === "new").length
  const learningCount = cards.filter((c) => c.status === "learning").length
  const reviewCount = cards.filter((c) => c.status === "review").length
  const masteredCount = cards.filter((c) => c.status === "mastered").length

  const activeTotal = (cards.length - masteredCount) || 1
  const learningPercent = (learningCount / activeTotal) * 100
  const reviewPercent = (reviewCount / activeTotal) * 100

  const getSideByMode = () => {
    if (mode === "英翻中") return "en"
    if (mode === "中翻英") return "zh"
    return Math.random() > 0.5 ? "en" : "zh"
  }

  useEffect(() => {
    setSide(getSideByMode())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIndex, mode])

  useEffect(() => {
    if (cards.length > 0 && imageKey) {
      localStorage.setItem(`anki-progress-${imageKey}`, JSON.stringify(cards))
    }
  }, [cards, imageKey])

  const getQuestion = (target?: Card) => {
    if (!target) return ""
    return side === "en" ? target.en : target.zh
  }

  const getAnswer = (target?: Card) => {
    if (!target) return ""
    return side === "en" ? target.zh : target.en
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    const key = `${file.name}-${file.size}-${file.lastModified}`

    setImage(url)
    setImageKey(key)
    setImageFile(file)

    setDetected(false)
    setCards([])
    setCardIndex(0)
    setShowAnswer(false)
    setShowComplete(false)
    setShowCardPreview(false)
    setShowImagePreview(false)
    setShowResetConfirm(false)
    setScreen("upload")
    setDetectError("")

    localStorage.removeItem(`anki-progress-${key}`)
    localStorage.removeItem(`anki-ai-${key}`)

    e.currentTarget.value = ""
  }

  const handleDetect = async () => {
    if (loading || cards.length > 0) return

    if (!imageKey || !imageFile) {
      setDetectError("請先上傳圖片")
      return
    }

    setLoading(true)
    setDetectError("")

    try {
      const formData = new FormData()
      formData.append("image", imageFile)
      formData.append("mode", mode)

      const res = await fetch("/api/extract-cards", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "AI 擷取失敗")
      }

      const result: Card[] = Array.isArray(data.cards) ? data.cards : []

      if (result.length === 0) {
        throw new Error("AI 沒有擷取到可用卡片")
      }

      localStorage.setItem(`anki-ai-${imageKey}`, JSON.stringify(result))

      setCards(result)
      setDetected(true)
      setCardPreviewMode("afterDetect")
      setShowCardPreview(true)
      setCardIndex(0)
      setShowAnswer(false)
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : "AI 擷取失敗，請重新偵測")
    } finally {
      setLoading(false)
    }
  }

  const handleFlip = () => {
    if (animating || !card) return

    setFlipping(true)
    setShowAnswer((prev) => !prev)

    setTimeout(() => {
      setFlipping(false)
    }, 500)
  }

  const getNextAvailableIndex = (updatedCards: Card[], currentIndex: number) => {
    const now = Date.now()

    // ✅ 只找「該出現 + 不是 mastered」
    const available = updatedCards
      .map((c, i) => ({ ...c, index: i }))
      .filter((c) => (c.dueAt ?? 0) <= now && c.status !== "mastered")

    if (available.length === 0) {
      return null // 🔥 重點：沒有卡了
    }

    // 找最早的
    const next = available.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0]

    return next.index
  }



  const handleAnswer = (level: 1 | 2 | 3 | 4) => {
    if (animating || cards.length === 0 || !card) return

    const directionMap: Record<number, Direction> = {
      1: "red",
      2: "orange",
      3: "green",
      4: "blue",
    }

    const delayMap: Record<number, number> = {
      1: 15 * 1000,
      2: 60 * 1000,
      3: 5 * 60 * 1000,
      4: 24 * 60 * 60 * 1000,
    }

    const statusMap: Record<number, CardStatus> = {
      1: "learning",
      2: "learning",
      3: "review",
      4: "mastered",
    }

    const updatedCards = [...cards]
    updatedCards[cardIndex] = {
      ...updatedCards[cardIndex],
      level,
      status: statusMap[level],
      dueAt: Date.now() + delayMap[level],
    }

    setCards(updatedCards)
    setDirection(directionMap[level])
    setAnimating(true)



    setTimeout(() => {
      setResetting(true)

      const nextIndex = getNextAvailableIndex(updatedCards, cardIndex)

      if (nextIndex === null) {
        setAnimating(false)
        setDirection(null)
        setShowAnswer(false)
        setShowComplete(true)
        setResetting(false)
        return
      }

      setAnimating(false)
      setDirection(null)
      setShowAnswer(false)
      setCardIndex(nextIndex)

      setTimeout(() => {
        setResetting(false)
      }, 200)
    }, 200)
  }

  const getSlideTransform = () => {
    if (!animating) return "translate(0, 0) rotate(0deg) scale(1)"
    if (direction === "red") return "translate(-25%, 25%) rotate(-18deg) scale(0.96)"
    if (direction === "orange") return "translate(-22%, 22%) rotate(-12deg) scale(0.96)"
    if (direction === "green") return "translate(22%, 22%) rotate(12deg) scale(0.96)"
    if (direction === "blue") return "translate(25%, 25%) rotate(18deg) scale(0.96)"
    return "translate(0, 0) rotate(0deg) scale(1)"
  }

  const escapeCsv = (value: string | number | undefined) => {
    return `"${String(value ?? "").replace(/"/g, '""')}"`
  }

  const downloadCsv = () => {
    if (cards.length === 0) return

    const header = ["英文", "中文", "狀態", "熟悉度"]
    const rows = cards.map((c) => [c.en, c.zh, c.status, c.level ?? ""])

    const csvContent = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n")

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "anki-cards.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetAllCards = () => {
    const resetCards = cards.map((c) => ({
      ...c,
      status: "new" as CardStatus,
      level: undefined,
      dueAt: undefined,
    }))

    setCards(resetCards)
    setCardIndex(0)
    setShowAnswer(false)
    setShowComplete(false)
  }

  const practiceNotMastered = () => {
    const filtered = cards
      .filter((c) => c.status !== "mastered")
      .map((c) => ({
        ...c,
        dueAt: 0,
      }))

    if (filtered.length === 0) {
      resetAllCards()
      return
    }

    setCards(filtered)
    setCardIndex(0)
    setShowAnswer(false)
    setShowComplete(false)
  }

  const resetToUpload = () => {
    setImage(null)
    setImageKey(null)
    setImageFile(null)
    setCards([])
    setCardIndex(0)
    setDetected(false)
    setShowAnswer(false)
    setShowComplete(false)
    setShowCardPreview(false)
    setShowImagePreview(false)
    setShowResetConfirm(false)
    setScreen("upload")
    setDetectError("")
    setUploadInputKey((prev) => prev + 1)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-indigo-950 text-white flex flex-col items-center justify-center p-6 space-y-6 overflow-hidden">
      {screen === "study" && (
        <div className="absolute top-6 right-6">
          <button
            onClick={() => setShowSettings(true)}
            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl hover:bg-white/20 transition"
          >
            ⚙️
          </button>
        </div>
      )}

      {screen === "upload" && (
        <div className="w-full max-w-md rounded-2xl border border-white/10 backdrop-blur-md bg-white/5 shadow-xl shadow-indigo-500/10 transition-all duration-500 p-6">
          <div className="space-y-4 w-full">
            <div>
              <h1 className="text-xl font-bold tracking-wide">Anatomy Card AI</h1>
              <p className="text-sm text-zinc-400 mt-1">
                上傳圖片，選模式，再手動擷取
              </p>
            </div>

            {!image ? (
              <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-white/15 bg-white/5 p-6 text-center hover:border-blue-400 hover:bg-white/10 transition">
                <input
                  key={uploadInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleUpload}
                  className="hidden"
                />
                <div className="text-3xl mb-2">📷</div>
                <div className="font-medium">上傳圖片</div>
                <div className="text-xs text-zinc-400 mt-1">JPG / PNG</div>
              </label>
            ) : (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-emerald-300">✓ 上傳完成</div>
                  <div className="text-xs text-zinc-400 mt-1">已載入圖片｜{mode}</div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImagePreview(true)}
                    className="bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-sm hover:bg-white/15 transition"
                  >
                    👁 預覽
                  </button>

                  <label className="cursor-pointer bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-sm hover:bg-white/15 transition">
                    重新上傳
                    <input
                      key={uploadInputKey}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {image && cards.length === 0 && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-zinc-400 mb-2">選擇學習模式</div>

                  <div className="grid grid-cols-3 gap-2">
                    {["英翻中", "中翻英", "雙向混合"].map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m as Mode)}
                        className={`py-2 rounded-xl text-sm transition ${mode === m
                          ? "bg-blue-500 text-white"
                          : "bg-white/10 hover:bg-white/20"
                          }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleDetect}
                  disabled={loading || cards.length > 0}
                  className="w-full rounded-2xl py-4 text-base font-bold bg-gradient-to-r from-indigo-500 to-blue-500 shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-40"
                >
                  {loading ? "逼哺逼哺 擷取中..." : "🤖 AI 擷取卡片"}
                </button>
              </div>
            )}

            {cards.length > 0 && !showComplete && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImagePreview(true)}
                  className="flex-1 bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-sm hover:bg-white/15 transition"
                >
                  👁 預覽圖片
                </button>

                <button
                  onClick={() => {
                    setCardPreviewMode("csv")
                    setShowCardPreview(true)
                  }}
                  className="flex-1 bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-sm hover:bg-white/15 transition"
                >
                  CSV
                </button>
              </div>
            )}

            {detectError && (
              <div className="rounded-xl bg-red-500/15 border border-red-500/20 text-red-300 text-sm p-3">
                {detectError}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === "upload" && cards.length === 0 && detected && (
        <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-zinc-400">
          目前沒有可學習的卡片
        </div>
      )}

      {screen === "study" && cards.length > 0 && !showComplete && (
        <div className="w-full max-w-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">Anatomy Card AI</h1>
              <p className="text-xs text-zinc-400">{mode}｜專心學習模式</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCardPreviewMode("csv")
                  setShowCardPreview(true)
                }}
                className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
              >
                CSV
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="rounded-xl bg-red-500/20 border border-red-500/20 px-4 py-2 text-sm text-red-200 hover:bg-red-500/30 transition"
              >
                重新上傳
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zinc-400 mb-2">
                <span>學習進度</span>
                <span>Learning Flow</span>
              </div>

              <div className="relative h-4 rounded-full bg-white/10 overflow-hidden border border-white/10 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-40" />

                <div className="relative z-10 flex h-full">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500 transition-all duration-500 ease-out shadow-[0_0_12px_rgba(250,204,21,0.45)]"
                    style={{ width: `${learningPercent}%` }}
                  />

                  <div
                    className="h-full bg-gradient-to-r from-green-300 to-emerald-500 transition-all duration-500 ease-out shadow-[0_0_12px_rgba(34,197,94,0.45)]"
                    style={{ width: `${reviewPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4 text-xs text-center">
            <div className="rounded-xl bg-red-500/20 border border-red-500/20 py-2">
              <div className="text-red-300 font-medium">新卡片</div>
              <div className="text-lg font-bold">{newCount}</div>
            </div>

            <div className="rounded-xl bg-yellow-500/20 border border-yellow-500/20 py-2">
              <div className="text-yellow-300 font-medium">正在記</div>
              <div className="text-lg font-bold">{learningCount}</div>
            </div>

            <div className="rounded-xl bg-green-500/20 border border-green-500/20 py-2">
              <div className="text-green-300 font-medium">待複習</div>
              <div className="text-lg font-bold">{reviewCount}</div>
            </div>
          </div>

          <div className="perspective relative h-56">
            {cards.length > 1 && showNextCard && (
              <div
                className="absolute inset-0 rounded-3xl bg-white/5 border border-white/10 scale-95 translate-y-4 shadow-lg flex flex-col items-center justify-center transition-opacity duration-150"
                style={{
                  opacity: showAnswer || animating || flipping ? 0 : 1,
                }}
              >
                <div className="text-sm opacity-50 mb-2">下一題</div>
                <div className="text-2xl font-bold opacity-60">
                  {getQuestion(nextCard)}
                </div>
              </div>
            )}

            <div
              className="relative w-full h-56 transition-all duration-200 ease-out"
              style={{
                transform: getSlideTransform(),
                opacity: animating || resetting ? 0 : 1,
              }}
            >
              <div
                className="relative w-full h-full transition-transform duration-500"
                style={{
                  transformStyle: "preserve-3d",
                  transform: showAnswer
                    ? "rotateY(180deg)"
                    : "rotateY(0deg)",
                }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 border border-white/10 backface-hidden shadow-2xl shadow-indigo-500/20">
                  <div className="text-sm opacity-70 mb-2">題目</div>
                  <div className="text-3xl font-bold tracking-wide">
                    {getQuestion(card)}
                  </div>
                </div>

                <div
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 border border-white/10 backface-hidden shadow-2xl shadow-blue-500/20"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <div className="text-sm opacity-70 mb-2">答案</div>
                  <div className="text-3xl font-bold tracking-wide">
                    {getAnswer(card)}
                  </div>
                </div>

                {animating && (
                  <div
                    className={`absolute inset-0 rounded-3xl transition-opacity duration-200 ${direction === "red"
                      ? "bg-red-500/35"
                      : direction === "orange"
                        ? "bg-orange-400/35"
                        : direction === "green"
                          ? "bg-green-500/35"
                          : direction === "blue"
                            ? "bg-blue-500/35"
                            : ""
                      }`}
                  />
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleFlip}
            disabled={animating}
            className="mt-6 w-full rounded-2xl py-3 font-medium text-white bg-gradient-to-r from-indigo-500 to-blue-500 shadow-lg shadow-blue-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-blue-500/40 active:scale-[0.98] disabled:opacity-40"
          >
            🔁 翻面
          </button>

          <div className="grid grid-cols-4 gap-3 mt-6">
            <button
              onClick={() => handleAnswer(1)}
              disabled={animating}
              className="bg-red-500/90 rounded-xl py-2 font-medium hover:scale-105 active:scale-95 transition disabled:opacity-40"
            >
              不會
            </button>
            <button
              onClick={() => handleAnswer(2)}
              disabled={animating}
              className="bg-orange-400/90 rounded-xl py-2 font-medium hover:scale-105 active:scale-95 transition disabled:opacity-40"
            >
              普通
            </button>
            <button
              onClick={() => handleAnswer(3)}
              disabled={animating}
              className="bg-green-500/90 rounded-xl py-2 font-medium hover:scale-105 active:scale-95 transition disabled:opacity-40"
            >
              還行
            </button>
            <button
              onClick={() => handleAnswer(4)}
              disabled={animating}
              className="bg-blue-500/90 rounded-xl py-2 font-medium hover:scale-105 active:scale-95 transition disabled:opacity-40"
            >
              很熟
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[90%] max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">設定</h2>
              <button onClick={() => setShowSettings(false)}>✖</button>
            </div>

            <div className="flex justify-between items-center relative">
              <div
                className="text-sm text-zinc-400 cursor-help"
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
              >
                是否顯示下一張卡片
              </div>

              {showTip && (
                <div className="absolute left-0 top-7 w-56 rounded-xl bg-black/80 border border-white/10 p-3 text-xs text-zinc-300 shadow-xl z-10">
                  開啟後會預先顯示下一張提示；關閉後畫面比較乾淨，也比較像正式測驗。
                </div>
              )}

              <button
                onClick={() => setShowNextCard(!showNextCard)}
                className={`w-12 h-6 rounded-full transition ${showNextCard ? "bg-blue-500" : "bg-zinc-600"
                  }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transform transition ${showNextCard ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>

            <div>
              <div className="text-sm text-zinc-400 mb-2">學習模式</div>
              <div className="grid grid-cols-3 gap-2">
                {["英翻中", "中翻英", "雙向混合"].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      if (m === mode) return
                      if (cards.length > 0) {
                        setPendingMode(m as Mode)
                      } else {
                        setMode(m as Mode)
                      }
                    }}
                    className={`py-2 rounded-xl text-sm transition ${mode === m
                      ? "bg-blue-500 text-white"
                      : "bg-white/10 hover:bg-white/20"
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                學習中更改模式會重新開始目前進度
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full rounded-xl py-3 bg-gradient-to-r from-indigo-500 to-blue-500 font-medium hover:scale-[1.02] active:scale-[0.98] transition"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {showCardPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[90%] max-w-lg bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-4">卡片預覽</h2>

            <div className="max-h-[300px] overflow-y-auto text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2 text-zinc-400 px-2">
                <div>英文</div>
                <div>中文</div>
              </div>

              {cards.map((c, i) => (
                <div
                  key={`${c.en}-${i}`}
                  className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-2"
                >
                  <div>{c.en}</div>
                  <div className="text-zinc-400">{c.zh}</div>
                </div>
              ))}
            </div>

            {cardPreviewMode === "afterDetect" ? (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex-1 bg-red-500/80 rounded-xl py-3 hover:bg-red-500 transition"
                >
                  重新上傳
                </button>

                <button
                  onClick={() => {
                    setShowCardPreview(false)
                    setScreen("study")
                  }}
                  className="flex-1 bg-blue-500 rounded-xl py-3 font-bold hover:bg-blue-600 transition"
                >
                  開始學習
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowCardPreview(false)}
                  className="flex-1 bg-white/10 rounded-xl py-3 hover:bg-white/20 transition"
                >
                  關閉
                </button>

                <button
                  onClick={downloadCsv}
                  className="flex-1 bg-blue-500 rounded-xl py-3 font-bold hover:bg-blue-600 transition"
                >
                  下載 CSV
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {screen === "study" && showComplete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="w-[90%] max-w-sm rounded-3xl bg-zinc-900 border border-white/10 p-8 text-center shadow-2xl animate-complete-pop">
            <div className="text-5xl mb-4 animate-bounce">🎉</div>

            <h2 className="text-2xl font-bold mb-2">這次學習完成</h2>

            <p className="text-sm text-zinc-400 mb-6">
              所有卡片都至少進入「待複習」以上了
            </p>

            <div className="grid grid-cols-3 gap-2 mb-6 text-xs">
              <div className="rounded-xl bg-red-500/20 py-3">
                <div className="text-red-300">新卡片</div>
                <div className="text-xl font-bold">{newCount}</div>
              </div>

              <div className="rounded-xl bg-yellow-500/20 py-3">
                <div className="text-yellow-300">正在記</div>
                <div className="text-xl font-bold">{learningCount}</div>
              </div>

              <div className="rounded-xl bg-green-500/20 py-3">
                <div className="text-green-300">待複習</div>
                <div className="text-xl font-bold">{reviewCount}</div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={resetAllCards}
                className="w-full rounded-xl py-3 bg-white/10 hover:bg-white/20 transition"
              >
                全部重新開始
              </button>

              <button
                onClick={practiceNotMastered}
                className="w-full rounded-xl py-3 bg-gradient-to-r from-indigo-500 to-blue-500 font-medium hover:scale-[1.02] active:scale-[0.98] transition"
              >
                只練還沒很熟的卡片
              </button>

              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full rounded-xl py-3 bg-red-500/80 hover:bg-red-500 transition"
              >
                結束並重新上傳
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[90]">
          <div className="w-[90%] max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold mb-2">確定要重新上傳嗎？</h2>
            <p className="text-sm text-zinc-400 mb-5">
              目前的卡片與學習進度會被清除。
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl py-3 bg-white/10 hover:bg-white/20 transition"
              >
                取消
              </button>
              <button
                onClick={resetToUpload}
                className="flex-1 rounded-xl py-3 bg-red-500/80 hover:bg-red-500 transition"
              >
                確定重製
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMode && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[90]">
          <div className="w-[90%] max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold mb-2">確定要更改模式嗎？</h2>
            <p className="text-sm text-zinc-400 mb-5">
              更改成「{pendingMode}」後，目前學習進度會重新開始。
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setPendingMode(null)}
                className="flex-1 rounded-xl py-3 bg-white/10 hover:bg-white/20 transition"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setMode(pendingMode)
                  resetAllCards()
                  setPendingMode(null)
                }}
                className="flex-1 rounded-xl py-3 bg-blue-500 hover:bg-blue-600 transition"
              >
                確定更改
              </button>
            </div>
          </div>
        </div>
      )}

      {showImagePreview && image && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-white/10 p-4 rounded-2xl shadow-2xl">
            <img src={image} alt="上傳圖片預覽" className="max-w-[300px] rounded-xl" />
            <button
              onClick={() => setShowImagePreview(false)}
              className="mt-3 w-full rounded-xl bg-red-500 py-2 font-medium hover:bg-red-600 transition"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
import { useState } from 'react'
import { BookOpen, CheckCircle, XCircle, Trophy, RotateCcw } from 'lucide-react'

export default function QuizCard({ quizData }) {
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)

  if (!quizData) return null

  const { ai_summary, questions_json } = quizData
  let questions = []
  try {
    questions = typeof questions_json === 'string'
      ? JSON.parse(questions_json)
      : questions_json ?? []
  } catch {
    questions = []
  }

  const totalQ = questions.length
  const score = submitted
    ? questions.reduce((acc, q, i) => answers[i] === q.correct_answer ? acc + 1 : acc, 0)
    : 0

  const allAnswered = totalQ > 0 && Object.keys(answers).length === totalQ

  const reset = () => {
    setAnswers({})
    setSubmitted(false)
  }

  return (
    <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#D62839] to-[#B71C2B] px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
          <BookOpen size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">Ringkasan & Kuis AI</h3>
          <p className="text-white/70 text-xs">Dibuat otomatis dari video</p>
        </div>
        {quizData.is_fallback && (
          <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
            Dari deskripsi
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Summary */}
        <div>
          <h4 className="font-semibold text-[#1F2937] text-sm mb-2">📝 Ringkasan Materi</h4>
          <p className="text-[#6B7280] text-sm leading-relaxed bg-[#FAFAFA] rounded-xl p-3">
            {ai_summary || 'Ringkasan tidak tersedia.'}
          </p>
        </div>

        {/* Quiz */}
        {questions.length > 0 && (
          <div>
            <h4 className="font-semibold text-[#1F2937] text-sm mb-3">🧠 Soal Kuis ({totalQ} soal)</h4>
            <div className="space-y-4">
              {questions.map((q, qi) => (
                <div key={qi} className="border border-[#F1D4D6] rounded-xl p-4">
                  <p className="font-medium text-[#1F2937] text-sm mb-3">
                    {qi + 1}. {q.question}
                  </p>
                  <div className="space-y-2">
                    {(q.options ?? []).map((opt, oi) => {
                      const isSelected = answers[qi] === opt
                      const isCorrect = opt === q.correct_answer
                      let optStyle = 'border-[#F1D4D6] bg-white text-[#1F2937] hover:border-[#D62839]'
                      if (submitted) {
                        if (isCorrect) optStyle = 'border-[#059669] bg-[#D1FAE5] text-[#065F46]'
                        else if (isSelected && !isCorrect) optStyle = 'border-[#DC2626] bg-[#FEE2E2] text-[#991B1B]'
                        else optStyle = 'border-[#F1D4D6] bg-[#FAFAFA] text-[#6B7280]'
                      } else if (isSelected) {
                        optStyle = 'border-[#D62839] bg-[#FDEDEE] text-[#D62839]'
                      }

                      return (
                        <button
                          key={oi}
                          onClick={() => !submitted && setAnswers(a => ({ ...a, [qi]: opt }))}
                          disabled={submitted}
                          className={`w-full text-left border rounded-xl px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-all ${optStyle} ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <span>{opt}</span>
                          {submitted && isCorrect && <CheckCircle size={15} className="text-[#059669] flex-shrink-0" />}
                          {submitted && isSelected && !isCorrect && <XCircle size={15} className="text-[#DC2626] flex-shrink-0" />}
                        </button>
                      )
                    })}
                    {/* Penjelasan jawaban — tampil setelah submit */}
                    {submitted && q.explanation && (
                      <p className="text-[#6B7280] text-xs bg-[#FAFAFA] border border-[#F1D4D6] rounded-lg px-3 py-2 mt-1">
                        💡 {q.explanation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Score */}
            {submitted ? (
              <div className={`mt-4 rounded-xl p-4 flex items-center gap-3 ${score === totalQ ? 'bg-[#D1FAE5] border border-[#059669]' : 'bg-[#FDEDEE] border border-[#F1D4D6]'}`}>
                <Trophy size={22} className={score === totalQ ? 'text-[#059669]' : 'text-[#D62839]'} />
                <div>
                  <p className="font-bold text-[#1F2937] text-sm">
                    Skor kamu: {score}/{totalQ}
                  </p>
                  <p className="text-[#6B7280] text-xs">
                    {score === totalQ ? 'Sempurna! Kamu sangat paham materi ini 🎉' :
                     score >= totalQ / 2 ? 'Bagus! Coba pelajari lagi bagian yang keliru.' :
                     'Coba tonton ulang videonya ya! Semangat 💪'}
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="ml-auto text-[#6B7280] hover:text-[#D62839] transition-colors"
                  title="Ulangi kuis"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSubmitted(true)}
                disabled={!allAnswered}
                className="mt-4 w-full bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {allAnswered ? 'Lihat Skor' : `Jawab semua soal dulu (${Object.keys(answers).length}/${totalQ})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { sendAiChatMessage } from './aiChatApi'
import { getLanguage } from '../../shared/locale'

const copyByLanguage = {
  en: {
    subtitle: 'Local Ollama assistant',
    close: 'Close AI chat',
    open: 'Open AI chat',
    placeholder: 'Ask how to use Notcobase...',
    send: 'Send',
    thinking: 'Thinking...',
    unavailable: 'I could not reach the local AI service. Make sure `python ai/index.py` is running and Ollama has the selected model available.',
    welcome: 'Hi, I can help with Notcobase tables, users, permissions, pages, and the UI editor.',
  },
  vi: {
    subtitle: 'Trợ lý Ollama cục bộ',
    close: 'Đóng chat AI',
    open: 'Mở chat AI',
    placeholder: 'Hỏi cách sử dụng Notcobase...',
    send: 'Gửi',
    thinking: 'Đang suy nghĩ...',
    unavailable: 'Tôi không kết nối được dịch vụ AI cục bộ. Hãy kiểm tra `python ai/index.py` đang chạy và Ollama đã có model được chọn.',
    welcome: 'Xin chào, tôi có thể hỗ trợ về bảng, người dùng, quyền, trang và trình chỉnh sửa giao diện của Notcobase.',
  },
}

function getChatLanguage() {
  return getLanguage() === 'vi' ? 'vi' : 'en'
}

function getCopy(language) {
  return copyByLanguage[language] || copyByLanguage.en
}

function createWelcomeMessage(language) {
  return {
    role: 'assistant',
    content: getCopy(language).welcome,
    welcome: true,
  }
}

export default function AiChatBot() {
  const language = getChatLanguage()
  const copy = getCopy(language)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => [createWelcomeMessage(language)])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [messages, open])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || loading) return

    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setDraft('')
    setLoading(true)
    setError('')

    try {
      const response = await sendAiChatMessage(
        text,
        nextMessages.filter((message) => !message.welcome),
        language,
      )
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response.answer,
          sources: response.sources || [],
        },
      ])
    } catch (err) {
      setError(err.message)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: copy.unavailable,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={open ? 'ai-chat-widget open' : 'ai-chat-widget'}>
      {open && (
        <section className="ai-chat-panel" aria-label="AI support chat">
          <header className="ai-chat-header">
            <div>
              <strong>Notcobase AI</strong>
              <span>{copy.subtitle}</span>
            </div>
            <button type="button" className="secondary ai-chat-close" onClick={() => setOpen(false)} aria-label={copy.close}>
              x
            </button>
          </header>

          <div ref={scrollRef} className="ai-chat-messages">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`ai-chat-message ${message.role}`}>
                <p>{message.content}</p>
                {message.sources?.length > 0 && (
                  <div className="ai-chat-sources">
                    {message.sources.slice(0, 3).map((source, sourceIndex) => (
                      <span key={`${source.source}-${source.heading}-${sourceIndex}`}>
                        {source.heading}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {loading && (
              <article className="ai-chat-message assistant">
                <p>{copy.thinking}</p>
              </article>
            )}
          </div>

          {error && <div className="ai-chat-error">{error}</div>}

          <form className="ai-chat-form" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              rows="2"
              placeholder={copy.placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmit(event)
                }
              }}
            />
            <button type="submit" disabled={loading || !draft.trim()}>
              {copy.send}
            </button>
          </form>
        </section>
      )}

      <button type="button" className="ai-chat-launcher" onClick={() => setOpen((current) => !current)} aria-label={copy.open}>
        AI
      </button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { getAiSettings, sendAiChatMessage, updateAiSettings } from './aiChatApi'
import { getLanguage } from '../../shared/locale'


const copyByLanguage = {
  en: {
    subtitle: 'Local Ollama assistant',
    close: 'Close AI chat',
    open: 'Open AI chat',
    settings: 'Settings',
    saveSettings: 'Save settings',
    settingsSaved: 'AI settings saved.',
    provider: 'Provider',
    model: 'Model',
    providerUrl: 'Provider URL',
    apiKey: 'API key',
    apiKeyPlaceholder: 'Leave blank to keep saved key',
    savedApiKey: 'API key saved in backend',
    ollamaProvider: 'Ollama (local)',
    openAiCompatibleProvider: 'OpenAI-compatible API',
    geminiProvider: 'Gemini API',
    placeholder: 'Ask how to use Notcobase...',
    send: 'Send',
    thinking: 'Thinking...',
    unavailable: 'I could not reach the local AI service.',
    welcome: 'Hi, I can help with Notcobase tables, users, permissions, pages, and the UI editor.',
  },
  vi: {
    subtitle: 'Trợ lý Ollama cục bộ',
    close: 'Đóng chat AI',
    open: 'Mở chat AI',
    settings: 'Cài đặt',
    saveSettings: 'Lưu cài đặt',
    settingsSaved: 'Đã lưu cài đặt AI.',
    provider: 'Nhà cung cấp',
    model: 'Model',
    providerUrl: 'URL nhà cung cấp',
    apiKey: 'API key',
    apiKeyPlaceholder: 'Để trống để giữ key đã lưu',
    savedApiKey: 'API key đã lưu trong backend',
    ollamaProvider: 'Ollama (cục bộ)',
    openAiCompatibleProvider: 'API tương thích OpenAI',
    geminiProvider: 'Gemini API',
    placeholder: 'Hỏi cách sử dụng Notcobase...',
    send: 'Gửi',
    thinking: 'Đang suy nghĩ...',
    unavailable: 'Tôi không kết nối được dịch vụ AI cục bộ.',
    welcome: 'Xin chào, tôi có thể hỗ trợ về bảng, người dùng, quyền, trang và trình chỉnh sửa giao diện của Notcobase.',
  },
}

const defaultProviderConfig = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: '',
  hasApiKey: false,
}

const providerDefaults = {
  ollama: defaultProviderConfig,
  'openai-compatible': {
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    hasApiKey: false,
  },
  gemini: {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    hasApiKey: false,
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

export default function AiChatBot({ canConfigureAi = false }) {
  const language = getChatLanguage()
  const copy = getCopy(language)
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providerConfig, setProviderConfig] = useState(defaultProviderConfig)
  const [messages, setMessages] = useState(() => [createWelcomeMessage(language)])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [messages, open])

  useEffect(() => {
    if (!canConfigureAi) return undefined

    let cancelled = false
    getAiSettings()
      .then((settings) => {
        if (!cancelled) {
          setProviderConfig({ ...defaultProviderConfig, ...settings, apiKey: '' })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsMessage('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [canConfigureAi])

  useEffect(() => {
    if (!canConfigureAi && settingsOpen) {
      setSettingsOpen(false)
    }
  }, [canConfigureAi, settingsOpen])

  function patchProviderConfig(patch) {
    setProviderConfig((current) => {
      const next = { ...current, ...patch }
      if (patch.provider === 'ollama') {
        return { ...providerDefaults.ollama }
      }
      if (patch.provider === 'openai-compatible') {
        return { ...providerDefaults['openai-compatible'], apiKey: '', hasApiKey: current.hasApiKey || false }
      }
      if (patch.provider === 'gemini') {
        return { ...providerDefaults.gemini, apiKey: '', hasApiKey: current.hasApiKey || false }
      }
      return next
    })
  }

  async function handleSaveSettings() {
    setSettingsLoading(true)
    setError('')
    setSettingsMessage('')

    try {
      const payload = {
        provider: providerConfig.provider,
        model: providerConfig.model,
        baseUrl: providerConfig.baseUrl,
      }
      if (providerConfig.apiKey) {
        payload.apiKey = providerConfig.apiKey
      }
      const saved = await updateAiSettings(payload)
      setProviderConfig({ ...defaultProviderConfig, ...saved, apiKey: '' })
      setSettingsMessage(copy.settingsSaved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSettingsLoading(false)
    }
  }

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
              <span>{copy.subtitle} · {providerConfig.model}</span>
            </div>
            <div className="ai-chat-header-actions">
              {canConfigureAi && (
                <button type="button" className="secondary" onClick={() => setSettingsOpen((current) => !current)}>
                  {copy.settings}
                </button>
              )}
              <button type="button" className="secondary ai-chat-close" onClick={() => setOpen(false)} aria-label={copy.close}>
                x
              </button>
            </div>
          </header>

          {settingsOpen && (
            <section className="ai-chat-settings">
              <label>
                {copy.provider}
                <select value={providerConfig.provider} onChange={(event) => patchProviderConfig({ provider: event.target.value })}>
                  <option value="ollama">{copy.ollamaProvider}</option>
                  <option value="openai-compatible">{copy.openAiCompatibleProvider}</option>
                  <option value="gemini">{copy.geminiProvider}</option>
                </select>
              </label>
              <label>
                {copy.model}
                <input value={providerConfig.model} onChange={(event) => patchProviderConfig({ model: event.target.value })} />
              </label>
              <label>
                {copy.providerUrl}
                <input value={providerConfig.baseUrl} onChange={(event) => patchProviderConfig({ baseUrl: event.target.value })} />
              </label>
              {providerConfig.provider !== 'ollama' && (
                <label>
                  {copy.apiKey}
                  <input
                    type="password"
                    value={providerConfig.apiKey}
                    placeholder={copy.apiKeyPlaceholder}
                    onChange={(event) => patchProviderConfig({ apiKey: event.target.value })}
                  />
                  {providerConfig.hasApiKey && <span>{copy.savedApiKey}</span>}
                </label>
              )}
              <button type="button" className="secondary" disabled={settingsLoading} onClick={handleSaveSettings}>
                {copy.saveSettings}
              </button>
              {settingsMessage && <span>{settingsMessage}</span>}
            </section>
          )}

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

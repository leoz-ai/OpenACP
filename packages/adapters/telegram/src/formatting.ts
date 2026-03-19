export function escapeHtml(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function markdownToTelegramHtml(md: string): string {
  // Step 1: Extract code blocks and inline code into placeholders
  const codeBlocks: string[] = []
  const inlineCodes: string[] = []

  // Extract fenced code blocks (```lang\n...\n```)
  let text = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const index = codeBlocks.length
    const escapedCode = escapeHtml(code)
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    codeBlocks.push(`<pre><code${langAttr}>${escapedCode}</code></pre>`)
    return `\x00CODE_BLOCK_${index}\x00`
  })

  // Extract inline code (`...`)
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    const index = inlineCodes.length
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`)
    return `\x00INLINE_CODE_${index}\x00`
  })

  // Step 2: Escape HTML in remaining text
  text = escapeHtml(text)

  // Step 3: Apply markdown transformations
  // Bold: **text** → <b>text</b>
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // Italic: *text* → <i>text</i> (but not the ** used for bold)
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')

  // Links: [text](url) → <a href="url">text</a>
  // Note: after escapeHtml, parentheses are not affected, but we need to handle
  // the escaped brackets properly. Since [ ] and ( ) are not escaped, this works directly.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Step 4: Restore fenced code blocks
  text = text.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_match, idx: string) => {
    return codeBlocks[parseInt(idx, 10)]
  })

  // Step 5: Restore inline code
  text = text.replace(/\x00INLINE_CODE_(\d+)\x00/g, (_match, idx: string) => {
    return inlineCodes[parseInt(idx, 10)]
  })

  return text
}

export function formatToolCall(tool: { id: string; name?: string; kind?: string; status?: string }): string {
  const statusIcon: Record<string, string> = {
    pending: '⏳',
    in_progress: '⏳',
    completed: '✅',
    failed: '❌',
  }
  const kindIcon: Record<string, string> = {
    read: '📄', edit: '✏️', delete: '🗑️', execute: '⚡',
    search: '🔍', fetch: '🌐', think: '💭',
  }
  const si = statusIcon[tool.status || ''] || '🔧'
  const ki = kindIcon[tool.kind || ''] || '🔧'
  return `${ki} ${si} <b>${escapeHtml(tool.name || 'Tool')}</b>`
}

export function formatToolUpdate(update: { id: string; status: string; content?: unknown }): string {
  const statusIcon: Record<string, string> = {
    pending: '⏳',
    in_progress: '⏳',
    completed: '✅',
    failed: '❌',
  }
  const si = statusIcon[update.status] || '🔧'
  let text = `${si} <b>Tool ${update.status}</b>`
  if (update.content) {
    const contentStr = typeof update.content === 'string' ? update.content : JSON.stringify(update.content)
    text += `\n<pre>${escapeHtml(contentStr)}</pre>`
  }
  return text
}

export function formatPlan(plan: { entries: Array<{ content: string; status: string }> }): string {
  const statusIcon: Record<string, string> = { pending: '⬜', in_progress: '🔄', completed: '✅' }
  const lines = plan.entries.map((e, i) =>
    `${statusIcon[e.status] || '⬜'} ${i + 1}. ${escapeHtml(e.content)}`
  )
  return `<b>Plan:</b>\n${lines.join('\n')}`
}

export function formatUsage(usage: { tokensUsed?: number; contextSize?: number; cost?: { amount: number; currency: string } }): string {
  const parts: string[] = []
  if (usage.tokensUsed != null) parts.push(`Tokens: ${usage.tokensUsed.toLocaleString()}`)
  if (usage.contextSize != null) parts.push(`Context: ${usage.contextSize.toLocaleString()}`)
  if (usage.cost) parts.push(`Cost: $${usage.cost.amount.toFixed(4)}`)
  return `📊 ${parts.join(' | ')}`
}

export function splitMessage(text: string, maxLength = 4096): string[] {
  if (text.length <= maxLength) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }
    let splitAt = remaining.lastIndexOf('\n\n', maxLength)
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf('\n', maxLength)
    }
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = maxLength
    }
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  return chunks
}

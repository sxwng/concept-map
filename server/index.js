import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = process.env.PORT || 8787
const root = path.dirname(fileURLToPath(import.meta.url))
app.use(express.json())
app.post('/api/generate-definition', async (request, response) => {
  const { title, kind } = request.body ?? {}
  if (!title) return response.status(400).json({ error: 'A title is required.' })
  if (!process.env.ANTHROPIC_API_KEY) return response.status(503).json({ error: 'Add ANTHROPIC_API_KEY to enable Claude generation.' })
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 400, messages: [{ role: 'user', content: `Write a concise, accurate ${kind === 'concept' ? 'definition' : 'explanation'} of “${title}” for a concept map. Use 2-3 complete sentences, no preamble, so that it is understandable to a university-level student studying that subject.` }] })
    const definition = message.content.find((block) => block.type === 'text')?.text
    return response.json({ definition: definition || 'Claude returned no text.' })
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Claude request failed.' })
  }
})
app.post('/api/generate-summary', async (request, response) => {
  const { title, kind, longDefinition } = request.body ?? {}
  if (!title || !longDefinition) return response.status(400).json({ error: 'A title and longDefinition are required.' })
  if (!process.env.ANTHROPIC_API_KEY) return response.status(503).json({ error: 'Add ANTHROPIC_API_KEY to enable Claude generation.' })
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: `Summarize this ${kind === 'concept' ? 'concept' : 'detail'} definition of “${title}” as a single concise sentence (under 20 words) for a concept map card. No preamble, no quotes. Explain the concept so that it is understandable to a university-level student studying that subject.\n\n${longDefinition}` }] })
    const summary = message.content.find((block) => block.type === 'text')?.text
    return response.json({ summary: summary || 'Claude returned no text.' })
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Claude request failed.' })
  }
})
app.listen(port, () => console.log(`Claude endpoint listening on http://localhost:${port}`))

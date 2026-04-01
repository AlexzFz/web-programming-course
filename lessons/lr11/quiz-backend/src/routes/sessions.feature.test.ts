import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { describe, expect, it } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { sessions } from './sessions.js'

// Чекпоинт 2 и 3: feature-тесты flow сессий и проверки владельца.
const app = new Hono()
app.route('/api/sessions', sessions)

async function createAuthHeader(userId: string): Promise<string> {
  const secret = process.env.JWT_SECRET as string
  const token = await sign({ userId, email: `${userId}@example.com` }, secret)
  return `Bearer ${token}`
}

describe('feature-тесты роутов sessions', () => {
  it('возвращает 401 при создании сессии без токена', async () => {
    const res = await app.request('/api/sessions', { method: 'POST' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('возвращает 400 для невалидного payload в answers', async () => {
    const authorization = await createAuthHeader('user-1')
    const res = await app.request('/api/sessions/session-1/answers', {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const payload = await res.json()
    expect(payload.error).toBe('Validation failed')
  })

  it('возвращает 403, когда пользователь отвечает в чужую сессию', async () => {
    await prisma.user.create({
      data: {
        githubId: 'gh-owner-user',
        email: 'owner-user@example.com',
        name: 'Owner User',
        id: 'owner-user',
      },
    })
    await prisma.user.create({
      data: {
        githubId: 'gh-attacker-user',
        email: 'attacker-user@example.com',
        name: 'Attacker User',
        id: 'attacker-user',
      },
    })

    const ownerAuth = await createAuthHeader('owner-user')
    const attackerAuth = await createAuthHeader('attacker-user')

    const createRes = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        Authorization: ownerAuth,
      },
    })
    expect(createRes.status).toBe(200)
    const created = (await createRes.json()) as { session: { id: string } }

    const answerRes = await app.request(`/api/sessions/${created.session.id}/answers`, {
      method: 'POST',
      headers: {
        Authorization: attackerAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionId: 'question-any',
        userAnswer: 'A',
      }),
    })

    expect(answerRes.status).toBe(403)
    await expect(answerRes.json()).resolves.toEqual({ error: 'zapret' })
  })
})
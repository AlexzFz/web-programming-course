import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { describe, expect, it } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { admin } from './admin.js'

// Чекпоинт 2 и 3: feature-тесты ролевого доступа.
const app = new Hono()
app.route('/api/admin', admin)

async function createAuthHeader(userId: string): Promise<string> {
  const secret = process.env.JWT_SECRET as string
  const token = await sign({ userId, email: `${userId}@example.com` }, secret)
  return `Bearer ${token}`
}

describe('feature-тесты роутов admin', () => {
  it('возвращает 401 без заголовка Authorization', async () => {
    const res = await app.request('/api/admin/questions')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('возвращает 401 для невалидного токена', async () => {
    const res = await app.request('/api/admin/questions', {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid token' })
  })

  it('возвращает 403 для роли student на admin endpoint', async () => {
    await prisma.user.create({
      data: {
        id: 'student-user',
        githubId: 'gh-student-user',
        email: 'student-user@example.com',
        name: 'Student User',
        role: 'student',
      },
    })

    const authorization = await createAuthHeader('student-user')
    const res = await app.request('/api/admin/questions', {
      headers: {
        Authorization: authorization,
      },
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' })
  })
})

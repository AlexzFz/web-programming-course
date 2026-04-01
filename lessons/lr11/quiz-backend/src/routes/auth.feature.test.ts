import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { auth } from './auth.js'

// Чекпоинт 2 и 3: feature-тесты auth flow и 401-кейсов.
const app = new Hono()
app.route('/api/auth', auth)

describe('feature-тесты роутов auth', () => {
  it('возвращает 401 без заголовка Authorization', async () => {
    const res = await app.request('/api/auth/me')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('возвращает 401 для невалидного bearer-токена', async () => {
    const res = await app.request('/api/auth/me', {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid token' })
  })
})
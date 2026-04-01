import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { prisma } from '../lib/prisma.js'

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required in .env')
  }
  return jwtSecret
}

const JWT_SECRET = getJwtSecret()

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const authorizationHeader = c.req.header('Authorization')
  if (!authorizationHeader) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256')
    if (typeof payload.userId !== 'string') {
      return c.json({ error: 'Invalid token' }, 401)
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    if (user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    c.set('adminUserId', user.id)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

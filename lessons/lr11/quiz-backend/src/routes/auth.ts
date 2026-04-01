import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { prisma } from '../lib/prisma.js'
import { getGitHubUserByCode, GitHubServiceError } from '../services/github.js'
import { githubCallbackSchema } from '../utils/validation.js'
const auth = new Hono()

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required in .env')
  }
  return jwtSecret
}
const JWT_SECRET = getJwtSecret()

type AuthTokenPayload = {
  userId: string
  email: string
}

class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

async function verifyBearerToken(
  authorizationHeader: string | undefined
): Promise<AuthTokenPayload> {
  if (!authorizationHeader) {
    throw new AuthError('Unauthorized')
  }

  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    throw new AuthError('Unauthorized')
  }

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256')

    if (
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      throw new AuthError('Invalid token')
    }

    return {
      userId: payload.userId,
      email: payload.email,
    }
  } catch {
    throw new AuthError('Invalid token')
  }
}

auth.post('/github/callback', async (c) => {
  const body = await c.req.json()
  const parsed = githubCallbackSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request: code is required' }, 400)
  }

  const { code } = parsed.data

  try {
    const githubUser = await getGitHubUserByCode(code)

    const user = await prisma.user.upsert({
      where: { githubId: String(githubUser.id) },
      update: {
        email: githubUser.email || '',
        name: githubUser.name || '',
      },
      create: {
        githubId: String(githubUser.id),
        email: githubUser.email || `${githubUser.id}@github.com`,
        name: githubUser.name || 'GitHub User',
      },
    })

    const token = await sign(
      { userId: user.id, email: user.email },
      JWT_SECRET
    )

    return c.json({ token, user })
  } catch (error) {
    if (error instanceof GitHubServiceError) {
      return c.json({ error: error.message }, error.statusCode as 400 | 500)
    }
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

auth.get('/me', async (c) => {
  try {
    const authorizationHeader = c.req.header('Authorization')
    const payload = await verifyBearerToken(authorizationHeader)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        githubId: true,
        createdAt: true,
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({
      user,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ error: error.message }, 401)
    }
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

export { auth }

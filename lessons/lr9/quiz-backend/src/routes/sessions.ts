import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { prisma } from '../lib/prisma.js'
import { sessionService } from '../services/sessionService.js'
import { answerSchema, sessionSubmitSchema } from '../utils/validation.js'
const sessions = new Hono()

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required in .env')
  }
  return jwtSecret
}

const JWT_SECRET = getJwtSecret()

async function getUserIdFromToken(
  authorizationHeader: string | undefined
): Promise<string> {
  if (!authorizationHeader) {
    throw new Error('Unauthorized')
  }

  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Unauthorized')
  }

  const payload = await verify(token, JWT_SECRET, 'HS256')
  if (typeof payload.userId !== 'string') {
    throw new Error('Invalid token')
  }

  return payload.userId
}

sessions.post('/', async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header('Authorization'))

    const questionsCount = await prisma.question.count()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    const session = await prisma.session.create({
      data: {
        userId,
        expiresAt,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        score: true,
        startedAt: true,
        expiresAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return c.json({
      session,
      questionsCount,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Invalid token') {
        return c.json({ error: error.message }, 401)
      }
    }
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

sessions.post('/:id/answers', async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header('Authorization'))

    const sessionId = c.req.param('id')
    const body = await c.req.json()
    const parsed = answerSchema.safeParse({ ...body, sessionId })

    if (!parsed.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        400
      )
    }

    const { questionId, userAnswer } = parsed.data
    const answer = await sessionService.submitAnswer(
      sessionId,
      questionId,
      userAnswer,
      userId
    )
    return c.json({ answer })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Invalid token') {
        return c.json({ error: error.message }, 401)
      }

      if (error.message === 'Session not found' || error.message === 'Question not found') {
        return c.json({ error: error.message }, 404)
      }

      if (error.message === 'zapret') {
        return c.json({ error: error.message }, 403)
      }

      if (
        error.message === 'Session expired' ||
        error.message === 'Session is not active'
      ) {
        return c.json({ error: error.message }, 400)
      }
    }

    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

sessions.get('/:id', async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header('Authorization'))
    const sessionId = c.req.param('id')

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        answers: {
          include: {
            question: {
              select: {
                id: true,
                text: true,
                type: true,
                points: true,
                categoryId: true,
              },
            },
          },
        },
      },
    })

    if (!session) {
      return c.json({ error: 'Session not found' }, 404)
    }

    if (session.userId !== userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return c.json({ session })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Invalid token') {
        return c.json({ error: error.message }, 401)
      }
    }
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

sessions.post('/:id/submit', async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header('Authorization'))
    const sessionId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const parsed = sessionSubmitSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        400
      )
    }

    const sessionOwner = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })

    if (!sessionOwner) {
      return c.json({ error: 'Session not found' }, 404)
    }

    if (sessionOwner.userId !== userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const session = await sessionService.submitSession(sessionId)
    return c.json({ session })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Invalid token') {
        return c.json({ error: error.message }, 401)
      }

      if (
        error.message === 'Session expired' ||
        error.message === 'Session is not active'
      ) {
        return c.json({ error: error.message }, 400)
      }

      if (error.message === 'Session not found') {
        return c.json({ error: error.message }, 404)
      }
    }

    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

export { sessions }

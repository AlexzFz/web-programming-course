import { Hono } from 'hono'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/admin.js'
import { gradeSchema, questionSchema, questionUpdateSchema } from '../utils/validation.js'
const admin = new Hono()

admin.use('*', requireAdmin)

function parsePagination(pageRaw: string | undefined, limitRaw: string | undefined) {
  const page = Math.max(1, Number(pageRaw) || 1)
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 20))
  return { page, limit, skip: (page - 1) * limit, take: limit }
}

admin.get('/questions', async (c) => {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        text: true,
        type: true,
        categoryId: true,
        points: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            answers: true,
          },
        },
      },
    })

    return c.json({ questions })
  } catch {
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

admin.post('/questions', async (c) => {
  try {
    const body = await c.req.json()
    const parsed = questionSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        400
      )
    }

    const question = await prisma.question.create({
      // zod parses JSON as unknown, Prisma expects InputJsonValue.
      // Safe cast here because schema restricts to JSON-compatible values.
      data: {
        ...parsed.data,
        correctAnswer: parsed.data.correctAnswer as
          | Prisma.InputJsonValue
          | Prisma.NullableJsonNullValueInput
          | undefined,
      },
    })

    return c.json({ question }, 201)
  } catch {
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

admin.put('/questions/:id', async (c) => {
  try {
    const questionId = c.req.param('id')
    const body = await c.req.json()
    const parsed = questionUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        400
      )
    }

    const existingQuestion = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    })

    if (!existingQuestion) {
      return c.json({ error: 'Question not found' }, 404)
    }

    const question = await prisma.question.update({
      where: { id: questionId },
      data: {
        ...parsed.data,
        correctAnswer: parsed.data.correctAnswer as
          | Prisma.InputJsonValue
          | Prisma.NullableJsonNullValueInput
          | undefined,
      },
    })

    return c.json({ question })
  } catch {
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

admin.get('/answers/pending', async (c) => {
  try {
    const { page, limit, skip, take } = parsePagination(
      c.req.query('page'),
      c.req.query('limit')
    )

    const where = {
      score: null,
      question: {
        type: 'essay',
      },
    }

    const total = await prisma.answer.count({ where })

    const pendingAnswers = await prisma.answer.findMany({
      where,
      select: {
        id: true,
        sessionId: true,
        questionId: true,
        userAnswer: true,
        score: true,
        createdAt: true,
        updatedAt: true,
        question: {
          select: {
            id: true,
            text: true,
            type: true,
            points: true,
          },
        },
        session: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            expiresAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    })

    return c.json({
      answers: pendingAnswers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch {
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

admin.post('/answers/:id/grade', async (c) => {
  try {
    const answerId = c.req.param('id')
    const body = await c.req.json()
    const parsed = gradeSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        400
      )
    }

    const gradedAnswer = await prisma.$transaction(async (tx) => {
      const answer = await tx.answer.findUnique({
        where: { id: answerId },
        select: {
          id: true,
          sessionId: true,
          question: {
            select: {
              type: true,
            },
          },
        },
      })

      if (!answer) {
        throw new Error('Answer not found')
      }

      if (answer.question.type !== 'essay') {
        throw new Error('Only essay answers can be graded manually')
      }

      const updatedAnswer = await tx.answer.update({
        where: { id: answerId },
        data: {
          score: parsed.data.score,
          isCorrect: parsed.data.score > 0,
        },
      })

      const pendingAnswersCount = await tx.answer.count({
        where: {
          sessionId: answer.sessionId,
          score: null,
        },
      })

      if (pendingAnswersCount === 0) {
        const scoredAnswers = await tx.answer.findMany({
          where: { sessionId: answer.sessionId },
          select: { score: true },
        })

        const totalScore = scoredAnswers.reduce((sum, item) => sum + (item.score ?? 0), 0)

        await tx.session.update({
          where: { id: answer.sessionId },
          data: {
            score: totalScore,
          },
        })
      }

      return updatedAnswer
    })

    return c.json({ answer: gradedAnswer })
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Answer not found'
      ) {
        return c.json({ error: error.message }, 404)
      }
      if (error.message === 'Only essay answers can be graded manually') {
        return c.json({ error: error.message }, 400)
      }
    }
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

admin.get('/students/:userId/stats', async (c) => {
  try {
    const userId = c.req.param('userId')

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const sessionsCount = await prisma.session.count({
      where: { userId },
    })

    const completedStats = await prisma.session.aggregate({
      where: {
        userId,
        status: 'completed',
        score: { not: null },
      },
      _avg: {
        score: true,
      },
    })

    return c.json({
      student: user,
      stats: {
        sessionsCount,
        averageScore: completedStats._avg.score ?? 0,
      },
    })
  } catch {
    return c.json({ error: 'Internal server error' }, 500 as const)
  }
})

export { admin }

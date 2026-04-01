import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { scoringService } from './scoringService.js'

type AnswerValue = string | number

class SessionService {
  async submitAnswer(
    sessionId: string,
    questionId: string,
    userAnswer: unknown,
    userId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, expiresAt: true, userId: true },
      })

      if (!session) {
        throw new Error('Session not found')
      }

      if (session.userId !== userId) {
        throw new Error('zapret')
      }

      if (session.status !== 'in_progress') {
        throw new Error('Session is not active')
      }

      if (session.expiresAt < new Date()) {
        await tx.session.update({
          where: { id: sessionId },
          data: { status: 'expired' },
        })
        throw new Error('Session expired')
      }

      const question = await tx.question.findUnique({
        where: { id: questionId },
        select: { id: true, type: true, correctAnswer: true, points: true },
      })

      if (!question) {
        throw new Error('Question not found')
      }

      const studentAnswers = this.toAnswerArray(userAnswer)
      const correctAnswers = this.toAnswerArray(question.correctAnswer)
      const normalizedUserAnswer = this.toJsonInput(userAnswer)

      let score: number | null = null
      let isCorrect: boolean | null = null

      if (question.type === 'multiple-select') {
        const rawScore = scoringService.scoreMultipleSelect(correctAnswers, studentAnswers)
        score = Math.min(rawScore, question.points)
        isCorrect = this.areSameAnswerSets(correctAnswers, studentAnswers)
      } else if (question.type === 'single-select') {
        const [expected] = correctAnswers
        const [actual] = studentAnswers
        isCorrect = expected !== undefined && actual === expected
        score = isCorrect ? question.points : 0
      } else if (question.type === 'essay') {
        score = null
        isCorrect = null
      }

      return tx.answer.upsert({
        where: {
          sessionId_questionId: { sessionId, questionId },
        },
        update: {
          userAnswer: normalizedUserAnswer,
          score,
          isCorrect,
        },
        create: {
          sessionId,
          questionId,
          userAnswer: normalizedUserAnswer,
          score,
          isCorrect,
        },
      })
    })
  }

  async submitSession(sessionId: string) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: { answers: true },
      })

      if (!session) {
        throw new Error('Session not found')
      }

      if (session.status !== 'in_progress') {
        throw new Error('Session is not active')
      }

      if (session.expiresAt < new Date()) {
        return tx.session.update({
          where: { id: sessionId },
          data: { status: 'expired' },
        })
      }

      const totalScore = session.answers.reduce((sum, answer) => {
        return sum + (answer.score ?? 0)
      }, 0)

      return tx.session.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          score: totalScore,
          completedAt: new Date(),
        },
        include: { answers: true },
      })
    })
  }

  private toAnswerArray(value: unknown): AnswerValue[] {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is AnswerValue =>
          typeof item === 'string' || typeof item === 'number'
      )
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return [value]
    }

    if (value && typeof value === 'object') {
      const maybeAnswers = (value as { answers?: unknown }).answers
      if (Array.isArray(maybeAnswers)) {
        return maybeAnswers.filter(
          (item): item is AnswerValue =>
            typeof item === 'string' || typeof item === 'number'
        )
      }
    }

    return []
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) {
      return {}
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value
    }

    if (Array.isArray(value)) {
      return value as Prisma.InputJsonValue
    }

    if (typeof value === 'object') {
      return value as Prisma.InputJsonValue
    }

    return String(value)
  }

  private areSameAnswerSets(a: AnswerValue[], b: AnswerValue[]): boolean {
    const setA = new Set(a)
    const setB = new Set(b)
    if (setA.size !== setB.size) {
      return false
    }
    for (const value of setA) {
      if (!setB.has(value)) {
        return false
      }
    }
    return true
  }
}

export const sessionService = new SessionService()

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Чекпоинт 1: unit-тесты сервиса с мокнутой Prisma.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $transaction: vi.fn() },
}))

vi.mock('../lib/prisma.js', () => ({
  prisma: prismaMock,
}))

import { sessionService } from './sessionService.js'

type TxMock = {
  session: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  question: {
    findUnique: ReturnType<typeof vi.fn>
  }
  answer: {
    upsert: ReturnType<typeof vi.fn>
  }
}

const createTxMock = (): TxMock => ({
  session: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  question: {
    findUnique: vi.fn(),
  },
  answer: {
    upsert: vi.fn(),
  },
})

describe('SessionService.submitAnswer', () => {
  let txMock: TxMock

  beforeEach(() => {
    txMock = createTxMock()
    prismaMock.$transaction.mockReset()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(txMock)
    )
  })

  it('бросает ошибку, если сессия не найдена', async () => {
    txMock.session.findUnique.mockResolvedValue(null)

    await expect(
      sessionService.submitAnswer('session-1', 'question-1', 'A', 'user-1')
    ).rejects.toThrow('Session not found')
  })

  it('бросает ошибку, если сессия принадлежит другому пользователю', async () => {
    txMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'owner-user',
    })

    await expect(
      sessionService.submitAnswer('session-1', 'question-1', 'A', 'other-user')
    ).rejects.toThrow('zapret')
  })

  it('сохраняет полный балл за правильный single-select ответ', async () => {
    txMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'user-1',
    })
    txMock.question.findUnique.mockResolvedValue({
      id: 'question-1',
      type: 'single-select',
      correctAnswer: 'A',
      points: 2,
    })
    txMock.answer.upsert.mockResolvedValue({ id: 'answer-1' })

    await sessionService.submitAnswer('session-1', 'question-1', 'A', 'user-1')

    expect(txMock.answer.upsert).toHaveBeenCalledTimes(1)
    const payload = txMock.answer.upsert.mock.calls[0][0]
    expect(payload.update.score).toBe(2)
    expect(payload.update.isCorrect).toBe(true)
  })

  it('сохраняет null score для essay-ответа', async () => {
    txMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'user-1',
    })
    txMock.question.findUnique.mockResolvedValue({
      id: 'question-1',
      type: 'essay',
      correctAnswer: null,
      points: 5,
    })
    txMock.answer.upsert.mockResolvedValue({ id: 'answer-2' })

    await sessionService.submitAnswer(
      'session-1',
      'question-1',
      'Long essay text',
      'user-1'
    )

    const payload = txMock.answer.upsert.mock.calls[0][0]
    expect(payload.update.score).toBeNull()
    expect(payload.update.isCorrect).toBeNull()
  })
})
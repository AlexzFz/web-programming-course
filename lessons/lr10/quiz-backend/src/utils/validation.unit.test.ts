import { describe, it, expect } from 'vitest'
import {
  answerSchema,
  githubCallbackSchema,
  gradeSchema,
  questionSchema,
  questionUpdateSchema,
  sessionSubmitSchema,
} from './validation.js'

// Чекпоинт 1 и 3: unit и негативные тесты Zod-схем.
describe('валидационные схемы', () => {
  describe('answerSchema', () => {
    it('принимает валидный payload', () => {
      const parsed = answerSchema.safeParse({
        sessionId: 'session-1',
        questionId: 'question-1',
        userAnswer: { answers: ['A'] },
      })
      expect(parsed.success).toBe(true)
    })

    it('отклоняет пустой sessionId', () => {
      const parsed = answerSchema.safeParse({
        sessionId: '',
        questionId: 'question-1',
        userAnswer: 'A',
      })
      expect(parsed.success).toBe(false)
    })

    it('отклоняет payload без questionId', () => {
      const parsed = answerSchema.safeParse({
        sessionId: 'session-1',
        userAnswer: 'A',
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('gradeSchema', () => {
    it('принимает валидный grade payload', () => {
      const parsed = gradeSchema.safeParse({
        score: 5,
        feedback: 'Well done',
      })
      expect(parsed.success).toBe(true)
    })

    it('отклоняет отрицательный score', () => {
      const parsed = gradeSchema.safeParse({
        score: -1,
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('questionSchema', () => {
    it('принимает валидный тип вопроса', () => {
      const parsed = questionSchema.safeParse({
        text: 'Question text',
        type: 'single-select',
        categoryId: 'cat-1',
      })
      expect(parsed.success).toBe(true)
    })

    it('отклоняет невалидный тип вопроса', () => {
      const parsed = questionSchema.safeParse({
        text: 'Question text',
        type: 'free-form',
        categoryId: 'cat-1',
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('sessionSubmitSchema', () => {
    it('принимает пустой объект', () => {
      const parsed = sessionSubmitSchema.safeParse({})
      expect(parsed.success).toBe(true)
    })
  })

  describe('githubCallbackSchema', () => {
    it('отклоняет пустой code', () => {
      const parsed = githubCallbackSchema.safeParse({ code: '' })
      expect(parsed.success).toBe(false)
    })
  })

  describe('questionUpdateSchema', () => {
    it('отклоняет невалидный payload обновления', () => {
      const parsed = questionUpdateSchema.safeParse({ points: 0 })
      expect(parsed.success).toBe(false)
    })
  })
})
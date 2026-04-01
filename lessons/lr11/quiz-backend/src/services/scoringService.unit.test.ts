import { describe, expect, it } from 'vitest'
import { scoringService } from './scoringService.js'

// Чекпоинт 1: unit-тесты бизнес-логики подсчета баллов.
describe('ScoringService', () => {
  describe('scoreMultipleSelect', () => {
    it('возвращает полный балл, если выбраны только правильные ответы', () => {
      const score = scoringService.scoreMultipleSelect(['A', 'C', 'D'], ['A', 'C'])
      expect(score).toBe(2)
    })

    it('снимает баллы за неправильные ответы', () => {
      const score = scoringService.scoreMultipleSelect(['A', 'C', 'D'], ['A', 'B', 'C'])
      expect(score).toBe(1.5)
    })

    it('никогда не возвращает отрицательный балл', () => {
      const score = scoringService.scoreMultipleSelect(['A', 'C', 'D'], ['B', 'E'])
      expect(score).toBe(0)
    })

    it('возвращает 0, если студент не отправил ответы', () => {
      const score = scoringService.scoreMultipleSelect(['A', 'C'], [])
      expect(score).toBe(0)
    })

    it('игнорирует дубли ответов студента из-за дедупликации Set', () => {
      const score = scoringService.scoreMultipleSelect(['A', 'C'], ['A', 'A', 'B'])
      expect(score).toBe(0.5)
    })
  })

  describe('scoreEssay', () => {
    it('суммирует оценки по критериям рубрики', () => {
      const score = scoringService.scoreEssay(
        [2, 1, 2],
        { maxPoints: [3, 2, 2] }
      )
      expect(score).toBe(5)
    })

    it('возвращает 0, когда все оценки равны нулю', () => {
      const score = scoringService.scoreEssay(
        [0, 0, 0],
        { maxPoints: [3, 2, 2] }
      )
      expect(score).toBe(0)
    })

    it('возвращает максимум, когда оценки равны максимумам рубрики', () => {
      const score = scoringService.scoreEssay(
        [3, 2, 2, 3],
        { maxPoints: [3, 2, 2, 3] }
      )
      expect(score).toBe(10)
    })

    it('обрезает оценки, которые превышают максимум рубрики', () => {
      const score = scoringService.scoreEssay(
        [5, 3],
        { maxPoints: [3, 2] }
      )
      expect(score).toBe(5)
    })

    it('бросает ошибку, если количество оценок не совпадает с критериями', () => {
      expect(() =>
        scoringService.scoreEssay([2, 1], { maxPoints: [3, 2, 2] })
      ).toThrow('Количество оценок должно совпадать с количеством критериев в рубрике')
    })
  })
})

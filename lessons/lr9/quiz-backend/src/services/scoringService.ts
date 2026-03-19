type AnswerValue = string | number

type EssayRubric = {
  maxPoints: number[]
}

class ScoringService {
  scoreMultipleSelect(
    correctAnswers: AnswerValue[],
    studentAnswers: AnswerValue[]
  ): number {
    const correctSet = new Set(correctAnswers)
    const studentSet = new Set(studentAnswers)

    let score = 0
    for (const answer of studentSet) {
      score += correctSet.has(answer) ? 1 : -0.5
    }

    return Math.max(0, score)
  }

  scoreEssay(grades: number[], rubric: EssayRubric): number {
    if (grades.length !== rubric.maxPoints.length) {
      throw new Error('Количество оценок должно совпадать с количеством критериев в рубрике')
    }

    const total = grades.reduce((sum, grade, index) => {
      const maxPoints = rubric.maxPoints[index]
      const normalizedGrade = Math.min(Math.max(grade, 0), maxPoints)
      return sum + normalizedGrade
    }, 0)

    return total
  }
}

export const scoringService = new ScoringService()

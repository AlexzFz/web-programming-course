import { z } from 'zod'

export const githubCallbackSchema = z.object({
  code: z.string().min(1),
})

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

export const answerSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  userAnswer: jsonValueSchema,
})

export const sessionSubmitSchema = z.object({})

export const gradeSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().max(2000).optional(),
})

export const questionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['single-select', 'multiple-select', 'essay']),
  categoryId: z.string().min(1),
  correctAnswer: jsonValueSchema.optional(),
  points: z.number().int().positive().default(1),
})

export const questionUpdateSchema = questionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {
    message: 'At least one field is required for update',
  }
)
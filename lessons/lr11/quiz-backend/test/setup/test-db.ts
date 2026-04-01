import { execSync } from 'node:child_process'
import { beforeAll, afterEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'

// Чекпоинт 0: подготовка и очистка тестовой БД.
beforeAll(() => {
  execSync('npx prisma db push', { stdio: 'ignore' })
})

afterEach(async () => {
  await prisma.answer.deleteMany()
  await prisma.session.deleteMany()
  await prisma.question.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
})

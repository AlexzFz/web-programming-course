// Чекпоинт 0: тестовые переменные окружения приложения.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret'
}

if (!process.env.GITHUB_CLIENT_ID) {
  process.env.GITHUB_CLIENT_ID = 'test-client-id'
}

if (!process.env.GITHUB_CLIENT_SECRET) {
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
}

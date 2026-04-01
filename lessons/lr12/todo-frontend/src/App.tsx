import { FormEvent, useCallback, useEffect, useState } from 'react';

type ServerTodo = {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

type QueueAction =
  | { id: string; type: 'create'; payload: { title: string }; ts: number }
  | { id: string; type: 'toggle'; payload: { todoId: number; done: boolean }; ts: number }
  | { id: string; type: 'delete'; payload: { todoId: number }; ts: number };

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const QUEUE_STORAGE_KEY = 'todo-pwa-queue-v1';

function toLocalText(value: string) {
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ru-RU');
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function apiFetchTodos(): Promise<ServerTodo[]> {
  const response = await fetch(`${API_BASE_URL}/api/todos`);
  const data = await parseJson<{ items: ServerTodo[] }>(response);
  return data.items;
}

async function apiCreate(title: string): Promise<ServerTodo> {
  const response = await fetch(`${API_BASE_URL}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  return parseJson<ServerTodo>(response);
}

async function apiToggle(todoId: number, done: boolean): Promise<ServerTodo> {
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done }),
  });

  return parseJson<ServerTodo>(response);
}

async function apiDelete(todoId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function registerServiceWorkerStarter() {
  if (!('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // Keep app usable even if SW registration fails.
  });
}

export default function App() {
  const [todos, setTodos] = useState<ServerTodo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [queueActions, setQueueActions] = useState<QueueAction[]>(() => {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QueueAction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const refreshFromServer = useCallback(async () => {
    const serverTodos = await apiFetchTodos();
    setTodos(serverTodos);
  }, []);

  const enqueueAction = useCallback((action: QueueAction) => {
    setQueueActions((prev) => [...prev, action]);
  }, []);

  const processQueue = useCallback(async () => {
    if (!navigator.onLine || queueActions.length === 0 || isSyncing) return;

    setIsSyncing(true);
    let processed = 0;

    try {
      for (const action of queueActions) {
        if (action.type === 'create') {
          await apiCreate(action.payload.title);
        } else if (action.type === 'toggle') {
          await apiToggle(action.payload.todoId, action.payload.done);
        } else if (action.type === 'delete') {
          await apiDelete(action.payload.todoId);
        }
        processed += 1;
      }

      setQueueActions((prev) => prev.slice(processed));
      await refreshFromServer();
      setMessage('Офлайн-очередь синхронизирована.');
    } catch {
      setQueueActions((prev) => prev.slice(processed));
      setMessage('Синхронизация остановлена: часть действий останется в очереди.');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queueActions, refreshFromServer]);

  const onCreate = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      try {
        await apiCreate(trimmed);
        await refreshFromServer();
        setMessage('Задача добавлена.');
      } catch {
        enqueueAction({
          id: crypto.randomUUID(),
          type: 'create',
          payload: { title: trimmed },
          ts: Date.now(),
        });
        setMessage('Сети нет: добавление сохранено в офлайн-очередь.');
      }
    },
    [enqueueAction, refreshFromServer]
  );

  const onToggle = useCallback(
    async (todo: ServerTodo) => {
      try {
        const nextDone = !todo.done;
        await apiToggle(todo.id, nextDone);
        await refreshFromServer();
        setMessage('Статус обновлен.');
      } catch {
        const nextDone = !todo.done;
        setTodos((prev) => prev.map((item) => (item.id === todo.id ? { ...item, done: nextDone } : item)));
        enqueueAction({
          id: crypto.randomUUID(),
          type: 'toggle',
          payload: { todoId: todo.id, done: nextDone },
          ts: Date.now(),
        });
        setMessage('Сети нет: изменение статуса сохранено в очереди.');
      }
    },
    [enqueueAction, refreshFromServer]
  );

  const onDelete = useCallback(
    async (todo: ServerTodo) => {
      try {
        await apiDelete(todo.id);
        await refreshFromServer();
        setMessage('Задача удалена.');
      } catch {
        setTodos((prev) => prev.filter((item) => item.id !== todo.id));
        enqueueAction({
          id: crypto.randomUUID(),
          type: 'delete',
          payload: { todoId: todo.id },
          ts: Date.now(),
        });
        setMessage('Сети нет: удаление сохранено в очереди.');
      }
    },
    [enqueueAction, refreshFromServer]
  );

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = inputValue;
      setInputValue('');
      await onCreate(value);
    },
    [inputValue, onCreate]
  );

  useEffect(() => {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueActions));
  }, [queueActions]);

  useEffect(() => {
    registerServiceWorkerStarter();

    let cancelled = false;

    const bootstrap = async () => {
      try {
        await refreshFromServer();
      } catch {
        if (!cancelled) {
          setMessage('Не удалось загрузить данные. Проверьте, что backend запущен.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refreshFromServer]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setMessage('Сеть восстановлена.');
      void processQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setMessage('Вы офлайн. Доступны только локальные/кэшированные данные.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processQueue]);

  return (
    <main className="app">
      <header className="header">
        <h1>Todo-сы</h1>
        <span className={`badge ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'online' : 'offline'}</span>
      </header>

      <p className="muted">
        Есть: online CRUD. Реализовать: PWA, offline-очередь и синхронизацию после reconnect.
      </p>

      <form className="toolbar" onSubmit={onSubmit}>
        <input
          type="text"
          maxLength={200}
          placeholder="Новая задача"
          required
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <button type="submit">Добавить</button>
        <button type="button" onClick={() => void processQueue()} disabled={!isOnline || queueActions.length === 0 || isSyncing}>
          {isSyncing ? 'Синхронизация...' : 'Синхронизировать'}
        </button>
      </form>

      <section className="meta">
        <span className="badge">Офлайн-очередь: {queueActions.length}</span>
        <span className="badge">sync: {isSyncing ? 'running' : 'idle'}</span>
      </section>

      <section className="todo-note">
        <p>
          Офлайн-действия сохраняются в локальную очередь и отправляются после восстановления сети.
        </p>
      </section>

      {message ? <div className="message">{message}</div> : null}
      {isLoading ? <p>Загрузка...</p> : null}
      {!isLoading && todos.length === 0 ? <div className="empty">Пока нет задач</div> : null}

      <ul className="list">
        {todos.map((todo) => (
          <li className="item" key={todo.id}>
            <button type="button" onClick={() => void onToggle(todo)}>
              {todo.done ? '✅' : '⬜'}
            </button>
            <div>
              <div className={todo.done ? 'done' : ''}>{todo.title}</div>
              <div className="hint">Сервер · {toLocalText(todo.updatedAt)}</div>
            </div>
            <button type="button" onClick={() => void onDelete(todo)}>
              Удалить
            </button>
            <span className="hint">#{todo.id}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

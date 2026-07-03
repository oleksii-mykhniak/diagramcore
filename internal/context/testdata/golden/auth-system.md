# Система авторизації

**Purpose:** Показати, як користувач автентифікується через власний сервіс та зовнішнього OAuth-провайдера

**Audience:** students

### Components

- **User** (actor): Користувач
  Людина, що намагається увійти в систему
- **Gateway** (service): API Gateway
  Єдина вхідна точка для зовнішніх запитів
- **AuthService** (service): Auth Service
  Сервіс, що відповідає за автентифікацію та видачу сесій
  AI context: Не зберігає паролі напряму — делегує перевірку OAuth-провайдеру, або звіряє хеш у DB для прямого входу
- **OAuthProvider** (external): OAuth-провайдер
  Зовнішній сервіс автентифікації (напр. Google, GitHub)
  Node OAuthProvider has a detailed sub-diagram: ./oauth-detail.dc.yaml
- **DB** (storage): База даних користувачів
  Зберігає облікові дані та хеші паролів

### Links

- User -> Gateway (request): HTTPS запит на вхід
- Gateway -> AuthService (call): Делегує автентифікацію
- AuthService -> OAuthProvider (request): Запит на OAuth-автентифікацію
- AuthService -> DB (query): Перевірка облікових даних

### Flow: Успішна авторизація через OAuth

1. User -> Gateway: Надсилає запит на вхід через OAuth
2. Gateway -> AuthService: Перенаправляє запит у Auth Service
3. AuthService -> OAuthProvider: Ініціює OAuth-флоу з зовнішнім провайдером
4. OAuthProvider -> AuthService: Повертає підтверджену особу користувача (response)
5. AuthService -> DB: Знаходить або створює локальний обліковий запис
6. DB -> AuthService: Повертає дані облікового запису (response)

### Flow: Пряма авторизація логін/пароль

1. User -> Gateway: Надсилає логін і пароль
2. Gateway -> AuthService: Перенаправляє запит у Auth Service
3. AuthService -> DB: Звіряє хеш пароля з базою
4. DB -> AuthService: Повертає результат перевірки (response)


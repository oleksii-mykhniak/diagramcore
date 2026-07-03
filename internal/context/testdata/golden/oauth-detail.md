# OAuth-провайдер: деталі

**Purpose:** Деталізувати внутрішній устрій зовнішнього OAuth-провайдера з auth-system.dc.yaml

**Audience:** students

### Components

- **OAuthGateway** (service): OAuth Gateway
  Приймає запити на автентифікацію від сторонніх систем
- **ConsentScreen** (component): Екран згоди
  UI, де користувач підтверджує надання доступу
- **TokenIssuer** (service): Видавець токенів
  Формує access/refresh токени після згоди користувача
- **TokenStore** (storage): Сховище токенів
  Зберігає видані токени для подальшої перевірки

### Links

- OAuthGateway -> ConsentScreen (call): Показати екран згоди
- ConsentScreen -> TokenIssuer (call): Користувач підтвердив доступ
- TokenIssuer -> TokenStore (query): Зберегти виданий токен

### Flow: Видача токена

1. OAuthGateway -> ConsentScreen: Запитує згоду користувача
2. ConsentScreen -> TokenIssuer: Передає підтверджену згоду
3. TokenIssuer -> TokenStore: Зберігає новий токен
4. TokenStore -> TokenIssuer: Підтверджує збереження (response)


# Обробка платежу

**Purpose:** Показати сценарій оплати з перевіркою на шахрайство та умовним розгалуженням

**Audience:** students

### Components

- **Customer** (actor): Клієнт
  Людина, що здійснює оплату
- **PaymentGateway** (service): Payment Gateway
  Приймає запити на оплату від клієнтів
- **PaymentProcessor** (service): Payment Processor
  Основна логіка обробки платежу
  AI context: Оркеструє перевірку на шахрайство, запис у леджер і сповіщення
- **FraudCheck** (component): Перевірка на шахрайство
  Оцінює ризик транзакції
- **Ledger** (storage): Леджер транзакцій
  Незмінний журнал усіх фінансових операцій
- **NotificationService** (service): Сервіс сповіщень
  Надсилає клієнту статус оплати

### Links

- Customer -> PaymentGateway (request): Запит на оплату
- PaymentGateway -> PaymentProcessor (call): Передає платіж на обробку
- PaymentProcessor -> FraudCheck (query): Оцінити ризик транзакції
- PaymentProcessor -> Ledger (dataflow): Записати транзакцію
- PaymentProcessor -> NotificationService (event): Сповістити клієнта

### Flow: Оплата з перевіркою на шахрайство

1. Customer -> PaymentGateway: Ініціює оплату
2. PaymentGateway -> PaymentProcessor: Передає деталі платежу
3. PaymentProcessor -> FraudCheck: Запитує оцінку ризику
4. Branch: транзакція визнана підозрілою
   - Then:
    1. PaymentProcessor -> NotificationService: Повідомляє клієнта про блокування транзакції
   - Else:
    1. PaymentProcessor -> Ledger: Записує успішну транзакцію
    2. PaymentProcessor -> NotificationService: Надсилає клієнту підтвердження оплати


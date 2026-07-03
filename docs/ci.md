# CI-рецепт для користувачів DiagramCore

Готовий GitHub Actions workflow для репозиторіїв, що зберігають діаграми
у форматі `*.dc.yaml`: на кожен push/PR — валідація, рендер SVG для
кожної діаграми, генерація AI-контексту, і публікація всього як build
artifact (для перегляду в PR або підключення до документації).

Приклад workflow — `.github/workflows/diagrams.example.yml` у корені
цього репозиторію. Він використовує лише команди `dc`, вже реалізовані
в попередніх кроках плану (`dc validate`, `dc render`, `dc context`), і
не залежить від жодної зовнішньої інфраструктури, окрім GitHub Actions.

## Що робить workflow

1. **Встановлює `dc`** — збирає бінарник з вихідного коду цього
   репозиторію (`go build -o dc ./cmd/dc`). Якщо ви використовуєте
   DiagramCore як зовнішній інструмент (не форк цього репозиторію),
   замініть цей крок на завантаження релізного бінарника з GitHub
   Releases (див. нижче) для вашої платформи.
2. **`dc validate diagrams/*.dc.yaml`** — падає з exit 1 (і зупиняє
   workflow), якщо будь-яка діаграма має помилки валідації.
3. **`dc render <file> -o out/<name>.svg`** для кожного `*.dc.yaml` —
   рендерить SVG нативним D2-рендерером.
4. **`dc context <file> -o out/<name>.md`** для кожного `*.dc.yaml` —
   генерує AI-контекст у markdown.
5. **`actions/upload-artifact`** — публікує вміст `out/` як artifact
   білда, доступний для завантаження зі сторінки прогону workflow.

## Використання у власному репозиторії

1. Скопіюйте `.github/workflows/diagrams.example.yml` у
   `.github/workflows/diagrams.yml` вашого репозиторію.
2. Змініть шлях `diagrams/*.dc.yaml` на директорію, де лежать ваші
   `*.dc.yaml` файли.
3. Якщо ви не форкаєте DiagramCore, замініть крок збірки `dc` на
   завантаження бінарника з GitHub Releases цього репозиторію (реліз
   збирається `goreleaser`, конфіг — `.goreleaser.yml` у корені).

## Реліз бінарника

`.goreleaser.yml` збирає `dc` для linux/darwin/windows × amd64/arm64
(6 платформ). Локальна перевірка без публікації:

```sh
goreleaser build --snapshot --clean
```

Публікація релізу (з GitHub Actions при push тегу `v*`, чи вручну):

```sh
goreleaser release --clean
```

вимагає `GITHUB_TOKEN` і git-тег вигляду `vX.Y.Z`.

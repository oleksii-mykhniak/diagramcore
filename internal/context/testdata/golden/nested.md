# Вкладені контейнери: GCP → k8s → namespace → services

**Purpose:** Демонструє parent-вкладеність (фаза 11, крок 11.5/11.6): контейнер усередині контейнера, з реальними зв'язками між листовими вузлами

**Audience:** engineers

### Components

- **gcp** (component): GCP Project
  Хмарний проєкт верхнього рівня
  - **k8s** (component): GKE Cluster
    - **namespace** (component): prod namespace
      - **api** (service): API service
      - **worker** (service): Worker service
    - **cache** (storage): Redis
- **client** (actor): Client

### Links

- client -> api (request): HTTPS
- api -> worker (call): enqueue job
- api -> cache (query): read/write


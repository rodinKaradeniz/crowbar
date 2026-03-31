# Slotera

A reservation management system for businesses and customers.

## Project Structure

```
slotera/
├── scripts/             # Development scripts
│   ├── dev.sh          # Start all services (Docker, backend, frontend)
│   └── stop.sh         # Stop Docker containers
├── client/              # Frontend (Next.js)
│   ├── app/             # Next.js app router pages
│   │   └── api/         # BFF proxy routes (auth, proxy)
│   ├── components/      # React components
│   ├── lib/             # Utility functions & API clients
│   ├── tests/           # Frontend tests (Vitest + Testing Library)
│   │   ├── mocks/       # MSW request handlers for API mocking
│   │   ├── unit/        # Unit tests (utilities, API client transforms)
│   │   ├── integration/ # Integration tests (components, context providers)
│   │   └── setup.ts     # Global test setup (jest-dom matchers)
│   ├── types/           # TypeScript type definitions
│   └── vitest.config.ts # Vitest configuration
├── server/              # Backend (FastAPI + PostgreSQL)
│   ├── app/             # FastAPI application
│   │   ├── models/      # SQLAlchemy models
│   │   ├── schemas/     # Pydantic request/response schemas
│   │   ├── services/    # Business logic layer
│   │   └── routers/     # API route handlers
│   ├── tests/           # Backend tests (pytest + httpx)
│   │   ├── unit/        # Unit tests (auth service, pure logic)
│   │   ├── integration/ # Integration tests (full HTTP route round-trips)
│   │   └── conftest.py  # Shared fixtures (test DB, client, auth helpers)
│   ├── db/              # Database management
│   │   ├── migrations/  # Schema DDL (runs in all environments)
│   │   └── seeds/       # Test data (runs only when SEED_DATA=true)
│   ├── uploads/         # Local file uploads (git-ignored)
│   ├── DATABASE.md      # Database operations reference
│   ├── pytest.ini       # Pytest configuration
│   └── docker-compose.yml
├── ml/                  # ML Insights Microservice (FastAPI + scikit-learn + LightGBM)
│   ├── src/
│   │   ├── features/    # Feature engineering (reservation, customer)
│   │   ├── models/      # ML models (segmentation, cancellation, demand)
│   │   ├── pipelines/   # Orchestration pipeline
│   │   ├── main.py      # FastAPI application (port 8001)
│   │   ├── config.py    # Pydantic settings
│   │   └── db.py        # Database connection + data loaders
│   ├── notebooks/       # Jupyter notebooks for EDA
│   ├── Dockerfile
│   └── requirements.txt
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- (ML service) Python 3.12+ with LightGBM

### Quick Start (All Services)

From the project root, run:

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

This will:

1. Start Docker (PostgreSQL, Redis, ML service)
2. Wait for the database to be ready
3. Set up backend (venv, dependencies, migrations + seed data)
4. Set up frontend (npm install if needed)
5. Start backend (port 8000), frontend (port 3000), and ML (port 8001)

Press **Ctrl+C** to stop all services.

To stop Docker containers only:

```bash
./scripts/stop.sh
```

### Frontend (Client)

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Backend (Server)

```bash
cd server

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp env.example .env

# Default DB name is `slotera`. If you still have an older `rk_reservations` database,
# either create `slotera` and run migrations, or keep your existing name in `DATABASE_URL`.

# Start PostgreSQL & Redis
docker compose up -d

# Run migrations + seed test data
SEED_DATA=true python -m db.migrate

# Start the API server
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the API docs.

### ML Insights Service

```bash
cd server

# Start all services (Postgres, Redis, ML)
docker compose up -d

# Or build/start only the ML service
docker compose up -d --build ml
```

The ML service runs at [http://localhost:8001](http://localhost:8001) and provides:
- `GET /health` — Service health check
- `POST /pipeline/run` — Trigger the full ML pipeline
- `GET /results/summary` — Latest pipeline results overview
- `GET /results/segmentation` — Customer segmentation results
- `GET /results/cancellation` — Cancellation prediction metrics
- `GET /results/demand` — 7-day demand forecast

**Local development (without Docker):**

```bash
cd ml
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env
uvicorn src.main:app --reload --port 8001
```

### Database Commands

```bash
# Run migrations only (production-safe)
python -m db.migrate

# Run migrations + seed test data (RK Design and Development, admin: mrodin.karadeniz@gmail.com, password: password123)
SEED_DATA=true python -m db.migrate

# Seed data only (assumes tables exist)
python -m db.migrate seed

# Reset everything (drop + recreate + optional seed)
SEED_DATA=true python -m db.migrate reset
```

## Testing

Both the frontend and backend have unit and integration test suites. Tests are designed to cover core functionality (auth, reservations, API transforms, UI components) without aiming for exhaustive coverage.

### Backend Tests

Uses **pytest** with **pytest-asyncio** and **httpx** for async FastAPI testing against a dedicated PostgreSQL test database.

```bash
cd server
source venv/bin/activate

# One-time setup: install test dependencies + create test database
pip install -r requirements-test.txt
docker compose exec postgres createdb -U postgres slotera_test

# Run all tests
python -m pytest tests/ -v

# Run only unit tests
python -m pytest tests/unit/ -v

# Run only integration tests
python -m pytest tests/integration/ -v

# Run with coverage report
python -m pytest tests/ --cov=app --cov-report=term-missing
```

| Test file | Type | What it covers |
|-----------|------|----------------|
| `tests/unit/test_auth_service.py` | Unit | Password hashing/verification, JWT token creation & decoding |
| `tests/integration/test_auth_routes.py` | Integration | Register, login, `/me`, profile update, password change |
| `tests/integration/test_reservation_routes.py` | Integration | Full reservation CRUD lifecycle, public reservations, edge cases |

**How it works:** Integration tests use a real `slotera_test` PostgreSQL database. Tables are created before each test and dropped after, ensuring full isolation. The FastAPI `get_db` dependency is overridden to use the test session. See `tests/conftest.py` for all shared fixtures.

### Frontend Tests

Uses **Vitest** with **React Testing Library** and **MSW** (Mock Service Worker) for network-level API mocking.

```bash
cd client

# Run all tests (single run)
npm run test:run

# Run in watch mode (re-runs on file changes)
npm test

# Run with coverage
npm run test:coverage
```

| Test file | Type | What it covers |
|-----------|------|----------------|
| `tests/unit/utils.test.ts` | Unit | `cn()` utility — class merging, Tailwind conflict resolution |
| `tests/unit/client-api.test.ts` | Unit | API client — snake_case → camelCase transforms, error handling |
| `tests/integration/auth-context.test.tsx` | Integration | AuthContext — login/logout state management, loading states |
| `tests/integration/login-form.test.tsx` | Integration | LoginForm — rendering, form submission, error display, OTP toggle |

**How it works:** MSW intercepts `fetch` calls at the network level, so actual client code runs unmodified. Mock handlers are defined in `tests/mocks/handlers.ts`. Component tests render inside the real `AuthProvider` to test realistic behavior. See `vitest.config.ts` for configuration and `tests/setup.ts` for global setup.

### Adding New Tests

- **Backend unit tests** go in `server/tests/unit/` — for pure logic that doesn't need a database (e.g. validation, hashing, token generation).
- **Backend integration tests** go in `server/tests/integration/` — for full HTTP round-trips through FastAPI routes. Use the `client` and `auth_headers` fixtures from `conftest.py`.
- **Frontend unit tests** go in `client/tests/unit/` — for utility functions, data transforms, and non-component logic.
- **Frontend integration tests** go in `client/tests/integration/` — for React components rendered with their context providers. Add new MSW handlers in `tests/mocks/handlers.ts` for any new API endpoints.

## Tech Stack

### Frontend
- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **Payments**: Stripe
- **Testing**: Vitest + React Testing Library + MSW

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database**: PostgreSQL 16
- **ORM**: SQLAlchemy (async)
- **Cache/Queue**: Redis
- **Auth**: JWT (python-jose + bcrypt)
- **Testing**: pytest + pytest-asyncio + httpx

### ML Insights
- **Framework**: FastAPI
- **Language**: Python 3.12
- **Models**: LightGBM (classification + regression), scikit-learn K-Means
- **Features**: Customer segmentation (RFM), cancellation prediction, demand forecasting
- **Data**: Pandas + SQLAlchemy (sync) for pipeline, asyncpg for API
- **Deployment**: Docker (standalone microservice)

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/register` | No | Register |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/businesses` | No | List businesses |
| GET | `/api/businesses/{id}` | No | Get business |
| GET | `/api/businesses/slug/{slug}` | No | Get business by slug |
| PATCH | `/api/businesses/{id}` | Yes | Update business |
| GET | `/api/service-types/business/{id}` | No | List service types |
| POST | `/api/service-types` | Yes | Create service type |
| PATCH | `/api/service-types/{id}` | Yes | Update service type |
| DELETE | `/api/service-types/{id}` | Yes | Delete service type |
| GET | `/api/reservations/business/{id}` | Yes | List business reservations |
| GET | `/api/reservations/my` | Yes | List my reservations |
| POST | `/api/reservations` | Yes | Create reservation |
| PATCH | `/api/reservations/{id}` | Yes | Update reservation |
| DELETE | `/api/reservations/{id}` | Yes | Delete reservation |
| GET | `/api/customers/business/{id}` | Yes | List business customers |
| GET | `/api/staff/business/{id}` | Yes | List business staff |
| PATCH | `/api/staff/{id}` | Yes | Update staff role |
| DELETE | `/api/staff/{id}` | Yes | Remove staff |
| GET | `/api/analytics/business/{id}` | Yes | Business dashboard stats |
| GET | `/api/analytics/customer/me` | Yes | Customer dashboard stats |

## License

Private project

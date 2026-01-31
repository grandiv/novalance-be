# Novalance Backend APIs

Web3 freelancer marketplace backend for Base Indonesia Hackathon.

## Tech Stack

- **Runtime:** Node.js (with tsx for TypeScript execution)
- **Framework:** Hono (ultra-fast, edge-compatible)
- **Database:** better-sqlite3 + Drizzle ORM (SQLite with full TypeScript support)
- **Web3:** viem (Base network integration)
- **Auth:** jose (JWT tokens)

## Features

- 📝 **Wallet Signature Authentication** - Nonce-based SIWE pattern
- 👥 **User Profiles** - GitHub, LinkedIn, bio management
- 🚀 **Project Management** - Create, update, delete projects
- 👥 **Role Management** - Multiple roles per project (FE, BE, Design, etc.)
- ✅ **KPI/Milestone Tracking** - Granular milestone management per role
- 📨 **Application System** - Freelancers apply to project roles
- ✔️ **Submission & Review** - KPI submission, approval, rejection workflow
- 🔗 **Smart Contract Bridge** - Ready for vault contract integration
- 📊 **Progress Tracking** - Real-time project and role progress
- ❌ **Cancellation Handling** - Project cancellation with refund calculations

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Setup database
npm run db:push

# Run development server
npm run dev
```

Server will start on `http://localhost:3000`

## Project Structure

```
src/
├── db/
│   ├── schema.ts          # Database schema with 7 tables
│   └── index.ts           # Database connection
├── lib/
│   ├── crypto.ts          # Wallet signature utilities
│   ├── jwt.ts             # JWT token utilities
│   ├── contracts/
│   │   └── vault.ts       # Smart contract integration
│   └── validations/
│       ├── project.ts
│       ├── application.ts
│       └── kpi.ts
├── middleware/
│   └── auth.ts            # JWT authentication middleware
├── routes/
│   ├── auth.ts            # /api/auth/* - Wallet auth endpoints
│   ├── users.ts           # /api/users/* - User profiles
│   ├── projects.ts        # /api/projects/* - Projects, roles, KPIs
│   ├── applications.ts    # /api/applications/* - Application flow
│   ├── kpis.ts            # /api/kpis/* - KPI submission/review
│   └── contracts.ts       # /api/contracts/* - SC bridge
├── config/
│   └── contracts.ts       # Contract addresses config
├── app.ts                 # Main Hono app
└── index.ts               # Entry point
```

## API Documentation

See [`docs/API.md`](docs/API.md) for complete API reference.

### Quick API Reference

| Endpoint                          | Method         | Description                    |
| --------------------------------- | -------------- | ------------------------------ |
| `/api/auth/wallet/nonce`          | POST           | Get nonce for wallet signature |
| `/api/auth/wallet/verify`         | POST           | Verify signature & get JWT     |
| `/api/users/me`                   | GET            | Get current user profile       |
| `/api/users/:address`             | GET            | Get public user profile        |
| `/api/projects`                   | GET/POST       | List/create projects           |
| `/api/projects/:id`               | GET/PUT/DELETE | Project details/update/delete  |
| `/api/projects/:id/roles`         | POST           | Add role to project            |
| `/api/projects/:id/progress`      | GET            | Get project progress           |
| `/api/applications`               | POST           | Submit application             |
| `/api/applications/:id/accept`    | POST           | Accept application             |
| `/api/kpis/:id/submit`            | POST           | Submit KPI                     |
| `/api/kpis/:id/approve`           | POST           | Approve KPI                    |
| `/api/contracts/vault/:address/*` | GET            | Vault contract queries         |

## Database Schema

7 tables: `users`, `projects`, `project_roles`, `applications`, `assignments`, `kpis`, `transactions`

See [`src/db/schema.ts`](src/db/schema.ts) for details.

## Environment Variables

```env
PORT=3000
BASE_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://sepolia.base.org
JWT_SECRET=your-super-secret-key-change-in-production

# Smart Contract Addresses (to be provided by SC dev)
MOCK_IDRX_ADDRESS=
VAULT_FACTORY_ADDRESS=
VAULT_IMPLEMENTATION_ADDRESS=
```

## For Frontend Team

### Base URL

```
http://localhost:3000/api
```

### Authentication Flow

1. `POST /api/auth/wallet/nonce` - Get nonce with `{ address }`
2. User signs message with wallet
3. `POST /api/auth/wallet/verify` - Verify with `{ address, signature }` → get token
4. Include token in requests: `Authorization: Bearer <token>`

### Postman Collection

Import [`docs/postman-collection.json`](docs/postman-collection.json) into Postman for testing all endpoints.

## For Smart Contract Team

### Required Contract Functions

See [`src/lib/contracts/vault.ts`](src/lib/contracts/vault.ts) for the expected ABI.

**Key Functions Needed:**

- `getBalance()` - Get vault balance
- `getKpiStatus(uint256 kpiIndex)` - Get KPI completion status
- `getProjectInfo()` - Get project details
- `deposit()` - Deposit funds (called by frontend via calldata)
- `releaseKpiPayment(uint256 kpiIndex)` - Release payment for completed KPI
- `cancelProject()` - Cancel project and handle refunds

**Events to Emit:**

- `Deposited(address caller, uint256 amount)` - When funds are deposited
- `KpiApproved(uint256 kpiIndex, address freelancer, uint256 amount)` - When KPI is approved
- `ProjectCancelled(address caller, uint256 refundAmount)` - When project is cancelled

## Development

```bash
# Run tests
npm test

# Database studio (visualize data)
npm run db:studio

# Generate migrations
npm run db:generate
```

## License

MIT

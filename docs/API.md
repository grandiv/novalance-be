# Novalance Backend API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
All endpoints (except `/api/auth/*`) require:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Auth

#### POST /auth/wallet/nonce
Request nonce for wallet signature.

**Request:**
```json
{
  "address": "0x..."
}
```

**Response:**
```json
{
  "nonce": "random-string",
  "message": "Sign this message..."
}
```

#### POST /auth/wallet/verify
Verify signature and get JWT token.

**Request:**
```json
{
  "address": "0x...",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "jwt-token",
  "address": "0x..."
}
```

### Projects

#### GET /projects
List all projects.

**Query Params:**
- `search`: Search in title/description
- `status`: Filter by status (draft, open, in_progress, completed, cancelled)
- `limit`: Max results (default 20)
- `offset`: Pagination offset

#### POST /projects
Create a new project (requires auth).

**Request:**
```json
{
  "title": "Build DEX Frontend",
  "description": "...",
  "timelineStart": "2025-02-01T00:00:00Z",
  "timelineEnd": "2025-04-01T00:00:00Z"
}
```

#### GET /projects/:id
Get project details.

#### PUT /projects/:id
Update project (owner only).

#### DELETE /projects/:id
Delete project (owner only, draft status only).

#### POST /projects/:id/roles
Add a role to project (owner only).

**Request:**
```json
{
  "name": "Frontend Developer",
  "description": "...",
  "kpiCount": 10,
  "paymentPerKpi": "2000000"
}
```

#### GET /projects/:id/roles
Get all roles for project.

#### PUT /projects/:id/roles/:roleId
Update role (owner only).

#### DELETE /projects/:id/roles/:roleId
Delete role (owner only).

#### POST /projects/:id/roles/:roleId/kpis
Create KPIs for role (owner only).

**Request:**
```json
{
  "kpis": [
    {
      "kpiNumber": 1,
      "description": "Design mockups",
      "deadline": "2025-02-15T00:00:00Z"
    }
  ]
}
```

#### GET /projects/:id/roles/:roleId/kpis
Get KPIs for role.

#### PUT /kpis/:kpiId
Update KPI (owner only).

#### GET /projects/:id/progress
Get project progress (owner or assigned FL only).

#### POST /projects/:id/cancel
Cancel project (owner only).

#### GET /projects/:id/cancellation-status
Get cancellation status.

### Applications

#### POST /applications?roleId=xxx
Submit application to role.

**Request:**
```json
{
  "coverLetter": "I have experience..."
}
```

#### GET /applications/role/:roleId
Get applicants for role (owner only).

#### POST /applications/:id/accept
Accept application, create assignment (owner only).

#### POST /applications/:id/reject
Reject application (owner only).

#### GET /applications/my
Get my applications.

### Users

#### GET /users/me
Get current user profile.

#### PUT /users/me
Update current user profile.

**Request:**
```json
{
  "email": "user@example.com",
  "githubUrl": "https://github.com/...",
  "linkedinUrl": "https://linkedin.com/in/...",
  "bio": "Web3 developer..."
}
```

#### GET /users/:address
Get public user profile.

#### GET /users/me/assignments
Get my active assignments.

#### GET /users/me/portfolio
Get my completed work portfolio.

### KPIs

#### POST /kpis/:id/submit
Submit KPI (assigned FL only).

**Request:**
```json
{
  "submissionData": "Link to PR, demo, etc."
}
```

#### POST /kpis/:id/approve
Approve KPI (owner only).

**Request:**
```json
{
  "comment": "Great work!"
}
```

#### POST /kpis/:id/reject
Reject KPI (owner only).

**Request:**
```json
{
  "comment": "Please fix these issues..."
}
```

#### GET /kpis/my/pending
Get my pending KPIs (FL only).

#### GET /kpis/pending-reviews
Get pending KPIs to review (owner only).

### Contracts

#### GET /contracts/vault/:address/balance
Get vault balance.

#### GET /contracts/vault/:address/kpi/:index
Get KPI status from vault.

#### GET /contracts/vault/:address/info
Get project info from vault.

#### POST /contracts/calldata/deposit
Generate calldata for deposit.

**Request:**
```json
{
  "vaultAddress": "0x...",
  "amount": "1000000"
}
```

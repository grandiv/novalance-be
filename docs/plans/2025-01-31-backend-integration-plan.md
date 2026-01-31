# NovaLance Backend Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the NovaLance backend API into the frontend, replacing mock data with real API calls while preserving all existing smart contract functionality.

**Architecture:** The frontend uses wagmi/viem for onchain operations (smart contracts) while the backend handles offchain data (user profiles, projects, applications, KPIs). We'll create an API client layer that mirrors the existing mock data structure, using TanStack React Query for caching and state management.

**Tech Stack:** Next.js 15, TypeScript, TanStack React Query (already installed), Hono backend, JWT authentication

**Important Constraints:**
- DO NOT modify any smart contract integration code (lib/contract.ts, lib/hooks.ts, lib/abi.ts)
- DO NOT modify existing wagmi hooks for blockchain operations
- Focus only on replacing mock data with API calls
- Backend is deployed at: https://novalance-be.vercel.app
- All existing contract hooks must continue to work

---

## Overview

This plan replaces mock data with API calls in the following areas:

| Area | Mock Data Location | API Endpoints |
|------|-------------------|---------------|
| Authentication | lib/mockData.ts (mockUser) | POST /api/auth/wallet/nonce, /api/auth/wallet/verify |
| User Profiles | lib/mockData.ts (mockUser) | GET /api/users/me, PUT /api/users/me |
| Projects | lib/mockData.ts (mockPOProjects, mockJobs) | GET /api/projects, GET /api/projects/:id |
| Applications | lib/mockData.ts (mockApplications) | GET /api/applications/my, POST /api/applications |
| KPIs | lib/mockData.ts (KPI in roles) | GET /api/kpis/my/pending, POST /api/kpis/:id/submit |

---

## Task 1: Create API Client Infrastructure

**Files:**
- Create: `lib/api-client.ts`
- Create: `lib/api-types.ts`
- Modify: `.env`

**Step 1: Create API types file**

Create `lib/api-types.ts` with TypeScript types matching backend responses:

```typescript
// User types
export interface UserProfile {
  address: string;
  nonce?: string;
  email?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserStats {
  projectsOwned: number;
  applicationsSubmitted: number;
  assignmentsActive: number;
}

// Project types
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type RoleStatus = 'open' | 'assigned' | 'completed' | 'cancelled';

export interface ProjectRole {
  id: string;
  name: string;
  description: string;
  kpiCount: number;
  paymentPerKpi: string;
  skills?: string[];
  status: RoleStatus;
}

export interface Project {
  id: string;
  ownerAddress: string;
  title: string;
  description: string;
  timelineStart: string;
  timelineEnd: string;
  status: ProjectStatus;
  vaultAddress?: string;
  owner?: {
    address: string;
    bio?: string;
  };
  roles: ProjectRole[];
}

// Application types
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface Application {
  id: string;
  projectRoleId: string;
  freelancerAddress: string;
  status: ApplicationStatus;
  coverLetter?: string;
  projectRole: {
    id: string;
    name: string;
    description: string;
    kpiCount: number;
    paymentPerKpi: string;
    skills?: string[];
    status: RoleStatus;
    project: {
      id: string;
      title: string;
      description: string;
      timelineStart: string;
      timelineEnd: string;
      status: ProjectStatus;
      vaultAddress?: string;
    };
  };
}

// KPI types
export type KpiStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'disputed' | 'paid' | 'cancelled';

export interface Kpi {
  id: string;
  projectRoleId: string;
  kpiNumber: number;
  description: string;
  deadline: string;
  amount: string;
  status: KpiStatus;
  submittedAt?: string;
  reviewedAt?: string;
  submissionData?: string;
  reviewComment?: string;
}

// Auth types
export interface NonceResponse {
  nonce: string;
  message: string;
}

export interface VerifyResponse {
  token: string;
  address: string;
}

// Balance types
export interface FreelancerBalance {
  availableBalance: string;
  pendingKpis: number;
  approvedKpis: number;
  totalEarned: string;
}

export interface ProjectBalance {
  projectId: string;
  projectTitle: string;
  vaultAddress: string;
  deposited: string;
  spent: string;
  pending: string;
  remaining: string;
}

export interface ProjectBalancesResponse {
  projects: ProjectBalance[];
  totals: {
    deposited: string;
    spent: string;
    pending: string;
    remaining: string;
  };
}
```

**Step 2: Create API client file**

Create `lib/api-client.ts` with fetch wrapper and API methods:

```typescript
import type {
  UserProfile,
  PublicUserStats,
  Project,
  Application,
  Kpi,
  NonceResponse,
  VerifyResponse,
  FreelancerBalance,
  ProjectBalancesResponse,
} from './api-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://novalance-be.vercel.app';

// Get stored JWT token
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('novalance_jwt');
}

// Set JWT token
export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('novalance_jwt', token);
}

// Clear JWT token
export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('novalance_jwt');
}

// API fetch wrapper with auth
async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response;
}

// Auth APIs
export const authApi = {
  async getNonce(address: string): Promise<NonceResponse> {
    const res = await apiFetch('/api/auth/wallet/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
    return res.json();
  },

  async verifySignature(address: string, signature: string): Promise<VerifyResponse> {
    const res = await apiFetch('/api/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature }),
    });
    return res.json();
  },
};

// User APIs
export const userApi = {
  async getProfile(): Promise<{ user: UserProfile }> {
    const res = await apiFetch('/api/users/me');
    return res.json();
  },

  async updateProfile(data: Partial<Pick<UserProfile, 'email' | 'githubUrl' | 'linkedinUrl' | 'bio'>>): Promise<{ user: UserProfile }> {
    const res = await apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getPublicProfile(address: string): Promise<{ user: UserProfile; stats: PublicUserStats }> {
    const res = await apiFetch(`/api/users/${address}`);
    return res.json();
  },

  async getFreelancerBalance(): Promise<FreelancerBalance> {
    const res = await apiFetch('/api/users/me/balance');
    return res.json();
  },

  async getProjectBalances(): Promise<ProjectBalancesResponse> {
    const res = await apiFetch('/api/users/me/project-balances');
    return res.json();
  },
};

// Project APIs
export const projectApi = {
  async list(params?: {
    search?: string;
    status?: string;
    skills?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ projects: Project[] }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.skills) searchParams.set('skills', params.skills);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    const res = await apiFetch(`/api/projects${query ? `?${query}` : ''}`);
    return res.json();
  },

  async get(id: string): Promise<{ project: Project }> {
    const res = await apiFetch(`/api/projects/${id}`);
    return res.json();
  },

  async create(data: {
    title: string;
    description: string;
    timelineStart: string;
    timelineEnd: string;
  }): Promise<{ project: Project }> {
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// Application APIs
export const applicationApi = {
  async getMyApplications(): Promise<{ applications: Application[] }> {
    const res = await apiFetch('/api/applications/my');
    return res.json();
  },

  async submitApplication(roleId: string, coverLetter: string): Promise<{ application: Application }> {
    const res = await apiFetch(`/api/applications?roleId=${roleId}`, {
      method: 'POST',
      body: JSON.stringify({ coverLetter }),
    });
    return res.json();
  },

  async getApplicantsForRole(roleId: string): Promise<{ applicants: Application[] }> {
    const res = await apiFetch(`/api/applications/role/${roleId}`);
    return res.json();
  },

  async acceptApplication(id: string): Promise<any> {
    const res = await apiFetch(`/api/applications/${id}/accept`, {
      method: 'POST',
    });
    return res.json();
  },

  async rejectApplication(id: string, comment: string): Promise<any> {
    const res = await apiFetch(`/api/applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
    return res.json();
  },
};

// KPI APIs
export const kpiApi = {
  async getMyPending(): Promise<{ kpis: Kpi[] }> {
    const res = await apiFetch('/api/kpis/my/pending');
    return res.json();
  },

  async submitKpi(id: string, data?: { submissionData?: string; deliverables?: { links: string[]; description: string } }): Promise<{ kpi: Kpi }> {
    const res = await apiFetch(`/api/kpis/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res.json();
  },

  async confirmKpi(id: string): Promise<{ kpi: Kpi }> {
    const res = await apiFetch(`/api/kpis/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return res.json();
  },

  async approveKpi(id: string, comment?: string): Promise<{ kpi: Kpi }> {
    const res = await apiFetch(`/api/kpis/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
    return res.json();
  },

  async rejectKpi(id: string, comment: string): Promise<{ kpi: Kpi }> {
    const res = await apiFetch(`/api/kpis/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
    return res.json();
  },
};
```

**Step 3: Add API URL to .env**

Add to `NovaLance/.env`:
```
NEXT_PUBLIC_API_URL=https://novalance-be.vercel.app
```

**Step 4: Test API client setup**

Run: `cd NovaLance && npm run dev`
Expected: Dev server starts without errors
Check: Open browser console, type `window.location` to confirm environment

**Step 5: Commit**

```bash
git add lib/api-client.ts lib/api-types.ts .env
git commit -m "feat: add API client infrastructure for backend integration"
```

---

## Task 2: Create React Query Hooks for API Calls

**Files:**
- Create: `lib/api-hooks.ts`

**Step 1: Write the API hooks file**

Create `lib/api-hooks.ts` with React Query hooks:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  userApi,
  projectApi,
  applicationApi,
  kpiApi,
  setToken,
  clearToken,
  type FreelancerBalance,
  type ProjectBalancesResponse,
} from './api-client';
import type {
  UserProfile,
  PublicUserStats,
  Project,
  Application,
  Kpi,
} from './api-types';

// Query keys
export const queryKeys = {
  user: ['user'] as const,
  userProfile: (address: string) => ['user', address] as const,
  freelancerBalance: ['balance', 'freelancer'] as const,
  projectBalances: ['balance', 'projects'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  myApplications: ['applications', 'mine'] as const,
  roleApplicants: (roleId: string) => ['applications', 'role', roleId] as const,
  pendingKpis: ['kpis', 'pending'] as const,
};

// Auth hooks
export function useNonce() {
  return useMutation({
    mutationFn: (address: string) => authApi.getNonce(address),
  });
}

export function useVerifySignature() {
  return useMutation({
    mutationFn: ({ address, signature }: { address: string; signature: string }) =>
      authApi.verifySignature(address, signature),
    onSuccess: (data) => {
      setToken(data.token);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return () => {
    clearToken();
    queryClient.clear();
  };
}

// User hooks
export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: () => userApi.getProfile(),
    select: (data) => data.user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Pick<UserProfile, 'email' | 'githubUrl' | 'linkedinUrl' | 'bio'>>) =>
      userApi.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

export function usePublicProfile(address: string) {
  return useQuery({
    queryKey: queryKeys.userProfile(address),
    queryFn: () => userApi.getPublicProfile(address),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFreelancerBalance() {
  return useQuery({
    queryKey: queryKeys.freelancerBalance,
    queryFn: () => userApi.getFreelancerBalance(),
    select: (data) => data as FreelancerBalance,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useProjectBalances() {
  return useQuery({
    queryKey: queryKeys.projectBalances,
    queryFn: () => userApi.getProjectBalances(),
    select: (data) => data as ProjectBalancesResponse,
    staleTime: 30 * 1000,
  });
}

// Project hooks
export function useProjects(params?: {
  search?: string;
  status?: string;
  skills?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...queryKeys.projects, params],
    queryFn: () => projectApi.list(params),
    select: (data) => data.projects,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => projectApi.get(id),
    select: (data) => data.project,
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      timelineStart: string;
      timelineEnd: string;
    }) => projectApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// Application hooks
export function useMyApplications() {
  return useQuery({
    queryKey: queryKeys.myApplications,
    queryFn: () => applicationApi.getMyApplications(),
    select: (data) => data.applications,
    staleTime: 30 * 1000,
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, coverLetter }: { roleId: string; coverLetter: string }) =>
      applicationApi.submitApplication(roleId, coverLetter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myApplications });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useRoleApplicants(roleId: string) {
  return useQuery({
    queryKey: queryKeys.roleApplicants(roleId),
    queryFn: () => applicationApi.getApplicantsForRole(roleId),
    select: (data) => data.applicants,
    enabled: !!roleId,
    staleTime: 30 * 1000,
  });
}

export function useAcceptApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationApi.acceptApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myApplications });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useRejectApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      applicationApi.rejectApplication(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myApplications });
    },
  });
}

// KPI hooks
export function usePendingKpis() {
  return useQuery({
    queryKey: queryKeys.pendingKpis,
    queryFn: () => kpiApi.getMyPending(),
    select: (data) => data.kpis,
    staleTime: 30 * 1000,
  });
}

export function useSubmitKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { submissionData?: string; deliverables?: { links: string[]; description: string } } }) =>
      kpiApi.submitKpi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingKpis });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useConfirmKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kpiApi.confirmKpi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingKpis });
      queryClient.invalidateQueries({ queryKey: queryKeys.freelancerBalance });
    },
  });
}

export function useApproveKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      kpiApi.approveKpi(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingKpis });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useRejectKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      kpiApi.rejectKpi(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingKpis });
    },
  });
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd NovaLance && npx tsc --noEmit`
Expected: No type errors related to the new files

**Step 3: Commit**

```bash
git add lib/api-hooks.ts
git commit -m "feat: add React Query hooks for API operations"
```

---

## Task 3: Integrate Authentication Flow

**Files:**
- Modify: `components/auth/WalletConnectModal.tsx`

**Step 1: Read the current wallet connect modal**

Read the file to understand current authentication flow:

Run: Read `C:\Projects\hackathon\novalance\NovaLance\components\auth\WalletConnectModal.tsx`

**Step 2: Update wallet connection to use backend auth**

After reading, modify the modal to integrate backend authentication:

1. After successful wallet connection, call `useNonce` to get a nonce
2. Use `signMessage` with the nonce to get signature
3. Call `useVerifySignature` to get JWT token
4. Store token using `setToken`

Key changes:
- Import `useNonce`, `useVerifySignature` from `lib/api-hooks`
- Add nonce/verification flow after wallet connection
- Store JWT token on successful verification

**Step 3: Test authentication flow**

Run: `cd NovaLance && npm run dev`
Expected: Wallet connection still works, now with JWT token stored
Check: In browser DevTools → Application → Local Storage, verify `novalance_jwt` exists

**Step 4: Commit**

```bash
git add components/auth/WalletConnectModal.tsx
git commit -m "feat: integrate backend JWT authentication with wallet connect"
```

---

## Task 4: Replace Mock Data in User Profile

**Files:**
- Modify: `components/dashboard/FreelancerSection.tsx`
- Modify: `components/dashboard/OwnerSection.tsx`
- Modify: `app/FL/profile/page.tsx`
- Modify: `app/PO/profile/page.tsx`
- Modify: `components/Header.tsx` or similar user display components

**Step 1: Identify all components using mockUser**

Search for `mockUser` imports:

Run: `cd NovaLance && grep -r "mockUser" components/ app/ --include="*.tsx" --include="*.ts"`

Expected output: List of files using mockUser data

**Step 2: Update FreelancerSection component**

In `components/dashboard/FreelancerSection.tsx`:
- Replace `mockUser` import with `useMyProfile` hook
- Handle loading and error states
- Map API response to expected display format

**Step 3: Update OwnerSection component**

In `components/dashboard/OwnerSection.tsx`:
- Replace `mockUser` import with `useMyProfile` hook
- Handle loading and error states

**Step 4: Update profile pages**

In `app/FL/profile/page.tsx` and `app/PO/profile/page.tsx`:
- Use `useMyProfile` and `useUpdateProfile` hooks
- Add loading skeleton while fetching
- Handle error states gracefully

**Step 5: Test profile data display**

Run: `cd NovaLance && npm run dev`
Expected: Profile data loads from backend, displays correctly
Check: Browser Network tab shows API calls to `/api/users/me`

**Step 6: Commit**

```bash
git add components/dashboard/FreelancerSection.tsx components/dashboard/OwnerSection.tsx app/FL/profile/page.tsx app/PO/profile/page.tsx
git commit -m "feat: replace mock user data with API calls"
```

---

## Task 5: Replace Mock Data in Projects List

**Files:**
- Modify: `app/FL/jobs/page.tsx`
- Modify: `app/PO/jobs/page.tsx` or similar project listing pages
- Modify: `components/ProjectCard.tsx` if it exists

**Step 1: Find project listing pages**

Search for `mockJobs` or `mockPOProjects` imports:

Run: `cd NovaLance && grep -r "mockJobs\|mockPOProjects" app/ components/ --include="*.tsx"`

**Step 2: Update FL jobs page**

In the jobs listing page:
- Replace `mockJobs` with `useProjects` hook
- Map API response to match frontend expected structure
- Add loading and error states

**Step 3: Update PO projects page**

In the PO projects page:
- Replace `mockPOProjects` with `useProjects` hook
- Filter for user's owned projects if needed

**Step 4: Test project listings**

Run: `cd NovaLance && npm run dev`
Expected: Projects load from backend, display with correct data
Check: Network tab shows `/api/projects` calls

**Step 5: Commit**

```bash
git add app/FL/jobs/page.tsx app/PO/jobs/page.tsx
git commit -m "feat: replace mock project data with API calls"
```

---

## Task 6: Replace Mock Data in Applications

**Files:**
- Modify: `app/FL/applications/page.tsx` or similar
- Modify: `app/PO/applications/page.tsx` or similar

**Step 1: Find application pages**

Search for `mockApplications` imports:

Run: `cd NovaLance && grep -r "mockApplications" app/ components/ --include="*.tsx"`

**Step 2: Update FL applications page**

In the freelancer applications page:
- Replace `mockApplications` with `useMyApplications` hook
- Map API response to expected format
- Add loading/error states

**Step 3: Update PO applications review page**

In the PO page for reviewing applications:
- Use `useRoleApplicants` hook for each role
- Add `useAcceptApplication` and `useRejectApplication` mutations

**Step 4: Test application flow**

Run: `cd NovaLance && npm run dev`
Expected: Applications load from backend, accept/reject works
Check: Network tab shows application API calls

**Step 5: Commit**

```bash
git add app/FL/applications/page.tsx app/PO/applications/page.tsx
git commit -m "feat: replace mock application data with API calls"
```

---

## Task 7: Integrate KPI Submission and Approval

**Files:**
- Modify: `components/contract/MilestoneActions.tsx` or similar KPI components
- Modify: `components/contract/POMilestoneActions.tsx` or similar

**Step 1: Find KPI-related components**

Search for KPI submission/approval components:

Run: `cd NovaLance && grep -r "KPI\|kpi\|milestone" components/ --include="*.tsx" -l`

**Step 2: Update KPI submission component**

In the freelancer KPI submission component:
- Keep existing smart contract hooks (DO NOT MODIFY)
- Add `useSubmitKpi` and `useConfirmKpi` hooks for offchain tracking
- Call offchain submit before or after onchain submission
- Handle offchain confirmation after PO approval

**Step 3: Update KPI approval component**

In the PO KPI approval component:
- Keep existing smart contract approval hooks (DO NOT MODIFY)
- Add `useApproveKpi` and `useRejectKpi` hooks for offchain tracking
- Sync offchain approval with onchain approval

**Step 4: Test KPI flow**

Run: `cd NovaLance && npm run dev`
Expected: KPI submission updates both onchain and offchain
Check: Network tab shows KPI API calls

**Step 5: Commit**

```bash
git add components/contract/MilestoneActions.tsx components/contract/POMilestoneActions.tsx
git commit -m "feat: integrate offchain KPI tracking with onchain operations"
```

---

## Task 8: Update Balance Displays

**Files:**
- Modify: `components/dashboard/FreelancerSection.tsx` (balance display)
- Modify: `components/dashboard/OwnerSection.tsx` (project balances)

**Step 1: Update freelancer balance display**

In FreelancerSection:
- Replace hardcoded/mock balance with `useFreelancerBalance` hook
- Display availableBalance, pendingKpis, approvedKpis

**Step 2: Update PO project balances**

In OwnerSection:
- Replace mock balances with `useProjectBalances` hook
- Display deposited, spent, pending, remaining per project

**Step 3: Test balance displays**

Run: `cd NovaLance && npm run dev`
Expected: Balances load from backend and display correctly
Check: Network tab shows balance API calls

**Step 4: Commit**

```bash
git add components/dashboard/FreelancerSection.tsx components/dashboard/OwnerSection.tsx
git commit -m "feat: replace mock balance data with API calls"
```

---

## Task 9: Update Project Creation Flow

**Files:**
- Modify: `app/PO/create/page.tsx` or similar project creation page

**Step 1: Find project creation page**

Search for project creation components:

Run: `cd NovaLance && grep -r "createProject\|CreateProject" app/ components/ --include="*.tsx" -l`

**Step 2: Update project creation to sync with backend**

Important: Your friend mentioned project creation is already onchain. The flow should be:
1. User fills project form
2. Call smart contract to create project onchain (existing - DO NOT MODIFY)
3. After successful onchain creation, call backend API to store offchain metadata

In the project creation component:
- Keep existing `useCreateProject` hook from wagmi (DO NOT MODIFY)
- Add backend call after successful onchain creation
- Use `useCreateProject` from api-hooks to store metadata
- Link vault address returned by smart contract to backend project

**Step 3: Test project creation sync**

Run: `cd NovaLance && npm run dev`
Expected: Onchain creation followed by backend metadata storage
Check: Network tab shows both contract transaction and API call

**Step 4: Commit**

```bash
git add app/PO/create/page.tsx
git commit -m "feat: sync offchain metadata after onchain project creation"
```

---

## Task 10: Clean Up Mock Data Files

**Files:**
- Modify: `lib/mockData.ts`

**Step 1: Mark mock data as deprecated**

Update `lib/mockData.ts` to add deprecation notice:

```typescript
// DEPRECATED: This file contains mock data for development.
// All data should now come from the backend API.
// Use hooks from lib/api-hooks.ts instead.
// TODO: Remove this file after API integration is complete.
```

**Step 2: Verify no remaining imports**

Search for any remaining mock data imports:

Run: `cd NovaLance && grep -r "from.*mockData" app/ components/ --include="*.tsx" --include="*.ts"`

Expected: No results (all mock data replaced)

**Step 3: Update README or documentation**

If there's a README, note the API integration:

Add a section about the backend API integration.

**Step 4: Final commit**

```bash
git add lib/mockData.ts README.md
git commit -m "docs: mark mock data as deprecated after API integration"
```

---

## Task 11: Backend Adjustments (If Needed)

**Files:**
- Modify: `novalance-be/src/routes/projects.ts`
- Modify: `novalance-be/src/routes/users.ts`

**Step 1: Check for missing data fields**

Compare frontend expectations with backend responses. If frontend expects fields not provided by backend:

1. Add the field to backend response, OR
2. Add field transformation in frontend API client

**Step 2: Add missing endpoints if needed**

If frontend needs endpoints not in backend:
- Notifications endpoints (GET /api/notifications)
- Dashboard summary (GET /api/dashboard/summary)

**Step 3: Update backend**

Run backend modifications.

**Step 4: Deploy backend changes**

Run: `cd novalance-be && git add . && git commit -m "feat: add missing endpoints for frontend integration"`
Then: `vercel --prod` or equivalent deployment command

**Step 5: Test backend changes**

Run: `curl https://novalance-be.vercel.app/api/users/me -H "Authorization: Bearer <test_token>"`
Expected: Correct response with all needed fields

---

## Task 12: Final Testing and Verification

**Files:**
- Test: All modified components and pages

**Step 1: Run full integration test**

Run: `cd NovaLance && npm run build`
Expected: Build succeeds without errors

**Step 2: Test all user flows**

1. **Wallet Connection**: Connect wallet → verify JWT stored
2. **Profile View**: View profile → verify data from backend
3. **Project List**: Browse projects → verify from backend
4. **Application**: Submit application → verify saved to backend
5. **Project Creation**: Create project → verify onchain then offchain
6. **KPI Flow**: Submit/approve KPI → verify both systems updated

**Step 3: Check for remaining issues**

Run: `cd NovaLance && npm run lint`
Expected: No linting errors

**Step 4: Fix any remaining issues**

Address any bugs or integration issues found during testing.

**Step 5: Final commit**

```bash
git add .
git commit -m "fix: resolve final integration issues and clean up"
```

---

## Task 13: Documentation

**Files:**
- Create: `docs/api-integration.md`

**Step 1: Create integration documentation**

Create `docs/api-integration.md` with:
- Overview of frontend-backend architecture
- API endpoint documentation
- How onchain and offchain data sync
- How to add new API calls

**Step 2: Update environment variables documentation**

Update `.env.example` to include new variables:
```
NEXT_PUBLIC_API_URL=https://novalance-be.vercel.app
```

**Step 3: Commit documentation**

```bash
git add docs/api-integration.md .env.example
git commit -m "docs: add API integration documentation"
```

---

## Summary

This plan integrates the NovaLance backend with the frontend by:

1. Creating a clean API client layer with proper TypeScript types
2. Using TanStack React Query for data fetching and caching
3. Replacing mock data incrementally, component by component
4. Preserving all existing smart contract integration
5. Ensuring onchain and offchain data stay in sync

**Key Principles:**
- Smart contract code (lib/contract.ts, lib/hooks.ts) remains untouched
- Offchain metadata flows through backend API
- Onchain operations use existing wagmi hooks
- API calls happen before/after onchain operations to maintain data consistency

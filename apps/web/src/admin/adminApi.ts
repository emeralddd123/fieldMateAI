const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/$/,
  '',
);

export interface AdminUserSite {
  id: string;
  name: string;
  code: string;
  location?: string;
}

export interface AdminUserListItem {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  role: 'technician' | 'supervisor' | 'admin';
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  sites: AdminUserSite[];
  activeSessionCount: number;
}

export interface AdminUsersResponse {
  users: AdminUserListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminInvitation {
  id: string;
  email: string;
  name: string;
  role: 'technician' | 'supervisor' | 'admin';
  siteIds: string[];
  expiresAt: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
}

export interface InviteResult {
  invite: {
    id: string;
    email: string;
    name: string;
    role: 'technician' | 'supervisor' | 'admin';
    siteIds: string[];
    expiresAt: string;
    createdAt: string;
  };
  inviteToken: string;
  inviteUrl: string;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/admin${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AdminApiError(
      body?.error?.message ?? 'The administrative request failed.',
      response.status,
      body?.error?.code,
    );
  }

  return (await response.json()).data;
}

export interface AdminSiteItem {
  id: string;
  name: string;
  code: string;
  location: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  activeAssetCount: number;
  assignedUserCount: number;
  assets?: {
    id: string;
    assetTag: string;
    name: string;
    status: string;
    equipmentType: string;
  }[];
}

export interface AdminComponentItem {
  id?: string;
  componentType: string;
  manufacturer: string;
  model: string;
  identifier?: string | null;
}

export interface AdminAssetItem {
  id: string;
  assetTag: string;
  name: string;
  description: string | null;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string | null;
  location: string;
  status: 'operational' | 'warning' | 'down' | 'maintenance';
  nominalVoltageV: number | null;
  nominalCurrentA: number | null;
  commissionedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  retiredAt: string | null;
  site: {
    id: string;
    name: string;
    code: string;
    location?: string;
  };
  components: AdminComponentItem[];
  incidentCount: number;
  maintenanceRecordCount?: number;
  measurementCount?: number;
}

export interface AdminAssetsResponse {
  assets: AdminAssetItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function fetchAdminSites() {
  return adminRequest<AdminUserSite[]>('/sites');
}

export function fetchAdminSitesList(params?: {
  q?: string;
  includeArchived?: boolean;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.includeArchived) search.set('includeArchived', 'true');
  const query = search.toString();
  return adminRequest<AdminSiteItem[]>(`/sites${query ? `?${query}` : ''}`);
}

export function fetchAdminSite(id: string) {
  return adminRequest<AdminSiteItem>(`/sites/${id}`);
}

export function createAdminSite(data: {
  name: string;
  code: string;
  location: string;
}) {
  return adminRequest<AdminSiteItem>('/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAdminSite(
  id: string,
  data: {
    name?: string;
    code?: string;
    location?: string;
  },
) {
  return adminRequest<AdminSiteItem>(`/sites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function archiveAdminSite(id: string) {
  return adminRequest<{ archived: boolean }>(`/sites/${id}`, {
    method: 'DELETE',
  });
}

export function fetchAdminAssets(params?: {
  q?: string;
  siteId?: string;
  status?: string;
  equipmentType?: string;
  page?: number;
  limit?: number;
  includeArchived?: boolean;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.siteId) search.set('siteId', params.siteId);
  if (params?.status) search.set('status', params.status);
  if (params?.equipmentType) search.set('equipmentType', params.equipmentType);
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.includeArchived) search.set('includeArchived', 'true');
  const query = search.toString();
  return adminRequest<AdminAssetsResponse>(`/assets${query ? `?${query}` : ''}`);
}

export function fetchAdminAsset(id: string) {
  return adminRequest<AdminAssetItem>(`/assets/${id}`);
}

export function createAdminAsset(data: {
  siteId: string;
  assetTag: string;
  name: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  location: string;
  serialNumber?: string;
  description?: string;
  status?: 'operational' | 'warning' | 'down' | 'maintenance';
  nominalVoltageV?: number;
  nominalCurrentA?: number;
  commissionedAt?: string;
  components?: {
    componentType: string;
    manufacturer: string;
    model: string;
    identifier?: string;
  }[];
}) {
  return adminRequest<AdminAssetItem>('/assets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAdminAsset(
  id: string,
  data: {
    siteId?: string;
    assetTag?: string;
    name?: string;
    equipmentType?: string;
    manufacturer?: string;
    model?: string;
    location?: string;
    serialNumber?: string;
    description?: string;
    status?: 'operational' | 'warning' | 'down' | 'maintenance';
    nominalVoltageV?: number;
    nominalCurrentA?: number;
    commissionedAt?: string;
    components?: {
      id?: string;
      componentType: string;
      manufacturer: string;
      model: string;
      identifier?: string;
    }[];
  },
) {
  return adminRequest<AdminAssetItem>(`/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function archiveAdminAsset(id: string) {
  return adminRequest<{ archived: boolean }>(`/assets/${id}`, {
    method: 'DELETE',
  });
}

export function fetchAdminUsers(params?: {
  q?: string;
  role?: string;
  status?: string;
  siteId?: string;
  page?: number;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.role) search.set('role', params.role);
  if (params?.status) search.set('status', params.status);
  if (params?.siteId) search.set('siteId', params.siteId);
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));

  const query = search.toString();
  return adminRequest<AdminUsersResponse>(`/users${query ? `?${query}` : ''}`);
}

export function fetchAdminUser(userId: string) {
  return adminRequest<AdminUserListItem>(`/users/${userId}`);
}

export function updateAdminUser(
  userId: string,
  data: {
    name?: string;
    role?: 'technician' | 'supervisor' | 'admin';
    status?: 'active' | 'disabled';
    siteIds?: string[];
  },
) {
  return adminRequest<AdminUserListItem>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function revokeUserSessions(userId: string) {
  return adminRequest<{ revokedCount: number }>(`/users/${userId}/revoke-sessions`, {
    method: 'POST',
  });
}

export function inviteUser(data: {
  email: string;
  name: string;
  role: 'technician' | 'supervisor' | 'admin';
  siteIds?: string[];
}) {
  return adminRequest<InviteResult>('/invitations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function fetchAdminInvitations() {
  return adminRequest<AdminInvitation[]>('/invitations');
}

export function revokeInvitation(inviteId: string) {
  return adminRequest<{ success: boolean }>(`/invitations/${inviteId}`, {
    method: 'DELETE',
  });
}

export function resendInvitation(inviteId: string) {
  return adminRequest<InviteResult>(`/invitations/${inviteId}/resend`, {
    method: 'POST',
  });
}

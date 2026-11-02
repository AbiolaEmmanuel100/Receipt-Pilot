/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Party {
  name?: string; address?: string; phone?: string; phoneCountry?: string;
  email?: string; website?: string; logo?: string; footer?: string;
}

export interface Receipt {
  id: string;
  number: string;
  date?: string; time?: string; payment?: string; currency?: string; notes?: string;
  template?: string;
  business?: Party; customer?: Party;
  items?: { name: string; qty: number; price: number; total: number }[];
  subtotal?: number; discount?: number; taxPct?: number; tax?: number; shipping?: number;
  grand?: number; paid?: number; balance?: number; status?: string; timezone?: string;
  createdAt?: string; updatedAt?: string; deletedAt?: string | null;
  versions?: { at: string; action: string }[];
  shareToken?: string; userId?: string | null; syncStatus?: string; isDraft?: boolean;
  voided?: boolean; refunded?: boolean;
  [k: string]: any;
}

export interface Business {
  name: string; address: string; phone: string; phoneCountry?: string; email: string; website: string; logo: string;
  prefix: string; footer: string; currency: string; template: string; taxPct: string | number;
  syncStatus?: string; updatedAt?: string;
  [k: string]: any;
}

export interface SessionUser {
  id: string; email: string; businessName: string; lastSignIn: string;
  entitlementChecked?: boolean; entitlementError?: boolean; entitlementLoadedAt?: number;
  trialEndsAt?: string | null; subscriptionStatus?: string; subscriptionExpiresAt?: string | null;
  planCode?: string | null; renewalMode?: string | null;
  deletionRequestedAt?: string | null; purgeAfter?: string | null;
}

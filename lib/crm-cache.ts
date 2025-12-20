/**
 * CRM Cache Layer
 * Uses Supabase to cache MySQL CRM data for faster access
 */

import { supabase } from './supabase';

// Cache TTL: 1 hour (adjust as needed)
const CACHE_TTL_HOURS = 1;

interface CachedEmail {
  id: string;
  crm_message_id: number;
  thread_id: string | null;
  client_id: number | null;
  email_from: string;
  email_to: string | null;
  cc: string | null;
  subject: string | null;
  body: string | null;
  received_on: string | null;
  archived: boolean;
  bounced: boolean;
  out_of_office: boolean;
  cached_at: string;
  updated_at: string;
}

interface CachedCustomer {
  id: string;
  client_id: number;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  phone: string | null;
  mobile: string | null;
  address1: string | null;
  address2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  dob: string | null;
  occupation: string | null;
  marital_status: string | null;
  iva_signing_date: string | null;
  iva_completion_date: string | null;
  total_debt: string | null;
  monthly_payment: string | null;
  arrears: string | null;
  cached_at: string;
  updated_at: string;
}

/**
 * Get emails from cache (only fresh ones within TTL)
 */
export async function getCachedEmails(): Promise<CachedEmail[] | null> {
  if (!supabase) return null;

  try {
    const cutoffTime = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('crm_emails_cache')
      .select('*')
      .gte('cached_at', cutoffTime)
      .order('received_on', { ascending: false });

    if (error) {
      console.error('Error fetching cached emails:', error);
      return null;
    }

    return data as CachedEmail[];
  } catch (error) {
    console.error('Error in getCachedEmails:', error);
    return null;
  }
}

/**
 * Get single email from cache by crm_message_id
 */
export async function getCachedEmailById(crmMessageId: number): Promise<CachedEmail | null> {
  if (!supabase) return null;

  try {
    const cutoffTime = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('crm_emails_cache')
      .select('*')
      .eq('crm_message_id', crmMessageId)
      .gte('cached_at', cutoffTime)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      console.error('Error fetching cached email:', error);
      return null;
    }

    return data as CachedEmail;
  } catch (error) {
    console.error('Error in getCachedEmailById:', error);
    return null;
  }
}

/**
 * Cache emails in Supabase (upsert)
 */
export async function cacheEmails(emails: any[]): Promise<void> {
  if (!supabase || emails.length === 0) return;

  try {
    // Normalize MySQL result field names to cache schema
    const emailsToCache = emails.map((email) => ({
      // Our MySQL query returns `crm_message_id` explicitly
      crm_message_id: email.crm_message_id ?? email.id,
      // Threads are not present in CRM; keep null for now
      thread_id: email.threadid ?? null,
      client_id: email.clientid ?? null,
      // Prefer normalized field names, fall back to alternates
      email_from: email.email_from ?? email.From ?? '',
      email_to: email.mailto ?? email.To ?? null,
      cc: email.CC ?? null,
      subject: email.subject ?? email.Subject ?? null,
      body: email.content ?? email.Body ?? null,
      received_on: email.Received_On ?? null,
      // Some flags may be numeric in CRM (0/1). Normalize to booleans.
      archived: email.archived ? email.archived === 1 || email.archived === true : false,
      bounced: email.bounced ? email.bounced === 1 || email.bounced === true : false,
      out_of_office: email.outofoffice ? email.outofoffice === 1 || email.outofoffice === true : false,
    }));

    // Filter out any rows missing a valid crm_message_id
    const validEmailsToCache = emailsToCache.filter((e) => {
      const idNum = Number(e.crm_message_id);
      return Number.isFinite(idNum) && !Number.isNaN(idNum);
    });

    const { error } = await supabase
      .from('crm_emails_cache')
      .upsert(validEmailsToCache, {
        onConflict: 'crm_message_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Error caching emails:', error);
    } else {
      console.log(`Cached ${validEmailsToCache.length} emails in Supabase`);
    }
  } catch (error) {
    console.error('Error in cacheEmails:', error);
  }
}

/**
 * Cache single email
 */
export async function cacheEmail(email: any): Promise<void> {
  if (!supabase) return;

  try {
    const emailToCache = {
      crm_message_id: email.crm_message_id ?? email.id,
      thread_id: email.threadid ?? null,
      client_id: email.clientid ?? null,
      email_from: email.email_from ?? email.From ?? '',
      email_to: email.mailto ?? email.To ?? null,
      cc: email.CC ?? null,
      subject: email.subject ?? email.Subject ?? null,
      body: email.content ?? email.Body ?? null,
      received_on: email.Received_On ?? null,
      archived: email.archived ? email.archived === 1 || email.archived === true : false,
      bounced: email.bounced ? email.bounced === 1 || email.bounced === true : false,
      out_of_office: email.outofoffice ? email.outofoffice === 1 || email.outofoffice === true : false,
    };

    const { error } = await supabase
      .from('crm_emails_cache')
      .upsert(emailToCache, {
        onConflict: 'crm_message_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Error caching email:', error);
    }
  } catch (error) {
    console.error('Error in cacheEmail:', error);
  }
}

/**
 * Get customer from cache by client_id
 */
export async function getCachedCustomer(clientId: number): Promise<CachedCustomer | null> {
  if (!supabase) return null;

  try {
    const cutoffTime = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('crm_customers_cache')
      .select('*')
      .eq('client_id', clientId)
      .gte('cached_at', cutoffTime)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching cached customer:', error);
      return null;
    }

    return data as CachedCustomer;
  } catch (error) {
    console.error('Error in getCachedCustomer:', error);
    return null;
  }
}

/**
 * Get customer from cache by email
 */
export async function getCachedCustomerByEmail(email: string): Promise<CachedCustomer | null> {
  if (!supabase) return null;

  try {
    const cutoffTime = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('crm_customers_cache')
      .select('*')
      .eq('email', email)
      .gte('cached_at', cutoffTime)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching cached customer by email:', error);
      return null;
    }

    return data as CachedCustomer;
  } catch (error) {
    console.error('Error in getCachedCustomerByEmail:', error);
    return null;
  }
}

/**
 * Cache customer data
 */
export async function cacheCustomer(customerData: any): Promise<void> {
  if (!supabase || !customerData) return;

  try {
    const customerToCache = {
      client_id: customerData.id,
      email: customerData.Email,
      firstname: customerData.Firstname,
      lastname: customerData.Lastname,
      phone: customerData.Phone,
      mobile: customerData.Mobile,
      address1: customerData.Address1,
      address2: customerData.Address2,
      town: customerData.Town,
      county: customerData.County,
      postcode: customerData.Postcode,
      dob: customerData.DOB,
      occupation: customerData.Occupation,
      marital_status: customerData.MaritalStatus,
      iva_signing_date: customerData.SigningDate,
      iva_completion_date: customerData.CompletionDate,
      total_debt: customerData.TotalDebt,
      monthly_payment: customerData.MonthlyPayment,
      arrears: customerData.Arrears,
    };

    const { error } = await supabase
      .from('crm_customers_cache')
      .upsert(customerToCache, {
        onConflict: 'client_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Error caching customer:', error);
    }
  } catch (error) {
    console.error('Error in cacheCustomer:', error);
  }
}

/**
 * Clear old cache entries (run periodically)
 */
export async function cleanupOldCache(): Promise<void> {
  if (!supabase) return;

  try {
    const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Delete old emails
    const { error: emailError } = await supabase
      .from('crm_emails_cache')
      .delete()
      .lt('cached_at', cutoffTime);

    if (emailError) {
      console.error('Error cleaning up old email cache:', emailError);
    }

    // Delete old customers
    const { error: customerError } = await supabase
      .from('crm_customers_cache')
      .delete()
      .lt('cached_at', cutoffTime);

    if (customerError) {
      console.error('Error cleaning up old customer cache:', customerError);
    }

    console.log('Cache cleanup completed');
  } catch (error) {
    console.error('Error in cleanupOldCache:', error);
  }
}

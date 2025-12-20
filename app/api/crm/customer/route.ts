import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getMySQLConnection } from '@/lib/mysql';
import { getCachedCustomer, getCachedCustomerByEmail, cacheCustomer } from '@/lib/crm-cache';

export async function GET(request: NextRequest) {
  try {
    // Validate session
    const sessionToken = request.cookies.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const clientId = searchParams.get('clientId');
    const email = searchParams.get('email');
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (!clientId && !email) {
      return NextResponse.json(
        { error: 'Either clientId or email is required' },
        { status: 400 }
      );
    }

    let customer: any = null;
    let fromCache = false;

    // Try cache first (unless forced refresh)
    if (!forceRefresh) {
      if (clientId) {
        const cached = await getCachedCustomer(parseInt(clientId));
        if (cached) {
          console.log(`Retrieved customer ${clientId} from cache`);
          customer = {
            id: cached.client_id,
            Firstname: cached.firstname,
            LastName: cached.lastname,
            Email: cached.email,
            Phone: cached.phone,
            Mobile: cached.mobile,
            Address1: cached.address1,
            Address2: cached.address2,
            Town: cached.town,
            County: cached.county,
            Postcode: cached.postcode,
            DateofBirth: cached.dob,
            Occupation: cached.occupation,
            MaritalStatus: cached.marital_status,
            iva_signing_date: cached.iva_signing_date,
            iva_completion_date: cached.iva_completion_date,
            unsecured_debt: cached.total_debt,
            monthly_payment: cached.monthly_payment,
            arrears_balance: cached.arrears,
          };
          fromCache = true;
        }
      } else if (email) {
        const cached = await getCachedCustomerByEmail(email);
        if (cached) {
          console.log(`Retrieved customer by email ${email} from cache`);
          customer = {
            id: cached.client_id,
            Firstname: cached.firstname,
            LastName: cached.lastname,
            Email: cached.email,
            Phone: cached.phone,
            Mobile: cached.mobile,
            Address1: cached.address1,
            Address2: cached.address2,
            Town: cached.town,
            County: cached.county,
            Postcode: cached.postcode,
            DateofBirth: cached.dob,
            Occupation: cached.occupation,
            MaritalStatus: cached.marital_status,
            iva_signing_date: cached.iva_signing_date,
            iva_completion_date: cached.iva_completion_date,
            unsecured_debt: cached.total_debt,
            monthly_payment: cached.monthly_payment,
            arrears_balance: cached.arrears,
          };
          fromCache = true;
        }
      }
    }

    // Cache miss or forced refresh - fetch from MySQL
    if (!customer || forceRefresh) {
      try {
        console.log('Fetching customer from MySQL...');
        const connection = getMySQLConnection();

      // Select only safe, universally present columns to avoid unknown-column errors.
      // We'll include address/phone details later once exact column names are confirmed.
      let query = `
        SELECT 
          c.id,
          c.Firstname,
          c.LastName,
          c.Email,
          ic.*
        FROM theinsolvencygroup.client c
        LEFT JOIN theinsolvencygroup.iva_client ic ON ic.clientid = c.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (clientId) {
        query += ' AND c.id = ?';
        params.push(parseInt(clientId));
      } else if (email) {
        query += ' AND c.Email = ?';
        params.push(email);
      }

      query += ' LIMIT 1';

      const [rows] = await connection.query<any[]>(query, params);

      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      customer = rows[0];

      // Normalize IVA field names so UI does not break across schema variants
      const normalized = {
        ...customer,
        iva_signing_date: customer.iva_signing_date ?? customer.signing_date ?? null,
        iva_completion_date: customer.iva_completion_date ?? customer.completion_date ?? customer.completed_date ?? null,
        unsecured_debt: customer.unsecured_debt ?? null,
        monthly_payment: customer.monthly_payment ?? null,
        arrears_balance: customer.arrears_balance ?? customer.arrears ?? null,
      };
      customer = normalized;

      // Cache in background
      cacheCustomer({
        id: customer.id,
        Email: customer.Email,
        Firstname: customer.Firstname,
        Lastname: customer.LastName,
        Phone: customer.Phone,
        Mobile: customer.Mobile,
        Address1: customer.Address1,
        Address2: customer.Address2,
        Town: customer.Town,
        County: customer.County,
        Postcode: customer.Postcode,
        DOB: customer.DateofBirth,
        Occupation: customer.Occupation,
        MaritalStatus: customer.MaritalStatus,
        SigningDate: normalized.iva_signing_date,
        CompletionDate: normalized.iva_completion_date,
        TotalDebt: normalized.unsecured_debt,
        MonthlyPayment: normalized.monthly_payment,
        Arrears: normalized.arrears_balance,
      }).catch((err) => {
        console.error('Background cache error:', err);
      });
      } catch (mysqlError) {
        console.error('MySQL fetch failed:', mysqlError);
        // If we already have a cached customer (from initial check), return it
        if (customer) {
          console.log('Returning cached customer due to MySQL error');
          return NextResponse.json({ customer, fromCache: true });
        }
        // Otherwise return error
        return NextResponse.json(
          { error: 'Customer not found and MySQL unavailable' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ customer, fromCache });
  } catch (error: any) {
    console.error('Error fetching CRM customer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer', details: error.message },
      { status: 500 }
    );
  }
}

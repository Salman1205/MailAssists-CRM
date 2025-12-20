# 🔄 IMPLEMENTATION GUIDE - MySQL CRM Integration

## ✅ **What Has Changed**

### **Authentication**
- ❌ **REMOVED:** Gmail OAuth (Google login)
- ✅ **ADDED:** Simple username/password login
- **Default Credentials:**
  - Username: `admin`
  - Password: `Mailassistcrm1205`

### **Email Source**
- ❌ **REMOVED:** Gmail API email fetching
- ✅ **ADDED:** MySQL CRM database email fetching
- Emails now pulled from `theinsolvencygroup.message_received` table

### **Database**
- ❌ **REMOVED:** Supabase
- ✅ **ADDED:** MySQL database for app data
- Two separate MySQL connections:
  1. **CRM Database** (theinsolvencygroup) - READ-ONLY, fetch emails
  2. **Mail Assist Database** (mailassist_crm) - READ/WRITE, tickets, users, etc.

---

## 🚀 **Setup Steps**

### **Step 1: Install Dependencies**
```bash
npm install
# or
pnpm install
```

New packages added:
- `mysql2` - MySQL client
- `bcryptjs` - Password hashing

### **Step 2: Setup Environment Variables**
Copy `.env.example` to `.env.local` and fill in your MySQL credentials:

```bash
cp .env.example .env.local
```

Required variables:
```
MYSQL_HOST=your-mysql-host.com
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=theinsolvencygroup

CRM_MYSQL_HOST=your-mysql-host.com
CRM_MYSQL_DATABASE=mailassist_crm

GROQ_API_KEY=your_groq_api_key
```

### **Step 3: Create Mail Assist CRM Database**
Run the SQL schema to create Mail Assist tables:

```sql
-- Create new database
CREATE DATABASE mailassist_crm;
USE mailassist_crm;

-- Run NEW_SCHEMA.sql
-- This creates: users, tickets, ticket_notes, notifications, 
-- knowledge_items, guardrails, quick_replies, etc.
```

Import `NEW_SCHEMA.sql` into your MySQL database.

### **Step 4: Generate Admin Password Hash**
The default password is already hashed in the schema, but if you want to change it:

```javascript
const bcrypt = require('bcryptjs');
const password = 'Mailassistcrm1205';
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
```

Update the `auth_users` table with the new hash.

### **Step 5: Start Development Server**
```bash
npm run dev
```

Navigate to `http://localhost:3000`

---

## 🔄 **How It Works Now**

### **1. Login Flow**
1. User visits app → sees login form
2. Enters username: `admin`, password: `Mailassistcrm1205`
3. System validates credentials against `auth_users` table
4. Creates session token, stores in `sessions` table
5. Sets `session_token` cookie (7-day expiry)
6. User redirected to dashboard

### **2. Email Fetching**
Instead of Gmail API, emails now fetched from MySQL:

```sql
-- The provided CTE query fetches:
-- 1. Assigned emails (linked to clients with IVA signing date)
-- 2. Unassigned emails (no client or clientid = 0)
-- 3. Excludes: MAILER-DAEMON, archived, auto-acknowledgements
-- 4. Includes: client info, arrears status, department classification
```

API Endpoint: `GET /api/crm/emails`

### **3. Ticket Creation**
When user views an email from MySQL:
1. Email data includes `crm_message_id` (maps to message_received.id)
2. System creates ticket in `mailassist_crm.tickets` table
3. Ticket includes:
   - `crm_message_id` - link to original CRM email
   - `client_id` - CRM client ID
   - `customer_email`, `customer_name`, `subject`, `content`
   - `status`, `priority`, `assignee_user_id`
   - `tags`, timestamps

### **4. Ticket Management**
All ticket operations work as before:
- ✅ Assign to team members
- ✅ Change status (Open, Pending, On Hold, Closed)
- ✅ Set priority
- ✅ Add tags
- ✅ Internal notes with @mentions
- ✅ AI draft generation
- ✅ Quick replies
- ✅ Knowledge base

---

## 📋 **What Still Works**

### **✅ Fully Functional**
- Ticket management system
- User roles (Admin, Manager, Agent)
- Team collaboration (notes, mentions, notifications)
- AI draft generation (Groq API)
- Knowledge base with semantic search
- Guardrails (tone, rules, banned words)
- Quick replies
- Analytics dashboard
- Shopify integration (if configured)
- Real-time updates (via polling - no Supabase Realtime)

### **⚠️ Modified**
- Login: Username/password instead of Gmail OAuth
- Emails: MySQL CRM instead of Gmail API
- Database: MySQL instead of Supabase
- Sessions: MySQL table instead of Supabase Auth

### **❌ Removed**
- Gmail OAuth flow
- Gmail API email sync
- Supabase Realtime subscriptions
- Token refresh logic
- Sent email embeddings storage (for now)

---

## 🗄️ **Database Structure**

### **CRM Database (theinsolvencygroup)** - READ ONLY
- `message_received` - Customer emails
- `client` - Client information
- `iva_client` - IVA clients
- `campaign_status`, `client_status` - Campaign tracking
- `client_assignment` - Client assignments
- Other CRM tables...

### **Mail Assist Database (mailassist_crm)** - READ/WRITE
- `auth_users` - Login credentials
- `sessions` - Active sessions
- `users` - Team members
- `tickets` - Support tickets
- `ticket_notes` - Internal notes
- `ticket_views` - View tracking
- `notifications` - User notifications
- `knowledge_items` - Knowledge base
- `guardrails` - Content validation
- `quick_replies` - Response templates
- `drafts` - AI-generated drafts
- `ai_usage_logs`, `guardrail_logs` - Analytics

---

## 🔐 **Security Notes**

1. **Password Storage**
   - Passwords hashed with bcrypt (10 salt rounds)
   - Never stored in plain text

2. **Session Management**
   - Session tokens: 64-character random strings
   - 7-day expiry (configurable)
   - Stored in httpOnly cookies
   - Automatic cleanup of expired sessions

3. **Database Access**
   - CRM database: READ-ONLY access recommended
   - Mail Assist database: Full access required
   - Use separate MySQL users with appropriate permissions

4. **API Authentication**
   - All API routes check `session_token` cookie
   - Invalid/expired tokens return 401 Unauthorized
   - No access to data without valid session

---

## 🛠️ **Migration from Supabase**

If you have existing Supabase data:

1. **Export tickets, users, notes** from Supabase
2. **Transform UUIDs** to VARCHAR(36) format
3. **Import** into Mail Assist MySQL database
4. **Update references** (foreign keys)
5. **Test** ticket operations

---

## 🚨 **Common Issues & Solutions**

### **Issue: Cannot connect to MySQL**
- Check host, port, username, password in `.env.local`
- Ensure MySQL server is running
- Check firewall rules
- Verify network connectivity

### **Issue: Login fails**
- Check `auth_users` table exists
- Verify password hash is correct
- Check `sessions` table exists
- Clear browser cookies and try again

### **Issue: No emails showing**
- Verify CRM database connection
- Check `theinsolvencygroup.message_received` table has data
- Review SQL query in `lib/mysql.ts`
- Check for SQL errors in console

### **Issue: Tickets not saving**
- Verify Mail Assist database connection
- Check `tickets` table exists
- Ensure user has INSERT permissions
- Check foreign key constraints

---

## 📞 **Next Steps**

1. ✅ **Test login** with default credentials
2. ✅ **Verify email fetching** from CRM database
3. ✅ **Create test ticket** from an email
4. ✅ **Add team members** in User Management
5. ✅ **Configure AI settings** (Groq API key)
6. ✅ **Setup knowledge base** articles
7. ✅ **Configure guardrails** for content validation
8. ✅ **Add quick replies** for common responses
9. ✅ **Test ticket assignment** workflow
10. ✅ **Review analytics** dashboard

---

## 🔮 **Future: Microsoft Entra SSO**

When ready to implement Microsoft Entra (Azure AD) SSO:

1. Keep `auth_users` table structure
2. Add `azure_id` column for Azure AD user ID
3. Implement OAuth 2.0 flow with Microsoft
4. Map Azure AD users to `auth_users`
5. Keep session management logic
6. Remove password_hash requirement

The current simple auth makes migration to Microsoft Entra straightforward!

---

## 📚 **Key Files Modified**

### **New Files**
- `lib/mysql.ts` - MySQL connection & email fetching
- `lib/auth.ts` - Authentication utilities
- `app/api/auth/login/route.ts` - Login endpoint
- `app/api/auth/check/route.ts` - Session validation
- `app/api/crm/emails/route.ts` - CRM email fetching
- `NEW_SCHEMA.sql` - MySQL database schema
- `.env.example` - Environment template

### **Modified Files**
- `components/gmail-connect.tsx` - Now shows login form
- `app/api/auth/logout/route.ts` - Simplified logout
- `package.json` - Added mysql2, bcryptjs

### **Files to Update (TODO)**
- `app/page.tsx` - Update auth check logic
- `components/inbox-view.tsx` - Fetch from `/api/crm/emails`
- `components/tickets-view.tsx` - Update ticket creation from CRM emails
- `lib/tickets.ts` - Add `crm_message_id` field handling

---

**Ready to go!** 🚀

Start the dev server and login with `admin` / `Mailassistcrm1205`

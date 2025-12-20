# Making MySQL Work on Vercel

## Current Issue
Your MySQL database is behind SonicWall VPN, so Vercel can't access it directly.

## Solution Options

### Option 1: Whitelist Vercel IPs in AWS RDS Security Group (Recommended)

1. **Get Vercel's IP ranges** (they use AWS us-east-1):
   - Visit: https://vercel.com/docs/concepts/edge-network/overview
   - Or use these common ranges:
     - `76.76.21.0/24`
     - `76.76.21.241/32`

2. **Update RDS Security Group**:
   - Go to AWS Console → RDS → Your Database → Security Groups
   - Add inbound rule:
     - Type: MySQL/Aurora
     - Port: 3306
     - Source: Vercel IP ranges
   
3. **Keep Vercel Environment Variables**:
   ```
   MYSQL_HOST=tig-replica.cog0zw4r8vmr.eu-west-1.rds.amazonaws.com
   MYSQL_PORT=3306
   MYSQL_USER=hubsolv
   MYSQL_PASSWORD=Da0zw2TrGEw22aYFxDhb
   MYSQL_DATABASE=theinsolvencygroup
   ```

### Option 2: Remove VERCEL Environment Detection (Simple)

If your RDS security group already allows public access, just remove the Vercel detection:

**Modify `lib/mysql.ts`** - change:
```typescript
function isMySQLEnabled(): boolean {
  // Disable MySQL on Vercel or if MYSQL_HOST is not set
  if (process.env.VERCEL || !process.env.MYSQL_HOST) {
    return false;
  }
  return true;
}
```

To:
```typescript
function isMySQLEnabled(): boolean {
  // Only disable if MYSQL_HOST is not set
  if (!process.env.MYSQL_HOST) {
    return false;
  }
  return true;
}
```

### Option 3: Set up Supabase Edge Function Proxy (Advanced)

Create a Supabase Edge Function that runs with VPN access and proxies MySQL queries.

### Option 4: Use Connection Pooler (Best for Production)

Set up PgBouncer or ProxySQL in the same VPC as your RDS instance.

## Recommended Approach

**For Development/Testing:**
- Use Option 2 (remove VERCEL detection) if RDS allows external connections

**For Production:**
- Use Option 1 (whitelist Vercel IPs) for security
- Consider adding read replica or connection pooler for performance

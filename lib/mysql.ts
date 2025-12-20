/**
 * MySQL Database Connection
 * Connects to external CRM MySQL database
 * 
 * Note: MySQL requires VPN (SonicWall NetExtender) and only works locally.
 * On Vercel, this will be skipped and Supabase cache will be used instead.
 */

import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

// Check if MySQL should be enabled
function isMySQLEnabled(): boolean {
  // Only disable if MYSQL_HOST is not set
  // MySQL will work on Vercel if RDS security group allows Vercel's IP ranges
  if (!process.env.MYSQL_HOST) {
    return false;
  }
  return true;
}

export function getMySQLConnection(): mysql.Pool {
  if (!isMySQLEnabled()) {
    throw new Error('MySQL is disabled in this environment. Using Supabase cache instead.');
  }
  
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'theinsolvencygroup',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000, // 10 seconds timeout
      acquireTimeout: 10000, // 10 seconds to acquire connection
      timeout: 10000, // 10 seconds query timeout
    });
  }
  return pool;
}

export async function testMySQLConnection(): Promise<boolean> {
  try {
    if (!isMySQLEnabled()) {
      console.log('MySQL is disabled (MYSQL_HOST not set)');
      return false;
    }
    const connection = getMySQLConnection();
    await connection.query('SELECT 1');
    console.log('MySQL connection successful');
    return true;
  } catch (error) {
    console.error('MySQL connection failed:', error);
    return false;
  }
}

/**
 * Fetch unassigned emails from CRM database
 * Uses the provided SQL query to get emails from message_received table
 */
export interface CRMEmail {
  clientid: number | null;
  Client: string;
  email_from: string;
  mailto: string;
  subject: string;
  content: string;
  Received_On: Date;
  Arrears_Status: string;
  AssignedTo: string;
  Type: string | null;
  Assignment: string;
  Department: string | null;
  crm_message_id?: number;
}

export async function fetchUnassignedEmails(): Promise<CRMEmail[]> {
  if (!isMySQLEnabled()) {
    throw new Error('MySQL is not available in this environment. Please use Supabase cache.');
  }
  
  try {
    const connection = getMySQLConnection();
    
    const query = `
      SELECT 
        mr.id as crm_message_id,
        mr.clientid, 
        '-' AS Client, 
        SUBSTRING_INDEX(IFNULL(mr.email_from, ' '), ':', -1) AS email_from, 
        SUBSTRING_INDEX(IFNULL(mr.mailbox_username, ' '), '@', 1) AS mailto, 
        IFNULL(mr.subject, ' ') AS subject, 
        IFNULL(mr.content, ' ') AS content,
        CONVERT_TZ(FROM_UNIXTIME(mr.received_on), 'UTC', 'Europe/London') AS Received_On,
        ' ' AS Arrears_Status,
        '-' AS AssignedTo,
        mr.Type,
        'Unassigned' AS Assignment,
        CASE 
          WHEN LOWER(mr.subject) LIKE '%complaining%' OR LOWER(mr.subject) LIKE '%complaint%' OR LOWER(mr.subject) LIKE '%Dissatisfied%' OR
               LOWER(mr.content) LIKE '%complaining%' OR LOWER(mr.content) LIKE '%complaint%' OR LOWER(mr.content) LIKE '%Dissatisfied%'
          THEN 'Complaints'
          ELSE NULL 
        END AS Department
      FROM theinsolvencygroup.message_received mr
      WHERE mr.archived = 0
        AND (mr.clientid IS NULL OR mr.clientid = 0)
        AND (mr.email_from <> 'MAILER-DAEMON@eu-west-1.amazonses.com:MAILER-DAEMON@eu-west-1.amazonses.com' OR mr.email_from IS NULL)   
        AND (mr.subject NOT LIKE 'Auto%' AND mr.subject NOT LIKE '%Auto%' AND mr.subject NOT LIKE '%Acknowledgement%' AND mr.subject NOT LIKE 'Acknowledgement%' OR mr.subject IS NULL)
      ORDER BY Received_On DESC
    `;

    const [rows] = await connection.query<any[]>(query);
    return rows as CRMEmail[];
  } catch (error) {
    console.error('Error fetching unassigned emails from MySQL:', error);
    throw error;
  }
}

/**
 * Fetch single email by CRM message ID
 */
export async function fetchEmailById(messageId: number): Promise<CRMEmail | null> {
  try {
    const connection = getMySQLConnection();
    
    const query = `
      SELECT 
        mr.id as crm_message_id,
        mr.clientid, 
        CONCAT(IFNULL(c.Firstname, ''), ' ', IFNULL(c.LastName, '')) AS Client, 
        SUBSTRING_INDEX(IFNULL(mr.email_from, ' '), ':', -1) AS email_from, 
        SUBSTRING_INDEX(IFNULL(mr.mailbox_username, ' '), '@', 1) AS mailto, 
        IFNULL(mr.subject, ' ') AS subject, 
        IFNULL(mr.content, ' ') AS content,
        CONVERT_TZ(FROM_UNIXTIME(mr.received_on), 'UTC', 'Europe/London') AS Received_On,
        mr.Type,
        'Assigned to Client' AS Assignment
      FROM theinsolvencygroup.message_received mr
      LEFT JOIN theinsolvencygroup.client c ON c.id = mr.clientid
      WHERE mr.id = ?
      LIMIT 1
    `;

    const [rows] = await connection.query<any[]>(query, [messageId]);
    return rows.length > 0 ? (rows[0] as CRMEmail) : null;
  } catch (error) {
    console.error('Error fetching email by ID from MySQL:', error);
    return null;
  }
}

/**
 * Mark email as archived in CRM database
 * This should be called when a ticket is closed or email is processed
 */
export async function archiveEmailInCRM(messageId: number): Promise<boolean> {
  try {
    const connection = getMySQLConnection();
    
    const query = `
      UPDATE theinsolvencygroup.message_received 
      SET archived = 1 
      WHERE id = ?
    `;

    await connection.query(query, [messageId]);
    return true;
  } catch (error) {
    console.error('Error archiving email in CRM:', error);
    return false;
  }
}

export default getMySQLConnection;

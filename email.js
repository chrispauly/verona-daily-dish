import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Connects to the configured IMAP mailbox, retrieves emails from either capauly@uwalumni.com
 * or info@pellitteri.com received in the last 7 days, and filters them based on their age
 * to support repeating emails in briefings.
 */
export async function fetchImportantEmails() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!host || !user || !pass) {
    console.log("Email monitoring is disabled (IMAP_HOST, IMAP_USER, or IMAP_PASSWORD is not set in .env).");
    return [];
  }

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: { user, pass },
    logger: false
  });

  const targetSenders = ['capauly@uwalumni.com', 'info@pellitteri.com'];
  const emails = [];
  
  // Only query emails from the last 7 days to keep it efficient
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    
    try {
      console.log(`Checking mailbox for emails from [${targetSenders.join(', ')}] since ${sevenDaysAgo.toLocaleDateString()}...`);
      
      const fetchIterator = client.fetch({
        or: targetSenders.map(sender => ({ from: sender })),
        since: sevenDaysAgo
      }, {
        source: true,
        envelope: true
      });

      for await (const message of fetchIterator) {
        const date = message.envelope.date ? new Date(message.envelope.date) : now;
        
        // Calculate age in days
        const ageMs = now.getTime() - date.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        // Define repeat rules:
        // 1. Day 1 (0-24h): repeat in every briefing (ageDays <= 1)
        // 2. Days 2-7: repeat every other day (odd dayIndexes are skipped, even dayIndexes are kept)
        // 3. Day 8+ (>7 days old) -> Skip entirely
        
        let keep = false;
        if (ageDays <= 1) {
          keep = true; // Day 1: keep always
        } else if (ageDays <= 7) {
          const dayIndex = Math.floor(ageDays);
          if (dayIndex % 2 === 0) {
            keep = true; // Days 3, 5, 7: keep
          }
        }

        if (keep) {
          const parsed = await simpleParser(message.source);
          const subject = message.envelope.subject || '(No Subject)';
          const bodyText = parsed.text ? parsed.text.trim() : '';
          const fromAddress = message.envelope.from?.[0]?.address || 'Unknown Sender';

          console.log(`Including email from ${fromAddress} in briefing: "${subject}" (Age: ${ageDays.toFixed(1)} days)`);
          
          emails.push({
            subject,
            text: bodyText,
            from: fromAddress,
            date: date.toLocaleDateString()
          });
        } else {
          console.log(`Skipping email: "${message.envelope.subject || '(No Subject)'}" due to age rules (Age: ${ageDays.toFixed(1)} days)`);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error("Error fetching emails from mailbox:", error.message);
  }

  return emails;
}

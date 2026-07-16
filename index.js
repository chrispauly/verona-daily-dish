import fs from 'fs/promises';
import path from 'path';
import { fetchWeather } from './weather.js';
import { fetchRSSFeeds, fetchPoliceRecap } from './rss.js';
import { fetchCulversDetails } from './culvers.js';
import { fetchImportantEmails } from './email.js';
import { fetchISSFlyover } from './iss.js';
import { generateBriefingScript } from './gemini.js';

async function main() {
  console.log('--- Starting Verona Daily Briefing Pipeline ---');

  // 1. Gather Weather Data
  console.log('Fetching weather for Verona, WI...');
  const weatherResult = await fetchWeather();
  console.log(`Weather: ${weatherResult.text}`);

  // 2. Gather RSS Feeds (City News & Alerts)
  console.log('Fetching city RSS feeds and article details...');
  const rssItems = await fetchRSSFeeds();
  console.log(`Parsed ${rssItems.length} news/alert items with full text content.`);

  // 3. Gather Police Department Recap
  console.log('Fetching Police Department recap...');
  const policeRecap = await fetchPoliceRecap();
  if (policeRecap) {
    console.log(`Successfully fetched Police Department recap: "${policeRecap.title}" (${policeRecap.fullContent.length} chars).`);
  } else {
    console.log('No Police Department recap fetched.');
  }

  // 4. Fetch Culver's Details (Flavors and Hours)
  console.log("Fetching Culver's details...");
  const culversResult = await fetchCulversDetails();
  console.log(`Culver's: Today is ${culversResult.todayFlavor}, Tomorrow is ${culversResult.tomorrowFlavor}, Status: ${culversResult.statusText}, Closing Soon: ${culversResult.closingSoon}`);

  // 5. Gather Inbound Important Emails
  console.log("Checking mailbox for updates...");
  const emails = await fetchImportantEmails();
  console.log(`Found ${emails.length} new important emails.`);

  // 6. Fetch ISS Flyover Predictions
  console.log("Fetching ISS flyover predictions...");
  const issResult = await fetchISSFlyover();
  console.log(`ISS: ${issResult.text}`);

  // 7. Generate Script with Gemini
  console.log('Generating briefing script with Gemini...');
  const scriptText = await generateBriefingScript({
    weather: weatherResult,
    rssItems,
    policeRecap,
    culvers: culversResult,
    emails,
    iss: issResult
  });

  console.log('\n--- Generated Script ---');
  console.log(scriptText);
  console.log('------------------------\n');

  // 8. Format for Alexa Flash Briefing Feed
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // e.g. "2026-07-16"
  
  const alexaFeed = [
    {
      uid: `verona-briefing-${dateStr}`,
      updateDate: now.toISOString(),
      titleText: "Verona Daily Dish",
      mainText: scriptText,
      redirectionUrl: "https://veronawi.gov/"
    }
  ];

  const outputPath = path.resolve('verona-briefing.json');
  await fs.writeFile(outputPath, JSON.stringify(alexaFeed, null, 2), 'utf-8');

  console.log(`Successfully wrote Alexa briefing JSON to: ${outputPath}`);
  console.log('--- Pipeline Complete ---');
}

main().catch(error => {
  console.error('Pipeline crashed:', error);
  process.exit(1);
});

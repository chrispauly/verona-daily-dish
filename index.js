import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { fetchWeather } from './weather.js';
import { fetchRSSFeeds, fetchPoliceRecap } from './rss.js';
import { fetchUpcomingEvents } from './events.js';
import { fetchCulversDetails } from './culvers.js';
import { fetchImportantEmails } from './email.js';
import { fetchISSFlyover } from './iss.js';
import { generateBriefingScript } from './gemini.js';

/**
 * Enforces the character limit on an Alexa feed item.
 * Shortens it to end at the nearest sentence that falls under the limit.
 */
function enforceCharacterLimit(text, limit = 4500) {
  if (!text || text.length <= limit) return text;
  
  // Truncate to limit first
  const truncatedStr = text.substring(0, limit);
  // Find the last sentence end (., !, ?) before the limit
  const lastSentenceEnd = Math.max(
    truncatedStr.lastIndexOf('.'),
    truncatedStr.lastIndexOf('!'),
    truncatedStr.lastIndexOf('?')
  );

  if (lastSentenceEnd > 0) {
    return truncatedStr.substring(0, lastSentenceEnd + 1).trim();
  }
  
  return truncatedStr.trim(); // Fallback if no sentence end found
}

async function main() {
  const cityName = process.env.CITY_NAME || 'Verona';
  const cityState = `${cityName}, ${process.env.STATE_NAME || 'WI'}`;
  console.log(`--- Starting ${cityName} Daily Briefing Pipeline ---`);

  // 1. Gather Weather Data
  console.log(`Fetching weather for ${cityState}...`);
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

  // 4. Fetch Upcoming Events
  console.log('Fetching upcoming local events...');
  const eventsResult = await fetchUpcomingEvents();
  console.log(`Fetched ${eventsResult.length} upcoming events.`);

  // 5. Fetch Culver's Details (Flavors and Hours)
  console.log("Fetching Culver's details...");
  const culversResult = await fetchCulversDetails();
  console.log(`Culver's: Today is ${culversResult.todayFlavor}, Tomorrow is ${culversResult.tomorrowFlavor}, Status: ${culversResult.statusText}, Closing Soon: ${culversResult.closingSoon}`);

  // 6. Gather Inbound Important Emails
  console.log("Checking mailbox for updates...");
  const emails = await fetchImportantEmails();
  console.log(`Found ${emails.length} new important emails.`);

  // 7. Fetch ISS Flyover Predictions
  console.log("Fetching ISS flyover predictions...");
  const issResult = await fetchISSFlyover();
  console.log(`ISS: ${issResult.text}`);

  // 8. Generate Script with Gemini (returns three tones)
  console.log('Generating multi-tone briefing script with Gemini...');
  const toneScripts = await generateBriefingScript({
    weather: weatherResult,
    rssItems,
    policeRecap,
    culvers: culversResult,
    emails,
    iss: issResult,
    events: eventsResult
  });

  console.log('\n--- Generated Briefing Scripts (Tones) ---');
  console.log(JSON.stringify(toneScripts, null, 2));
  console.log('------------------------------------------\n');

  const cityKey = cityName.toLowerCase().replace(/\s+/g, '-');
  const cityUrl = process.env.CITY_URL || 'https://veronawi.gov/';
  const eventsUrl = process.env.EVENTS_MAIN_URL || 'https://www.visitveronawi.com/events/?bounds=false&view=list&sort=date';
  const culversUrl = process.env.CULVERS_URL || 'https://www.culvers.com/restaurants/verona';

  // 9. Format and write the three different briefing feeds
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // e.g. "2026-07-16"

  const tones = [
    { name: 'quick', data: toneScripts.quick, filename: `${cityKey}-briefing-quick.json` },
    { name: 'entertainment', data: toneScripts.entertainment, filename: `${cityKey}-briefing-entertainment.json` },
    { name: 'balanced', data: toneScripts.balanced, filename: `${cityKey}-briefing-balanced.json` }
  ];

  const categories = [
    { key: 'weather', title: `${cityName} Weather`, fallbackRedir: cityUrl },
    { key: 'news', title: `${cityName} City News`, fallbackRedir: cityUrl },
    { key: 'events', title: `${cityName} Upcoming Events`, fallbackRedir: eventsUrl },
    { key: 'police', title: `${cityName} Police Report`, fallbackRedir: cityUrl },
    { key: 'culvers', title: `${cityName} Culver's Update`, fallbackRedir: culversUrl }
  ];

  for (const tone of tones) {
    const toneData = tone.data || {};
    
    // Format 5 update items in this feed
    const feedItems = categories.map(cat => {
      const rawText = toneData[cat.key] || '';
      const cleanText = enforceCharacterLimit(rawText);
      return {
        uid: `${cityKey}-${tone.name}-${cat.key}-${dateStr}`,
        updateDate: now.toISOString(),
        titleText: cat.title,
        mainText: cleanText,
        redirectionUrl: cat.fallbackRedir,
        generatorModel: toneScripts.usedModel || 'Local Fallback Template'
      };
    });

    const outputPath = path.resolve(tone.filename);
    await fs.writeFile(outputPath, JSON.stringify(feedItems, null, 2), 'utf-8');
    console.log(`Successfully wrote ${tone.name} briefing JSON to: ${outputPath}`);

    // If this is the balanced feed, copy it to ${cityKey}-briefing.json for backwards compatibility
    if (tone.name === 'balanced') {
      const defaultOutputPath = path.resolve(`${cityKey}-briefing.json`);
      await fs.writeFile(defaultOutputPath, JSON.stringify(feedItems, null, 2), 'utf-8');
      console.log(`Copied balanced feed to default path: ${defaultOutputPath}`);
    }
  }

  console.log('--- Pipeline Complete ---');
}

main().catch(error => {
  console.error('Pipeline crashed:', error);
  process.exit(1);
});

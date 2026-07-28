import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { fetchWeather } from './weather.js';
import { fetchRSSFeeds, fetchPoliceRecap, fetchKonaIceFeed } from './rss.js';
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

/**
 * Post-processes script text to replace specific abbreviations with phonetic equivalents
 * or spaced letters to ensure correct Alexa pronunciation.
 */
function fixPronunciations(text) {
  if (!text) return '';
  return text
    .replace(/\bOWI's\b/gi, "O W I's")
    .replace(/\bOWIs\b/gi, "O W I's")
    .replace(/\bOWI\b/gi, "O W I")
    .replace(/\btrishaws\b/gi, "tri-shaws")
    .replace(/\btrishaw\b/gi, "tri-shaw")
    .replace(/\bLake Louie\b/gi, "Lake Lou-ee")
    .replace(/\bLouie\b/gi, "Lou-ee")
    .replace(/\boffenses\b/gi, "offences")
    .replace(/\boffense\b/gi, "offence");
}

/**
 * Escapes XML special characters for SSML compatibility.
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

const VOICES = ['Ivy', 'Joanna', 'Joey', 'Justin', 'Kendra', 'Kimberly', 'Matthew', 'Salli'];
function getRandomVoice() {
  return VOICES[Math.floor(Math.random() * VOICES.length)];
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

  // 7.5. Fetch Kona Ice schedule (between 8:00 AM and 8:00 PM local time only)
  const tzName = process.env.TIMEZONE || 'America/Chicago';
  const localHour24 = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(new Date()), 10);

  let konaIcePosts = null;
  if (localHour24 >= 8 && localHour24 < 20) {
    console.log("Fetching Kona Ice details...");
    konaIcePosts = await fetchKonaIceFeed();
    if (konaIcePosts) {
      console.log(`Fetched ${konaIcePosts.length} Kona Ice posts.`);
    }
  } else {
    console.log(`Current local hour is ${localHour24}. Skipping Kona Ice check (active only 8 AM - 8 PM).`);
  }

  // 8. Generate Script with Gemini (returns three tones)
  console.log('Generating multi-tone briefing script with Gemini...');
  const toneScripts = await generateBriefingScript({
    weather: weatherResult,
    rssItems,
    policeRecap,
    culvers: culversResult,
    emails,
    iss: issResult,
    events: eventsResult,
    konaIcePosts
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
      const cleanText = enforceCharacterLimit(fixPronunciations(rawText));
      const selectedVoice = getRandomVoice();
      const ssmlText = `<speak><voice name="${selectedVoice}">${escapeXml(cleanText)}</voice></speak>`;
      return {
        uid: `${cityKey}-${tone.name}-${cat.key}-${dateStr}`,
        updateDate: now.toISOString(),
        titleText: cat.title,
        mainText: ssmlText,
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

  // 10. Format and write the Culver's-only briefing feed
  const rawCulversText = toneScripts.balanced?.culvers || '';
  const cleanCulversText = enforceCharacterLimit(fixPronunciations(rawCulversText));
  const culversVoice = getRandomVoice();
  const ssmlCulversText = `<speak><voice name="${culversVoice}">${escapeXml(cleanCulversText)}</voice></speak>`;
  const culversFeedItem = {
    uid: `${cityKey}-culvers-${dateStr}`,
    updateDate: now.toISOString(),
    titleText: `${cityName} Culver's Flavor of the Day`,
    mainText: ssmlCulversText,
    redirectionUrl: culversUrl,
    generatorModel: toneScripts.usedModel || 'Local Fallback Template'
  };
  const culversOutputPath = path.resolve(`${cityKey}-briefing-culvers.json`);
  await fs.writeFile(culversOutputPath, JSON.stringify([culversFeedItem], null, 2), 'utf-8');
  console.log(`Successfully wrote Culver's briefing JSON to: ${culversOutputPath}`);

  console.log('--- Pipeline Complete ---');
}

main().catch(error => {
  console.error('Pipeline crashed:', error);
  process.exit(1);
});

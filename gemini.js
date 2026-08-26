import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

dotenv.config();

function getLocalDateString(date, tzName) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

/**
 * Generates the multi-tone daily briefing scripts using Gemini 3.5 Flash.
 * Returns a JSON object containing three tones: quick, entertainment, and balanced.
 */
export async function generateBriefingScript({ weather, rssItems, policeRecap, culvers, emails, iss, events, konaIcePosts }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Using local fallback generator.");
    return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events, konaIcePosts });
  }

  const ai = new GoogleGenAI({ apiKey });

  const cityName = process.env.CITY_NAME || 'Verona';
  const stateName = process.env.STATE_NAME || 'WI';
  const stateFullName = process.env.STATE_FULL_NAME || 'Wisconsin';
  const tzName = process.env.TIMEZONE || 'America/Chicago';

  const todayStrOnly = getLocalDateString(new Date(), tzName);
  const tomorrowStrOnly = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000), tzName);

  // Prepare RSS summaries for context
  const newsContext = rssItems.map((item, idx) => {
    return `Story ${idx + 1} (${item.source}):\nTitle: ${item.title}\nFull Webpage Content: ${item.fullContent}\nLink: ${item.link}\n`;
  }).join('\n---\n');

  // Prepare Police Recap context
  const policeContext = policeRecap
    ? `Title: ${policeRecap.title}\nRecap Calls Text:\n${policeRecap.fullContent}`
    : 'No police recap available today.';

  // Prepare Emails context
  const emailsContext = emails && emails.length > 0
    ? emails.map((mail, idx) => `Email ${idx + 1} (Date: ${mail.date}):\nSubject: ${mail.subject}\nBody Content:\n${mail.text}`).join('\n---\n')
    : 'No new emails received.';

  // Prepare Events context
  const eventsContext = events && events.length > 0
    ? events.map((event, idx) => {
        let relativeDateStr = event.date;
        if (event.rawDate) {
          try {
            const eventLocalDateStr = getLocalDateString(new Date(event.rawDate), tzName);
            if (eventLocalDateStr === todayStrOnly) {
              relativeDateStr = 'Today';
            } else if (eventLocalDateStr === tomorrowStrOnly) {
              relativeDateStr = 'tomorrow';
            }
          } catch (e) {
            console.error('Error parsing event date:', event.rawDate, e.message);
          }
        }
        return `Event ${idx + 1}:\nTitle: ${event.title}\nDate: ${event.date} (Relative: ${relativeDateStr})\nVenue: ${event.venue}\nDescription: ${event.description}\n`;
      }).join('\n---\n')
    : 'No upcoming events listed for the next 30 days.';

  // Prepare Kona Ice context
  const konaContext = konaIcePosts && konaIcePosts.length > 0
    ? konaIcePosts.map((item, idx) => `Post ${idx + 1} (Date: ${item.pubDate}):\nTitle: ${item.title}\nContent:\n${item.description}`).join('\n---\n')
    : 'No Kona Ice schedule posts available.';

  const prompt = `
You are a friendly local news anchor for the City of ${cityName}, ${stateFullName}. 
Your task is to write content for three different Alexa Flash Briefing feeds, each with a different tone.
Each briefing must cover the daily updates: weather, city news, local events, a police department weekly report, and the Culver's flavor of the day.

Here is today's raw data:
- Weather Details: 
  * Temperature: ${weather.temp}°F (Feels like: ${weather.apparentTemp}°F)
  * Condition: ${weather.condition}
  * Is it currently night time? ${!weather.isDay}
  * Astronomical Moon Phase: ${weather.moonPhase}
  * Local Landmark for Weather Context: ${weather.landmark}
  * Current Hour: ${weather.currentHour}
  * Air Quality Alert: ${weather.hasElevatedAQI ? `Elevated! AQI is ${weather.aqi} (${weather.aqiCategory})` : 'Normal (AQI is 50 or below - DO NOT mention air quality)'}
  * Is it after 5 PM? ${weather.isAfter5Pm}
  * Overnight Low Temperature: ${weather.overnightLow !== null && weather.overnightLow !== undefined ? `${weather.overnightLow}°F` : 'N/A'}
  * Is rain predicted overnight? ${weather.rainPredicted !== null && weather.rainPredicted !== undefined ? (weather.rainPredicted ? 'Yes' : 'No') : 'N/A'}
- ISS Space Station Sighting Info:
  * Upcoming visible pass tonight? ${iss.hasPass}
  * Sighting directions: ${iss.text}
- Inbound Important Emails:
${emailsContext}
- City News Articles:
${newsContext}
- Upcoming Local Events:
${eventsContext}
- ${cityName} Police Department Weekly Recap:
${policeContext}
- Kona Ice Schedule Posts:
${konaContext}
- Culver's of ${cityName} Details:
  * Today's Flavor of the Day: ${culvers.todayFlavor}
  * Tomorrow's Flavor of the Day: ${culvers.tomorrowFlavor}
  * Store Hours/Open Status: ${culvers.statusText}
  * Is Store Currently Open? ${culvers.isOpen}
  * Is Store Closed Before Opening Today (Morning)? ${culvers.isBeforeOpen}
  * Is Store Closed For The Night? ${culvers.isClosedForNight}
  * Is Store Closing Soon (within 60 minutes)? ${culvers.closingSoon}
  * Today's Opening Time: ${culvers.openTimeToday || '10:00 AM'}
  * Today's Closing Time: ${culvers.closeTimeToday || '10:00 PM'}
  * Tomorrow's Opening Time: ${culvers.openTimeTomorrow || '10:00 AM'}

You must return a JSON object containing three properties: "quick", "entertainment", and "balanced".
Each of these properties must be an object containing exactly five keys: "weather", "news", "events", "police", and "culvers".
All values must be plain text with NO markdown, bold formatting, asterisks, hashes, brackets, or emojis. Use standard punctuation for natural speech.

JSON Output Schema:
{
  "quick": {
    "weather": "string",
    "news": "string",
    "events": "string",
    "police": "string",
    "culvers": "string"
  },
  "entertainment": {
    "weather": "string",
    "news": "string",
    "events": "string",
    "police": "string",
    "culvers": "string"
  },
  "balanced": {
    "weather": "string",
    "news": "string",
    "events": "string",
    "police": "string",
    "culvers": "string"
  }
}

Tone Descriptions & Instructions:

1. "quick" (A fast, direct, factual recap of all topics):
   - Keep each section extremely concise (ideally 1 short, plain sentence).
   - "weather": Factual statement of temp, condition, landmark, and AQI (only if AQI > 50).
   - "news": Direct summary of the top news item or email.
   - "events": Mention the top upcoming event title and date.
   - "police": Mention one incident, specifying the day of the week or date it occurred (extracted from the recap).
   - "culvers": Highlight today's flavor and current store status. If closed before opening this morning, state that it opens today at ${culvers.openTimeToday || '10:00 AM'}. If closed for the night, preview tomorrow's flavor. If closing soon, urge grabbing it quickly.

2. "entertainment" (A lively, enthusiastic, and fun briefing):
   - Highlight the local events, Culver's flavor, and weather with high energy, playful details, and local references.
   - "weather": Sassy commentary on the conditions at the landmark. Include AQI alert only if AQI > 50. If night and clear, make a big deal about the moon phase and ISS flyover (only if there is an active pass tonight - do not mention it if there is no pass)!
   - "news": Briefly touch on city news in a conversational, lighthearted way.
   - "events": Show off the upcoming local events in a fun, inviting way. Promote going out and enjoying them!
   - "police": Briefly summarize a police call in a lighthearted or curious way, making sure to explicitly mention the day it happened.
   - "culvers": Make today's flavor sound irresistible! If closed before opening this morning, hype today's flavor and mention doors open today at ${culvers.openTimeToday || '10:00 AM'}. If open, encourage them to head over (especially if closing soon!). If closed for the night, preview tomorrow's flavor opening tomorrow.

3. "balanced" (A friendly, informative news anchor style):
   - A balanced and fun style that gives equal weight and detail to all five categories.
   - "weather": Fun weather summary incorporating landmarks, AQI (only if AQI > 50), moon phase, and ISS flyover if night, clear, and there is a pass (do not mention the ISS at all if there is no pass).
   - "news": Include a couple city news stories or important email updates, prioritizing neighborhood-relevant details.  Make sure to summarize the full webpage content, not just the title and link.
   - "events": Informative summary of all events coming up in the next couple days. And highlight any big event in the near future in ${cityName}.
   - "police": A conversational reciting of exactly one noteworthy weekly incident, making sure to identify the day of the week or date it occurred.
   - "culvers": Make today's flavor sound delicious. If closed before opening this morning, state that the store opens today at ${culvers.openTimeToday || '10:00 AM'} with today's flavor. If currently open, encourage running out to grab it, noting if it closes soon. Only if the store is already closed for the night should you say it is closed for the day and preview tomorrow's flavor and opening time.

Rules:
- Start the first section of every tone ("weather") with a catchy intro, and immediately mention the current hour (e.g. "At 9 AM...", "At 8 PM...") using the provided Current Hour. Tailor the intro as follows:
  * Quick: "Quick update: At [Current Hour]..."
  * Entertainment: "Hey ${cityName}, let's get into the dish! At [Current Hour]..."
  * Balanced: "Hello, ${cityName}! At [Current Hour], here is today's balanced dish..."
- Air Quality Rule: ONLY mention air quality if the Air Quality Index (AQI) is ABOVE 50 (e.g. Moderate, Unhealthy). If AQI is 50 or below, do NOT mention air quality at all in the briefing scripts.
- ISS Sightings Rule: If there is no ISS visible pass tonight (Upcoming visible pass tonight? is false), do NOT mention the ISS, the space station, or sightings at all in any of the briefing scripts. Only mention the ISS if there is an active pass tonight (Upcoming visible pass tonight? is true).
- When describing the ISS flyover trajectory, frame the direction using local geographical references relative to Verona (e.g., from Middleton / Verona High School in the northwest towards Oregon / Festival Foods in the southeast) and describe its height naturally (e.g., "low near the horizon", "about halfway up the sky", "high in the sky", or "almost directly overhead") instead of stating degree numbers.
- When writing the "police" segment, you MUST mention which day of the week the incident occurred (e.g., "Last Friday...", "Two days ago...") by finding it in the provided police recap. Do not say broad terms like "last week" or "recently".
- Overnight Weather Rule: If it is after 5 PM (Is it after 5 PM is true), you MUST also mention the overnight low temperature and whether rain is predicted overnight in the "weather" section for all three tones. Mention it naturally as part of the weather summary (e.g., "Tonight, expect a low of 53 degrees with rain predicted" or "The overnight low will drop to 53 degrees, with no rain in the forecast"). If it is not after 5 PM, do NOT mention the overnight low or rain.
- Event Date Rule: When summarizing upcoming local events:
  * If an event's Relative date is "Today", you MUST refer to its date as "Today" (e.g. "happening today", or just "today") and NOT by its weekday name (e.g., do NOT say "on Tuesday").
  * If an event's Relative date is "tomorrow", you MUST refer to its date as "tomorrow" (e.g. "happening tomorrow", or just "tomorrow") and NOT by its weekday name (e.g., do NOT say "on Wednesday").
  * For all other events, refer to their dates normally (using their weekday name or date).
- Police Pronunciation Rule: If a police report contains "OWI" (Operating While Intoxicated), always write it as "O W I" so Alexa pronounces it as the individual letters "O", "W", "I" without pauses.
- Kona Ice Rule: If the Kona Ice schedule updates contain scheduled stops in Verona for **today** (the same day: ${todayStrOnly}), you MUST mention the Kona Ice locations and times **exclusively** in the "culvers" section of each tone, alongside the Culver's flavor (e.g. telling listeners they can also grab a Kona Ice at Fireman's Park today from 11 AM to 4 PM). Do NOT mention Kona Ice in the weather, news, events, or police sections. If there are no Verona stops today, or if the data is empty/unavailable, do NOT mention Kona Ice at all in the briefing.
- Culver's Timing Rule: Pay strict attention to the store's open status:
  * Morning before open (when "Is Store Closed Before Opening Today (Morning)?" is true or status mentions opens today): Always focus on **today's flavor** and explicitly say the store opens **today at ${culvers.openTimeToday || '10:00 AM'}** (e.g. "Culver's opens today at 10 AM with today's flavor of the day..."). DO NOT say it opens tomorrow.
  * Currently open (when "Is Store Currently Open?" is true): Focus on **today's flavor** and mention closing time or if closing soon.
  * Night after close (when "Is Store Closed For The Night?" is true): Mention that today's flavor is wrapped up and preview **tomorrow's flavor** and that the store opens **tomorrow at ${culvers.openTimeTomorrow || '10:00 AM'}**.
- Keep them interesting and readable by text-to-speech.
`;

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.0-flash'];

  for (const model of modelsToTry) {
    let retries = 3;
    let delayMs = 2000;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        let cleanedText = response.text.trim();
        // Remove markdown backticks if returned despite responseMimeType
        cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleanedText);
        parsed.usedModel = model;
        return parsed;
      } catch (error) {
        const isTransient = error.status === 503 || error.code === 503 || error.message?.includes('503') || error.message?.includes('high demand') || error.status === 429 || error.status === 'RESOURCE_EXHAUSTED';

        if (isTransient && attempt < retries) {
          // Check if Google provided a retry delay in seconds (e.g., "retry in 10s")
          const delayMatch = error.message?.match(/retry in ([0-9.]+)s/i);
          const waitTime = delayMatch ? Math.ceil(parseFloat(delayMatch[1]) * 1000) + 1000 : delayMs;

          console.warn(`Gemini API rate limited/busy (${model}, attempt ${attempt}/${retries}). Waiting ${(waitTime / 1000).toFixed(1)}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delayMs *= 2;
        } else if (isTransient && model !== modelsToTry[modelsToTry.length - 1]) {
          console.warn(`Model ${model} unavailable after retries. Trying alternate model...`);
          break; // Try next fallback model
        } else {
          console.error(`Error generating script with Gemini (${model}):`, error.message);
          if (model === modelsToTry[modelsToTry.length - 1]) {
            return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events });
          }
          break;
        }
      }
    }
  }

  return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events });
}

/**
 * A fallback generator in case the Gemini API call fails or is not configured.
 */
function generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events, konaIcePosts }) {
  const cityName = process.env.CITY_NAME || 'Verona';
  const stateName = process.env.STATE_NAME || 'WI';
  const tzName = process.env.TIMEZONE || 'America/Chicago';

  const todayStrOnly = getLocalDateString(new Date(), tzName);
  const tomorrowStrOnly = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000), tzName);

  // Helper to extract a day of the week from the police recap if possible
  let policeDay = 'recently';
  if (policeRecap && policeRecap.fullContent) {
    const dayMatch = policeRecap.fullContent.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    if (dayMatch) {
      policeDay = `on ${dayMatch[1]}`;
    }
  }

  const cleanNews = rssItems?.[0] ? rssItems[0].title.replace(/[^a-zA-Z0-9\s]/g, '').trim() : 'No new city alerts';

  // Format events with relative dates
  const formattedEvents = (events || []).map(event => {
    let relativeDate = event.date;
    if (event.rawDate) {
      try {
        const eventLocalDateStr = getLocalDateString(new Date(event.rawDate), tzName);
        if (eventLocalDateStr === todayStrOnly) {
          relativeDate = 'Today';
        } else if (eventLocalDateStr === tomorrowStrOnly) {
          relativeDate = 'tomorrow';
        }
      } catch (e) {
        console.error('Error parsing event date in fallback:', event.rawDate, e.message);
      }
    }
    return {
      ...event,
      relativeDate
    };
  });

  const getRelativeEventText = (event) => {
    if (!event) return 'No events scheduled';
    const dateText = (event.relativeDate === 'Today' || event.relativeDate === 'tomorrow')
      ? event.relativeDate
      : `on ${event.relativeDate}`;
    return `${event.title} ${dateText} at ${event.venue}`;
  };

  const cleanEvent = getRelativeEventText(formattedEvents[0]);

  const cleanPolice = policeRecap && policeRecap.fullContent
    ? policeRecap.fullContent.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 80).trim()
    : 'No updates from the police department';
  const aqiNotice = weather.hasElevatedAQI ? ` Note: Air quality is ${weather.aqiCategory} with an AQI of ${weather.aqi}.` : '';

  const overnightNotice = (weather.isAfter5Pm && weather.overnightLow !== null)
    ? ` The overnight low will be around ${weather.overnightLow} degrees, with rain ${weather.rainPredicted ? '' : 'un'}likely.`
    : '';

  // Kona Ice same-day check for fallback
  let konaNotice = '';
  if (konaIcePosts && konaIcePosts.length > 0) {
    const latest = konaIcePosts[0];
    const postDate = new Date(latest.pubDate);
    const isTodayPost = getLocalDateString(postDate, tzName) === todayStrOnly;
    const mentionsVerona = latest.description?.toLowerCase().includes('verona') || latest.title?.toLowerCase().includes('verona');

    if (isTodayPost && mentionsVerona) {
      const lines = latest.description.split('\n');
      const veronaLines = lines.filter(line => line.toLowerCase().includes('verona')).map(line => line.replace(/📍/g, '').trim());
      if (veronaLines.length > 0) {
        konaNotice = ` Also, Kona Ice is scheduled in Verona today: ${veronaLines.join(', ')}.`;
      }
    }
  }

  let culversQuick = '';
  let culversEnt = '';
  let culversBalanced = '';

  if (culvers.isBeforeOpen) {
    culversQuick = `Culver's flavor today is ${culvers.todayFlavor}, opening today at ${culvers.openTimeToday || '10:00 AM'}.${konaNotice}`;
    culversEnt = `Time for a treat! Today's Culver's flavor of the day is a delicious scoop of ${culvers.todayFlavor}, opening today at ${culvers.openTimeToday || '10:00 AM'}!${konaNotice}`;
    culversBalanced = `Today's Culver's Flavor of the Day is ${culvers.todayFlavor}. The restaurant opens today at ${culvers.openTimeToday || '10:00 AM'}.${konaNotice}`;
  } else if (culvers.isOpen) {
    const closingText = culvers.closingSoon ? ' (closing soon!)' : '';
    culversQuick = `Culver's today is ${culvers.todayFlavor}, open until ${culvers.closeTimeToday || '10:00 PM'}${closingText}.${konaNotice}`;
    culversEnt = `Time for a treat! Today's Culver's flavor of the day is a delicious scoop of ${culvers.todayFlavor}! Grab a scoop before they close at ${culvers.closeTimeToday || '10:00 PM'}.${konaNotice}`;
    culversBalanced = `We sign off with today's Culver's Flavor of the Day: ${culvers.todayFlavor}. The restaurant is open until ${culvers.closeTimeToday || '10:00 PM'}.${konaNotice}`;
  } else {
    culversQuick = `Culver's is closed for the night. Tomorrow's flavor will be ${culvers.tomorrowFlavor}, opening tomorrow at ${culvers.openTimeTomorrow || '10:00 AM'}.${konaNotice}`;
    culversEnt = `Time for a treat! Today's flavor was ${culvers.todayFlavor}, and tomorrow we get ${culvers.tomorrowFlavor}, opening tomorrow at ${culvers.openTimeTomorrow || '10:00 AM'}!${konaNotice}`;
    culversBalanced = `Today's Culver's flavor was ${culvers.todayFlavor}. The restaurant is closed for the night and will open tomorrow at ${culvers.openTimeTomorrow || '10:00 AM'} featuring ${culvers.tomorrowFlavor}.${konaNotice}`;
  }

  return {
    quick: {
      weather: `Quick update: At ${weather.currentHour || '9 AM'}, it is ${weather.temp} degrees and ${weather.condition} at ${weather.landmark}.${aqiNotice}${overnightNotice}`,
      news: `City update: ${cleanNews}.`,
      events: `Upcoming: ${cleanEvent}.`,
      police: `In police news: ${policeDay}, officers noted ${cleanPolice}.`,
      culvers: culversQuick
    },
    entertainment: {
      weather: `Hey ${cityName}, let's get into the dish! At ${weather.currentHour || '9 AM'}, we've got ${weather.temp} degrees and ${weather.condition} over at ${weather.landmark}.${aqiNotice}${overnightNotice} ${weather.isDay ? 'Get out and enjoy the sunshine!' : `Look up to see that lovely ${weather.moonPhase}!`} ${iss.hasPass ? 'Keep your eyes on the skies!' : ''}`,
      news: `A quick note from city hall: ${cleanNews}.`,
      events: `Looking for fun? Check out ${cleanEvent}!`,
      police: `A bit of neighborhood drama: ${policeDay}, ${cleanPolice}.`,
      culvers: culversEnt
    },
    balanced: {
      weather: `Hello, ${cityName}! At ${weather.currentHour || '9 AM'}, here is today's balanced dish. Over at ${weather.landmark}, it is currently ${weather.temp} degrees with ${weather.condition}.${aqiNotice}${overnightNotice} ${!weather.isDay ? `Tonight we have a ${weather.moonPhase}.` : ''} ${iss.hasPass ? iss.text : ''}`,
      news: `In city affairs, the latest update is: ${cleanNews}.`,
      events: `If you are planning your week, we have local events coming up, including ${cleanEvent}.`,
      police: `From the police department weekly log: ${policeDay}, ${cleanPolice}.`,
      culvers: culversBalanced
    }
  };
}

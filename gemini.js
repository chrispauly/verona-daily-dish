import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Generates the multi-tone daily briefing scripts using Gemini 3.5 Flash.
 * Returns a JSON object containing three tones: quick, entertainment, and balanced.
 */
export async function generateBriefingScript({ weather, rssItems, policeRecap, culvers, emails, iss, events }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Using local fallback generator.");
    return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events });
  }

  const ai = new GoogleGenAI({ apiKey });

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
    ? events.map((event, idx) => `Event ${idx + 1}:\nTitle: ${event.title}\nDate: ${event.date}\nVenue: ${event.venue}\nDescription: ${event.description}\n`).join('\n---\n')
    : 'No upcoming events listed for the next 30 days.';

  const prompt = `
You are a friendly local news anchor for the City of Verona, Wisconsin. 
Your task is to write content for three different Alexa Flash Briefing feeds, each with a different tone.
Each briefing must cover the daily updates: weather, city news, local events, a police department weekly report, and the Culver's flavor of the day.

Here is today's raw data:
- Weather Details: 
  * Temperature: ${weather.temp}°F (Feels like: ${weather.apparentTemp}°F)
  * Condition: ${weather.condition}
  * Is it currently night time? ${!weather.isDay}
  * Astronomical Moon Phase: ${weather.moonPhase}
  * Local Landmark for Weather Context: ${weather.landmark}
- ISS Space Station Sighting Info:
  * Upcoming visible pass tonight? ${iss.hasPass}
  * Sighting directions: ${iss.text}
- Inbound Important Emails:
${emailsContext}
- City News Articles:
${newsContext}
- Upcoming Local Events:
${eventsContext}
- Verona Police Department Weekly Recap:
${policeContext}
- Culver's of Verona Details:
  * Today's Flavor of the Day: ${culvers.todayFlavor}
  * Tomorrow's Flavor of the Day: ${culvers.tomorrowFlavor}
  * Store Hours/Open Status: ${culvers.statusText}
  * Is Store Closing Soon (within 60 minutes)? ${culvers.closingSoon}

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
   - "weather": Factual statement of temp, condition, and landmark.
   - "news": Direct summary of the top news item or email.
   - "events": Mention the top upcoming event title and date.
   - "police": Mention one incident, specifying the day of the week or date it occurred (extracted from the recap).
   - "culvers": Factual statement of today's flavor and status.

2. "entertainment" (A lively, enthusiastic, and fun briefing):
   - Highlight the local events, Culver's flavor, and weather with high energy, playful details, and local references.
   - "weather": Sassy commentary on the conditions at the landmark. If night and clear, make a big deal about the moon phase and ISS flyover!
   - "news": Briefly touch on city news in a conversational, lighthearted way.
   - "events": Show off the upcoming local events in a fun, inviting way. Promote going out and enjoying them!
   - "police": Briefly summarize a police call in a lighthearted or curious way, making sure to explicitly mention the day it happened.
   - "culvers": Make today's flavor sound delicious! Encourage running out to grab it, especially if closing soon.

3. "balanced" (A friendly, informative news anchor style):
   - A balanced, professional yet warm style that gives equal weight and detail to all five categories.
   - "weather": Professional weather summary incorporating landmarks, moon phase, and ISS flyover if night and clear.
   - "news": Summary of city news or important email updates, prioritizing neighborhood-relevant details.
   - "events": Informative summary of 1 or 2 upcoming local events in Verona.
   - "police": A professional summary of exactly one noteworthy weekly incident, making sure to identify the day of the week or date it occurred.
   - "culvers": Conclude naturally with the Culver's flavor of the day and operating hours.

Specific Constraints:
- Start the first section of every tone ("weather") with a catchy intro, but tailor it:
  * Quick: "Quick update: "
  * Entertainment: "Hey Verona, let's get into the dish! "
  * Balanced: "Hello, Verona! Here is today's balanced dish. "
- When writing the "police" segment, you MUST mention which day of the week or specific date the incident occurred (e.g., "On Tuesday...", "Last Friday...", "On July 12th...") by finding it in the provided police recap. Do not say "last week" or "recently" without specifying the day.
- Do not exceed 150 words per individual segment value. Keep them short, crisp, and readable by text-to-speech.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const cleanedText = response.text.trim();
    // Parse to ensure it is valid JSON
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error generating script with Gemini:', error.message);
    return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events });
  }
}

/**
 * A fallback generator in case the Gemini API call fails or is not configured.
 */
function generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss, events }) {
  // Helper to extract a day of the week from the police recap if possible
  let policeDay = 'recently';
  if (policeRecap && policeRecap.fullContent) {
    const dayMatch = policeRecap.fullContent.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    if (dayMatch) {
      policeDay = `on ${dayMatch[1]}`;
    }
  }

  const cleanNews = rssItems?.[0] ? rssItems[0].title.replace(/[^a-zA-Z0-9\s]/g, '').trim() : 'No new city alerts';
  const cleanEvent = events?.[0] ? `${events[0].title} on ${events[0].date} at ${events[0].venue}` : 'No events scheduled';
  const cleanPolice = policeRecap && policeRecap.fullContent
    ? policeRecap.fullContent.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 80).trim()
    : 'No updates from the police department';

  return {
    quick: {
      weather: `Quick update: It is ${weather.temp} degrees and ${weather.condition} at ${weather.landmark}.`,
      news: `City update: ${cleanNews}.`,
      events: `Upcoming: ${cleanEvent}.`,
      police: `In police news: ${policeDay}, officers noted ${cleanPolice}.`,
      culvers: `Culver's today is ${culvers.todayFlavor}. Store is ${culvers.statusText.includes('Closed') ? 'closed' : 'open'}.`
    },
    entertainment: {
      weather: `Hey Verona, let's get into the dish! We've got ${weather.temp} degrees and ${weather.condition} over at ${weather.landmark}. ${weather.isDay ? 'Get out and enjoy the sunshine!' : `Look up to see that lovely ${weather.moonPhase}!`} ${iss.hasPass ? 'Keep your eyes on the skies!' : ''}`,
      news: `A quick note from city hall: ${cleanNews}.`,
      events: `Looking for fun? Check out ${cleanEvent}!`,
      police: `A bit of neighborhood drama: ${policeDay}, ${cleanPolice}.`,
      culvers: `Time for a treat! Today's Culver's flavor of the day is a delicious scoop of ${culvers.todayFlavor}! Tomorrow we get ${culvers.tomorrowFlavor}.`
    },
    balanced: {
      weather: `Hello, Verona! Here is today's balanced dish. Over at ${weather.landmark}, it is currently ${weather.temp} degrees with ${weather.condition}. ${!weather.isDay ? `Tonight we have a ${weather.moonPhase}.` : ''} ${iss.hasPass ? iss.text : ''}`,
      news: `In city affairs, the latest update is: ${cleanNews}.`,
      events: `If you are planning your week, we have local events coming up, including ${cleanEvent}.`,
      police: `From the police department weekly log: ${policeDay}, ${cleanPolice}.`,
      culvers: `We sign off with today's Culver's Flavor of the Day: ${culvers.todayFlavor}. The restaurant status is ${culvers.statusText}.`
    }
  };
}

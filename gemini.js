import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Generates the daily briefing script using Gemini 2.5 Flash / 3.5 Flash.
 */
export async function generateBriefingScript({ weather, rssItems, policeRecap, culvers, emails, iss }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Using local fallback generator.");
    return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss });
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

  const prompt = `
You are a friendly, slightly sassy local news anchor for the City of Verona, Wisconsin. 
Your task is to write a daily news briefing script that Alexa's Text-to-Speech engine will read out loud.
The final script must read naturally and stay strictly between 90 and 130 words (approximately 45-60 seconds when read out loud). Do not exceed 130 words under any circumstance.

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
- Culver's of Verona Details:
  * Today's Flavor of the Day: ${culvers.todayFlavor}
  * Tomorrow's Flavor of the Day: ${culvers.tomorrowFlavor}
  * Store Hours/Open Status: ${culvers.statusText}
  * Is Store Closing Soon (within 60 minutes)? ${culvers.closingSoon}
- City News Articles (Summarize from the provided Full Webpage Content, not just the titles!):
${newsContext}
- Verona Police Department Weekly Recap:
${policeContext}

Guidelines for the Script:
1. Start EXACTLY with this catchy phrase: "Hello, Verona! Here is your daily dish."
2. Report the weather in a clever, sassy way, referencing the temperature and specifically locating it at or near the landmark: "${weather.landmark}".
   * Be a little playful or cheeky about the weather conditions.
   * If it is currently night time and the temperature is hotter than normal for a summer night in Wisconsin (e.g. above 73°F), make a sassy note about how warm it is.
   * If it is night time (Is it currently night time? is true):
     - Mention the current moon phase: "${weather.moonPhase}".
     - If there is an upcoming visible ISS flyover (Upcoming visible pass is true), mention the flyover! If the weather condition is currently cloudy, overcast, or rainy, note that they might catch it if the clouds clear up. Otherwise, give the sighting instructions (time, duration, and which directions to look) using the details from: "${iss.text}". Keep it brief and integrated into the night weather segment.
3. Share up to 3 of the most interesting recent city stories/events, OR summaries of new important emails (such as garbage collection schedules or local neighborhood updates). Keep each summary very short (one sentence each) and focus on the practical details. If there are new emails, prioritize including them!
4. Select EXACTLY ONE interesting, noteworthy, or unusual police call/incident from the Verona Police Department weekly recap. Summarize that single incident in 1 or 2 sentences (e.g., "In police news, officers responded to a motorcycle fleeing traffic stops...").
5. Conclude with a fun sign-off mentioning Culver's status:
   * If Culver's is currently closed (Store Hours/Open Status contains "Closed"), mention that they are closed right now but opens in the morning at the time listed (e.g., "opens in the morning at 10:00 AM"), and tell the listener that tomorrow's flavor is "${culvers.tomorrowFlavor}".
   * If Culver's is open but closing soon (Is Store Closing Soon is true), warn the listener that they are closing soon at the time listed (e.g., "closes at 10:00 PM"), and tell them to run out for today's flavor, "${culvers.todayFlavor}".
   * Otherwise, just mention today's flavor is "${culvers.todayFlavor}" as a standard sign-off.
6. The script MUST be plain text with NO formatting (no bold, asterisks, hashes, brackets) and NO emojis. Use standard punctuation for natural pauses.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error('Error generating script with Gemini:', error.message);
    return generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss });
  }
}

/**
 * A fallback script generator in case the Gemini API call fails or the key is missing.
 */
function generateFallbackScript({ weather, rssItems, policeRecap, culvers, emails, iss }) {
  // Sassy weather fallback logic with local landmarks
  let weatherSass = `It is currently ${weather.temp} degrees and ${weather.condition} over by ${weather.landmark}.`;
  if (!weather.isDay) {
    if (weather.temp > 73) {
      weatherSass = `Whew! It's a sticky ${weather.temp} degrees tonight over by ${weather.landmark}. Keep those fans running! Plus, look up to see the ${weather.moonPhase}.`;
    } else if (['clear skies', 'mainly clear skies', 'partly cloudy skies'].includes(weather.condition)) {
      weatherSass = `It's a pleasant ${weather.temp} degree night over by ${weather.landmark} under a beautiful ${weather.moonPhase}.`;
    }
    
    // Add ISS flyover text to fallback if visible
    if (iss.hasPass) {
      weatherSass += ` Also, keep an eye out: ${iss.text}`;
    }
  }

  let newsSnippet = '';
  if (rssItems && rssItems.length > 0) {
    newsSnippet = "Today's top updates: " + rssItems.slice(0, 2).map((item, idx) => {
      const cleanBody = (item.fullContent || '')
        .replace(/[^a-zA-Z0-9\s]/g, '') // remove special chars
        .substring(0, 70).trim();
      return `[Story ${idx + 1}: "${item.title}" - Detail: ${cleanBody}...]`;
    }).join(' ');
  } else {
    newsSnippet = "There are no new alerts from the city today.";
  }

  let emailSnippet = '';
  if (emails && emails.length > 0) {
    emailSnippet = " Also, we received an email update: " + emails.map(m => {
      const cleanBody = m.text.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50).trim();
      return `"${m.subject}" (${cleanBody}...)`;
    }).join(', ');
  }

  let policeSnippet = '';
  if (policeRecap && policeRecap.fullContent) {
    const policeCallClean = policeRecap.fullContent
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .substring(0, 80).trim();
    policeSnippet = `In police news: the weekly recap notes "${policeCallClean}...".`;
  }

  // Culver's fallback sign-off logic
  let culversSass = '';
  const isClosed = culvers.statusText.toLowerCase().includes('closed');
  if (isClosed) {
    const opensMatch = culvers.statusText.match(/opens\s+([^$]+)/i);
    const opensAt = opensMatch ? opensMatch[1].trim() : '10:00 AM';
    culversSass = `Culver's is closed right now but opens in the morning at ${opensAt}, when you can grab tomorrow's flavor, ${culvers.tomorrowFlavor}.`;
  } else if (culvers.closingSoon) {
    const closesMatch = culvers.statusText.match(/closes\s+([^$]+)/i);
    const closesAt = closesMatch ? closesMatch[1].trim() : '10:00 PM';
    culversSass = `Hurry up! Culver's is closing soon at ${closesAt}, but you can still run out for today's flavor, ${culvers.todayFlavor}.`;
  } else {
    culversSass = `And to top off your day, today's Culver's Flavor of the Day is ${culvers.todayFlavor}.`;
  }

  return `Hello, Verona! Here is your daily dish. ${weatherSass} ${newsSnippet}${emailSnippet} ${policeSnippet} ${culversSass} Have a great day, Verona!`;
}

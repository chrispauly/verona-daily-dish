import * as cheerio from 'cheerio';

/**
 * Clean up HTML tags and excessive whitespace from event descriptions for Alexa readability.
 */
function cleanHTML(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ') // Replace tags with space
    .replace(/&nbsp;/gi, ' ') // Replace non-breaking spaces
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

/**
 * Fetches upcoming events for the next 30 days from visitveronawi.com.
 */
export async function fetchUpcomingEvents() {
  const mainUrl = process.env.EVENTS_MAIN_URL || 'https://www.visitveronawi.com/events/?bounds=false&view=list&sort=date';
  
  try {
    console.log('Fetching events main page to extract token...');
    const mainRes = await fetch(mainUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!mainRes.ok) {
      throw new Error(`Failed to fetch events main page: ${mainRes.status}`);
    }

    const html = await mainRes.text();
    const $ = cheerio.load(html);
    
    let token = '';
    $('script').each((_, el) => {
      const text = $(el).text();
      if (text.includes('plugins_events_custom_events_layout_list_apex')) {
        const tokenMatch = text.match(/"token"\s*:\s*"([^"]+)"/) || text.match(/'token'\s*:\s*'([^']+)'/);
        if (tokenMatch) {
          token = tokenMatch[1];
        }
      }
    });

    if (!token) {
      throw new Error('CSRF/dynamic token not found in page scripts');
    }

    // Set search window: from today to 30 days in the future
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 30);

    const queryObj = {
      filter: {
        active: true,
        $and: [
          {
            "categories.calendar_id": {
              "$in": ["1"]
            }
          }
        ],
        date_range: {
          start: { "$date": startDate.toISOString() },
          end: { "$date": endDate.toISOString() }
        }
      },
      options: {
        limit: 10,
        count: true,
        castDocs: false,
        fields: {
          _id: 1,
          title: 1,
          startDate: 1,
          endDate: 1,
          nextDate: 1,
          nextMatchingDate: 1,
          venue_name: 1,
          url: 1,
          description: 1
        },
        hooks: [],
        sort: {
          nextMatchingDate: 1,
          title_sort: 1
        }
      }
    };

    const queryJson = JSON.stringify(queryObj);
    const apiBase = process.env.EVENTS_API_URL || 'https://www.visitveronawi.com/includes/rest_v2/plugins_events_events/find//';
    const apiUrl = `${apiBase}?json=${encodeURIComponent(queryJson)}&token=${token}`;

    console.log('Querying events REST API...');
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': mainUrl
      }
    });

    if (!apiRes.ok) {
      throw new Error(`Events API returned error status: ${apiRes.status}`);
    }

    const apiData = await apiRes.json();
    const docs = apiData.docs?.docs || [];

    const origin = new URL(mainUrl).origin;
    const cityName = process.env.CITY_NAME || 'Verona';
    const stateName = process.env.STATE_NAME || 'WI';

    const events = docs.map(doc => {
      const nextDate = doc.nextMatchingDate || doc.nextDate || doc.startDate;
      const formattedDate = nextDate 
        ? new Date(nextDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Date TBD';
        
      return {
        title: doc.title || 'Untitled Event',
        date: formattedDate,
        venue: doc.venue_name || `${cityName}, ${stateName}`,
        description: cleanHTML(doc.description).substring(0, 300), // Keep description brief for prompt size
        link: doc.url ? `${origin}${doc.url}` : mainUrl
      };
    });

    console.log(`Successfully fetched and parsed ${events.length} upcoming events.`);
    return events;
  } catch (error) {
    console.error('Error fetching upcoming events:', error.message);
    return []; // Return empty array to keep pipeline running if external site fails
  }
}

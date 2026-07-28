import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

/**
 * Fetches the HTML content of a Verona city webpage and extracts the main article text.
 */
async function fetchArticleContent(url) {
  if (!url) return '';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch article details from: ${url}, status: ${response.status}`);
      return '';
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Primary selector for CivicPlus article text (froala editor view)
    let contentParts = [];
    $('.fr-view').each((_, el) => {
      contentParts.push($(el).text().trim());
    });
    
    let content = contentParts.join('\n').trim();

    // 2. Fallback to main content wrapper
    if (!content) {
      content = $('#contentarea').text().trim();
    }

    // 3. Last resort fallback to main/body
    if (!content) {
      content = $('main').text().trim() || $('body').text().trim();
    }

    // Clean up excessive whitespace/newlines
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    // Truncate to first 3000 characters to keep prompt sizes reasonable
    if (content.length > 3000) {
      content = content.substring(0, 3000) + '... [truncated]';
    }

    return content;
  } catch (error) {
    console.error(`Error fetching article details at ${url}:`, error.message);
    return '';
  }
}

/**
 * Fetches and parses RSS feeds, then fetches the full article content for the top items.
 */
export async function fetchRSSFeeds() {
  const defaultFeeds = [
    'https://veronawi.gov/RSSFeed.aspx?ModID=76&CID=All-0',
    'https://veronawi.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml'
  ];
  const feeds = process.env.CITY_RSS_FEEDS
    ? process.env.CITY_RSS_FEEDS.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
    : defaultFeeds;

  const parser = new XMLParser();
  const allItems = [];

  for (const url of feeds) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to fetch RSS feed: ${url}, status: ${response.status}`);
        continue;
      }
      const xml = await response.text();
      const jsonObj = parser.parse(xml);
      
      let items = jsonObj.rss?.channel?.item || [];
      if (!Array.isArray(items)) {
        items = [items];
      }

      for (const item of items) {
        const title = item.title || '';
        const description = item.description || '';
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        const link = item.link || '';

        // Clean description HTML tags
        const cleanDesc = description.replace(/<[^>]*>/g, '').trim();

        const sourceName = jsonObj.rss?.channel?.title || (url.includes('ModID=76') ? 'City Calendar/Alerts' : 'City Newsflash');
        allItems.push({
          title: title.trim(),
          description: cleanDesc,
          pubDate,
          link: link.trim(),
          source: sourceName
        });
      }
    } catch (error) {
      console.error(`Error parsing RSS feed ${url}:`, error.message);
    }
  }

  // Sort items: newest first
  allItems.sort((a, b) => b.pubDate - a.pubDate);

  // Filter items: keep only items from the last 72 hours, or at least the top 5 if empty
  const now = new Date();
  const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72 hours
  
  let filtered = allItems.filter(item => item.pubDate >= cutoff);
  if (filtered.length === 0) {
    filtered = allItems.slice(0, 5);
  } else {
    // Cap at top 5 to prevent excessive HTTP requests
    filtered = filtered.slice(0, 5);
  }

  console.log(`Fetching full article details for the top ${filtered.length} city news items...`);
  const results = [];
  for (const item of filtered) {
    const fullContent = await fetchArticleContent(item.link);
    results.push({
      title: item.title,
      description: item.description,
      fullContent: fullContent || item.description, // Fallback to RSS description if fetch fails
      date: item.pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      link: item.link,
      source: item.source
    });
  }

  return results;
}

/**
 * Fetches the latest Verona Police Department Weekly Recap.
 */
export async function fetchPoliceRecap() {
  const url = process.env.POLICE_RSS_FEED || 'https://www.veronawi.gov/RSSFeed.aspx?ModID=1&CID=Police-Department-5';
  const parser = new XMLParser();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Police feed returned status: ${response.status}`);
    }

    const xml = await response.text();
    const jsonObj = parser.parse(xml);
    
    let items = jsonObj.rss?.channel?.item || [];
    if (!Array.isArray(items)) {
      items = [items];
    }

    if (items.length === 0) {
      return null;
    }

    // Grab the most recent item
    const latestItem = items[0];
    console.log(`Fetching full details for latest Police Department update: "${latestItem.title}"...`);
    
    const fullContent = await fetchArticleContent(latestItem.link);

    return {
      title: latestItem.title.trim(),
      date: latestItem.pubDate ? new Date(latestItem.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      link: latestItem.link.trim(),
      fullContent: fullContent || latestItem.description || ''
    };
  } catch (error) {
    console.error('Error fetching Police Department recap:', error.message);
    return null;
  }
}

/**
 * Fetches the latest Kona Ice of Madison schedule updates from the FetchRSS feed.
 */
export async function fetchKonaIceFeed() {
  const url = process.env.KONA_ICE_RSS_FEED;
  if (!url) {
    console.log("Kona Ice RSS feed URL is not set in .env. Skipping.");
    return null;
  }

  const parser = new XMLParser();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch Kona Ice RSS feed: ${url}, status: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const jsonObj = parser.parse(xml);
    
    let items = jsonObj.rss?.channel?.item || [];
    if (!Array.isArray(items)) {
      items = [items];
    }

    const cleanedItems = items.map(item => {
      const title = item.title || '';
      const rawDesc = item.description || '';
      const pubDateStr = item.pubDate || '';

      // Clean description HTML: replace <br> with newlines, then strip tags
      const cleanDesc = rawDesc
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();

      return {
        title: title.trim(),
        description: cleanDesc,
        pubDate: pubDateStr ? new Date(pubDateStr) : new Date()
      };
    });

    return cleanedItems;
  } catch (error) {
    console.error('Error fetching Kona Ice RSS feed:', error.message);
    return null;
  }
}


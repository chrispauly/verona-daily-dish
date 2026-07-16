import * as cheerio from 'cheerio';

/**
 * Parses the hours status string and determines if the store closes in less than 60 minutes.
 */
function checkClosingSoon(statusText, localTime = new Date()) {
  if (!statusText || !statusText.toLowerCase().includes('open')) {
    return false;
  }
  
  // Extract time like "10:00 PM" or "10:30 PM"
  const match = statusText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return false;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  
  let closingHour24 = hours;
  if (ampm === 'PM' && hours < 12) closingHour24 += 12;
  if (ampm === 'AM' && hours === 12) closingHour24 = 0;
  
  const closingTime = new Date(localTime);
  closingTime.setHours(closingHour24, minutes, 0, 0);
  
  // Difference in minutes
  const diffMinutes = (closingTime.getTime() - localTime.getTime()) / (1000 * 60);
  
  // True if closing within 60 minutes
  return diffMinutes > 0 && diffMinutes <= 60;
}

/**
 * Fetches Culver's of Verona flavors and hours details.
 */
export async function fetchCulversDetails() {
  const url = 'https://www.culvers.com/restaurants/verona';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Culver's server returned status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Gather all calendar flavors
    const calendarFlavors = [];
    
    // Primary calendar selector
    $('a.RestaurantCalendarPanel_containerItemContentFlavorLink__Kvd0e').each((_, el) => {
      calendarFlavors.push($(el).text().trim());
    });

    // Suffix wildcard calendar selector if primary fails
    if (calendarFlavors.length === 0) {
      $('[class*="ItemContentFlavorLink"]').each((_, el) => {
        calendarFlavors.push($(el).text().trim());
      });
    }

    let todayFlavor = calendarFlavors[0] || '';
    let tomorrowFlavor = calendarFlavors[1] || '';

    // If today's flavor is missing from calendar list, check the main header (when open)
    if (!todayFlavor) {
      todayFlavor = $('h2.RestaurantDetails_containerRestaurantFlavorContentHeading__sLzcV').text().trim() || 
                    $('[class*="FlavorContentHeading"]').text().trim();
    }

    // Clean registered trademarks for Alexa TTS readability
    const cleanFlavor = (str) => str ? str.replace(/®/g, '').replace(/™/g, '').trim() : 'unknown flavor';
    todayFlavor = cleanFlavor(todayFlavor);
    tomorrowFlavor = cleanFlavor(tomorrowFlavor);

    // 2. Fetch hours status text
    let statusText = $('button.Accordion_headingButton__5kHDW').first().text().trim();
    if (!statusText) {
      statusText = $('[class*="headingButton"]').first().text().trim();
    }
    statusText = statusText || 'Closed - Opens 10:00 AM';

    const closingSoon = checkClosingSoon(statusText, new Date());

    return {
      success: true,
      todayFlavor,
      tomorrowFlavor,
      statusText,
      closingSoon
    };
  } catch (error) {
    console.error("Error scraping Culver's details:", error.message);
    return {
      success: false,
      todayFlavor: 'unknown flavor',
      tomorrowFlavor: 'unknown flavor',
      statusText: 'Closed - Opens 10:00 AM',
      closingSoon: false
    };
  }
}

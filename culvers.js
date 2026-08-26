import * as cheerio from 'cheerio';

/**
 * Parses the hours status string and determines if the store closes in less than 60 minutes.
 */
function checkClosingSoon(statusText, localTime = new Date(new Date().toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/Chicago" }))) {
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
 * Fetches Culver's flavors and hours details.
 */
export async function fetchCulversDetails() {
  const url = process.env.CULVERS_URL || 'https://www.culvers.com/restaurants/verona';

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

    // Try parsing Next.js JSON properties first (more robust and timezone-accurate)
    const nextDataTxt = $('#__NEXT_DATA__').text().trim();
    if (nextDataTxt) {
      try {
        const nextData = JSON.parse(nextDataTxt);
        const details = nextData.props?.pageProps?.page?.customData?.restaurantDetails;
        if (details) {
          const tz = process.env.TIMEZONE || 'America/Chicago';

          // Get local dates and day of week
          const localDateStr = new Date().toLocaleDateString('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const [m, d, y] = localDateStr.split('/');
          const todayISO = `${y}-${m}-${d}`;

          const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomLocalDateStr = tomorrow.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const [tm, td, ty] = tomLocalDateStr.split('/');
          const tomorrowISO = `${ty}-${tm}-${td}`;

          const localDayName = new Date().toLocaleDateString('en-US', {
            timeZone: tz,
            weekday: 'long'
          });
          const tomorrowDayName = tomorrow.toLocaleDateString('en-US', {
            timeZone: tz,
            weekday: 'long'
          });

          // Extract flavors
          const cleanFlavor = (str) => str ? str.replace(/®/g, '').replace(/™/g, '').trim() : 'unknown flavor';
          const todayFlavorObj = details.flavors?.find(f => f.calendarDate?.startsWith(todayISO));
          const tomorrowFlavorObj = details.flavors?.find(f => f.calendarDate?.startsWith(tomorrowISO));
          const todayFlavor = cleanFlavor(todayFlavorObj?.name);
          const tomorrowFlavor = cleanFlavor(tomorrowFlavorObj?.name);

          // Extract and evaluate hours for today and tomorrow
          const dayTimes = details.currentTimes?.driveThruTimes?.find(
            t => t.day?.toLowerCase() === localDayName.toLowerCase()
          ) || details.currentTimes?.dineInTimes?.find(
            t => t.day?.toLowerCase() === localDayName.toLowerCase()
          );

          const tomorrowDayTimes = details.currentTimes?.driveThruTimes?.find(
            t => t.day?.toLowerCase() === tomorrowDayName.toLowerCase()
          ) || details.currentTimes?.dineInTimes?.find(
            t => t.day?.toLowerCase() === tomorrowDayName.toLowerCase()
          );

          const opens = dayTimes?.opens || '10:00 AM';
          const closes = dayTimes?.closes || '10:00 PM';
          const tomorrowOpens = tomorrowDayTimes?.opens || '10:00 AM';

          const parseLocalTime = (timeStr) => {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (!match) return null;
            const hrs = parseInt(match[1], 10);
            const mins = parseInt(match[2], 10);
            const ampm = match[3].toUpperCase();
            
            let hr24 = hrs;
            if (ampm === 'PM' && hrs < 12) hr24 += 12;
            if (ampm === 'AM' && hrs === 12) hr24 = 0;
            
            const dt = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
            dt.setHours(hr24, mins, 0, 0);
            return dt;
          };

          const openDate = parseLocalTime(opens);
          const closeDate = parseLocalTime(closes);
          const nowLocalDate = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));

          let isOpen = false;
          let isBeforeOpen = false;
          let isClosedForNight = false;
          let closingSoon = false;
          let statusText = '';

          if (nowLocalDate < openDate) {
            isBeforeOpen = true;
            isOpen = false;
            isClosedForNight = false;
            closingSoon = false;
            statusText = `Closed - Opens today at ${opens}`;
          } else if (nowLocalDate >= openDate && nowLocalDate < closeDate) {
            isOpen = true;
            isBeforeOpen = false;
            isClosedForNight = false;
            const diffMin = (closeDate.getTime() - nowLocalDate.getTime()) / (1000 * 60);
            closingSoon = diffMin > 0 && diffMin <= 60;
            if (closingSoon) {
              const minsRounded = Math.round(diffMin);
              statusText = `Open Until ${closes} (Closing soon in ${minsRounded} ${minsRounded === 1 ? 'minute' : 'minutes'})`;
            } else {
              statusText = `Open Until ${closes}`;
            }
          } else {
            isOpen = false;
            isBeforeOpen = false;
            isClosedForNight = true;
            closingSoon = false;
            statusText = `Closed for the night - Opens tomorrow at ${tomorrowOpens}`;
          }

          return {
            success: true,
            todayFlavor,
            tomorrowFlavor,
            statusText,
            isOpen,
            isBeforeOpen,
            isClosedForNight,
            openTimeToday: opens,
            closeTimeToday: closes,
            openTimeTomorrow: tomorrowOpens,
            closingSoon
          };
        }
      } catch (parseError) {
        console.warn("Failed to parse Next.js data for Culver's, falling back to DOM scraper:", parseError.message);
      }
    }

    // --- DOM Scraper Fallback ---
    const calendarFlavors = [];

    // Primary calendar selector
    $('a.RestaurantCalendarPanel_containerItemContentFlavorLink__Kvd0e').each((_, el) => {
      calendarFlavors.push($(el).text().trim());
    });

    if (calendarFlavors.length === 0) {
      $('[class*="ItemContentFlavorLink"]').each((_, el) => {
        calendarFlavors.push($(el).text().trim());
      });
    }

    let todayFlavor = calendarFlavors[0] || '';
    let tomorrowFlavor = calendarFlavors[1] || '';

    if (!todayFlavor) {
      todayFlavor = $('h2.RestaurantDetails_containerRestaurantFlavorContentHeading__sLzcV').text().trim() ||
        $('[class*="FlavorContentHeading"]').text().trim();
    }

    const cleanFlavor = (str) => str ? str.replace(/®/g, '').replace(/™/g, '').trim() : 'unknown flavor';
    todayFlavor = cleanFlavor(todayFlavor);
    tomorrowFlavor = cleanFlavor(tomorrowFlavor);

    const tz = process.env.TIMEZONE || 'America/Chicago';
    const nowLocalDate = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const currentHour24 = nowLocalDate.getHours();
    const currentMin = nowLocalDate.getMinutes();

    let isOpen = false;
    let isBeforeOpen = false;
    let isClosedForNight = false;
    let closingSoon = false;
    let statusText = '';
    const openTimeToday = '10:00 AM';
    const closeTimeToday = '10:00 PM';
    const openTimeTomorrow = '10:00 AM';

    if (currentHour24 < 10) {
      isBeforeOpen = true;
      statusText = `Closed - Opens today at ${openTimeToday}`;
    } else if (currentHour24 < 22) {
      isOpen = true;
      if (currentHour24 === 21) {
        closingSoon = true;
        const minsLeft = 60 - currentMin;
        statusText = `Open Until ${closeTimeToday} (Closing soon in ${minsLeft} ${minsLeft === 1 ? 'minute' : 'minutes'})`;
      } else {
        statusText = `Open Until ${closeTimeToday}`;
      }
    } else {
      isClosedForNight = true;
      statusText = `Closed for the night - Opens tomorrow at ${openTimeTomorrow}`;
    }

    return {
      success: true,
      todayFlavor,
      tomorrowFlavor,
      statusText,
      isOpen,
      isBeforeOpen,
      isClosedForNight,
      openTimeToday,
      closeTimeToday,
      openTimeTomorrow,
      closingSoon
    };
  } catch (error) {
    console.error("Error scraping Culver's details:", error.message);
    const tz = process.env.TIMEZONE || 'America/Chicago';
    const nowLocalDate = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const currentHour24 = nowLocalDate.getHours();
    const isBeforeOpen = currentHour24 < 10;
    const isClosedForNight = currentHour24 >= 22;
    const isOpen = currentHour24 >= 10 && currentHour24 < 22;

    return {
      success: false,
      todayFlavor: 'unknown flavor',
      tomorrowFlavor: 'unknown flavor',
      statusText: isBeforeOpen ? 'Closed - Opens today at 10:00 AM' : (isOpen ? 'Open Until 10:00 PM' : 'Closed for the night - Opens tomorrow at 10:00 AM'),
      isOpen,
      isBeforeOpen,
      isClosedForNight,
      openTimeToday: '10:00 AM',
      closeTimeToday: '10:00 PM',
      openTimeTomorrow: '10:00 AM',
      closingSoon: false
    };
  }
}

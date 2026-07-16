/**
 * Fetches International Space Station (ISS) flyover predictions for Verona, WI.
 */
export async function fetchISSFlyover() {
  const lat = 42.9897;
  const lon = -89.5356;
  const url = `https://iss-api.polluxlabs.io/iss-pass?lat=${lat}&lon=${lon}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ISS API returned status: ${response.status}`);
    }
    const data = await response.json();
    const passes = data.passes || [];

    const now = new Date();
    const twelveHoursMs = 12 * 60 * 60 * 1000; // Look ahead 12 hours

    // Find the next visible pass in the future within the next 12 hours
    const nextPass = passes.find(p => {
      if (!p.visible) return false;
      const startTime = new Date(p.visible_start || p.rise.time);
      const diffMs = startTime.getTime() - now.getTime();
      return diffMs > 0 && diffMs <= twelveHoursMs;
    });

    if (nextPass) {
      const startTime = new Date(nextPass.visible_start || nextPass.rise.time);
      const localTimeStr = startTime.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit'
      });
      const durationMin = Math.round(nextPass.visible_duration_sec / 60) || 1;
      const peakElevation = Math.round(nextPass.culmination.elevation_deg);
      
      // Expand compass directions for natural reading (e.g. WNW -> West Northwest)
      const compassMap = {
        'N': 'North', 'NNE': 'North Northeast', 'NE': 'Northeast', 'ENE': 'East Northeast',
        'E': 'East', 'ESE': 'East Southeast', 'SE': 'Southeast', 'SSE': 'South Southeast',
        'S': 'South', 'SSW': 'South Southwest', 'SW': 'Southwest', 'WSW': 'West Southwest',
        'W': 'West', 'WNW': 'West Northwest', 'NW': 'Northwest', 'NNW': 'North Northwest'
      };
      
      const startCompass = compassMap[nextPass.rise.compass] || nextPass.rise.compass || 'horizon';
      const endCompass = compassMap[nextPass.set.compass] || nextPass.set.compass || 'horizon';

      return {
        hasPass: true,
        text: `The ISS will be visible tonight starting at ${localTimeStr} for ${durationMin} minutes. Look for it rising in the ${startCompass} and setting in the ${endCompass}, reaching a peak elevation of ${peakElevation} degrees.`,
        details: {
          time: localTimeStr,
          durationMin,
          peakElevation,
          startCompass,
          endCompass
        }
      };
    }

    return {
      hasPass: false,
      text: 'No visible ISS passes tonight.'
    };
  } catch (error) {
    console.error('Error fetching ISS passes:', error.message);
    return {
      hasPass: false,
      text: 'ISS tracking details currently unavailable.'
    };
  }
}

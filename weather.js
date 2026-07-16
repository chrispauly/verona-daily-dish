/**
 * Fetches current weather for Verona, WI using Open-Meteo API
 */

// WMO Weather interpretation codes
const WEATHER_CODES = {
  0: 'clear skies',
  1: 'mainly clear skies',
  2: 'partly cloudy skies',
  3: 'overcast skies',
  45: 'foggy conditions',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  56: 'light freezing drizzle',
  57: 'dense freezing drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  66: 'light freezing rain',
  67: 'heavy freezing rain',
  71: 'slight snow fall',
  73: 'moderate snow fall',
  75: 'heavy snow fall',
  77: 'snow grains',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'slight snow showers',
  86: 'heavy snow showers',
  95: 'a thunderstorm',
  96: 'a thunderstorm with slight hail',
  99: 'a thunderstorm with heavy hail'
};

// Notable Verona, WI landmarks to add local flavor
const VERONA_LANDMARKS = [
  "Harriet Park",
  "Fireman's Park",
  "Reddan Soccer Park",
  "Verona Community Park",
  "Badger Prairie County Park",
  "Military Ridge State Trail",
  "Verona Area High School",
  "Badger Ridge Middle School",
  "Verona City Hall",
  "Verona Public Library"
];

function getRandomLandmark() {
  const idx = Math.floor(Math.random() * VERONA_LANDMARKS.length);
  return VERONA_LANDMARKS[idx];
}

/**
 * Calculates the current moon phase using a standard astronomical approximation.
 */
function getMoonPhase(date = new Date()) {
  // Known new moon reference: Jan 6, 2000 at 18:14 UTC
  const newMoonRef = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const synodicMonth = 29.530588853; // Average length of lunar cycle
  
  const diffMs = date.getTime() - newMoonRef.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const phase = (diffDays / synodicMonth) % 1;
  const normalizedPhase = phase < 0 ? phase + 1 : phase;

  if (normalizedPhase < 0.0625 || normalizedPhase >= 0.9375) return "New Moon";
  if (normalizedPhase < 0.1875) return "Waxing Crescent";
  if (normalizedPhase < 0.3125) return "First Quarter";
  if (normalizedPhase < 0.4375) return "Waxing Gibbous";
  if (normalizedPhase < 0.5625) return "Full Moon";
  if (normalizedPhase < 0.6875) return "Waning Gibbous";
  if (normalizedPhase < 0.8125) return "Third Quarter";
  return "Waning Crescent";
}

export async function fetchWeather() {
  const lat = 42.9897;
  const lon = -89.5356;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,is_day,weather_code&temperature_unit=fahrenheit&timezone=America%2FChicago`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API returned status: ${response.status}`);
    }
    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const apparentTemp = Math.round(data.current.apparent_temperature);
    const isDay = data.current.is_day === 1;
    const code = data.current.weather_code;
    const condition = WEATHER_CODES[code] || 'fair conditions';
    const moonPhase = getMoonPhase(new Date());
    const landmark = getRandomLandmark();

    return {
      success: true,
      temp,
      apparentTemp,
      isDay,
      condition,
      moonPhase,
      landmark,
      text: `${temp} degrees (feels like ${apparentTemp}) with ${condition} at ${landmark}. Day: ${isDay}. Moon phase: ${moonPhase}.`
    };
  } catch (error) {
    console.error('Error fetching weather:', error.message);
    const landmark = getRandomLandmark();
    return {
      success: false,
      temp: 70,
      apparentTemp: 70,
      isDay: true,
      condition: 'fair conditions',
      moonPhase: 'Unknown',
      landmark,
      text: `weather data currently unavailable at ${landmark}`
    };
  }
}

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

// Notable landmarks to add local flavor (with fallback list)
const DEFAULT_LANDMARKS = [
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
  const landmarksStr = process.env.LANDMARKS;
  const landmarks = landmarksStr
    ? landmarksStr.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
    : DEFAULT_LANDMARKS;
  const idx = Math.floor(Math.random() * landmarks.length);
  return landmarks[idx];
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
  const tzName = process.env.TIMEZONE || 'America/Chicago';
  const now = new Date();
  
  const currentHour = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hour: 'numeric',
    hour12: true
  }).format(now);

  const currentHour24 = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(now), 10);

  const lat = parseFloat(process.env.GPS_LAT || '42.9897');
  const lon = parseFloat(process.env.GPS_LON || '-89.5356');
  const tz = encodeURIComponent(tzName);
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,is_day,weather_code&hourly=temperature_2m,precipitation_probability&forecast_days=2&temperature_unit=fahrenheit&timezone=${tz}`;
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;

  try {
    const [response, aqResponse] = await Promise.all([
      fetch(weatherUrl),
      fetch(aqUrl).catch(err => {
        console.error('Error fetching air quality:', err.message);
        return null;
      })
    ]);

    if (!response.ok) {
      throw new Error(`Weather API returned status: ${response.status}`);
    }
    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const apparentTemp = Math.round(data.current.apparent_temperature);
    const isDay = data.current.is_day === 1;
    const code = data.current.weather_code;
    const condition = WEATHER_CODES[code] || 'fair conditions';
    const moonPhase = getMoonPhase(now);
    const landmark = getRandomLandmark();

    let aqi = null;
    let aqiCategory = null;
    if (aqResponse && aqResponse.ok) {
      const aqData = await aqResponse.json();
      aqi = aqData.current?.us_aqi ?? null;
      if (aqi !== null && aqi > 50) {
        if (aqi <= 100) aqiCategory = 'Moderate';
        else if (aqi <= 150) aqiCategory = 'Unhealthy for Sensitive Groups';
        else if (aqi <= 200) aqiCategory = 'Unhealthy';
        else aqiCategory = 'Very Unhealthy';
      }
    }

    const hasElevatedAQI = aqi !== null && aqi > 50;
    const aqiStr = hasElevatedAQI ? ` Air quality index is ${aqi} (${aqiCategory}).` : '';

    const isAfter5Pm = currentHour24 >= 17;
    let overnightLow = null;
    let rainPredicted = null;
    let maxPrecipitationProbability = null;

    if (isAfter5Pm && data.hourly) {
      const startIdx = currentHour24;
      const endIdx = 32; // Tomorrow 8 AM
      if (data.hourly.temperature_2m && data.hourly.precipitation_probability) {
        const temps = data.hourly.temperature_2m.slice(startIdx, endIdx + 1);
        const probs = data.hourly.precipitation_probability.slice(startIdx, endIdx + 1);

        if (temps.length > 0) {
          overnightLow = Math.round(Math.min(...temps));
        }
        if (probs.length > 0) {
          maxPrecipitationProbability = Math.max(...probs);
          rainPredicted = maxPrecipitationProbability >= 20;
        }
      }
    }

    const overnightStr = (isAfter5Pm && overnightLow !== null)
      ? ` The overnight low will be ${overnightLow} degrees and rain is ${rainPredicted ? 'predicted' : 'not predicted'}.`
      : '';

    return {
      success: true,
      temp,
      apparentTemp,
      isDay,
      condition,
      moonPhase,
      landmark,
      currentHour,
      aqi,
      aqiCategory,
      hasElevatedAQI,
      isAfter5Pm,
      overnightLow,
      rainPredicted,
      maxPrecipitationProbability,
      text: `At ${currentHour}, the weather is ${temp} degrees (feels like ${apparentTemp}) with ${condition} at ${landmark}.${aqiStr} Day: ${isDay}. Moon phase: ${moonPhase}.${overnightStr}`
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
      currentHour,
      aqi: null,
      aqiCategory: null,
      hasElevatedAQI: false,
      isAfter5Pm: false,
      overnightLow: null,
      rainPredicted: null,
      maxPrecipitationProbability: null,
      text: `At ${currentHour}, weather data currently unavailable at ${landmark}`
    };
  }
}


/*
 * Current weather from Open-Meteo (free, no API key, no tracking).
 * Results are cached for 30 minutes.
 */
var Weather = (function () {
  'use strict';

  var CACHE_KEY = 'tvdeck:weather';
  var TTL_MS = 30 * 60 * 1000;

  // WMO weather codes -> [label, glyph]
  var CODES = {
    0: ['Clear sky', '☀'], 1: ['Mostly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
    45: ['Fog', '🌫'], 48: ['Fog', '🌫'],
    51: ['Drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Drizzle', '🌦'],
    61: ['Rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
    71: ['Snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '🌨'],
    80: ['Rain showers', '🌦'], 81: ['Rain showers', '🌦'], 82: ['Heavy showers', '⛈'],
    95: ['Thunderstorms', '⛈'], 96: ['Thunderstorms', '⛈'], 99: ['Thunderstorms', '⛈']
  };

  // State abbreviations people type after the city ("Arraial do Cabo, RJ").
  var STATES = {
    ac: 'acre', al: 'alagoas', ap: 'amapá', am: 'amazonas', ba: 'bahia', ce: 'ceará', df: 'distrito federal',
    es: 'espírito santo', go: 'goiás', ma: 'maranhão', mt: 'mato grosso', ms: 'mato grosso do sul',
    mg: 'minas gerais', pa: 'pará', pb: 'paraíba', pr: 'paraná', pe: 'pernambuco', pi: 'piauí',
    rj: 'rio de janeiro', rn: 'rio grande do norte', rs: 'rio grande do sul', ro: 'rondônia', rr: 'roraima',
    sc: 'santa catarina', sp: 'são paulo', se: 'sergipe', to: 'tocantins'
  };

  function getJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function readCache(city) {
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (cached && cached.city === city && Date.now() - cached.at < TTL_MS) return cached.data;
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeCache(city, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city, at: Date.now(), data: data }));
    } catch (e) { /* ignore */ }
  }

  function fetchCurrent(city) {
    var cached = readCache(city);
    if (cached) return Promise.resolve(cached);

    // Brazil first, so "Arraial do Cabo" is the one in Rio de Janeiro; any
    // country if Brazil has no such place. "Cidade, Estado" narrows the state.
    var parts = city.split(',');
    var name = parts[0].trim();
    var state = (parts[1] || '').trim().toLowerCase();
    var geoBase = 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&name=' + encodeURIComponent(name);
    function pick(geo) {
      var list = (geo && geo.results) || [];
      if (state) {
        var match = list.filter(function (r) {
          var adm = (r.admin1 || '').toLowerCase();
          return adm === state || adm.indexOf(state) === 0 || (STATES[state] && adm === STATES[state]);
        })[0];
        if (match) return match;
      }
      return list[0];
    }
    return getJSON(geoBase + '&countryCode=BR').then(function (geo) {
      return pick(geo) || getJSON(geoBase).then(pick);
    }).then(function (place) {
      if (!place) throw new Error('City not found');
      return place;
    }).then(function (place) {
      var url = 'https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto' +
        '&latitude=' + place.latitude + '&longitude=' + place.longitude;
      return getJSON(url).then(function (forecast) {
        var code = forecast.current.weather_code;
        var info = CODES[code] || ['', '🌡'];
        var data = {
          place: place.name,
          region: place.admin1 || '',
          temp: Math.round(forecast.current.temperature_2m),
          max: forecast.daily ? Math.round(forecast.daily.temperature_2m_max[0]) : null,
          min: forecast.daily ? Math.round(forecast.daily.temperature_2m_min[0]) : null,
          wind: forecast.current.wind_speed_10m != null ? Math.round(forecast.current.wind_speed_10m) : null,
          label: info[0],
          glyph: info[1]
        };
        writeCache(city, data);
        return data;
      });
    });
  }

  return { fetchCurrent: fetchCurrent };
})();

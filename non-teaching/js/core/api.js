// ============================================================================
// API LAYER — Centralized fetch with caching and auth injection
// ============================================================================

(function () {
  'use strict';

  var API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : 'http://localhost:5000/api';

  // ── IN-MEMORY CACHE ──────────────────────────────────────────────────────
  var cache = {};

  function getCacheKey(url) {
    return url;
  }

  function getCached(url, ttlMs) {
    var key = getCacheKey(url);
    var entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      delete cache[key];
      return null;
    }
    return entry.data;
  }

  function setCache(url, data) {
    cache[getCacheKey(url)] = {
      data: data,
      timestamp: Date.now()
    };
  }

  function invalidateCache(urlPattern) {
    if (!urlPattern) {
      cache = {};
      return;
    }
    var keys = Object.keys(cache);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(urlPattern) !== -1) {
        delete cache[keys[i]];
      }
    }
  }

  // ── AUTH TOKEN ───────────────────────────────────────────────────────────
  async function getToken() {
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
      try {
        return await window.firebaseAuth.currentUser.getIdToken();
      } catch (e) {
        console.error('[API] Token error:', e);
      }
    }
    return null;
  }

  async function buildHeaders(extra) {
    var headers = { 'Content-Type': 'application/json' };
    var token = await getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (extra) {
      Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
    }
    return headers;
  }

  // ── CORE FETCH ───────────────────────────────────────────────────────────
  async function fetchWithCache(url, ttlMs) {
    var fullUrl = url.startsWith('http') ? url : API_BASE + url;
    ttlMs = ttlMs || 60000;

    var cached = getCached(fullUrl, ttlMs);
    if (cached) return cached;

    var headers = await buildHeaders();
    var response = await fetch(fullUrl, { headers: headers });
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    var data = await response.json();
    setCache(fullUrl, data);
    return data;
  }

  async function post(url, data) {
    var fullUrl = url.startsWith('http') ? url : API_BASE + url;
    var headers = await buildHeaders();
    var response = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });
    var result = await response.json();
    return result;
  }

  async function put(url, data) {
    var fullUrl = url.startsWith('http') ? url : API_BASE + url;
    var headers = await buildHeaders();
    var response = await fetch(fullUrl, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data)
    });
    var result = await response.json();
    return result;
  }

  async function del(url) {
    var fullUrl = url.startsWith('http') ? url : API_BASE + url;
    var headers = await buildHeaders();
    var response = await fetch(fullUrl, {
      method: 'DELETE',
      headers: headers
    });
    var result = await response.json();
    return result;
  }

  // ── TTL CONSTANTS (ms) ──────────────────────────────────────────────────
  var TTL = {
    STUDENTS: 300000,       // 5 minutes
    STREAMS: 1800000,       // 30 minutes
    SUBJECTS: 1800000,      // 30 minutes
    ATTENDANCE: 30000,      // 30 seconds
    TEACHERS: 600000,       // 10 minutes
    DASHBOARD: 60000,       // 60 seconds
    PARENT_STATUS: 60000    // 60 seconds
  };

  // ── ENDPOINT REGISTRY ───────────────────────────────────────────────────
  var API = {
    students: {
      list: function () { return fetchWithCache('/students/all', TTL.STUDENTS); },
      streams: function () { return fetchWithCache('/students/streams', TTL.STREAMS); },
      subjects: function (type) { return fetchWithCache('/subjects/' + (type || 'all'), TTL.SUBJECTS); },
      languages: function () { return fetchWithCache('/subjects/languages', TTL.SUBJECTS); },
      electives: function () { return fetchWithCache('/students/subjects/electives', TTL.SUBJECTS); },
      create: function (data) {
        return post('/students', data).then(function (r) {
          invalidateCache('/students');
          return r;
        });
      },
      createBulk: function (data) {
        return post('/students/bulk', data).then(function (r) {
          invalidateCache('/students');
          return r;
        });
      },
      update: function (id, data) {
        return put('/students/' + id, data).then(function (r) {
          invalidateCache('/students');
          return r;
        });
      },
      delete: function (id) {
        return del('/students/' + id).then(function (r) {
          invalidateCache('/students');
          return r;
        });
      },
      managementStreams: function () { return fetchWithCache('/students/management/streams', TTL.STREAMS); },
      createStream: function (data) {
        return post('/students/management/streams', data).then(function (r) {
          invalidateCache('/students');
          invalidateCache('/management');
          return r;
        });
      },
      createSubject: function (data) {
        return post('/students/management/subjects', data).then(function (r) {
          invalidateCache('/subjects');
          return r;
        });
      }
    },

    attendance: {
      byDate: function (date) { return fetchWithCache('/attendance?date=' + date, TTL.ATTENDANCE); },
      update: function (data) {
        return post('/attendance/bulk', data).then(function (r) {
          invalidateCache('/attendance');
          invalidateCache('/dashboard');
          return r;
        });
      }
    },

    dashboard: {
      stats: function () { return fetchWithCache('/dashboard/stats', TTL.DASHBOARD); },
      trend: function (period) { return fetchWithCache('/dashboard/attendance-trend?period=' + (period || 'month'), TTL.DASHBOARD); }
    },

    teachers: {
      list: function () { return fetchWithCache('/teacher/all', TTL.TEACHERS); },
      profile: function (email) { return fetchWithCache('/teacher/profile/email/' + encodeURIComponent(email), TTL.TEACHERS); },
      create: function (data) {
        return post('/teacher', data).then(function (r) {
          invalidateCache('/teacher');
          return r;
        });
      },
      update: function (id, data) {
        return put('/teacher/' + id, data).then(function (r) {
          invalidateCache('/teacher');
          return r;
        });
      },
      delete: function (id) {
        return del('/teacher/' + id).then(function (r) {
          invalidateCache('/teacher');
          return r;
        });
      }
    },

    parents: {
      statusReport: function () { return fetchWithCache('/parent/status-report', TTL.PARENT_STATUS); },
      resetPassword: function (studentID, newPassword) {
        return post('/parent/admin-reset-password', { studentID: studentID, newPassword: newPassword });
      }
    },

    mentorship: {
      list: function () { return fetchWithCache('/mentorship', TTL.TEACHERS); },
      assign: function (data) {
        return post('/mentorship/assign', data).then(function (r) {
          invalidateCache('/mentorship');
          return r;
        });
      }
    },

    promotion: {
      preview: function (data) { return post('/promotion/preview', data); },
      execute: function (data) {
        return post('/promotion/execute', data).then(function (r) {
          invalidateCache('/students');
          invalidateCache('/dashboard');
          return r;
        });
      }
    },

    reports: {
      generate: function (params) {
        var query = Object.keys(params).map(function (k) {
          return k + '=' + encodeURIComponent(params[k]);
        }).join('&');
        return fetchWithCache('/reports?' + query, TTL.ATTENDANCE);
      }
    }
  };

  // ── EXPORT ──────────────────────────────────────────────────────────────
  window.AppAPI = API;
  window.AppAPI.fetchWithCache = fetchWithCache;
  window.AppAPI.invalidateCache = invalidateCache;
  window.AppAPI.post = post;
  window.AppAPI.put = put;
  window.AppAPI.del = del;
  window.AppAPI.TTL = TTL;
  window.AppAPI.getToken = getToken;

})();

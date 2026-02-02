// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// ============================================================================
// MIDDLEWARE
// ============================================================================

const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not available'
    });
  }
  req.db = db;
  next();
};

router.use(checkDB);

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

// GET Dashboard Overview Stats - SaaS Focused
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching SaaS dashboard statistics...');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Get current date info
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate date ranges
    const startOfToday = new Date(currentYear, currentMonth, now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const startOfMonth = new Date(currentYear, currentMonth, 1);

    // ========== CORE STATS ==========
    const [
      totalStudents,
      activeStudents,
      totalStreams,
      totalSubjects,
      todayAttendance,
      thisWeekAttendance,
      lastWeekAttendance,
      allStreams
    ] = await Promise.all([
      req.db.collection('students').countDocuments(),
      req.db.collection('students').countDocuments({ isActive: true }),
      req.db.collection('students').distinct('stream', { isActive: true }).then(arr => arr.length),
      req.db.collection('subjects').countDocuments({ isActive: true }),
      req.db.collection('attendance').find({ date: today }).toArray(),
      req.db.collection('attendance').find({ createdAt: { $gte: startOfWeek, $lt: startOfToday } }).toArray(),
      req.db.collection('attendance').find({ createdAt: { $gte: startOfLastWeek, $lt: startOfWeek } }).toArray(),
      req.db.collection('students').distinct('stream', { isActive: true })
    ]);

    // ========== TODAY'S ATTENDANCE (Count unique students only) ==========
    let todayPresent = 0, todayTotal = 0;
    const uniqueStudentsToday = new Set();
    const uniqueTotalStudentsToday = new Map(); // Track unique stream+semester combinations

    todayAttendance.forEach(r => {
      const key = `${r.stream}-${r.semester}`;

      // Count unique students present (by their IDs if available)
      if (r.studentsPresent && Array.isArray(r.studentsPresent)) {
        r.studentsPresent.forEach(studentId => {
          uniqueStudentsToday.add(`${key}-${studentId}`);
        });
      } else {
        // If no student IDs, just add present count for this unique class
        if (!uniqueTotalStudentsToday.has(key)) {
          todayPresent += r.presentCount || 0;
        }
      }

      // Track unique total students per stream+semester (don't double count)
      if (!uniqueTotalStudentsToday.has(key)) {
        uniqueTotalStudentsToday.set(key, r.totalStudents || 0);
      }
    });

    // If we tracked unique student IDs, use that count
    if (uniqueStudentsToday.size > 0) {
      todayPresent = uniqueStudentsToday.size;
    }

    // Sum up unique totals
    todayTotal = Array.from(uniqueTotalStudentsToday.values()).reduce((sum, val) => sum + val, 0);

    const todayAbsent = todayTotal - todayPresent;
    const todayRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

    // ========== WEEKLY COMPARISON ==========
    let thisWeekPresent = 0, thisWeekTotal = 0, lastWeekPresent = 0, lastWeekTotal = 0;
    thisWeekAttendance.forEach(r => {
      thisWeekPresent += r.presentCount || r.studentsPresent?.length || 0;
      thisWeekTotal += r.totalStudents || 0;
    });
    lastWeekAttendance.forEach(r => {
      lastWeekPresent += r.presentCount || r.studentsPresent?.length || 0;
      lastWeekTotal += r.totalStudents || 0;
    });
    const thisWeekRate = thisWeekTotal > 0 ? Math.round((thisWeekPresent / thisWeekTotal) * 100) : 0;
    const lastWeekRate = lastWeekTotal > 0 ? Math.round((lastWeekPresent / lastWeekTotal) * 100) : 0;
    const weeklyTrend = lastWeekRate > 0 ? thisWeekRate - lastWeekRate : 0;

    // ========== MONTHLY RATE ==========
    const monthlyAttendance = await req.db.collection('attendance').find({ createdAt: { $gte: startOfMonth } }).toArray();
    let monthPresent = 0, monthTotal = 0;
    monthlyAttendance.forEach(r => {
      monthPresent += r.presentCount || r.studentsPresent?.length || 0;
      monthTotal += r.totalStudents || 0;
    });
    const attendanceRate = monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 100) : 0;

    // ========== TOP PERFORMING STREAMS (by Stream + Semester) ==========
    const streamStats = await req.db.collection('attendance').aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: { stream: '$stream', semester: '$semester' },
          totalPresent: { $sum: { $ifNull: ['$presentCount', 0] } },
          totalStudents: { $sum: { $ifNull: ['$totalStudents', 0] } },
          sessions: { $sum: 1 }
        }
      },
      { $match: { totalStudents: { $gt: 0 } } },
      {
        $project: {
          stream: '$_id.stream',
          semester: '$_id.semester',
          label: { $concat: ['$_id.stream', ' - Sem ', { $toString: '$_id.semester' }] },
          rate: { $round: [{ $multiply: [{ $divide: ['$totalPresent', '$totalStudents'] }, 100] }, 0] },
          sessions: 1
        }
      },
      { $sort: { rate: -1 } },
      { $limit: 6 }
    ]).toArray();

    // ========== ALERTS ==========
    const alerts = [];
    const lowStreams = streamStats.filter(s => s.rate < 75);

    if (todayRate > 0 && todayRate < 70) {
      alerts.push({ type: 'warning', icon: 'warning', title: 'Low Attendance Today', description: `Only ${todayRate}% attendance today`, severity: 'high' });
    }
    if (weeklyTrend < -5) {
      alerts.push({ type: 'warning', icon: 'trending_down', title: 'Declining Trend', description: `${Math.abs(weeklyTrend)}% drop from last week`, severity: 'medium' });
    }
    if (lowStreams.length > 0) {
      const lowClassLabels = lowStreams.slice(0, 3).map(s => s.label || `${s.stream} - Sem ${s.semester}`).join(', ');
      alerts.push({ type: 'alert', icon: 'error', title: `${lowStreams.length} Classes Below 75%`, description: lowClassLabels, severity: 'high' });
    }
    if (todayRate >= 90) {
      alerts.push({ type: 'success', icon: 'check_circle', title: 'Great Attendance!', description: `${todayRate}% attendance today`, severity: 'low' });
    }
    if (todayAttendance.length === 0) {
      alerts.push({ type: 'info', icon: 'schedule', title: 'No Classes Marked', description: 'No attendance marked today yet', severity: 'low' });
    }

    // ========== CHARTS ==========
    const streamDistribution = await req.db.collection('students').aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$stream', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    // Attendance Trend - SaaS Style (Daily for last 15 days) - Fixed to avoid duplicate counting
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const attendanceTrendLabels = [];
    const attendanceTrendData = [];
    const dailyDataMap = new Map();

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 14);
    fifteenDaysAgo.setHours(0, 0, 0, 0);

    // First, get all attendance records for last 15 days
    const trendRecords = await req.db.collection('attendance').find({
      $or: [
        { date: { $gte: fifteenDaysAgo.toISOString().split('T')[0] } },
        { createdAt: { $gte: fifteenDaysAgo } }
      ]
    }).toArray();

    // Group by date, then by unique stream+semester (to avoid duplicate counting)
    const dailyStats = new Map();

    trendRecords.forEach(r => {
      const dateStr = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : null);
      if (!dateStr) return;

      const classKey = `${r.stream}-${r.semester}`;

      if (!dailyStats.has(dateStr)) {
        dailyStats.set(dateStr, new Map());
      }

      const dayData = dailyStats.get(dateStr);

      // Only count the first record for each stream+semester per day (or accumulate unique students)
      if (!dayData.has(classKey)) {
        dayData.set(classKey, {
          present: r.presentCount || r.studentsPresent?.length || 0,
          total: r.totalStudents || 0
        });
      }
    });

    // Calculate daily percentages
    dailyStats.forEach((classMap, dateStr) => {
      let dayPresent = 0, dayTotal = 0;
      classMap.forEach(({ present, total }) => {
        dayPresent += present;
        dayTotal += total;
      });

      const dateParts = dateStr.split('-');
      const key = `${parseInt(dateParts[0])}-${parseInt(dateParts[1])}-${parseInt(dateParts[2])}`;
      dailyDataMap.set(key, dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 100) : 0);
    });

    // Fill in last 15 days
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const y = d.getFullYear();

      attendanceTrendLabels.push(`${day} ${monthNames[m - 1]}`);
      attendanceTrendData.push(dailyDataMap.get(`${y}-${m}-${day}`) || 0);
    }

    const streamDistLabels = streamDistribution.length > 0
      ? streamDistribution.map(s => s._id || 'Unknown')
      : ['No Streams'];
    const streamDistData = streamDistribution.length > 0
      ? streamDistribution.map(s => s.count)
      : [0];

    console.log('📊 Chart data prepared:', {
      attendanceTrend: { labels: attendanceTrendLabels, data: attendanceTrendData },
      streamDistribution: { labels: streamDistLabels, count: streamDistData.length }
    });

    const stats = {
      totalStudents, activeStudents, totalStreams, totalSubjects, attendanceRate,
      trends: { students: null, streams: null, subjects: null, attendance: weeklyTrend },
      studentsSubtitle: `${activeStudents} active`, streamsSubtitle: `${allStreams.length} programs`,
      subjectsSubtitle: `${totalSubjects} courses`, attendanceSubtitle: `This month`,
      todayOverview: { present: todayPresent, absent: todayAbsent, total: todayTotal, rate: todayRate, classesMarked: todayAttendance.length, date: today },
      weeklyComparison: { thisWeek: thisWeekRate, lastWeek: lastWeekRate, trend: weeklyTrend, thisWeekSessions: thisWeekAttendance.length, lastWeekSessions: lastWeekAttendance.length },
      topPerformers: streamStats.slice(0, 6).map(s => ({
        stream: s.stream || 'Unknown',
        semester: s.semester,
        label: s.label || `${s.stream} - Sem ${s.semester}`,
        rate: s.rate,
        sessions: s.sessions
      })),
      alerts: alerts.slice(0, 4),
      charts: {
        attendanceTrend: { labels: attendanceTrendLabels, data: attendanceTrendData },
        streamDistribution: { labels: streamDistLabels, data: streamDistData }
      },
      timestamp: new Date()
    };

    console.log('✅ SaaS Dashboard:', { students: totalStudents, todayRate: todayRate + '%', alerts: alerts.length });
    res.json({ success: true, stats });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RECENT ACTIVITIES
// ============================================================================

// GET Recent Activities
router.get('/activities', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    console.log(`📋 Fetching last ${limit} activities...`);

    // Fetch recent students
    const recentStudents = await req.db.collection('students')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // Fetch recent attendance records
    const recentAttendance = await req.db.collection('attendance')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const activities = [
      ...recentStudents.map(student => ({
        type: 'student_registered',
        title: `${student.name} registered`,
        description: `${student.stream} - Semester ${student.semester}`,
        timestamp: student.createdAt || new Date(),
        badge: 'new',
        avatar: student.name?.substring(0, 2).toUpperCase() || 'ST'
      })),
      ...recentAttendance.map(record => ({
        type: 'attendance_marked',
        title: 'Attendance marked',
        description: `${record.stream || 'N/A'} - ${record.subject || 'N/A'}`,
        timestamp: record.createdAt || new Date(),
        badge: 'completed',
        avatar: 'AT'
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

    console.log(`✅ Found ${activities.length} activities`);

    res.json({
      success: true,
      activities,
      count: activities.length
    });

  } catch (error) {
    console.error('❌ Error fetching activities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// STREAM STATISTICS
// ============================================================================

// GET Stream-wise Statistics
router.get('/streams/stats', async (req, res) => {
  try {
    console.log('📚 Fetching stream-wise statistics...');

    const streamStats = await req.db.collection('students')
      .aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$stream',
            totalStudents: { $sum: 1 },
            semesters: { $addToSet: '$semester' }
          }
        },
        { $sort: { totalStudents: -1 } }
      ])
      .toArray();

    const formattedStats = streamStats.map(stat => ({
      stream: stat._id,
      totalStudents: stat.totalStudents,
      semesterCount: stat.semesters.length,
      semesters: stat.semesters.sort()
    }));

    console.log(`✅ Found ${formattedStats.length} streams`);

    res.json({
      success: true,
      streamStats: formattedStats,
      totalStreams: formattedStats.length
    });

  } catch (error) {
    console.error('❌ Error fetching stream stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ATTENDANCE STATISTICS
// ============================================================================

// GET Attendance Statistics
router.get('/attendance/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    console.log('📈 Fetching attendance statistics...');

    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const attendanceRecords = await req.db.collection('attendance')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalRecords = attendanceRecords.length;

    attendanceRecords.forEach(record => {
      totalPresent += (record.presentCount || record.studentsPresent?.length || 0);
      totalAbsent += (record.absentCount || 0);
    });

    const totalMarked = totalPresent + totalAbsent;
    const attendanceRate = totalMarked > 0 ? ((totalPresent / totalMarked) * 100).toFixed(2) : 0;

    // Daily attendance trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const dailyTrends = await req.db.collection('attendance')
      .aggregate([
        {
          $match: {
            date: { $gte: sevenDaysAgoStr }
          }
        },
        {
          $group: {
            _id: '$date',
            present: { $sum: { $ifNull: ['$presentCount', 0] } },
            absent: { $sum: { $ifNull: ['$absentCount', 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray();

    console.log(`✅ Found ${totalRecords} attendance records`);

    res.json({
      success: true,
      attendanceStats: {
        totalPresent,
        totalAbsent,
        totalRecords,
        attendanceRate: parseFloat(attendanceRate),
        dailyTrends: dailyTrends.map(d => ({
          date: d._id,
          present: d.present,
          absent: d.absent
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching attendance stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// QUICK SUMMARY
// ============================================================================

// GET Quick Dashboard Summary (for fast loading)
router.get('/summary', async (req, res) => {
  try {
    console.log('⚡ Fetching quick dashboard summary...');

    const [totalStudents, totalStreams, totalSubjects] = await Promise.all([
      req.db.collection('students').countDocuments({ isActive: true }),
      req.db.collection('students').distinct('stream', { isActive: true }).then(arr => arr.length),
      req.db.collection('subjects').countDocuments({ isActive: true })
    ]);

    // Quick attendance rate
    const recentAttendance = await req.db.collection('attendance')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    let attendanceRate = 0;
    if (recentAttendance.length > 0) {
      const totalPresent = recentAttendance.reduce((sum, r) => sum + (r.presentCount || 0), 0);
      const totalMarked = recentAttendance.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
      attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0;
    }

    console.log('✅ Summary fetched successfully');

    res.json({
      success: true,
      summary: {
        totalStudents,
        totalStreams,
        totalSubjects,
        attendanceRate
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ATTENDANCE TREND BY PERIOD (Week/Month/Year)
// ============================================================================

router.get('/attendance-trend', async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let daysToFetch, labelFormat;
    
    switch (period) {
      case 'week':
        daysToFetch = 7;
        labelFormat = 'day'; // Show day names
        break;
      case 'year':
        daysToFetch = 365;
        labelFormat = 'month'; // Show month names
        break;
      case 'month':
      default:
        daysToFetch = 30;
        labelFormat = 'date'; // Show dates
        break;
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (daysToFetch - 1));
    startDate.setHours(0, 0, 0, 0);
    
    // Get all attendance records for the period
    const trendRecords = await req.db.collection('attendance').find({
      $or: [
        { date: { $gte: startDate.toISOString().split('T')[0] } },
        { createdAt: { $gte: startDate } }
      ]
    }).toArray();
    
    // Group by date
    const dailyStats = new Map();
    
    trendRecords.forEach(r => {
      const dateStr = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : null);
      if (!dateStr) return;
      
      const classKey = `${r.stream}-${r.semester}`;
      
      if (!dailyStats.has(dateStr)) {
        dailyStats.set(dateStr, new Map());
      }
      
      const dayData = dailyStats.get(dateStr);
      
      if (!dayData.has(classKey)) {
        dayData.set(classKey, {
          present: r.presentCount || r.studentsPresent?.length || 0,
          total: r.totalStudents || 0
        });
      }
    });
    
    // Calculate daily percentages
    const dailyDataMap = new Map();
    dailyStats.forEach((classMap, dateStr) => {
      let dayPresent = 0, dayTotal = 0;
      classMap.forEach(({ present, total }) => {
        dayPresent += present;
        dayTotal += total;
      });
      dailyDataMap.set(dateStr, dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 100) : 0);
    });
    
    const labels = [];
    const data = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    if (labelFormat === 'month') {
      // For year view - aggregate by month
      const monthlyData = new Map();
      
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
        monthlyData.set(monthKey, { total: 0, count: 0 });
      }
      
      dailyDataMap.forEach((rate, dateStr) => {
        const [y, m] = dateStr.split('-').map(Number);
        const key = `${y}-${m}`;
        if (monthlyData.has(key)) {
          const mData = monthlyData.get(key);
          mData.total += rate;
          mData.count += 1;
        }
      });
      
      monthlyData.forEach((mData, key) => {
        const [y, m] = key.split('-').map(Number);
        labels.push(monthNames[m - 1]);
        data.push(mData.count > 0 ? Math.round(mData.total / mData.count) : 0);
      });
      
    } else {
      // For week/month view - show each day
      for (let i = daysToFetch - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        if (labelFormat === 'day') {
          labels.push(dayNames[d.getDay()]);
        } else {
          labels.push(`${d.getDate()} ${monthNames[d.getMonth()]}`);
        }
        
        data.push(dailyDataMap.get(dateStr) || 0);
      }
    }
    
    console.log(`📊 Attendance trend (${period}):`, labels.length, 'data points');
    
    res.json({
      success: true,
      period,
      trend: { labels, data }
    });
    
  } catch (error) {
    console.error('❌ Error fetching attendance trend:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Dashboard API is running',
    database: req.db ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

module.exports = router;

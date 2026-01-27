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

    // ========== TODAY'S ATTENDANCE ==========
    let todayPresent = 0, todayTotal = 0;
    todayAttendance.forEach(r => {
      todayPresent += r.presentCount || r.studentsPresent?.length || 0;
      todayTotal += r.totalStudents || 0;
    });
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

    // ========== TOP PERFORMING STREAMS ==========
    const streamStats = await req.db.collection('attendance').aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: '$stream', totalPresent: { $sum: { $ifNull: ['$presentCount', 0] } }, totalStudents: { $sum: { $ifNull: ['$totalStudents', 0] } }, sessions: { $sum: 1 } } },
      { $match: { totalStudents: { $gt: 0 } } },
      { $project: { stream: '$_id', rate: { $round: [{ $multiply: [{ $divide: ['$totalPresent', '$totalStudents'] }, 100] }, 0] }, sessions: 1 } },
      { $sort: { rate: -1 } },
      { $limit: 5 }
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
      alerts.push({ type: 'alert', icon: 'error', title: `${lowStreams.length} Streams Below 75%`, description: lowStreams.slice(0, 2).map(s => s.stream).join(', '), severity: 'high' });
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

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyTrend = await req.db.collection('attendance').aggregate([
      { $addFields: { dateObj: { $cond: { if: { $eq: [{ $type: '$date' }, 'string'] }, then: { $dateFromString: { dateString: '$date', onError: '$createdAt' } }, else: { $ifNull: ['$date', '$createdAt'] } } } } },
      { $match: { dateObj: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$dateObj' }, month: { $month: '$dateObj' } }, totalPresent: { $sum: { $ifNull: ['$presentCount', 0] } }, totalStudents: { $sum: { $ifNull: ['$totalStudents', 0] } } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]).toArray();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ========== BUILD RESPONSE ==========
    // Build chart data with fallbacks for empty data
    const attendanceTrendLabels = monthlyTrend.length > 0 
      ? monthlyTrend.map(i => monthNames[i._id.month - 1]) 
      : ['No Data'];
    const attendanceTrendData = monthlyTrend.length > 0 
      ? monthlyTrend.map(i => i.totalStudents > 0 ? Math.round((i.totalPresent / i.totalStudents) * 100) : 0) 
      : [0];
    const streamDistLabels = streamDistribution.length > 0 
      ? streamDistribution.map(s => s._id || 'Unknown') 
      : ['No Streams'];
    const streamDistData = streamDistribution.length > 0 
      ? streamDistribution.map(s => s.count) 
      : [0];

    console.log('📊 Chart data prepared:', { 
      attendanceTrend: { labels: attendanceTrendLabels, dataPoints: attendanceTrendData.length },
      streamDistribution: { labels: streamDistLabels, dataPoints: streamDistData.length }
    });

    const stats = {
      totalStudents, activeStudents, totalStreams, totalSubjects, attendanceRate,
      trends: { students: null, streams: null, subjects: null, attendance: weeklyTrend },
      studentsSubtitle: `${activeStudents} active`, streamsSubtitle: `${allStreams.length} programs`,
      subjectsSubtitle: `${totalSubjects} courses`, attendanceSubtitle: `This month`,
      todayOverview: { present: todayPresent, absent: todayAbsent, total: todayTotal, rate: todayRate, classesMarked: todayAttendance.length, date: today },
      weeklyComparison: { thisWeek: thisWeekRate, lastWeek: lastWeekRate, trend: weeklyTrend, thisWeekSessions: thisWeekAttendance.length, lastWeekSessions: lastWeekAttendance.length },
      topPerformers: streamStats.slice(0, 4).map(s => ({ stream: s.stream || 'Unknown', rate: s.rate, sessions: s.sessions })),
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

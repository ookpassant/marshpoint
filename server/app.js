require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const marshalRoutes = require('./routes/marshals');
const invitationRoutes = require('./routes/invitations');
const applyRoutes = require('./routes/apply');
const { router: applicationRoutes } = require('./routes/applications');
const scheduleRoutes = require('./routes/schedule');
const commsRoutes = require('./routes/comms');
const paymentRoutes = require('./routes/payments');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'marshpoint', time: new Date().toISOString() }));

// Public (token-auth) routes.
app.use('/api', applyRoutes);

// Auth + admin routes.
app.use('/api', authRoutes);
app.use('/api', eventRoutes);
app.use('/api', marshalRoutes);
app.use('/api', invitationRoutes);
app.use('/api', applicationRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', commsRoutes);
app.use('/api', paymentRoutes);
app.use('/api', reportRoutes);

// 404 for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler (handles Multer file-size/type errors with friendly copy).
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: "That file's too large. Try a photo rather than a scanned PDF." });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = parseInt(process.env.PORT, 10) || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Marshpoint API listening on port ${PORT}`);
  });
}

module.exports = app;

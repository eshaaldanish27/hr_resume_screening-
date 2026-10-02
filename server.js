const express = require('express');
const cors = require('cors');
const path = require('path');
const sql = require('mssql');

const app = express();

app.use(cors());
app.use(express.json());

// In-memory candidate storage for Live Demo Mode (when no DB is connected)
const memoryCandidates = [
  {
    CandidateID: 1,
    FullName: 'Alex Rivera',
    Email: 'alex.rivera@devmail.io',
    TargetPosition: 'Full-Stack Software Engineer',
    MatchScore: 92,
    ImprovementsText: 'Enhance AWS deployment experience.',
    CreatedDate: new Date().toISOString()
  }
];

// Determine database environment mode
const isLocal = !process.env.DB_SERVER || process.env.DB_SERVER === 'localhost' || process.env.DB_SERVER === '(local)';

// Serve static frontend assets
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Flexible DB configuration
const dbConfig = isLocal
  ? {
      connectionString: process.env.DB_CONNECTION_STRING || 'Driver={SQL Server};Server=(local);Database=HR_ScreenerDB;Trusted_Connection=yes;',
      driver: 'msnodesqlv8',
      connectionTimeout: 5000,
      requestTimeout: 5000
    }
  : {
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME || 'HR_ScreenerDB',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: true
      },
      connectionTimeout: 10000,
      requestTimeout: 10000
    };

// Single re-usable connection pool variable
let poolPromise;
const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise;
};

// API Endpoint: Save candidate record
app.post('/api/save-candidate', async (req, res) => {
  const { fullName, email, targetPosition, matchScore, improvementsText } = req.body;
  console.log('Received save payload:', { fullName, email, targetPosition, matchScore });

  // FALLBACK DEMO MODE: Runs on live host when DB_SERVER is not configured
  if (!process.env.DB_SERVER && process.env.NODE_ENV === 'production') {
    const newCandidate = {
      CandidateID: memoryCandidates.length + 1,
      FullName: fullName || 'Alex Rivera',
      Email: email || 'alex.rivera@devmail.io',
      TargetPosition: targetPosition || 'Full-Stack Software Engineer',
      MatchScore: matchScore !== undefined ? matchScore : 92,
      ImprovementsText: improvementsText || 'None provided',
      CreatedDate: new Date().toISOString()
    };
    memoryCandidates.unshift(newCandidate);
    console.log('✅ DEMO MODE: Candidate recorded in memory!');
    return res.json({ success: true, message: 'Candidate recorded (Demo Mode) successfully!', candidate: newCandidate });
  }

  // REAL SQL SAVE LOGIC
  try {
    const pool = await getPool();

    await pool.request()
      .input('FullName', sql.VarChar(100), fullName || 'Alex Rivera')
      .input('Email', sql.VarChar(100), email || 'alex.rivera@devmail.io')
      .input('TargetPosition', sql.VarChar(100), targetPosition || 'Full-Stack Software Engineer')
      .input('MatchScore', sql.Int, matchScore !== undefined ? matchScore : 92)
      .input('ImprovementsText', sql.NVarChar(sql.MAX), improvementsText || 'None provided')
      .query(`
        INSERT INTO CandidateLedger (FullName, Email, TargetPosition, MatchScore, ImprovementsText)
        VALUES (@FullName, @Email, @TargetPosition, @MatchScore, @ImprovementsText)
      `);

    console.log('✅ SUCCESS: Saved to CandidateLedger table!');
    return res.json({ success: true, message: 'Candidate recorded in MS SQL DB successfully!' });

  } catch (err) {
    console.error('❌ SQL SAVE ERROR:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API Endpoint: Fetch all saved candidate records for UI Ledger
app.get('/api/candidates', async (req, res) => {
  // FALLBACK DEMO MODE: Returns in-memory records on Vercel
  if (!process.env.DB_SERVER && process.env.NODE_ENV === 'production') {
    return res.json({ success: true, candidates: memoryCandidates });
  }

  // REAL SQL FETCH LOGIC
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT CandidateID, FullName, Email, TargetPosition, MatchScore, ImprovementsText, CreatedDate
      FROM CandidateLedger
      ORDER BY CandidateID DESC
    `);

    return res.json({ success: true, candidates: result.recordset });

  } catch (err) {
    console.error('❌ SQL FETCH ERROR:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
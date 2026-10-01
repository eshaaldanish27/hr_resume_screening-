require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Determine database environment mode (Local Windows ODBC vs. Production Cloud SQL)
const isLocal = !process.env.DB_SERVER || process.env.DB_SERVER === 'localhost' || process.env.DB_SERVER === '(local)';

// Dynamically select driver based on environment
const sql = isLocal ? require('mssql/msnodesqlv8') : require('mssql');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Flexible DB configuration: Windows Authentication locally, Standard SQL Auth in production
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
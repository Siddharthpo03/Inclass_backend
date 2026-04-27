// Quick script to create colleges table and insert data
// Run this: node scripts/setup-colleges.js

const pool = require("../db");

const colleges = [
  { name: 'Massachusetts Institute of Technology', country: 'United States', state: 'Massachusetts', city: 'Cambridge', type: 'University' },
  { name: 'Harvard University', country: 'United States', state: 'Massachusetts', city: 'Cambridge', type: 'University' },
  { name: 'Stanford University', country: 'United States', state: 'California', city: 'Stanford', type: 'University' },
  { name: 'University of California, Berkeley', country: 'United States', state: 'California', city: 'Berkeley', type: 'University' },
  { name: 'California Institute of Technology', country: 'United States', state: 'California', city: 'Pasadena', type: 'Institute' },
  { name: 'Yale University', country: 'United States', state: 'Connecticut', city: 'New Haven', type: 'University' },
  { name: 'Princeton University', country: 'United States', state: 'New Jersey', city: 'Princeton', type: 'University' },
  { name: 'University of Chicago', country: 'United States', state: 'Illinois', city: 'Chicago', type: 'University' },
  { name: 'Columbia University', country: 'United States', state: 'New York', city: 'New York', type: 'University' },
  { name: 'University of Pennsylvania', country: 'United States', state: 'Pennsylvania', city: 'Philadelphia', type: 'University' },
  { name: 'Cornell University', country: 'United States', state: 'New York', city: 'Ithaca', type: 'University' },
  { name: 'University of Michigan', country: 'United States', state: 'Michigan', city: 'Ann Arbor', type: 'University' },
  { name: 'University of California, Los Angeles', country: 'United States', state: 'California', city: 'Los Angeles', type: 'University' },
  { name: 'University of Texas at Austin', country: 'United States', state: 'Texas', city: 'Austin', type: 'University' },
  { name: 'New York University', country: 'United States', state: 'New York', city: 'New York', type: 'University' },
  { name: 'Carnegie Mellon University', country: 'United States', state: 'Pennsylvania', city: 'Pittsburgh', type: 'University' },
  { name: 'University of Washington', country: 'United States', state: 'Washington', city: 'Seattle', type: 'University' },
  { name: 'University of Illinois at Urbana-Champaign', country: 'United States', state: 'Illinois', city: 'Urbana', type: 'University' },
  { name: 'Georgia Institute of Technology', country: 'United States', state: 'Georgia', city: 'Atlanta', type: 'Institute' },
  { name: 'Duke University', country: 'United States', state: 'North Carolina', city: 'Durham', type: 'University' },
  { name: 'Northwestern University', country: 'United States', state: 'Illinois', city: 'Evanston', type: 'University' },
  { name: 'Johns Hopkins University', country: 'United States', state: 'Maryland', city: 'Baltimore', type: 'University' },
  { name: 'University of California, San Diego', country: 'United States', state: 'California', city: 'San Diego', type: 'University' },
  { name: 'University of Wisconsin-Madison', country: 'United States', state: 'Wisconsin', city: 'Madison', type: 'University' },
  { name: 'University of Southern California', country: 'United States', state: 'California', city: 'Los Angeles', type: 'University' },
  { name: 'Rice University', country: 'United States', state: 'Texas', city: 'Houston', type: 'University' },
  { name: 'University of North Carolina at Chapel Hill', country: 'United States', state: 'North Carolina', city: 'Chapel Hill', type: 'University' },
  { name: 'Boston University', country: 'United States', state: 'Massachusetts', city: 'Boston', type: 'University' },
  { name: 'Pennsylvania State University', country: 'United States', state: 'Pennsylvania', city: 'University Park', type: 'University' },
  { name: 'Ohio State University', country: 'United States', state: 'Ohio', city: 'Columbus', type: 'University' },
  { name: 'Purdue University', country: 'United States', state: 'Indiana', city: 'West Lafayette', type: 'University' },
  { name: 'Indian Institute of Technology, Delhi', country: 'India', state: 'Delhi', city: 'New Delhi', type: 'Institute' },
  { name: 'Indian Institute of Technology, Bombay', country: 'India', state: 'Maharashtra', city: 'Mumbai', type: 'Institute' },
  { name: 'Indian Institute of Technology, Madras', country: 'India', state: 'Tamil Nadu', city: 'Chennai', type: 'Institute' },
  { name: 'Indian Institute of Technology, Kanpur', country: 'India', state: 'Uttar Pradesh', city: 'Kanpur', type: 'Institute' },
  { name: 'Indian Institute of Technology, Kharagpur', country: 'India', state: 'West Bengal', city: 'Kharagpur', type: 'Institute' },
  { name: 'Indian Institute of Science', country: 'India', state: 'Karnataka', city: 'Bangalore', type: 'Institute' },
  { name: 'Delhi University', country: 'India', state: 'Delhi', city: 'New Delhi', type: 'University' },
  { name: 'Jawaharlal Nehru University', country: 'India', state: 'Delhi', city: 'New Delhi', type: 'University' },
  { name: 'University of Mumbai', country: 'India', state: 'Maharashtra', city: 'Mumbai', type: 'University' },
  { name: 'University of Calcutta', country: 'India', state: 'West Bengal', city: 'Kolkata', type: 'University' },
  { name: 'Anna University', country: 'India', state: 'Tamil Nadu', city: 'Chennai', type: 'University' },
  { name: 'Birla Institute of Technology and Science', country: 'India', state: 'Rajasthan', city: 'Pilani', type: 'Institute' },
  { name: 'National Institute of Technology, Trichy', country: 'India', state: 'Tamil Nadu', city: 'Tiruchirappalli', type: 'Institute' },
  { name: 'Vellore Institute of Technology', country: 'India', state: 'Tamil Nadu', city: 'Vellore', type: 'Institute' },
  { name: 'Manipal Institute of Technology', country: 'India', state: 'Karnataka', city: 'Manipal', type: 'Institute' }
];

async function setupColleges() {
  try {
    console.log("🔨 Creating colleges table if it doesn't exist...");
    
    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS colleges (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        country VARCHAR(100) DEFAULT 'United States',
        state VARCHAR(100),
        city VARCHAR(100),
        type VARCHAR(50) DEFAULT 'University',
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
      CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);
      CREATE INDEX IF NOT EXISTS idx_colleges_is_active ON colleges(is_active);
    `);
    
    console.log("✅ Colleges table created!");
    
    // Insert colleges
    console.log("📝 Inserting colleges...");
    let inserted = 0;
    for (const college of colleges) {
      const result = await pool.query(
        `INSERT INTO colleges (name, country, state, city, type, is_active) 
         VALUES ($1, $2, $3, $4, $5, true) 
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [college.name, college.country, college.state, college.city, college.type]
      );
      if (result.rowCount > 0) {
        inserted++;
      }
    }
    
    console.log(`✅ Inserted ${inserted} new colleges (${colleges.length - inserted} already existed)`);
    
    // Verify
    const check = await pool.query("SELECT COUNT(*) as count FROM colleges WHERE is_active = true");
    console.log(`📊 Total active colleges in database: ${check.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting up colleges:", error);
    process.exit(1);
  }
}

setupColleges();


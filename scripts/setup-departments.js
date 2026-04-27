// Quick script to create departments table and insert data
// Run this: node scripts/setup-departments.js

const pool = require("../db");

const departments = [
  { name: 'Computer Science', code: 'CS', description: 'Computer Science and Engineering' },
  { name: 'Electrical Engineering', code: 'EE', description: 'Electrical and Electronics Engineering' },
  { name: 'Mechanical Engineering', code: 'ME', description: 'Mechanical Engineering' },
  { name: 'Civil Engineering', code: 'CE', description: 'Civil Engineering' },
  { name: 'Chemical Engineering', code: 'CHE', description: 'Chemical Engineering' },
  { name: 'Aerospace Engineering', code: 'AE', description: 'Aerospace and Aeronautical Engineering' },
  { name: 'Biomedical Engineering', code: 'BME', description: 'Biomedical and Bioengineering' },
  { name: 'Mathematics', code: 'MATH', description: 'Mathematics and Applied Mathematics' },
  { name: 'Physics', code: 'PHY', description: 'Physics and Applied Physics' },
  { name: 'Chemistry', code: 'CHEM', description: 'Chemistry and Chemical Sciences' },
  { name: 'Biology', code: 'BIO', description: 'Biological Sciences' },
  { name: 'Biotechnology', code: 'BT', description: 'Biotechnology and Life Sciences' },
  { name: 'Information Technology', code: 'IT', description: 'Information Technology' },
  { name: 'Electronics and Communication Engineering', code: 'ECE', description: 'Electronics and Communication Engineering' },
  { name: 'Data Science', code: 'DS', description: 'Data Science and Analytics' },
  { name: 'Artificial Intelligence', code: 'AI', description: 'Artificial Intelligence and Machine Learning' },
  { name: 'Cybersecurity', code: 'CSEC', description: 'Cybersecurity and Information Security' },
  { name: 'Software Engineering', code: 'SE', description: 'Software Engineering' },
  { name: 'Business Administration', code: 'MBA', description: 'Business Administration and Management' },
  { name: 'Economics', code: 'ECON', description: 'Economics and Finance' },
  { name: 'English', code: 'ENG', description: 'English Language and Literature' },
  { name: 'History', code: 'HIST', description: 'History and Social Sciences' },
  { name: 'Psychology', code: 'PSY', description: 'Psychology and Behavioral Sciences' },
  { name: 'Architecture', code: 'ARCH', description: 'Architecture and Design' },
  { name: 'Pharmacy', code: 'PHARM', description: 'Pharmaceutical Sciences' },
  { name: 'Medicine', code: 'MED', description: 'Medical Sciences' },
  { name: 'Law', code: 'LAW', description: 'Law and Legal Studies' },
  { name: 'Education', code: 'EDU', description: 'Education and Teaching' },
  { name: 'Environmental Science', code: 'ENV', description: 'Environmental Science and Engineering' },
  { name: 'Materials Science', code: 'MS', description: 'Materials Science and Engineering' }
];

async function setupDepartments() {
  try {
    console.log("🔨 Creating departments table if it doesn't exist...");
    
    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(20),
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (name)
      )
    `);
    
    // Create index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
      CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
      CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);
    `);
    
    console.log("✅ Departments table created!");
    
    // Insert departments
    console.log("📝 Inserting departments...");
    let inserted = 0;
    for (const dept of departments) {
      const result = await pool.query(
        `INSERT INTO departments (name, code, description, is_active) 
         VALUES ($1, $2, $3, true) 
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [dept.name, dept.code, dept.description]
      );
      if (result.rowCount > 0) {
        inserted++;
      }
    }
    
    console.log(`✅ Inserted ${inserted} new departments (${departments.length - inserted} already existed)`);
    
    // Verify
    const check = await pool.query("SELECT COUNT(*) as count FROM departments WHERE is_active = true");
    console.log(`📊 Total active departments in database: ${check.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting up departments:", error);
    process.exit(1);
  }
}

setupDepartments();


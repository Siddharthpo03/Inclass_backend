-- ============================================
-- InClass Database Schema v2.0
-- ============================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. COLLEGES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS colleges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    state VARCHAR(100),
    city VARCHAR(100),
    type VARCHAR(50) DEFAULT 'University',
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 2. DEPARTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(20),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 3. USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'faculty', 'student')),
    roll_no VARCHAR(50),
    mobile_number VARCHAR(20),
    country_code VARCHAR(5) DEFAULT '+91',
    gender VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    college VARCHAR(255),
    department VARCHAR(255),
    college_id INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    section VARCHAR(10),
    year_semester VARCHAR(20),
    college_id_number VARCHAR(50),
    employee_id VARCHAR(50),
    designation VARCHAR(100),
    passport_photo_url TEXT,
    face_enrolled BOOLEAN DEFAULT FALSE,
    fingerprint_enrolled BOOLEAN DEFAULT FALSE,
    embedding vector(512),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

-- ---------------------------------------------------------------------------
-- 4. COURSES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    credits INTEGER DEFAULT 3,
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    college_id INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    section VARCHAR(10),
    year_semester VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_courses_faculty_id ON courses(faculty_id);
CREATE INDEX IF NOT EXISTS idx_courses_college_id ON courses(college_id);
CREATE INDEX IF NOT EXISTS idx_courses_department_id ON courses(department_id);

-- ---------------------------------------------------------------------------
-- 5. SESSIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_code VARCHAR(10) UNIQUE,
    code_expires_at TIMESTAMP,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_course_id ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_faculty_id ON sessions(faculty_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_code ON sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);

-- ---------------------------------------------------------------------------
-- 6. ATTENDANCE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    marked_by VARCHAR(20) DEFAULT 'student' CHECK (marked_by IN ('student', 'faculty', 'system')),
    face_verified BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,
    notes TEXT,
    UNIQUE(session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_course_id ON attendance(course_id);

-- ---------------------------------------------------------------------------
-- 7. REGISTRATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_registrations_student_id ON registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_registrations_course_id ON registrations(course_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

-- ---------------------------------------------------------------------------
-- 8. OTPs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    otp_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_otps_user_id ON otps(user_id);

-- ---------------------------------------------------------------------------
-- 9. BIOMETRIC FACE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biometric_face (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_embedding TEXT,
    embedding_version VARCHAR(20) DEFAULT 'v1',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_biometric_face_user_id ON biometric_face(user_id);

-- ---------------------------------------------------------------------------
-- 10. WEBAUTHN CREDENTIALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    sign_count INTEGER DEFAULT 0,
    device_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id);

-- ---------------------------------------------------------------------------
-- 11. EXPIRED CODE REPORTS (UC-04)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expired_code_reports (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 12. DUPLICATE REPORTS (UC-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS duplicate_reports (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 13. MEDICAL LEAVES (UC-02)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_leaves (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT,
    certificate_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 14. SEED: DEPARTMENTS
-- ---------------------------------------------------------------------------
INSERT INTO departments (name, code, description) VALUES
('Computer Science and Engineering', 'CSE', 'Computer Science and Engineering'),
('Electrical Engineering', 'EE', 'Electrical and Electronics Engineering'),
('Mechanical Engineering', 'ME', 'Mechanical Engineering'),
('Civil Engineering', 'CE', 'Civil Engineering'),
('Chemical Engineering', 'CHE', 'Chemical Engineering'),
('Aerospace Engineering', 'AE', 'Aerospace and Aeronautical Engineering'),
('Biomedical Engineering', 'BME', 'Biomedical and Bioengineering'),
('Mathematics', 'MATH', 'Mathematics and Applied Mathematics'),
('Physics', 'PHY', 'Physics and Applied Physics'),
('Chemistry', 'CHEM', 'Chemistry and Chemical Sciences'),
('Biology', 'BIO', 'Biological Sciences'),
('Biotechnology', 'BT', 'Biotechnology and Life Sciences'),
('Information Technology', 'IT', 'Information Technology'),
('Electronics and Communication Engineering', 'ECE', 'Electronics and Communication Engineering'),
('Data Science', 'DS', 'Data Science and Analytics'),
('Artificial Intelligence', 'AI', 'Artificial Intelligence and Machine Learning'),
('Cybersecurity', 'CSEC', 'Cybersecurity and Information Security'),
('Software Engineering', 'SE', 'Software Engineering'),
('Business Administration', 'MBA', 'Business Administration and Management'),
('Economics', 'ECON', 'Economics and Finance'),
('English', 'ENG', 'English Language and Literature'),
('History', 'HIST', 'History and Social Sciences'),
('Psychology', 'PSY', 'Psychology and Behavioral Sciences'),
('Architecture', 'ARCH', 'Architecture and Design'),
('Pharmacy', 'PHARM', 'Pharmaceutical Sciences'),
('Medicine', 'MED', 'Medical Sciences'),
('Law', 'LAW', 'Law and Legal Studies'),
('Education', 'EDU', 'Education and Teaching'),
('Environmental Science', 'ENV', 'Environmental Science and Engineering'),
('Materials Science', 'MS', 'Materials Science and Engineering')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 15. SEED: COLLEGES (Real World)
-- ---------------------------------------------------------------------------
INSERT INTO colleges (name, country, state, city, type) VALUES
-- NITs India
('NIT Warangal', 'India', 'Telangana', 'Warangal', 'Institute'),
('NIT Trichy', 'India', 'Tamil Nadu', 'Tiruchirappalli', 'Institute'),
('NIT Surathkal', 'India', 'Karnataka', 'Mangalore', 'Institute'),
('NIT Calicut', 'India', 'Kerala', 'Kozhikode', 'Institute'),
('NIT Rourkela', 'India', 'Odisha', 'Rourkela', 'Institute'),
('NIT Jaipur', 'India', 'Rajasthan', 'Jaipur', 'Institute'),
('NIT Kurukshetra', 'India', 'Haryana', 'Kurukshetra', 'Institute'),
('NIT Durgapur', 'India', 'West Bengal', 'Durgapur', 'Institute'),
('NIT Silchar', 'India', 'Assam', 'Silchar', 'Institute'),
('NIT Allahabad', 'India', 'Uttar Pradesh', 'Prayagraj', 'Institute'),
('NIT Nagpur', 'India', 'Maharashtra', 'Nagpur', 'Institute'),
('NIT Bhopal', 'India', 'Madhya Pradesh', 'Bhopal', 'Institute'),
('NIT Patna', 'India', 'Bihar', 'Patna', 'Institute'),
('NIT Raipur', 'India', 'Chhattisgarh', 'Raipur', 'Institute'),
('NIT Srinagar', 'India', 'Jammu and Kashmir', 'Srinagar', 'Institute'),
('NIT Hamirpur', 'India', 'Himachal Pradesh', 'Hamirpur', 'Institute'),
('NIT Jalandhar', 'India', 'Punjab', 'Jalandhar', 'Institute'),
('NIT Agartala', 'India', 'Tripura', 'Agartala', 'Institute'),
('NIT Meghalaya', 'India', 'Meghalaya', 'Shillong', 'Institute'),
('NIT Manipur', 'India', 'Manipur', 'Imphal', 'Institute'),
('NIT Mizoram', 'India', 'Mizoram', 'Aizawl', 'Institute'),
('NIT Nagaland', 'India', 'Nagaland', 'Dimapur', 'Institute'),
('NIT Puducherry', 'India', 'Puducherry', 'Karaikal', 'Institute'),
('NIT Sikkim', 'India', 'Sikkim', 'Ravangla', 'Institute'),
('NIT Arunachal Pradesh', 'India', 'Arunachal Pradesh', 'Yupia', 'Institute'),
('NIT Goa', 'India', 'Goa', 'Ponda', 'Institute'),
('NIT Delhi', 'India', 'Delhi', 'New Delhi', 'Institute'),
('NIT Andhra Pradesh', 'India', 'Andhra Pradesh', 'Tadepalligudem', 'Institute'),
('NIT Uttarakhand', 'India', 'Uttarakhand', 'Srinagar', 'Institute'),
('NIT Jamshedpur', 'India', 'Jharkhand', 'Jamshedpur', 'Institute'),
-- IITs India
('IIT Bombay', 'India', 'Maharashtra', 'Mumbai', 'Institute'),
('IIT Delhi', 'India', 'Delhi', 'New Delhi', 'Institute'),
('IIT Madras', 'India', 'Tamil Nadu', 'Chennai', 'Institute'),
('IIT Kanpur', 'India', 'Uttar Pradesh', 'Kanpur', 'Institute'),
('IIT Kharagpur', 'India', 'West Bengal', 'Kharagpur', 'Institute'),
('IIT Roorkee', 'India', 'Uttarakhand', 'Roorkee', 'Institute'),
('IIT Guwahati', 'India', 'Assam', 'Guwahati', 'Institute'),
('IIT Hyderabad', 'India', 'Telangana', 'Hyderabad', 'Institute'),
('IIT Indore', 'India', 'Madhya Pradesh', 'Indore', 'Institute'),
('IIT Jodhpur', 'India', 'Rajasthan', 'Jodhpur', 'Institute'),
('IIT Mandi', 'India', 'Himachal Pradesh', 'Mandi', 'Institute'),
('IIT Patna', 'India', 'Bihar', 'Patna', 'Institute'),
('IIT Ropar', 'India', 'Punjab', 'Ropar', 'Institute'),
('IIT Bhubaneswar', 'India', 'Odisha', 'Bhubaneswar', 'Institute'),
('IIT Gandhinagar', 'India', 'Gujarat', 'Gandhinagar', 'Institute'),
('IIT Varanasi (BHU)', 'India', 'Uttar Pradesh', 'Varanasi', 'Institute'),
('IIT Palakkad', 'India', 'Kerala', 'Palakkad', 'Institute'),
('IIT Tirupati', 'India', 'Andhra Pradesh', 'Tirupati', 'Institute'),
('IIT Dhanbad (ISM)', 'India', 'Jharkhand', 'Dhanbad', 'Institute'),
('IIT Bhilai', 'India', 'Chhattisgarh', 'Bhilai', 'Institute'),
('IIT Goa', 'India', 'Goa', 'Ponda', 'Institute'),
('IIT Jammu', 'India', 'Jammu and Kashmir', 'Jammu', 'Institute'),
('IIT Dharwad', 'India', 'Karnataka', 'Dharwad', 'Institute'),
-- IIMs India
('IIM Ahmedabad', 'India', 'Gujarat', 'Ahmedabad', 'Institute'),
('IIM Bangalore', 'India', 'Karnataka', 'Bangalore', 'Institute'),
('IIM Calcutta', 'India', 'West Bengal', 'Kolkata', 'Institute'),
('IIM Lucknow', 'India', 'Uttar Pradesh', 'Lucknow', 'Institute'),
('IIM Kozhikode', 'India', 'Kerala', 'Kozhikode', 'Institute'),
('IIM Indore', 'India', 'Madhya Pradesh', 'Indore', 'Institute'),
('IIM Shillong', 'India', 'Meghalaya', 'Shillong', 'Institute'),
('IIM Rohtak', 'India', 'Haryana', 'Rohtak', 'Institute'),
('IIM Ranchi', 'India', 'Jharkhand', 'Ranchi', 'Institute'),
('IIM Raipur', 'India', 'Chhattisgarh', 'Raipur', 'Institute'),
('IIM Trichy', 'India', 'Tamil Nadu', 'Tiruchirappalli', 'Institute'),
('IIM Udaipur', 'India', 'Rajasthan', 'Udaipur', 'Institute'),
('IIM Kashipur', 'India', 'Uttarakhand', 'Kashipur', 'Institute'),
('IIM Nagpur', 'India', 'Maharashtra', 'Nagpur', 'Institute'),
('IIM Visakhapatnam', 'India', 'Andhra Pradesh', 'Visakhapatnam', 'Institute'),
('IIM Bodh Gaya', 'India', 'Bihar', 'Bodh Gaya', 'Institute'),
('IIM Sirmaur', 'India', 'Himachal Pradesh', 'Sirmaur', 'Institute'),
('IIM Sambalpur', 'India', 'Odisha', 'Sambalpur', 'Institute'),
('IIM Jammu', 'India', 'Jammu and Kashmir', 'Jammu', 'Institute'),
('IIM Amritsar', 'India', 'Punjab', 'Amritsar', 'Institute'),
-- IISc & Other Premier Institutes
('Indian Institute of Science', 'India', 'Karnataka', 'Bangalore', 'Institute'),
('BITS Pilani', 'India', 'Rajasthan', 'Pilani', 'Institute'),
('BITS Hyderabad', 'India', 'Telangana', 'Hyderabad', 'Institute'),
('BITS Goa', 'India', 'Goa', 'Goa', 'Institute'),
('BITS Mumbai', 'India', 'Maharashtra', 'Mumbai', 'Institute'),
('VIT Vellore', 'India', 'Tamil Nadu', 'Vellore', 'University'),
('VIT Chennai', 'India', 'Tamil Nadu', 'Chennai', 'University'),
('VIT Amaravati', 'India', 'Andhra Pradesh', 'Amaravati', 'University'),
('VIT Bhopal', 'India', 'Madhya Pradesh', 'Bhopal', 'University'),
('Manipal Institute of Technology', 'India', 'Karnataka', 'Manipal', 'Institute'),
('SRM Institute of Science and Technology', 'India', 'Tamil Nadu', 'Chennai', 'University'),
('Amrita Vishwa Vidyapeetham', 'India', 'Tamil Nadu', 'Coimbatore', 'University'),
('Thapar Institute of Engineering', 'India', 'Punjab', 'Patiala', 'Institute'),
('SASTRA University', 'India', 'Tamil Nadu', 'Thanjavur', 'University'),
('PSG College of Technology', 'India', 'Tamil Nadu', 'Coimbatore', 'College'),
('SSN College of Engineering', 'India', 'Tamil Nadu', 'Chennai', 'College'),
('RV College of Engineering', 'India', 'Karnataka', 'Bangalore', 'College'),
('PES University', 'India', 'Karnataka', 'Bangalore', 'University'),
('BMS College of Engineering', 'India', 'Karnataka', 'Bangalore', 'College'),
('MSRIT', 'India', 'Karnataka', 'Bangalore', 'Institute'),
('Jadavpur University', 'India', 'West Bengal', 'Kolkata', 'University'),
('Anna University', 'India', 'Tamil Nadu', 'Chennai', 'University'),
('Osmania University', 'India', 'Telangana', 'Hyderabad', 'University'),
('University of Hyderabad', 'India', 'Telangana', 'Hyderabad', 'University'),
('JNTU Hyderabad', 'India', 'Telangana', 'Hyderabad', 'University'),
('JNTU Kakinada', 'India', 'Andhra Pradesh', 'Kakinada', 'University'),
('JNTU Anantapur', 'India', 'Andhra Pradesh', 'Anantapur', 'University'),
('Andhra University', 'India', 'Andhra Pradesh', 'Visakhapatnam', 'University'),
('Sri Venkateswara University', 'India', 'Andhra Pradesh', 'Tirupati', 'University'),
('Kakatiya University', 'India', 'Telangana', 'Warangal', 'University'),
('University of Delhi', 'India', 'Delhi', 'New Delhi', 'University'),
('Jawaharlal Nehru University', 'India', 'Delhi', 'New Delhi', 'University'),
('University of Mumbai', 'India', 'Maharashtra', 'Mumbai', 'University'),
('Pune University', 'India', 'Maharashtra', 'Pune', 'University'),
('University of Calcutta', 'India', 'West Bengal', 'Kolkata', 'University'),
('University of Madras', 'India', 'Tamil Nadu', 'Chennai', 'University'),
('Bangalore University', 'India', 'Karnataka', 'Bangalore', 'University'),
('Kerala University', 'India', 'Kerala', 'Thiruvananthapuram', 'University'),
('Calicut University', 'India', 'Kerala', 'Malappuram', 'University'),
('Cochin University of Science and Technology', 'India', 'Kerala', 'Kochi', 'University'),
('Gujarat University', 'India', 'Gujarat', 'Ahmedabad', 'University'),
('Rajasthan University', 'India', 'Rajasthan', 'Jaipur', 'University'),
('Panjab University', 'India', 'Punjab', 'Chandigarh', 'University'),
('Banaras Hindu University', 'India', 'Uttar Pradesh', 'Varanasi', 'University'),
('Aligarh Muslim University', 'India', 'Uttar Pradesh', 'Aligarh', 'University'),
('Hyderabad Central University', 'India', 'Telangana', 'Hyderabad', 'University'),
-- US Universities
('Massachusetts Institute of Technology', 'USA', 'Massachusetts', 'Cambridge', 'Institute'),
('Stanford University', 'USA', 'California', 'Stanford', 'University'),
('Harvard University', 'USA', 'Massachusetts', 'Cambridge', 'University'),
('California Institute of Technology', 'USA', 'California', 'Pasadena', 'Institute'),
('Carnegie Mellon University', 'USA', 'Pennsylvania', 'Pittsburgh', 'University'),
('University of California Berkeley', 'USA', 'California', 'Berkeley', 'University'),
('Princeton University', 'USA', 'New Jersey', 'Princeton', 'University'),
('Yale University', 'USA', 'Connecticut', 'New Haven', 'University'),
('Columbia University', 'USA', 'New York', 'New York', 'University'),
('University of Chicago', 'USA', 'Illinois', 'Chicago', 'University'),
('University of Pennsylvania', 'USA', 'Pennsylvania', 'Philadelphia', 'University'),
('Cornell University', 'USA', 'New York', 'Ithaca', 'University'),
('Johns Hopkins University', 'USA', 'Maryland', 'Baltimore', 'University'),
('University of Michigan', 'USA', 'Michigan', 'Ann Arbor', 'University'),
('University of California Los Angeles', 'USA', 'California', 'Los Angeles', 'University'),
('New York University', 'USA', 'New York', 'New York', 'University'),
('Duke University', 'USA', 'North Carolina', 'Durham', 'University'),
('Northwestern University', 'USA', 'Illinois', 'Evanston', 'University'),
('Georgia Institute of Technology', 'USA', 'Georgia', 'Atlanta', 'Institute'),
('University of Texas Austin', 'USA', 'Texas', 'Austin', 'University'),
-- UK Universities
('University of Oxford', 'UK', 'England', 'Oxford', 'University'),
('University of Cambridge', 'UK', 'England', 'Cambridge', 'University'),
('Imperial College London', 'UK', 'England', 'London', 'College'),
('University College London', 'UK', 'England', 'London', 'University'),
('London School of Economics', 'UK', 'England', 'London', 'School'),
('University of Edinburgh', 'UK', 'Scotland', 'Edinburgh', 'University'),
('University of Manchester', 'UK', 'England', 'Manchester', 'University'),
('Kings College London', 'UK', 'England', 'London', 'College'),
-- Australian Universities
('University of Melbourne', 'Australia', 'Victoria', 'Melbourne', 'University'),
('Australian National University', 'Australia', 'ACT', 'Canberra', 'University'),
('University of Sydney', 'Australia', 'New South Wales', 'Sydney', 'University'),
('University of Queensland', 'Australia', 'Queensland', 'Brisbane', 'University'),
('UNSW Sydney', 'Australia', 'New South Wales', 'Sydney', 'University'),
-- Canadian Universities
('University of Toronto', 'Canada', 'Ontario', 'Toronto', 'University'),
('McGill University', 'Canada', 'Quebec', 'Montreal', 'University'),
('University of British Columbia', 'Canada', 'British Columbia', 'Vancouver', 'University'),
('University of Waterloo', 'Canada', 'Ontario', 'Waterloo', 'University'),
-- Singapore
('National University of Singapore', 'Singapore', NULL, 'Singapore', 'University'),
('Nanyang Technological University', 'Singapore', NULL, 'Singapore', 'University'),
-- Other
('ETH Zurich', 'Switzerland', NULL, 'Zurich', 'Institute'),
('Technical University of Munich', 'Germany', 'Bavaria', 'Munich', 'University'),
('University of Tokyo', 'Japan', 'Tokyo', 'Tokyo', 'University'),
('Peking University', 'China', 'Beijing', 'Beijing', 'University'),
('Tsinghua University', 'China', 'Beijing', 'Beijing', 'University')
ON CONFLICT (name) DO NOTHING;
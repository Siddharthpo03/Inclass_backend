-- ============================================
-- InClass Database Schema - Single Consolidated Schema
-- ============================================
--
-- Complete database schema for InClass Attendance Management System.
-- All tables, indexes, constraints, and seed data in one file.
-- Safe to run multiple times (uses IF NOT EXISTS and conditional ALTERs).
--
-- Usage (pgAdmin or psql):
--   1. Connect to your PostgreSQL database
--   2. Execute this entire file
--
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
    country VARCHAR(100) DEFAULT 'United States',
    state VARCHAR(100),
    city VARCHAR(100),
    type VARCHAR(50) DEFAULT 'University',
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);
CREATE INDEX IF NOT EXISTS idx_colleges_is_active ON colleges(is_active);

-- ---------------------------------------------------------------------------
-- 2. DEPARTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(20),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);

-- ---------------------------------------------------------------------------
-- 3. SEED: Colleges and Departments
-- ---------------------------------------------------------------------------
INSERT INTO colleges (name, country, state, city, type) VALUES
('Massachusetts Institute of Technology', 'United States', 'Massachusetts', 'Cambridge', 'University'),
('Harvard University', 'United States', 'Massachusetts', 'Cambridge', 'University'),
('Stanford University', 'United States', 'California', 'Stanford', 'University'),
('University of California, Berkeley', 'United States', 'California', 'Berkeley', 'University'),
('California Institute of Technology', 'United States', 'California', 'Pasadena', 'Institute'),
('Yale University', 'United States', 'Connecticut', 'New Haven', 'University'),
('Princeton University', 'United States', 'New Jersey', 'Princeton', 'University'),
('University of Chicago', 'United States', 'Illinois', 'Chicago', 'University'),
('Columbia University', 'United States', 'New York', 'New York', 'University'),
('University of Pennsylvania', 'United States', 'Pennsylvania', 'Philadelphia', 'University'),
('Cornell University', 'United States', 'New York', 'Ithaca', 'University'),
('University of Michigan', 'United States', 'Michigan', 'Ann Arbor', 'University'),
('University of California, Los Angeles', 'United States', 'California', 'Los Angeles', 'University'),
('University of Texas at Austin', 'United States', 'Texas', 'Austin', 'University'),
('New York University', 'United States', 'New York', 'New York', 'University'),
('Carnegie Mellon University', 'United States', 'Pennsylvania', 'Pittsburgh', 'University'),
('University of Washington', 'United States', 'Washington', 'Seattle', 'University'),
('University of Illinois at Urbana-Champaign', 'United States', 'Illinois', 'Urbana', 'University'),
('Georgia Institute of Technology', 'United States', 'Georgia', 'Atlanta', 'Institute'),
('Duke University', 'United States', 'North Carolina', 'Durham', 'University'),
('Northwestern University', 'United States', 'Illinois', 'Evanston', 'University'),
('Johns Hopkins University', 'United States', 'Maryland', 'Baltimore', 'University'),
('University of California, San Diego', 'United States', 'California', 'San Diego', 'University'),
('University of Wisconsin-Madison', 'United States', 'Wisconsin', 'Madison', 'University'),
('University of Southern California', 'United States', 'California', 'Los Angeles', 'University'),
('Rice University', 'United States', 'Texas', 'Houston', 'University'),
('University of North Carolina at Chapel Hill', 'United States', 'North Carolina', 'Chapel Hill', 'University'),
('Boston University', 'United States', 'Massachusetts', 'Boston', 'University'),
('Pennsylvania State University', 'United States', 'Pennsylvania', 'University Park', 'University'),
('Ohio State University', 'United States', 'Ohio', 'Columbus', 'University'),
('Purdue University', 'United States', 'Indiana', 'West Lafayette', 'University'),
('Indian Institute of Technology, Delhi', 'India', 'Delhi', 'New Delhi', 'Institute'),
('Indian Institute of Technology, Bombay', 'India', 'Maharashtra', 'Mumbai', 'Institute'),
('Indian Institute of Technology, Madras', 'India', 'Tamil Nadu', 'Chennai', 'Institute'),
('Indian Institute of Technology, Kanpur', 'India', 'Uttar Pradesh', 'Kanpur', 'Institute'),
('Indian Institute of Technology, Kharagpur', 'India', 'West Bengal', 'Kharagpur', 'Institute'),
('Indian Institute of Science', 'India', 'Karnataka', 'Bangalore', 'Institute'),
('Delhi University', 'India', 'Delhi', 'New Delhi', 'University'),
('Jawaharlal Nehru University', 'India', 'Delhi', 'New Delhi', 'University'),
('University of Mumbai', 'India', 'Maharashtra', 'Mumbai', 'University'),
('University of Calcutta', 'India', 'West Bengal', 'Kolkata', 'University'),
('Anna University', 'India', 'Tamil Nadu', 'Chennai', 'University'),
('Birla Institute of Technology and Science', 'India', 'Rajasthan', 'Pilani', 'Institute'),
('National Institute of Technology, Trichy', 'India', 'Tamil Nadu', 'Tiruchirappalli', 'Institute'),
('Vellore Institute of Technology', 'India', 'Tamil Nadu', 'Vellore', 'Institute'),
('Manipal Institute of Technology', 'India', 'Karnataka', 'Manipal', 'Institute')
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name, code, description) VALUES
('Computer Science', 'CS', 'Computer Science and Engineering'),
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
-- 4. USERS (Admin, Faculty, Student)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'faculty', 'student')),
    roll_no VARCHAR(50),
    mobile_number VARCHAR(20),
    country_code VARCHAR(5) DEFAULT '+1',
    passport_photo_url TEXT,
    college VARCHAR(255),
    department VARCHAR(255),
    college_id INTEGER REFERENCES colleges(id),
    department_id INTEGER REFERENCES departments(id),
    face_enrolled BOOLEAN DEFAULT FALSE,
    fingerprint_enrolled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add any columns that may be missing on existing databases
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'mobile_number') THEN
        ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'country_code') THEN
        ALTER TABLE users ADD COLUMN country_code VARCHAR(5) DEFAULT '+1';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'passport_photo_url') THEN
        ALTER TABLE users ADD COLUMN passport_photo_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'college') THEN
        ALTER TABLE users ADD COLUMN college VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department') THEN
        ALTER TABLE users ADD COLUMN department VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'college_id') THEN
        ALTER TABLE users ADD COLUMN college_id INTEGER REFERENCES colleges(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department_id') THEN
        ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'face_enrolled') THEN
        ALTER TABLE users ADD COLUMN face_enrolled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fingerprint_enrolled') THEN
        ALTER TABLE users ADD COLUMN fingerprint_enrolled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'embedding') THEN
        ALTER TABLE users ADD COLUMN embedding vector(512);
    END IF;
END $$;

-- Roll_no: composite unique (college_id, roll_no) so same roll_no can exist in different colleges
DO $$
DECLARE
    cname TEXT;
    rn_attnum INTEGER;
BEGIN
    SELECT attnum INTO rn_attnum FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'roll_no';
    IF rn_attnum IS NOT NULL THEN
        SELECT conname INTO cname FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND contype = 'u' AND array_length(conkey, 1) = 1 AND conkey[1] = rn_attnum;
        IF cname IS NOT NULL THEN
            EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(cname);
        END IF;
        SELECT indexname INTO cname FROM pg_indexes
        WHERE tablename = 'users' AND indexdef LIKE '%UNIQUE%' AND (indexdef LIKE '%roll_no%' OR indexdef LIKE '%(roll_no)%');
        IF cname IS NOT NULL THEN
            EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(cname);
        END IF;
    END IF;
END $$;
DROP INDEX IF EXISTS idx_users_roll_no;
CREATE UNIQUE INDEX IF NOT EXISTS users_college_roll_no_unique ON users (college_id, roll_no) WHERE roll_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users(roll_no);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number);
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

-- ---------------------------------------------------------------------------
-- 5. CLASSES (Faculty course instances)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    course_code VARCHAR(10) NOT NULL,
    title VARCHAR(255) NOT NULL,
    total_classes INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (faculty_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_classes_faculty_id ON classes(faculty_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_code ON classes(course_code);

-- ---------------------------------------------------------------------------
-- 6. SESSIONS (Attendance codes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- 7. ENROLLMENTS (Students in classes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);

-- ---------------------------------------------------------------------------
-- 8. FACE_ENCODINGS (Legacy face descriptor storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS face_encodings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    face_descriptor JSONB NOT NULL,
    enrollment_image_url TEXT,
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_face_encodings_user_id ON face_encodings(user_id);
CREATE INDEX IF NOT EXISTS idx_face_encodings_is_active ON face_encodings(is_active);

-- ---------------------------------------------------------------------------
-- 9. FINGERPRINT_DATA (Legacy WebAuthn – kept for backward compatibility)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fingerprint_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_name VARCHAR(255),
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITHOUT TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fingerprint_data_user_id ON fingerprint_data(user_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_data_credential_id ON fingerprint_data(credential_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_data_is_active ON fingerprint_data(is_active);

-- ---------------------------------------------------------------------------
-- 10. WEBAUTHN_CREDENTIALS (Device biometrics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_name VARCHAR(255),
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITHOUT TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_is_active ON webauthn_credentials(is_active);

-- ---------------------------------------------------------------------------
-- 11. BIOMETRIC_FACE (Encrypted face embeddings – primary face storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biometric_face (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    encrypted_embedding TEXT NOT NULL,
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_biometric_face_user_id ON biometric_face(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_face_is_active ON biometric_face(is_active);

-- ---------------------------------------------------------------------------
-- 12. BIOMETRIC_CONSENT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biometric_consent (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    method VARCHAR(50) DEFAULT 'both',
    ip_address VARCHAR(50),
    user_agent TEXT,
    consented_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITHOUT TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_biometric_consent_user_id ON biometric_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_consent_is_active ON biometric_consent(is_active);

-- ---------------------------------------------------------------------------
-- 13. ATTENDANCE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'Present' NOT NULL CHECK (status IN ('Present', 'Absent', 'Manual')),
    ip_address VARCHAR(50),
    location TEXT,
    face_verified BOOLEAN DEFAULT FALSE,
    face_match_score DECIMAL(5,4),
    fingerprint_verified BOOLEAN DEFAULT FALSE,
    fingerprint_credential_id TEXT,
    is_overridden BOOLEAN DEFAULT FALSE NOT NULL,
    override_reason TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON attendance(created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_face_verified ON attendance(face_verified);

-- ---------------------------------------------------------------------------
-- 14. EXPIRED_CODE_REPORTS (session_id nullable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expired_code_reports (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    report_reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    faculty_response TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITHOUT TIME ZONE
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expired_code_reports' AND column_name = 'session_id' AND is_nullable = 'NO') THEN
        ALTER TABLE expired_code_reports ALTER COLUMN session_id DROP NOT NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_expired_code_reports_student_id ON expired_code_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_expired_code_reports_session_id ON expired_code_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_expired_code_reports_status ON expired_code_reports(status);

-- ---------------------------------------------------------------------------
-- 15. PENDING_STUDENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_students (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    faculty_notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITHOUT TIME ZONE,
    UNIQUE (student_id, faculty_id)
);
CREATE INDEX IF NOT EXISTS idx_pending_students_student_id ON pending_students(student_id);
CREATE INDEX IF NOT EXISTS idx_pending_students_faculty_id ON pending_students(faculty_id);
CREATE INDEX IF NOT EXISTS idx_pending_students_status ON pending_students(status);

-- ---------------------------------------------------------------------------
-- 16. OTPS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_otps_user_id ON otps(user_id);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_otps_is_used ON otps(is_used);

-- ---------------------------------------------------------------------------
-- 17. COURSES (Course catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    description TEXT,
    credits INTEGER,
    semester VARCHAR(50),
    academic_year VARCHAR(20),
    department_id INTEGER REFERENCES departments(id),
    college_id INTEGER REFERENCES colleges(id),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (faculty_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_courses_faculty_id ON courses(faculty_id);
CREATE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code);
CREATE INDEX IF NOT EXISTS idx_courses_department_id ON courses(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_college_id ON courses(college_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_active ON courses(is_active);

-- ---------------------------------------------------------------------------
-- 18. STUDENT_REGISTRATIONS (course_id references courses.id – no FK for flexibility)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_registrations (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    course_id INTEGER NOT NULL,
    faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITHOUT TIME ZONE,
    UNIQUE (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_student_registrations_student_id ON student_registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_registrations_course_id ON student_registrations(course_id);
CREATE INDEX IF NOT EXISTS idx_student_registrations_faculty_id ON student_registrations(faculty_id);
CREATE INDEX IF NOT EXISTS idx_student_registrations_status ON student_registrations(status);

-- ---------------------------------------------------------------------------
-- 19. FINGERPRINT_TEMPLATES (Legacy – kept for backward compatibility)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fingerprint_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    registration_id VARCHAR(255),
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_template TEXT NOT NULL,
    vendor VARCHAR(50),
    enrolled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fingerprint_templates_user_id ON fingerprint_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_templates_student_id ON fingerprint_templates(student_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_templates_vendor ON fingerprint_templates(vendor);
CREATE INDEX IF NOT EXISTS idx_fingerprint_templates_is_active ON fingerprint_templates(is_active);

-- ============================================
-- End of schema
-- ============================================

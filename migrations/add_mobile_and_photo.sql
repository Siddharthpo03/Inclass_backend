-- Migration: Add mobile_number, country_code, and passport_photo_url to users table
-- Run this script to update existing database

-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Add mobile_number column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'mobile_number') THEN
        ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20);
    END IF;

    -- Add country_code column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'country_code') THEN
        ALTER TABLE users ADD COLUMN country_code VARCHAR(5) DEFAULT '+1';
    END IF;

    -- Add passport_photo_url column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'passport_photo_url') THEN
        ALTER TABLE users ADD COLUMN passport_photo_url TEXT;
    END IF;
END $$;

-- Add index for mobile_number if needed
CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number);


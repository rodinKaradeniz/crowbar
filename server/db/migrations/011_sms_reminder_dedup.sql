-- Add sms_reminder_sent flag to prevent duplicate reminders on worker restart
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS sms_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;

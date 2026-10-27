-- Rename bid status 'awarded' to 'converted'
UPDATE bids SET status = 'converted' WHERE status = 'awarded';

-- Update activity log actions
UPDATE activity_logs SET action = 'bid_converted' WHERE action = 'bid_awarded';

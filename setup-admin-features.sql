-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings Table for storing editable configuration
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

-- Insert default call script
INSERT INTO settings (key, value, updated_by) 
VALUES (
  'call_script',
  '{
    "company": "Delaware Fence Solutions",
    "introduction": "Hi, this is [Your Name] from Delaware Fence Solutions. We''re a local fence company specializing in high-quality installations for contractors and property managers.",
    "opening": "I''m reaching out because we work with contractors like [Company Name] to provide reliable fencing solutions for your projects.",
    "products": [
      {"name": "Vinyl Fencing", "description": "Low maintenance, 20+ year warranty"},
      {"name": "Wood Fencing", "description": "Cedar and pine options, custom designs"},
      {"name": "Chain Link", "description": "Commercial grade, galvanized"},
      {"name": "Aluminum", "description": "Decorative and pool code compliant"},
      {"name": "Tools & Materials", "description": "Gates, posts, hardware, repair kits"}
    ],
    "value_prop": "We offer competitive contractor pricing, quick turnaround times, and we handle everything from permits to installation.",
    "questions": [
      "Do you currently work with any fence suppliers?",
      "What types of fencing projects do you typically handle?",
      "Would you be interested in learning about our contractor discount program?"
    ],
    "cta": "I''d love to schedule a brief meeting to show you our product catalog and discuss how we can support your upcoming projects. Would next week work for you?"
  }',
  1
)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activity_logs
CREATE POLICY "Users can view all activity logs" ON activity_logs FOR SELECT USING (true);
CREATE POLICY "System can insert activity logs" ON activity_logs FOR INSERT WITH CHECK (true);

-- RLS Policies for settings
CREATE POLICY "Anyone can read settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON settings FOR UPDATE USING (true);
CREATE POLICY "Admins can insert settings" ON settings FOR INSERT WITH CHECK (true);

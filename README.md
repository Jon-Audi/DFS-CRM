# Delaware Fence Solutions - Contractor CRM

A full-stack web application for managing contractor relationships, tracking outreach, and monitoring sales activities.

## Features

- 🔐 **User Authentication** - Secure login system for team members
- 🏢 **Company Management** - Track 88+ contractors with contact information
- 👥 **Employee Management** - Manage your sales team
- 📞 **Activity Logging** - Record calls, emails, and follow-ups
- 📊 **Dashboard** - Real-time statistics and recent activity feed
- 🔍 **Search & Filter** - Find companies quickly by name, type, or location
- 💾 **Database Storage** - All data persists in a SQLite database

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (can be upgraded to PostgreSQL)
- **Frontend**: React (via CDN)
- **Authentication**: JWT (JSON Web Tokens)
- **Styling**: Tailwind CSS

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)

### Setup Steps

1. **Extract the application files** to your server or local machine

2. **Install dependencies**:
   ```bash
   cd crm-app
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and change the JWT_SECRET to a random string:
   ```
   JWT_SECRET=your-random-secret-key-here-make-it-long-and-random
   ```

4. **Initialize the database**:
   ```bash
   npm run init-db
   ```
   
   This will:
   - Create the database tables
   - Import all 88 contractor companies
   - Create default admin user (username: `admin`, password: `admin123`)
   - Add Jon as the initial employee

5. **Start the server**:
   ```bash
   npm start
   ```

6. **Access the application**:
   - Open your browser to `http://localhost:3000`
   - Login with: username `admin`, password `admin123`
   - **IMPORTANT**: Change the admin password immediately after first login!

## Deployment to Your Domain

### Option 1: VPS/Cloud Server (Recommended)

Deploy to services like DigitalOcean, AWS EC2, Linode, or Vultr:

1. **Choose a VPS provider** and create an Ubuntu 22.04 server

2. **Connect to your server via SSH**:
   ```bash
   ssh root@your-server-ip
   ```

3. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Install PM2** (keeps your app running):
   ```bash
   sudo npm install -g pm2
   ```

5. **Upload your application**:
   ```bash
   # On your local machine
   scp -r crm-app root@your-server-ip:/var/www/
   ```

6. **On the server, setup the app**:
   ```bash
   cd /var/www/crm-app
   npm install --production
   cp .env.example .env
   nano .env  # Edit and set JWT_SECRET
   npm run init-db
   ```

7. **Start with PM2**:
   ```bash
   pm2 start server.js --name "crm"
   pm2 startup  # Follow instructions to start on boot
   pm2 save
   ```

8. **Install and configure Nginx**:
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/crm
   ```
   
   Add this configuration (replace `your-domain.com`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com www.your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

9. **Enable the site**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

10. **Point your domain to the server**:
    - Go to your domain registrar
    - Add an A record pointing to your server's IP address

11. **Setup SSL (HTTPS)**:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d your-domain.com -d www.your-domain.com
    ```

### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run init-db
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t crm-app .
docker run -d -p 3000:3000 -v $(pwd)/crm.db:/app/crm.db crm-app
```

### Option 3: Heroku (Quick Deployment)

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-crm-app`
4. Set environment variables:
   ```bash
   heroku config:set JWT_SECRET=your-random-secret
   heroku config:set NODE_ENV=production
   ```
5. Create a `Procfile`:
   ```
   web: node server.js
   ```
6. Deploy:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```
7. Initialize database:
   ```bash
   heroku run npm run init-db
   ```

## Default Credentials

**Username**: `admin`  
**Password**: `admin123`

⚠️ **IMPORTANT**: Change these credentials immediately after first login!

## Usage

### Adding Team Members

1. Go to the **Employees** tab
2. Click **+ Add Employee**
3. Enter name and role
4. Employee can now be selected when logging activities

### Logging Activities

1. Go to the **Companies** tab
2. Find a company and click **Log Activity**
3. Select:
   - Type: Call or Email
   - Employee who made contact
   - Whether they answered
   - If they're interested
   - If follow-up is needed
4. Add notes
5. Click **Save Activity**

### Tracking Progress

The **Dashboard** shows:
- Total companies in database
- Companies contacted that answered
- Companies that showed interest
- Companies needing follow-up
- Total calls and emails made
- Recent activity feed

### Filtering Companies

- Use the search bar to find companies by name or city
- Use the type filter to show only Landscape, Fencing, Construction, or Handyman companies

## Database Backup

Your data is stored in `crm.db`. To backup:

```bash
# Create backup
cp crm.db crm-backup-$(date +%Y%m%d).db

# Automated daily backup (add to crontab)
0 2 * * * cp /var/www/crm-app/crm.db /var/www/backups/crm-$(date +\%Y\%m\%d).db
```

## Upgrading to PostgreSQL (Optional)

For larger teams, you can upgrade from SQLite to PostgreSQL:

1. Install PostgreSQL
2. Install node package: `npm install pg`
3. Modify `server.js` to use PostgreSQL instead of SQLite
4. Migrate your data

## Troubleshooting

### Application won't start
- Check Node.js is installed: `node --version`
- Verify all dependencies installed: `npm install`
- Check port 3000 is available: `lsof -i :3000`

### Can't login
- Verify database was initialized: `npm run init-db`
- Check JWT_SECRET is set in `.env`

### Lost admin password
Reset the admin password:
```bash
node -e "
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const db = new Database('crm.db');
const hash = bcrypt.hashSync('newpassword123', 10);
db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hash, 'admin');
console.log('Password reset to: newpassword123');
"
```

## Adding More Users

To add new users with login access:

1. Use the API endpoint or database directly
2. Hash passwords with bcrypt
3. Assign appropriate roles ('admin' or 'user')

## Security Notes

- Always use HTTPS in production (SSL certificate)
- Change the default JWT_SECRET
- Change the default admin password
- Keep Node.js and dependencies updated
- Regular database backups
- Use strong passwords for all users
- Consider IP whitelisting for admin access

## Support

For issues or questions:
- Check the troubleshooting section above
- Review server logs: `pm2 logs crm` (if using PM2)
- Check database file permissions

## License

Proprietary - Delaware Fence Solutions

---

**Version**: 1.0.0  
**Last Updated**: February 2026

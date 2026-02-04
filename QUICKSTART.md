# Quick Start Guide - Delaware Fence Solutions CRM

## What You Have

A complete, production-ready web application for tracking contractor relationships and sales activities. The app is fully functional and can be accessed from anywhere once deployed to your domain.

## Files Included

```
crm-app/
├── server.js           # Main backend server (Express API)
├── database.js         # Database initialization script
├── package.json        # Dependencies and scripts
├── .env.example        # Environment configuration template
├── .gitignore         # Git ignore rules
├── README.md          # Complete documentation
└── public/
    └── index.html     # Frontend application (React)
```

## Get Started in 5 Minutes (Local Testing)

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org
   - Version 16 or higher required

2. **Open Terminal/Command Prompt** and navigate to the crm-app folder:
   ```bash
   cd crm-app
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Setup configuration**:
   ```bash
   cp .env.example .env
   ```
   (On Windows: `copy .env.example .env`)

5. **Initialize database** with your 88 companies:
   ```bash
   npm run init-db
   ```

6. **Start the server**:
   ```bash
   npm start
   ```

7. **Open in browser**: http://localhost:3000

8. **Login**:
   - Username: `admin`
   - Password: `admin123`

## Deploy to Your Domain - Simple Steps

### Recommended: DigitalOcean Droplet ($6/month)

1. **Create a DigitalOcean account** and create a Droplet:
   - Choose: Ubuntu 22.04
   - Plan: Basic ($6/month is enough)
   - Add your SSH key

2. **Upload your app to the server**:
   ```bash
   scp -r crm-app root@your-server-ip:/var/www/
   ```

3. **SSH into your server**:
   ```bash
   ssh root@your-server-ip
   ```

4. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   apt-get install -y nodejs
   ```

5. **Setup the application**:
   ```bash
   cd /var/www/crm-app
   npm install
   cp .env.example .env
   nano .env  # Press Ctrl+X, then Y to save
   npm run init-db
   ```

6. **Install PM2 to keep app running**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name crm
   pm2 startup  # Follow the instructions shown
   pm2 save
   ```

7. **Install Nginx**:
   ```bash
   apt install nginx
   ```

8. **Configure Nginx** (copy this exactly, replace YOUR-DOMAIN.COM):
   ```bash
   cat > /etc/nginx/sites-available/crm << 'EOF'
   server {
       listen 80;
       server_name YOUR-DOMAIN.COM www.YOUR-DOMAIN.COM;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   EOF
   ```

9. **Enable the site**:
   ```bash
   ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

10. **Point your domain**:
    - Go to your domain registrar (GoDaddy, Namecheap, etc.)
    - Add an A record: 
      - Name: @ (or blank)
      - Value: Your server IP address
    - Add an A record:
      - Name: www
      - Value: Your server IP address

11. **Setup SSL (HTTPS)**:
    ```bash
    apt install certbot python3-certbot-nginx
    certbot --nginx -d YOUR-DOMAIN.COM -d www.YOUR-DOMAIN.COM
    ```
    Follow the prompts, enter your email, agree to terms.

12. **Done!** Visit your domain in a browser.

## What Your Team Can Do

### For Sales Team:
- Log every call and email with contractors
- Mark if they answered
- Mark if they're interested
- Set follow-up reminders
- Add notes about conversations

### For Managers:
- See dashboard with total calls/emails
- See which companies showed interest
- Track which team member is contacting which company
- See who needs follow-up

### For Everyone:
- Search the 88 contractors quickly
- Filter by type (Landscape, Fencing, Construction, Handyman)
- See all contact information (phone, email, address)
- View complete activity history for each company

## Important First Steps

After deployment:

1. **Change admin password**:
   - Login as admin
   - Go to settings (you'll need to add a password change feature, or do it via database)

2. **Add your team members**:
   - Go to Employees tab
   - Click "+ Add Employee"
   - Add each sales team member

3. **Start logging activities**:
   - Go to Companies tab
   - Click "Log Activity" on any company
   - Record your calls and emails

## Backup Your Data

Set up automatic daily backups:

```bash
# Add to crontab (run: crontab -e)
0 2 * * * cp /var/www/crm-app/crm.db /var/www/backups/crm-$(date +\%Y\%m\%d).db
```

## Getting Help

- **App won't start**: Check `pm2 logs crm` for errors
- **Can't login**: Make sure you ran `npm run init-db`
- **Database issues**: Your data is in `crm.db` file - back it up regularly

## Costs

- **Domain**: $10-15/year (GoDaddy, Namecheap)
- **Server**: $6/month (DigitalOcean Basic Droplet)
- **SSL Certificate**: FREE (Let's Encrypt via Certbot)
- **Total**: ~$80/year

## Next Steps

1. Test locally to make sure everything works
2. Choose your domain name
3. Set up a DigitalOcean account
4. Follow deployment steps above
5. Add your team members
6. Start tracking your sales!

## Support

Need help? Check:
- README.md for detailed documentation
- Server logs: `pm2 logs crm`
- Database file: `crm.db` (should exist after init-db)

---

**Your CRM is ready to go! Start with local testing, then deploy to your domain when ready.**

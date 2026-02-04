# Deployment Checklist for Delaware Fence Solutions CRM

## Pre-Deployment

- [ ] Tested application locally (npm start, visit localhost:3000)
- [ ] Verified all 88 companies loaded correctly
- [ ] Tested logging activities (calls and emails)
- [ ] Tested adding/removing employees
- [ ] Chosen domain name
- [ ] Registered domain (if not already owned)

## Server Setup

- [ ] Created VPS/Cloud server (DigitalOcean, AWS, etc.)
- [ ] SSH access working
- [ ] Firewall configured (allow ports 22, 80, 443)
- [ ] Node.js installed (v16+)
- [ ] PM2 installed globally

## Application Deployment

- [ ] Uploaded application files to /var/www/crm-app
- [ ] Ran `npm install`
- [ ] Created .env file from .env.example
- [ ] Set JWT_SECRET to random string (not "change-this")
- [ ] Ran `npm run init-db` successfully
- [ ] Started app with PM2: `pm2 start server.js --name crm`
- [ ] Configured PM2 startup: `pm2 startup` and `pm2 save`
- [ ] Verified app running: `pm2 status`

## Web Server (Nginx)

- [ ] Nginx installed
- [ ] Created site configuration in /etc/nginx/sites-available/crm
- [ ] Replaced YOUR-DOMAIN.COM with actual domain
- [ ] Created symlink: /etc/nginx/sites-enabled/crm
- [ ] Tested Nginx config: `nginx -t`
- [ ] Reloaded Nginx: `systemctl reload nginx`

## Domain Configuration

- [ ] Added A record pointing to server IP (@)
- [ ] Added A record pointing to server IP (www)
- [ ] DNS propagated (test: ping your-domain.com)
- [ ] Can access site via http://your-domain.com

## SSL Certificate

- [ ] Installed Certbot
- [ ] Ran certbot for domain
- [ ] Verified HTTPS working (https://your-domain.com)
- [ ] Certificate auto-renewal configured

## Security Hardening

- [ ] Changed default admin password
- [ ] JWT_SECRET is strong and random
- [ ] Firewall configured (UFW or iptables)
- [ ] SSH key-only authentication (disabled password auth)
- [ ] Fail2ban installed (optional but recommended)
- [ ] Server OS updated: `apt update && apt upgrade`

## Backup Configuration

- [ ] Database backup location created: /var/www/backups
- [ ] Cron job added for daily backups
- [ ] Tested backup restore process
- [ ] Off-site backup configured (optional)

## Team Setup

- [ ] Added all team members as employees in the system
- [ ] Verified employees can be selected when logging activities
- [ ] Created login accounts for team members (if multi-user login added)
- [ ] Trained team on how to use the system

## Testing in Production

- [ ] Can login with admin credentials
- [ ] Dashboard loads correctly
- [ ] Companies list displays all 88 contractors
- [ ] Search and filter working
- [ ] Can log activities (calls/emails)
- [ ] Activities appear in activity log
- [ ] Statistics update correctly
- [ ] Can add/edit/delete employees
- [ ] Mobile responsive (test on phone)

## Monitoring & Maintenance

- [ ] PM2 monitoring working: `pm2 monit`
- [ ] Log rotation configured for PM2
- [ ] Server monitoring setup (Uptime Robot, Pingdom, etc.)
- [ ] Database size monitored
- [ ] Documented backup restore procedure

## Documentation

- [ ] Team members know where to access the CRM
- [ ] Login credentials securely shared with team
- [ ] Quick reference guide created for team
- [ ] Emergency contacts documented
- [ ] Server access credentials backed up securely

## Go Live

- [ ] Announced to team
- [ ] Initial training session held
- [ ] Support contact designated
- [ ] First week check-in scheduled

## Post-Deployment (First Week)

- [ ] Monitored for errors or issues
- [ ] Collected feedback from team
- [ ] Verified backups running
- [ ] Checked server resource usage
- [ ] Addressed any usability concerns

## Optional Enhancements

- [ ] Setup email notifications for follow-ups
- [ ] Add export functionality (CSV/Excel)
- [ ] Integrate with email system
- [ ] Add reporting features
- [ ] Setup analytics/insights dashboard
- [ ] Mobile app consideration

---

## Quick Reference

**Server IP**: ___________________
**Domain**: ___________________
**Admin Username**: admin
**Admin Password**: ___________________
**Database Location**: /var/www/crm-app/crm.db
**PM2 App Name**: crm
**SSH Access**: ssh root@server-ip

## Emergency Contacts

**Server Provider**: ___________________
**Domain Registrar**: ___________________
**Technical Contact**: ___________________

## Important Commands

```bash
# Check app status
pm2 status

# View logs
pm2 logs crm

# Restart app
pm2 restart crm

# Backup database
cp /var/www/crm-app/crm.db ~/crm-backup-$(date +%Y%m%d).db

# Check Nginx status
systemctl status nginx

# Reload Nginx config
systemctl reload nginx
```

---

**Date Deployed**: ___________________
**Deployed By**: ___________________
**Notes**: ___________________

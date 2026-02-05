# Vercel Deployment Guide

## Environment Variables Setup

In your Vercel project dashboard, add these environment variables:

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add the following:

```
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
PORT=3000
```

## Deployment Steps

1. Push your code to GitHub (already done)
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repository: `Jon-Audi/DFS-CRM`
4. Add environment variables (see above)
5. Deploy!

## Important Notes

- The `vercel.json` file configures Vercel to route all requests to your Express server
- The server exports the Express app for serverless compatibility
- All API routes will work at: `https://your-app.vercel.app/auth/login`, etc.
- The frontend is served from the `public` folder automatically

## Testing After Deployment

1. Visit your Vercel URL
2. Try logging in with your admin credentials
3. Verify all features work:
   - Companies tab loads 87 contractors
   - Employees tab works
   - Calling interface functional
   - Activities logging works

## Troubleshooting

If you get 404 errors:
- Verify environment variables are set in Vercel dashboard
- Check deployment logs for errors
- Ensure `vercel.json` is committed to git

If login fails:
- Check browser console for actual error
- Verify Supabase credentials in environment variables
- Test API endpoint directly: `https://your-app.vercel.app/auth/login`

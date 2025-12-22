# Troubleshooting Login Issues

## If you can't login through the frontend but can login through Postman

### 1. Check Backend CORS Configuration

The backend needs to allow your frontend origin. Update your backend `.env` file:

```env
FRONTEND_ORIGIN=http://localhost:3000
```

Then restart your backend server.

### 2. Check Browser Console

Open your browser's developer console (F12) and check for:
- CORS errors
- Network errors
- Console errors

### 3. Check Network Tab

In the browser's Network tab:
- Look for the `/api/auth/login` request
- Check the request headers
- Check the response status and body
- Verify cookies are being set (Application/Storage tab)

### 4. Verify Backend is Running

Make sure your backend is running on `http://localhost:4000`:
```bash
cd ai-chat-backend
npm run dev
```

### 5. Check API Base URL

If you're not using the Vite proxy, make sure your `.env` file has:
```
VITE_API_URL=http://localhost:4000/api
```

### 6. Clear Browser Data

Sometimes cached data can cause issues:
- Clear localStorage
- Clear cookies
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### 7. Check Backend Logs

Check your backend console for any error messages when attempting to login.

### Common Issues

**Issue: CORS Error**
- Solution: Update `FRONTEND_ORIGIN` in backend `.env` to match your frontend URL

**Issue: 401 Unauthorized**
- Solution: Check that email/password are correct
- Check backend logs for authentication errors

**Issue: Cookies not being set**
- Solution: Ensure `withCredentials: true` is set in axios config (already configured)
- Check that backend cookie settings allow your frontend origin

**Issue: Network Error**
- Solution: Verify backend is running and accessible
- Check firewall/antivirus settings


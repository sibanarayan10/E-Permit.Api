# e-PTW Backend API

Backend server for the Electronic Permit to Work (e-PTW) system.

## 🚀 Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
NODE_ENV=development
PORT=5000
MONGO_URL_ATLAS=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret-key
COOKIE_SECRET=your-cookie-secret-key
LOG_LEVEL=info
```

3. Start development server:
```bash
npm run dev
```

## 📁 Project Structure

```
server/
├── config/          # Configuration files (database, constants)
├── controllers/     # Request handlers
├── middleware/      # Custom middleware (auth, validation, error handling)
├── models/          # Mongoose models
├── routes/          # Express routes
├── utils/           # Utility functions (logger, token manager)
├── validations/     # Input validation schemas
├── logs/            # Application logs
└── app.js           # Express application entry point
```

## 🔧 API Endpoints

### Authentication
- `POST /api/v1/users/login` - User login
- `POST /api/v1/users/logout` - User logout
- `GET /api/v1/users/verify` - Verify token
- `GET /api/v1/users/profile` - Get profile
- `PUT /api/v1/users/profile` - Update profile

### Permits
- `GET /api/v1/permits/my-permits` - Get user's permits
- `GET /api/v1/permits/next-numbers` - Get next permit numbers
- `POST /api/v1/permits` - Create permit
- `GET /api/v1/permits/:id` - Get permit details
- `PUT /api/v1/permits/:id` - Update permit
- `PUT /api/v1/permits/:id/submit-to-execution` - Submit to execution
- `PUT /api/v1/permits/:id/execution-approve` - Execution approval
- `PUT /api/v1/permits/:id/execution-return` - Execution return
- `PUT /api/v1/permits/:id/issuer-approve` - Issuer approval
- `PUT /api/v1/permits/:id/issuer-return` - Issuer return
- `DELETE /api/v1/permits/:id` - Delete permit
- `GET /api/v1/permits/stats` - Get statistics

### Users (Admin Only)
- `GET /api/v1/users` - Get all users
- `POST /api/v1/users` - Create user
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user
- `GET /api/v1/users/stats` - Get user statistics
- `GET /api/v1/users/system-info` - Get system information

### Notifications
- `GET /api/v1/notifications` - Get notifications
- `PUT /api/v1/notifications/:id/read` - Mark as read
- `PUT /api/v1/notifications/read-all` - Mark all as read

## 🔒 Security

- JWT authentication
- Secure HTTP-only cookies
- Password hashing (bcrypt)
- Input validation
- XSS protection
- MongoDB injection prevention
- Rate limiting
- CORS configuration
- Helmet.js security headers

## 📝 Logging

Logs are stored in the `logs/` directory:
- `error.log` - Error level logs
- `combined.log` - All logs

## 🛠️ Development

```bash
# Development with auto-reload
npm run dev

# Production
npm start
```

## 📦 Dependencies

- Express - Web framework
- Mongoose - MongoDB ODM
- JWT - Authentication
- Bcrypt - Password hashing
- Winston - Logging
- Express Validator - Input validation
- Helmet - Security headers
- CORS - Cross-origin resource sharing


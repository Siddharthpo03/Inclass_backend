# Deployment Checklist - InClass Backend

This checklist ensures your backend is production-ready before deployment.

## 🔴 Critical Pre-Deployment Requirements

### 1. Environment Variables

- [ ] `NODE_ENV=production` is set
- [ ] `DATABASE_URL` is configured and tested
- [ ] `JWT_SECRET` is set (minimum 32 characters, randomly generated)
- [ ] `BIOMETRIC_ENCRYPTION_KEY` is set (64 hex characters for AES-256)
- [ ] `FRONTEND_URL` is set to production domain
- [ ] All email service credentials (`EMAIL_USER`, `EMAIL_PASS`) are configured
- [ ] SMS service credentials (Twilio `ACCOUNT_SID`, `AUTH_TOKEN`) are set
- [ ] `SENTRY_DSN` is configured for error tracking (optional but recommended)

### 2. Security Hardening

- [ ] JWT token expiration is set to 24 hours maximum (`auth.js` - already fixed)
- [ ] CORS is configured for production domain only
- [ ] Rate limiting is enabled for all API endpoints
- [ ] SSL/TLS is enabled for database connection
- [ ] All secrets are stored in environment variables, NOT in code
- [ ] No hardcoded credentials exist in codebase (run: `npm run validate-no-hardcoded-secrets`)

### 3. Database Readiness

- [ ] PostgreSQL database is provisioned and accessible
- [ ] Database migrations have been run (`schema.sql` applied)
- [ ] All required tables exist (users, attendance, registrations, etc.)
- [ ] pgvector extension is installed (if using vector search)
- [ ] Database backups are configured
- [ ] Connection pooling is configured appropriately (max: 20 clients)

### 4. Logging & Monitoring

- [ ] Winston logger is configured and working (verify with health check)
- [ ] Console.log statements have been replaced with logger calls
- [ ] Sentry integration is configured for production error tracking
- [ ] Application logs are being captured and stored
- [ ] Prometheus metrics endpoint is accessible at `/metrics`
- [ ] Health check endpoints are working (`/health`, `/api/health`)

### 5. Graceful Shutdown

- [ ] SIGINT and SIGTERM handlers are configured in `server.js` and `db.js`
- [ ] Database connections close gracefully on shutdown
- [ ] Timeout for graceful shutdown is set (currently 3000ms)
- [ ] Process manager (PM2, systemd, Kubernetes) is responsible for restarting

### 6. Error Handling

- [ ] Error response format is standardized (checked by frontend)
- [ ] Stack traces are NOT leaked to production responses
- [ ] All async route handlers use `asyncHandler` wrapper
- [ ] Database connection errors trigger process exit (fail-fast)
- [ ] Unhandled promise rejections are caught

### 7. API & Routes

- [ ] Test/debug endpoints have been removed (`/sentry-test` - removed)
- [ ] All routes use proper HTTP status codes
- [ ] Input validation is in place (check: courseId, userId, codes)
- [ ] File uploads have security checks (MIME type, size limits, path validation)
- [ ] Rate limiting is properly configured for each endpoint tier
- [ ] API documentation is up-to-date

## 🟡 High Priority - Before Production

### Performance

- [ ] Database query performance has been optimized
- [ ] Connection pool size is appropriate (max: 20, currently set)
- [ ] Statement timeout is configured (30 seconds)
- [ ] Long-running queries are identified and optimized
- [ ] Memory usage is monitored during load testing

### Deployment Infrastructure

- [ ] Docker image is built and tested (if using containers)
- [ ] Environment variables are set in deployment platform secrets
- [ ] Process manager is configured (PM2, supervisor, systemd, Kubernetes, etc.)
- [ ] Reverse proxy (nginx, HAProxy) is configured with:
  - [ ] Request timeouts set appropriately
  - [ ] Rate limiting at proxy level (optional, for DDoS protection)
  - [ ] HTTPS/TLS termination
  - [ ] Compression enabled
- [ ] CDN is configured (if serving static files)
- [ ] SSL/TLS certificates are valid and not self-signed

### Testing

- [ ] Unit tests pass (`npm test`)
- [ ] Integration tests pass against production-like database
- [ ] Load testing has been performed (check: `/load` tests)
- [ ] Smoke tests pass on staging environment
- [ ] API endpoints respond within acceptable time limits

## 🟢 Good to Have - Production Best Practices

- [ ] Database backups are automated and tested
- [ ] Logs are aggregated and searchable (ELK, Datadog, Splunk, etc.)
- [ ] Alerts are configured for:
  - [ ] Database connection failures
  - [ ] High error rates
  - [ ] High memory/CPU usage
  - [ ] Database performance degradation
- [ ] Scaling strategy is planned for:
  - [ ] Database connection management
  - [ ] Horizontal scaling with load balancer
  - [ ] Cache layer (Redis) for session/data caching
- [ ] API versioning strategy is implemented
- [ ] Incident response playbook exists
- [ ] On-call rotation is established

## 🚀 Pre-Deployment Verification Steps

### 1. Start the Application

```bash
npm install
npm run lint
npm test
npm start
```

### 2. Verify Health Endpoints

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 123.456,
  "memory": { ... },
  "environment": "production",
  "timestamp": "2026-04-26T...",
  "responseTimeMs": 12
}
```

### 3. Test Authentication

```bash
# Create test account (if allowed)
# Log in to verify JWT tokens are generated
# Verify token expiration is reasonable (24h)
```

### 4. Test Database Connectivity

```bash
# Verify all critical tables exist
# Verify migrations have run
# Check connection pool status
```

### 5. Verify Error Handling

```bash
# Test with invalid auth (should return 401)
# Test with missing required fields (should return 400)
# Test with nonexistent resource (should return 404)
# Verify error responses are standardized
```

## 📋 Final Deployment Sign-Off

- [ ] All critical requirements are met
- [ ] All high priority items are addressed
- [ ] Load testing results are acceptable
- [ ] Stakeholders have approved deployment
- [ ] Rollback procedure is documented and tested
- [ ] On-call engineer is ready
- [ ] Incident response contacts are confirmed

## 🔄 Post-Deployment

- [ ] Monitor application logs for errors
- [ ] Verify metrics are being collected
- [ ] Create alerts if not already done
- [ ] Prepare incident response if issues arise
- [ ] Begin graceful shutdown testing if needed

---

**Last Updated:** 2026-04-26  
**Deployment Status:** ⚠️ Ready for review - Execute checklist before deployment

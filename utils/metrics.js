// backend/utils/metrics.js
// Prometheus metrics and alert logging. Active only when ENABLE_METRICS is set.

const { Registry, Histogram, Gauge } = require("prom-client");
const logger = require("./logger");

const ENABLE_METRICS = process.env.ENABLE_METRICS === "true" || process.env.ENABLE_METRICS === "1";
const ALERT_MEMORY_PCT = 0.8;
const ALERT_POOL_PCT = 0.8;

const register = new Registry();

// HTTP request duration in seconds
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Process memory usage (bytes)
const memoryHeapUsed = new Gauge({
  name: "process_memory_heap_used_bytes",
  help: "Node.js heap used memory in bytes",
  registers: [register],
});
const memoryHeapTotal = new Gauge({
  name: "process_memory_heap_total_bytes",
  help: "Node.js heap total memory in bytes",
  registers: [register],
});
const memoryRss = new Gauge({
  name: "process_memory_rss_bytes",
  help: "Resident set size in bytes",
  registers: [register],
});

// Active Socket.io connections
const socketConnectionsActive = new Gauge({
  name: "socket_connections_active",
  help: "Number of active Socket.io connections",
  registers: [register],
});

// DB pool usage (pg Pool: totalCount, idleCount; max from pool.options.max)
const dbPoolTotal = new Gauge({
  name: "db_pool_total",
  help: "Total number of clients in the pool",
  registers: [register],
});
const dbPoolIdle = new Gauge({
  name: "db_pool_idle",
  help: "Number of idle clients in the pool",
  registers: [register],
});
const dbPoolUsed = new Gauge({
  name: "db_pool_used",
  help: "Number of clients currently in use",
  registers: [register],
});

// Request latency and status_code are in http_request_duration_seconds; error rate = count(status_code >= 400).

function isEnabled() {
  return ENABLE_METRICS;
}

/**
 * Middleware to record HTTP request duration. Mount early; call next() then observe on res finish.
 * No-op when ENABLE_METRICS is not set.
 */
function requestDurationMiddleware(req, res, next) {
  if (!ENABLE_METRICS) {
    return next();
  }
  const start = process.hrtime.bigint();
  const route = req.route ? (req.route.path || req.path) : req.path;

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationSec = Number(end - start) / 1e9;
    const statusCode = String(res.statusCode);
    httpRequestDuration.observe(
      { method: req.method, route: route || req.path, status_code: statusCode },
      durationSec
    );
  });

  next();
}

/**
 * Update process and pool gauges and run alert checks. Call before returning /metrics.
 */
function updateSystemMetrics(io, pool) {
  const mem = process.memoryUsage();
  memoryHeapUsed.set(mem.heapUsed);
  memoryHeapTotal.set(mem.heapTotal);
  memoryRss.set(mem.rss);

  if (pool && typeof pool.totalCount === "number") {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const used = total - idle;
    const max = pool.options && typeof pool.options.max === "number" ? pool.options.max : 20;
    dbPoolTotal.set(total);
    dbPoolIdle.set(idle);
    dbPoolUsed.set(used);

    const poolUsagePct = max > 0 ? used / max : 0;
    if (poolUsagePct >= ALERT_POOL_PCT) {
      logger.warn("Metrics alert: DB pool usage above 80%", {
        used,
        total: max,
        usagePct: `${(poolUsagePct * 100).toFixed(1)}%`,
      });
    }
  }

  if (io && io.sockets && io.sockets.sockets) {
    const count = io.sockets.sockets.size;
    socketConnectionsActive.set(count);
  } else {
    socketConnectionsActive.set(0);
  }

  // Memory alert: heap used vs heap total (Node.js heap)
  if (mem.heapTotal > 0) {
    const heapPct = mem.heapUsed / mem.heapTotal;
    if (heapPct >= ALERT_MEMORY_PCT) {
      logger.warn("Metrics alert: process heap usage above 80%", {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        usagePct: `${(heapPct * 100).toFixed(1)}%`,
      });
    }
  }
}

/**
 * Returns Express handler for GET /metrics. Only returns Prometheus output when ENABLE_METRICS is set.
 */
function getMetricsHandler(pool) {
  return async (req, res) => {
    if (!ENABLE_METRICS) {
      res.status(404).send("Metrics not enabled. Set ENABLE_METRICS=true to enable.");
      return;
    }
    const io = req.app.get && req.app.get("io");
    updateSystemMetrics(io, pool);
    res.setHeader("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  };
}

module.exports = {
  isEnabled: () => ENABLE_METRICS,
  requestDurationMiddleware,
  getMetricsHandler,
  register,
  updateSystemMetrics,
};

// src/database/database-diagnostics.ts

/**
 * Human-readable diagnosis for `MONGODB_URI` problems.
 *
 * The driver's own error is accurate and useless at 8pm: "Could not connect to any
 * servers in your MongoDB Atlas cluster" names neither the host it tried, the user it
 * authenticated as, nor the three settings that actually cause it. These helpers turn
 * the URI and the error into a short checklist an operator can act on — and they are
 * pure functions, so the guidance itself is unit-tested rather than trusted.
 */

export type DatabaseProtocol = 'mongodb' | 'mongodb+srv' | 'unknown';

export interface DatabaseUriSummary {
  /** `false` when the string cannot be a MongoDB URI at all. */
  valid: boolean;
  protocol: DatabaseProtocol;
  srv: boolean;
  hosts: string[];
  username: string | null;
  database: string | null;
  options: Record<string, string>;
  /** A hosted Atlas cluster (`*.mongodb.net`). */
  atlas: boolean;
  /** A loopback/`localhost` server. */
  local: boolean;
  /** Blockers: the connection cannot succeed while one of these is true. */
  problems: string[];
  /** Suspicious, but may still work. */
  warnings: string[];
}

/** Characters that must be percent-encoded inside the userinfo of a URI. */
const UNENCODED_IN_USERINFO = /[@/?#[\]\s]/;

const URI_PATTERN = /^(mongodb(?:\+srv)?):\/\/([^/?]*)(?:\/([^?]*))?(?:\?(.*))?$/i;

/** Hides the password so a summary can be pasted into a ticket. */
export function maskDatabaseUri(uri: string): string {
  const match = URI_PATTERN.exec(uri.trim());

  if (!match) {
    return '<unparseable URI>';
  }

  const userinfo = match[2].includes('@') ? match[2].slice(0, match[2].lastIndexOf('@')) : '';
  const rest = userinfo ? match[2].slice(match[2].lastIndexOf('@')) : match[2];

  if (!userinfo) {
    return `${match[1]}://${rest}${match[3] ? `/${match[3]}` : ''}`;
  }

  const username = userinfo.split(':')[0];

  return `${match[1]}://${username}:***${rest}${match[3] ? `/${match[3]}` : ''}`;
}

/**
 * Parses a connection string and lists what is wrong or worth checking.
 *
 * Deliberately hand-parsed: `new URL()` lowercases hosts, decodes the username and
 * rejects some connection-string forms, none of which is helpful when the point is to
 * report the string back to the person who typed it.
 */
export function describeDatabaseUri(uri: string): DatabaseUriSummary {
  const summary: DatabaseUriSummary = {
    valid: false,
    protocol: 'unknown',
    srv: false,
    hosts: [],
    username: null,
    database: null,
    options: {},
    atlas: false,
    local: false,
    problems: [],
    warnings: [],
  };

  const trimmed = (uri ?? '').trim();

  if (!trimmed) {
    summary.problems.push('MONGODB_URI is empty.');

    return summary;
  }

  if (/[<>]/.test(trimmed)) {
    summary.problems.push(
      'The URI still contains a placeholder such as <password> — paste the real value from Atlas.',
    );
  }

  const match = URI_PATTERN.exec(trimmed);

  if (!match) {
    summary.problems.push(
      'The URI must start with mongodb:// (a single server) or mongodb+srv:// (Atlas/DNS discovery).',
    );

    return summary;
  }

  summary.protocol = (match[1].toLowerCase() === 'mongodb+srv' ? 'mongodb+srv' : 'mongodb') as DatabaseProtocol;
  summary.srv = summary.protocol === 'mongodb+srv';
  summary.valid = true;

  const authority = match[2] ?? '';
  const atIndex = authority.lastIndexOf('@');
  const userinfo = atIndex >= 0 ? authority.slice(0, atIndex) : '';
  const hostPart = atIndex >= 0 ? authority.slice(atIndex + 1) : authority;

  if (atIndex >= 0) {
    const credentials = userinfo;
    const firstColon = credentials.indexOf(':');

    summary.username = decodeURIComponent(
      firstColon >= 0 ? credentials.slice(0, firstColon) : credentials,
    );

    const password = firstColon >= 0 ? credentials.slice(firstColon + 1) : '';

    // A second '@' means the password was pasted raw: everything after the first one
    // is being read as a host, which produces a confusing DNS error.
    if (credentials.includes('@') || password.includes('@')) {
      summary.problems.push(
        'The password contains a raw "@". Percent-encode it (%40) — otherwise the driver reads part of the password as the hostname.',
      );
    }
    if (firstColon >= 0 && password.includes(':')) {
      summary.problems.push(
        'The password contains a raw ":". Percent-encode it (%3A) so it is not split from the username.',
      );
    }
    if (UNENCODED_IN_USERINFO.test(password.replace(/@/g, '').replace(/:/g, ''))) {
      summary.problems.push(
        'The password contains characters that must be percent-encoded (/ ? # [ ] or a space).',
      );
    }
  }

  summary.hosts = hostPart
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  if (summary.hosts.length === 0) {
    summary.problems.push('The URI has no host — expected something like cluster0.xxxxx.mongodb.net.');
  }

  if (summary.srv && summary.hosts.some((host) => host.includes(':'))) {
    summary.problems.push(
      'A mongodb+srv:// URI must not include a port — drop ":27017" from the host.',
    );
  }

  summary.database = (match[3] ?? '').trim() || null;

  for (const pair of (match[4] ?? '').split('&')) {
    const [rawKey, ...rest] = pair.split('=');

    if (rawKey.trim()) {
      summary.options[decodeURIComponent(rawKey.trim())] = decodeURIComponent(rest.join('=').trim());
    }
  }

  const hostNames = summary.hosts.map((host) => host.replace(/:\d+$/, ''));

  summary.atlas = hostNames.some((host) => /\.mongodb\.net$/i.test(host));
  summary.local = hostNames.some((host) =>
    /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i.test(host),
  );

  if (!summary.database) {
    summary.warnings.push(
      'The URI has no database name; the driver will use "test". Add it before the "?": …/ecommerce26?retryWrites=true.',
    );
  }

  if (summary.atlas && summary.srv && (!summary.options.retryWrites || !summary.options.w)) {
    summary.warnings.push(
      'Atlas connection strings usually end with ?retryWrites=true&w=majority — copy the whole string from Atlas.',
    );
  }

  if (summary.local && process.env.NODE_ENV === 'production') {
    summary.warnings.push(
      'This points at a local MongoDB while NODE_ENV=production — make sure that is what you want.',
    );
  }

  return summary;
}

/**
 * `true` when the error came from the database layer rather than, say, an invalid
 * `JWT_ACCESS_SECRET` — `main.ts` uses it to decide whether to print the checklist.
 */
export function looksLikeDatabaseError(error: unknown): boolean {
  const name = (error as Error)?.name ?? '';
  const message = (error as Error)?.message ?? String(error);

  return (
    /^Mongo/i.test(name) ||
    /^Mongoose/i.test(name) ||
    /Could not connect to any servers|ServerSelection|connect ECONNREFUSED|querySrv/i.test(
      message,
    )
  );
}

export type ConnectionFailure =
  | 'server_selection'
  | 'authentication'
  | 'dns'
  | 'refused'
  | 'tls'
  | 'unknown';

/**
 * Maps a driver error to the class of problem it represents.
 *
 * `MongooseServerSelectionError` is the catch-all the driver raises when it never
 * reached *any* seed host, so it is classified on the message it wraps.
 */
export function classifyConnectionError(error: unknown): ConnectionFailure {
  const message = `${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? String(error)}`;

  if (/bad auth|authentication failed|auth failed|SCRAM|AuthenticationFailed/i.test(message)) {
    return 'authentication';
  }
  if (/querySrv|ENOTFOUND|EAI_AGAIN|ESERVFAIL|EBADNAME|getaddrinfo/i.test(message)) {
    return 'dns';
  }
  if (/ECONNREFUSED|connection refused/i.test(message)) {
    return 'refused';
  }
  if (/SSL|TLS|CERTIFICATE|ERR_TLS|self[- ]signed/i.test(message)) {
    return 'tls';
  }
  if (/ServerSelection|Could not connect to any servers|topology was destroyed/i.test(message)) {
    return 'server_selection';
  }

  return 'unknown';
}

function stepsFor(failure: ConnectionFailure, summary: DatabaseUriSummary): string[] {
  switch (failure) {
    case 'authentication':
      return [
        'Check the database user and password in Atlas → Database Access.',
        'If the password contains @ : / ? # or a space, percent-encode it: @ → %40, # → %23.',
        'Confirm that user has read/write on this database (Atlas Database Access → Edit → Built-in Role).',
        'Re-copy the connection string from Atlas → Connect → Drivers; it already has the encoding right.',
      ];

    case 'dns':
      return [
        summary.srv
          ? 'mongodb+srv:// needs DNS SRV/TXT lookups: a VPN, corporate DNS or a blocked UDP port 53 breaks it.'
          : 'The host name did not resolve — check the cluster host copied from Atlas.',
        'Try the "standard connection string" instead (Atlas → Connect → Drivers → connection string only, without +srv), which lists the three nodes explicitly.',
        'If you are on a VPN/proxy, disconnect it or add its DNS; then retry.',
      ];

    case 'refused':
      return summary.local
        ? [
            'No MongoDB is listening on that host:port. Start the local server (mongod / Docker) or point MONGODB_URI at Atlas.',
            'On Windows: `net start MongoDB`, or run `mongod --dbpath <path>` in its own terminal.',
          ]
        : [
            'The host refused the TCP connection — check the host:port in MONGODB_URI.',
            'Atlas never accepts port 27017 on a paused cluster; resume it in the Atlas UI.',
          ];

    case 'tls':
      return [
        'TLS handshake failed — usually a proxy/VPN intercepting traffic, or a very old Node.js.',
        'Node 20+ is required by the drivers this project uses; check `node -v`.',
        'Remove any tls/ssl options you added to MONGODB_URI and retry with the string Atlas gives you.',
      ];

    case 'server_selection':
      return summary.atlas
        ? [
            'Whitelist your current public IP: Atlas → Network Access → Add IP Address → "Add Current IP Address" (or 0.0.0.0/0 for a throwaway dev cluster only).',
            'Wait for the entry to show Active (it takes up to a minute), then restart the API.',
            'Check the cluster is not paused (free clusters pause after inactivity) — Resume it.',
            'If you are on a VPN or a mobile hotspot, your egress IP changed: whitelist the new one or disconnect.',
            `Confirm the host is right: ${summary.hosts[0] ?? 'unknown host'}.`,
          ]
        : [
            'The driver reached no seed host — check the host list and that the server is running.',
            'For a local server, confirm `mongod` is listening on 127.0.0.1:27017.',
          ];

    default:
      return [
        'Re-copy the full connection string from Atlas → Connect → Drivers.',
        'Run `npm run db:check` in backend/ for a detailed diagnosis.',
      ];
  }
}

export interface ConnectionDiagnosis {
  failure: ConnectionFailure;
  /** Short one-line hint, suitable for a retry log line. */
  summary: string;
  /** Full checklist, printed once on startup failure. */
  details: string;
}

const FAILURE_LABELS: Record<ConnectionFailure, string> = {
  server_selection: 'no reachable server (IP allow-list, paused cluster or wrong host)',
  authentication: 'authentication rejected (user, password or encoding)',
  dns: 'host name could not be resolved (DNS/SRV or wrong host)',
  refused: 'connection refused (nothing listening on that host:port)',
  tls: 'TLS handshake failed (proxy/VPN or old Node.js)',
  unknown: 'the driver rejected the connection',
};

/** Turns an error plus a parsed URI into one-line and full guidance. */
export function diagnoseConnectionFailure(
  error: unknown,
  uri: string,
): ConnectionDiagnosis {
  const summary = describeDatabaseUri(uri);
  const failure = classifyConnectionError(error);
  const where = summary.hosts.length ? summary.hosts.join(', ') : 'unknown host';
  const target = summary.atlas ? 'Atlas cluster' : summary.local ? 'local MongoDB' : 'MongoDB';

  const steps = [
    ...summary.problems.map((problem) => `Fix in MONGODB_URI: ${problem}`),
    ...stepsFor(failure, summary),
    ...summary.warnings.map((warning) => `Note: ${warning}`),
  ];

  return {
    failure,
    summary: `${FAILURE_LABELS[failure]} — tried ${target} at ${where}${
      summary.username ? ` as "${summary.username}"` : ''
    }`,
    details: [
      'Database connection failed.',
      '',
      `  URI      ${maskDatabaseUri(uri)}`,
      `  Hosts    ${where}`,
      `  Database ${summary.database ?? '(none — driver will use "test")'}`,
      `  User     ${summary.username ?? '(none — no credentials)'}`,
      '',
      'Most likely causes, in order:',
      ...steps.map((step, index) => `  ${index + 1}. ${step}`),
      '',
      'Nothing else starts until this works: the API exits rather than serving requests',
      'against a database it cannot read. Fix the URI or the Atlas allow-list, then run',
      '`npm run db:check` in backend/ to confirm before starting the API again.',
    ].join('\n'),
  };
}

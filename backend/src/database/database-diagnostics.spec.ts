// src/database/database-diagnostics.spec.ts

import {
  classifyConnectionError,
  describeDatabaseUri,
  diagnoseConnectionFailure,
  maskDatabaseUri,
} from './database-diagnostics.js';

const ATLAS =
  'mongodb+srv://app_user:S3cret%40value@cluster0.ab12c.mongodb.net/ecommerce26?retryWrites=true&w=majority';

describe('describeDatabaseUri', () => {
  it('accepts an Atlas SRV string and reports what it found', () => {
    const summary = describeDatabaseUri(ATLAS);

    expect(summary.valid).toBe(true);
    expect(summary.srv).toBe(true);
    expect(summary.atlas).toBe(true);
    expect(summary.local).toBe(false);
    expect(summary.hosts).toEqual(['cluster0.ab12c.mongodb.net']);
    expect(summary.username).toBe('app_user');
    expect(summary.database).toBe('ecommerce26');
    expect(summary.options).toEqual({ retryWrites: 'true', w: 'majority' });
    expect(summary.problems).toEqual([]);
    expect(summary.warnings).toEqual([]);
  });

  it('accepts a local URI and flags nothing', () => {
    const summary = describeDatabaseUri('mongodb://127.0.0.1:27017/ecommerce26');

    expect(summary.local).toBe(true);
    expect(summary.atlas).toBe(false);
    expect(summary.database).toBe('ecommerce26');
    expect(summary.problems).toEqual([]);
  });

  it('rejects a completely wrong scheme', () => {
    const summary = describeDatabaseUri('postgres://user@host/db');

    expect(summary.valid).toBe(false);
    expect(summary.problems[0]).toMatch(/must start with mongodb:\/\//);
  });

  it('reports an empty URI', () => {
    expect(describeDatabaseUri('').problems[0]).toMatch(/empty/i);
  });

  it('catches an unencoded @ in the password', () => {
    const summary = describeDatabaseUri(
      'mongodb+srv://app_user:p@ssword@cluster0.ab12c.mongodb.net/ecommerce26',
    );

    expect(summary.problems.join(' ')).toMatch(/raw "@"/);
  });

  it('catches an unencoded : in the password', () => {
    const summary = describeDatabaseUri('mongodb://user:pa:ss@localhost:27017/ecommerce26');

    expect(summary.problems.join(' ')).toMatch(/raw ":"/);
  });

  it('catches an unreplaced placeholder', () => {
    const summary = describeDatabaseUri(
      'mongodb+srv://app_user:<password>@cluster0.ab12c.mongodb.net/ecommerce26',
    );

    expect(summary.problems.join(' ')).toMatch(/placeholder/i);
  });

  it('rejects a port on a mongodb+srv URI', () => {
    const summary = describeDatabaseUri(
      'mongodb+srv://cluster0.ab12c.mongodb.net:27017/ecommerce26',
    );

    expect(summary.problems.join(' ')).toMatch(/must not include a port/i);
  });

  it('warns when the database name is missing', () => {
    const summary = describeDatabaseUri(
      'mongodb+srv://app_user:S3cret@cluster0.ab12c.mongodb.net?retryWrites=true&w=majority',
    );

    expect(summary.database).toBeNull();
    expect(summary.warnings.join(' ')).toMatch(/no database name/i);
  });

  it('warns when an Atlas URI lost its options', () => {
    const summary = describeDatabaseUri(
      'mongodb+srv://app_user:S3cret@cluster0.ab12c.mongodb.net/ecommerce26',
    );

    expect(summary.warnings.join(' ')).toMatch(/retryWrites=true&w=majority/);
  });
});

describe('maskDatabaseUri', () => {
  it('hides the password but keeps the host and database', () => {
    const masked = maskDatabaseUri(ATLAS);

    expect(masked).not.toContain('S3cret');
    expect(masked).toContain('app_user:***@cluster0.ab12c.mongodb.net/ecommerce26');
  });

  it('leaves a credential-free URI alone', () => {
    expect(maskDatabaseUri('mongodb://127.0.0.1:27017/ecommerce26')).toBe(
      'mongodb://127.0.0.1:27017/ecommerce26',
    );
  });
});

describe('classifyConnectionError', () => {
  const cases: Array<[string, string, string]> = [
    [
      'server selection',
      'MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster',
      'server_selection',
    ],
    ['bad auth', 'MongoServerError: bad auth : Authentication failed.', 'authentication'],
    ['srv lookup', 'Error: querySrv ENOTFOUND _mongodb._tcp.cluster0.mongodb.net', 'dns'],
    ['refused', 'MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017', 'refused'],
    ['tls', 'Error: self-signed certificate in certificate chain', 'tls'],
  ];

  it.each(cases)('classifies %s', (_label, message, expected) => {
    const error = new Error(message);
    error.name = message.split(':')[0];

    expect(classifyConnectionError(error)).toBe(expected);
  });

  it('falls back to unknown', () => {
    expect(classifyConnectionError(new Error('something odd'))).toBe('unknown');
  });
});

describe('diagnoseConnectionFailure', () => {
  const atlasError = Object.assign(
    new Error(
      'Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you are trying to access the database from an IP that isn\'t whitelisted.',
    ),
    { name: 'MongooseServerSelectionError' },
  );

  it('puts the allow-list step first for an Atlas server-selection failure', () => {
    const diagnosis = diagnoseConnectionFailure(atlasError, ATLAS);

    expect(diagnosis.failure).toBe('server_selection');
    expect(diagnosis.summary).toContain('no reachable server');
    expect(diagnosis.summary).toContain('cluster0.ab12c.mongodb.net');
    expect(diagnosis.summary).toContain('app_user');
    expect(diagnosis.details).toContain('Atlas → Network Access');
    expect(diagnosis.details).toContain('npm run db:check');
    // Never echo the password into a log line.
    expect(diagnosis.details).not.toContain('S3cret');
  });

  it('leads with the URI problem when the string itself is broken', () => {
    const diagnosis = diagnoseConnectionFailure(
      atlasError,
      'mongodb+srv://app_user:p@ss@cluster0.ab12c.mongodb.net/ecommerce26',
    );

    expect(diagnosis.details).toContain('Fix in MONGODB_URI');
    expect(diagnosis.details.indexOf('Fix in MONGODB_URI')).toBeLessThan(
      diagnosis.details.indexOf('Network Access'),
    );
  });

  it('tells a local setup to start mongod', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      name: 'MongooseServerSelectionError',
    });
    const diagnosis = diagnoseConnectionFailure(
      refused,
      'mongodb://127.0.0.1:27017/ecommerce26',
    );

    expect(diagnosis.failure).toBe('refused');
    expect(diagnosis.details).toMatch(/mongod|net start MongoDB/);
  });

  it('explains SRV blocking for DNS failures', () => {
    const dns = Object.assign(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.mongodb.net'), {
      name: 'Error',
    });
    const diagnosis = diagnoseConnectionFailure(dns, ATLAS);

    expect(diagnosis.failure).toBe('dns');
    expect(diagnosis.details).toMatch(/DNS SRV/);
    expect(diagnosis.details).toMatch(/standard connection string/i);
  });
});
